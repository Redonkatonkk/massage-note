#!/usr/bin/env python3
"""Restore only to a new, loopback-only Docker project. No image pulls or production writes."""
import argparse
import contextlib
import datetime as dt
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import ssl
import sys
import tempfile
import time
import urllib.parse

from recovery import (Drive, RecoveryError, committed_backups, digest_file, environment,
                      validate_permissions, restore_globals, restore_dump, run, safe_extract, validate_payload,
                      wait_database, baseline_for, write_json, SqlSession, inspect_images, image_fingerprint, compose_literal)
from setup import keychain_get, request_json


def compose_command(root, *args):
    return ["docker", "compose", "-f", str(root / "compose.json")] + list(args)


def cleanup(root):
    state = json.loads((root / "restore-state.json").read_text())
    compose = json.loads((root / "compose.json").read_text())
    if compose.get("name") != state["project"] or not re.fullmatch(r"mn-recovery-[a-f0-9]{12}", state["project"]):
        raise RecoveryError("Refusing cleanup of an unrelated project")
    ids = run(compose_command(root, "ps", "-aq")).decode().split()
    if ids:
        for c in json.loads(run(["docker", "inspect"] + ids)):
            if c["Config"].get("Labels", {}).get("com.massagenote.recovery") != state["project"]:
                raise RecoveryError("Recovery container ownership mismatch")
    run(compose_command(root, "down", "--volumes", "--remove-orphans"))


def connection(host, port, ca, timeout=30):
    class LocalHTTPS(http.client.HTTPSConnection):
        def connect(self):
            sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
            self.sock = self._context.wrap_socket(sock, server_hostname=host)
    return LocalHTTPS(host, port, context=ssl.create_default_context(cafile=str(ca)), timeout=timeout)


def api(root, path, method="GET", body=None, cookie=None, timeout=30, raw=False):
    state = json.loads((root / "restore-state.json").read_text())
    parsed = urllib.parse.urlsplit(state["origin"])
    conn = connection(parsed.hostname, parsed.port, root / "root.crt", timeout)
    headers = {"Origin": state["origin"], "Host": parsed.netloc}
    if cookie: headers["Cookie"] = cookie
    if body is not None: headers["Content-Type"] = "application/json"
    try:
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        data = response.read()
        return response.status, response.getheaders(), data if raw else (json.loads(data) if data else None)
    finally:
        conn.close()


def authenticated_checks(root, inventory, postgres):
    session = SqlSession(postgres)
    try:
        text = session.query("SELECT json_build_object('uid',u.firebase_uid,'store',m.store_id::text,'financeDate',(SELECT max(w.business_date)::text FROM work_records w WHERE w.store_id=m.store_id AND w.deleted_at IS NULL)) FROM users u JOIN store_memberships m ON m.user_id=u.id WHERE u.status='ACTIVE' AND m.status='ACTIVE' AND m.role='OWNER' AND u.first_name IS NOT NULL AND u.last_name IS NOT NULL ORDER BY u.created_at LIMIT 1")
    finally:
        session.close()
    if not text:
        raise RecoveryError("No existing owner account available for authenticated restore validation")
    owner = json.loads(text)
    app = run(compose_command(root, "ps", "-q", "app")).decode().strip()
    code = """
const {createRequire}=require('node:module');
const req=createRequire('/opt/massage-note/api/package.json');
const {initializeApp,cert}=req('firebase-admin/app');
const {getAuth}=req('firebase-admin/auth');
const app=initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g,'\\n')})});
getAuth(app).createCustomToken(process.env.MN_RECOVERY_UID).then(t=>process.stdout.write(t)).catch(()=>process.exit(1));
"""
    token = run(["docker", "exec", "-e", "MN_RECOVERY_UID=" + owner["uid"], app, "node", "-e", code]).decode()
    web_key = environment(inventory["app"]).get("FIREBASE_WEB_API_KEY")
    if not web_key:
        raise RecoveryError("Firebase Web API key missing from recovery inventory")
    exchanged = request_json("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + web_key,
                             body={"token": token, "returnSecureToken": True})
    status, headers, body = api(root, "/api/v1/auth/csrf")
    csrf_cookie = next((v.split(";", 1)[0] for k, v in headers if k.lower() == "set-cookie" and v.startswith("massage_csrf=")), None)
    if status != 200 or not csrf_cookie:
        raise RecoveryError("Restored CSRF handshake failed")
    status, headers, _ = api(root, "/api/v1/auth/session", "POST", {"idToken": exchanged["idToken"], "csrfToken": body["csrfToken"]}, csrf_cookie)
    cookie_name = environment(inventory["app"]).get("SESSION_COOKIE_NAME", "massage_session")
    cookie = next((v.split(";", 1)[0] for k, v in headers if k.lower() == "set-cookie" and v.startswith(cookie_name + "=")), None)
    if status not in [200, 201] or not cookie or api(root, "/api/v1/me", cookie=cookie)[0] != 200:
        raise RecoveryError("Restored authenticated session failed")
    today = owner.get("financeDate") or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    path = "/api/v1/stores/" + owner["store"] + "/finance/summary?dateFrom=" + today + "&dateTo=" + today
    if api(root, path, cookie=cookie)[0] != 200:
        raise RecoveryError("Restored financial API query failed")
    status, _, _ = api(root, "/api/v1/stores", "POST", {"storeCode": str(secrets.randbelow(900000) + 100000),
                      "name": "Recovery validation (isolated)", "timezone": "America/New_York",
                      "businessCutoffLocal": "22:00", "globalCommissionBps": 3000}, cookie)
    if status != 201:
        raise RecoveryError("Isolated restored API write failed")
    return {"authSession": "passed", "financialQueries": "passed", "financialQueryUsedSnapshotDate": bool(owner.get("financeDate")),
            "testWrite": "passed", "realSmsDelivery": "not-tested"}


def compose_document(inventory, manifest, root, hostname, port, project):
    env = {name: environment(c) for name, c in inventory.items()}
    origin = "https://" + hostname + ":" + str(port)
    env["app"]["WEB_ORIGIN"] = origin
    # No outbound webhook should execute against a restored snapshot during validation.
    env["app"]["SMS_WEBHOOK_URL"] = ""
    base = {"platform": "linux/amd64", "pull_policy": "never", "restart": "no",
            "labels": {"com.massagenote.recovery": project}, "networks": ["recovery"]}
    services = {}
    for name in ["postgres", "redis", "app", "migrate", "harden"]:
        services[name] = {**base, "image": inventory[name]["Image"], "environment": env[name]}
    services["postgres"]["volumes"] = ["postgres:/var/lib/postgresql/data"]
    services["postgres"]["command"] = inventory["postgres"]["Config"]["Cmd"]
    services["redis"]["volumes"] = ["redis:/data"]
    services["redis"]["command"] = inventory["redis"]["Config"]["Cmd"]
    services["app"]["command"] = ["app"]
    services["migrate"]["command"] = ["migrate"]
    services["harden"]["command"] = ["harden"]
    services["proxy"] = {**base, "image": manifest["proxyImage"],
                          "ports": ["127.0.0.1:" + str(port) + ":443"],
                          "volumes": [str(root / "Caddyfile") + ":/etc/caddy/Caddyfile:ro", "tls:/data"]}
    if (root / "payload/public-info/www").is_dir():
        services["proxy"]["volumes"].append(str(root / "payload/public-info/www") + ":/srv/info:ro")
    return {"name": project, "services": services, "networks": {"recovery": {}},
            "volumes": {"postgres": {}, "redis": {}, "tls": {}}}, origin


def caddy_document(hostname, public_info):
    handlers = ""
    if public_info:
        handlers = "  handle /backup-info {\n    redir /backup-info/ 308\n  }\n  handle_path /backup-info/* {\n    root * /srv/info\n    file_server\n  }\n"
    return "{\n  auto_https disable_redirects\n}\nhttps://" + hostname + " {\n  tls internal\n" + handlers + "  handle {\n    reverse_proxy app:3000\n  }\n}\n"


def restore(bundle, root, age, identity=None, port=8443, drill=False):
    if root.exists():
        raise RecoveryError("Restore directory already exists; choose a fresh directory")
    # A busy port is an error; never stop another service or switch ports silently.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", port))
    root.mkdir(parents=True, mode=0o700)
    started, created, succeeded = time.monotonic(), False, False
    progress = {"phase": "decrypt"}
    try:
        payload = root / "payload"; payload.mkdir(mode=0o700)
        archive = root / "decrypted.tar.gz"
        if identity:
            run([age, "-d", "-i", identity, "-o", archive, bundle])
        else:
            # Age accepts a pipe for the identity; no private key file or command argument.
            run([age, "-d", "-i", "/dev/stdin", "-o", archive, bundle], data=keychain_get().encode())
        safe_extract(archive, payload); archive.unlink()
        manifest = validate_payload(payload)
        progress["phase"] = "load-offline-images"
        inventory = json.loads((payload / "inventory.json").read_text())
        old_tags = {}
        for line in run(["docker", "image", "ls", "--no-trunc", "--format", "{{json .}}"]).decode().splitlines():
            item = json.loads(line)
            if item["Repository"] != "<none>" and item["Tag"] != "<none>":
                old_tags[item["Repository"] + ":" + item["Tag"]] = item["ID"]
        output = run(["docker", "image", "load", "--input", payload / "images.tar"]).decode()
        references = [line.split(": ", 1)[1].strip() for line in output.splitlines() if line.startswith(("Loaded image ID: ", "Loaded image: "))]
        if not references:
            raise RecoveryError("Docker did not report any loaded images")
        candidates = [(ref, inspect_images([ref])[0]) for ref in references]
        mapping = {}
        for image in manifest["sourceImages"]:
            matched = next(((ref, c) for ref, c in candidates if image_fingerprint(c) == image_fingerprint(image)), None)
            if not matched:
                raise RecoveryError("Offline image filesystem/configuration/platform mismatch")
            reference, loaded = matched
            if loaded["Os"] != "linux" or loaded["Architecture"] != "amd64":
                raise RecoveryError("Offline image platform mismatch")
            anchor = "mn-recovery/cache:" + image_fingerprint(image)
            mapping[image["Id"]] = anchor
            # Use immutable IDs and preserve existing development image tags.
            run(["docker", "image", "tag", reference, anchor])
            for tag in loaded.get("RepoTags", []):
                if tag in old_tags and old_tags[tag] != loaded["Id"]:
                    run(["docker", "image", "tag", old_tags[tag], tag])
        for c in inventory.values():
            c["Image"] = mapping[manifest["imageReferences"].get(c["Image"], c["Image"])]
        manifest["proxyImage"] = mapping[manifest["proxyImage"]]
        hostname = urllib.parse.urlsplit(environment(inventory["app"])["WEB_ORIGIN"]).hostname
        if not hostname or not all(c.isalnum() or c in ".-" for c in hostname):
            raise RecoveryError("Invalid recovered origin hostname")
        project = "mn-recovery-" + secrets.token_hex(6)
        document, origin = compose_document(inventory, manifest, root, hostname, port, project)
        write_json(root / "compose.json", compose_literal(document))
        (root / "Caddyfile").write_text(caddy_document(hostname, (payload / "public-info/www").is_dir()))
        write_json(root / "restore-state.json", {"project": project, "origin": origin, "snapshot": manifest.get("snapshotAt", manifest["createdAt"]),
                                                 "outboundAgentsPaused": True, "source": "cloud-bundle-only"})
        created = True
        progress["phase"] = "restore-database"
        run(compose_command(root, "up", "-d", "--pull", "never", "postgres", "redis"))
        postgres = run(compose_command(root, "ps", "-q", "postgres")).decode().strip()
        pg = environment(inventory["postgres"])
        wait_database(postgres, pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        restore_globals(postgres, payload, pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        restore_dump(postgres, payload / "database.dump", pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        if baseline_for(postgres) != json.loads((payload / "baseline.json").read_text()):
            raise RecoveryError("Mac restored data/schema does not match the snapshot")
        validate_permissions(postgres)
        run(compose_command(root, "run", "--rm", "--no-deps", "migrate"))
        run(compose_command(root, "up", "-d", "--pull", "never", "app", "proxy"))
        progress["phase"] = "web-api-readiness"
        proxy = run(compose_command(root, "ps", "-q", "proxy")).decode().strip()
        ready = False
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            try:
                if not (root / "root.crt").exists():
                    run(["docker", "cp", proxy + ":/data/caddy/pki/authorities/local/root.crt", root / "root.crt"])
                code, _, body = api(root, "/api/v1/health/ready", timeout=3)
                progress["lastHttpStatus"] = code
                if isinstance(body, dict) and re.fullmatch(r"[A-Z_]{1,64}", body.get("code", "")):
                    progress["lastApiCode"] = body["code"]
                if code == 200: ready = True; break
            except Exception as error:
                progress["lastConnectionError"] = type(error).__name__
            time.sleep(1)
        if not ready:
            progress["certificatePresent"] = (root / "root.crt").exists()
            raise RecoveryError("Restored Web/API did not become ready")
        for path in ["/api/v1/health", "/api/v1/auth/csrf"]:
            if api(root, path)[0] != 200:
                raise RecoveryError("Restored API smoke check failed")
        if api(root, "/", raw=True)[0] != 200:
            raise RecoveryError("Restored Web page did not respond successfully")
        if (payload / "public-info/www").is_dir():
            for page in ["index.html", "privacy.html", "terms.html"]:
                code, _, content = api(root, "/backup-info/" + page, raw=True)
                if code != 200 or content != (payload / "public-info/www" / page).read_bytes():
                    raise RecoveryError("Restored public information readback mismatch")
        checks = authenticated_checks(root, inventory, postgres) if drill else {"authSession": "pending", "financialQueries": "pending", "testWrite": "not-run"}
        report = {"snapshot": manifest.get("snapshotAt", manifest["createdAt"]), "files": "passed", "database": "passed",
                  "permissions": "passed", "offlineImages": "passed", "webApi": "passed",
                  **checks,
                  "durationSeconds": round(time.monotonic() - started, 2),
                  "origin": origin, "publicDnsChanged": False, "localHostsChanged": False,
                  "externalMessagesSent": False, "drill": drill}
        write_json(root / "restore-report.json", report)
        succeeded = True
        return report
    except Exception as error:
        write_json(root / "restore-report.json", {"status": "failed", "progress": progress,
                   "reason": str(error) if isinstance(error, RecoveryError) else type(error).__name__,
                   "durationSeconds": round(time.monotonic() - started, 2)})
        raise
    finally:
        if created and (drill or not succeeded):
            cleanup(root)
        if drill:
            # Keep only the non-sensitive report; production plaintext/config and private TLS material are removed.
            report = root / "restore-report.json"
            keep = report.read_bytes() if report.exists() else None
            shutil.rmtree(root)
            if keep:
                root.mkdir(mode=0o700); report.write_bytes(keep); report.chmod(0o600)
        elif not created:
            shutil.rmtree(root)


def download_bundle(config, output, name=None):
    drive = Drive(config)
    backups = committed_backups(drive)
    chosen = next((entry for entry in backups if entry[0] == name), None) if name else (backups[-1] if backups else None)
    if not chosen:
        raise RecoveryError("No matching committed backup")
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = output / chosen[0]
    drive.command(["copyto", drive.root + chosen[0], str(target)])
    if digest_file(target) != chosen[1]:
        target.unlink(); raise RecoveryError("Downloaded cloud backup checksum mismatch")
    return target


def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("restore"); s.add_argument("--bundle", type=Path); s.add_argument("--config", type=Path)
    s.add_argument("--name"); s.add_argument("--root", type=Path, required=True)
    s.add_argument("--age", default="age"); s.add_argument("--identity", type=Path)
    s.add_argument("--port", type=int, default=8443); s.add_argument("--drill", action="store_true")
    s = sub.add_parser("stop"); s.add_argument("--root", type=Path, required=True)
    a = p.parse_args()
    try:
        if a.command == "stop": cleanup(a.root); print("Recovery containers stopped and isolated volumes removed.")
        else:
            with tempfile.TemporaryDirectory(prefix="mn-recovery-download-") as tmp:
                bundle = a.bundle
                if bundle is None:
                    if not a.config: raise RecoveryError("Supply --config to download a cloud backup, or --bundle")
                    bundle = download_bundle(json.loads(a.config.read_text()), Path(tmp), a.name)
                print(json.dumps(restore(bundle, a.root.resolve(), a.age, a.identity, a.port, a.drill), ensure_ascii=False))
    except Exception:
        print("Restore failed. Secrets are suppressed; check prerequisites and the protected recovery report.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
