#!/usr/bin/env python3
"""Encrypted, self-contained NAS recovery bundles. Python standard library only."""
import argparse
import contextlib
import datetime as dt
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import select
import shutil
import socket
import ssl
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import urllib.parse

FORMAT = 1
PREFIX = re.compile(r"^mn-recovery-\d{8}T\d{6}Z-[0-9a-f]{8}\.tar\.gz\.age$")
SERVICES = {"app", "postgres", "redis", "migrate", "harden"}
ACCOUNT = "jr24839652@gmail.com"


class RecoveryError(Exception):
    pass


def run(args, data=None, output=None):
    # Never expose command arguments or stderr: both can contain production secrets.
    try:
        p = subprocess.run([str(x) for x in args], input=data,
                           stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=1800)
        return p.stdout if output is None else b""
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise RecoveryError("Command failed: " + Path(str(args[0])).name) from None


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(value, f, ensure_ascii=False, sort_keys=True, indent=2)
        f.write("\n")
    path.chmod(0o600)


def compose_literal(value):
    if isinstance(value, str): return value.replace("$", "$$")
    if isinstance(value, list): return [compose_literal(x) for x in value]
    if isinstance(value, dict): return {k: compose_literal(v) for k, v in value.items()}
    return value


def digest_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def environment(container):
    return dict(x.split("=", 1) for x in container["Config"].get("Env", []) if "=" in x)


def inspect_images(references):
    api = run(["docker", "version", "--format", "{{.Server.APIVersion}}"]).decode().strip()
    platform = ["--platform", "linux/amd64"] if tuple(int(x) for x in api.split(".")) >= (1, 49) else []
    return json.loads(run(["docker", "image", "inspect"] + platform + list(references)))


def save_images(references, output):
    api = run(["docker", "version", "--format", "{{.Server.APIVersion}}"]).decode().strip()
    platform = ["--platform", "linux/amd64"] if tuple(int(x) for x in api.split(".")) >= (1, 48) else []
    run(["docker", "image", "save"] + platform + list(references), output=output)


def image_fingerprint(image):
    # Classic Docker identifies config JSON; Docker's containerd store identifies manifests.
    # The archive SHA verifies the bytes; compare filesystem and executable configuration across stores.
    fields = ["User", "Env", "Entrypoint", "Cmd", "WorkingDir", "ExposedPorts", "Volumes", "Labels", "StopSignal", "Healthcheck"]
    value = {"os": image.get("Os"), "architecture": image.get("Architecture"),
             "layers": image.get("RootFS", {}).get("Layers", []),
             "config": {k: image.get("Config", {}).get(k) or None for k in fields}}
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def inspect_project(project):
    ids = run(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]).decode().split()
    if not ids:
        raise RecoveryError("Production project not found")
    items = json.loads(run(["docker", "inspect"] + ids))
    result = {}
    for c in items:
        name = c["Config"].get("Labels", {}).get("com.docker.compose.service")
        if name in SERVICES:
            if name in result:
                raise RecoveryError("Duplicate production service")
            result[name] = c
        elif c.get("State", {}).get("Running"):
            raise RecoveryError("Uninventoried running service in production project")
    if set(result) != SERVICES:
        raise RecoveryError("Production service inventory incomplete")
    for name in ["app", "postgres", "redis"]:
        if not result[name]["State"].get("Running"):
            raise RecoveryError("Production dependency not running")
    if len({result[n]["Image"] for n in ["app", "migrate", "harden"]}) != 1:
        raise RecoveryError("Application and migration images differ")
    # Unknown persistent files must be inventoried, never silently omitted.
    for name, c in result.items():
        expected = {"/var/lib/postgresql/data"} if name == "postgres" else ({"/data"} if name == "redis" else set())
        if {m["Destination"] for m in c.get("Mounts", [])} != expected:
            raise RecoveryError("Uninventoried persistent mount: " + name)
    return result


def stable_inventory(items):
    return {n: {"image": c["Image"], "config": c["Config"], "mounts": c.get("Mounts", []),
                "restart": c.get("HostConfig", {}).get("RestartPolicy")}
            for n, c in items.items()}


class SqlSession:
    """Keep the pg_export_snapshot transaction alive until dump AND baseline finish."""
    def __init__(self, container):
        self.error_file = tempfile.TemporaryFile()
        self.process = subprocess.Popen([
            "docker", "exec", "-i", container, "sh", "-c",
            'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.error_file, bufsize=0)
        self.pending = b""

    def query(self, sql):
        marker = "end_" + secrets.token_hex(16)
        self.process.stdin.write((sql.rstrip(";\n") + ";\n\\echo " + marker + "\n").encode())
        self.process.stdin.flush()
        result, deadline = [], time.monotonic() + 120
        while True:
            while b"\n" in self.pending:
                line, self.pending = self.pending.split(b"\n", 1)
                if line.decode() == marker: return "\n".join(result)
                result.append(line.decode())
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([self.process.stdout], [], [], remaining)[0]:
                raise RecoveryError("Database verification query timed out")
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk: raise RecoveryError("Database snapshot session failed")
            self.pending += chunk

    def close(self):
        if self.process.poll() is None:
            with contextlib.suppress(BrokenPipeError): self.process.stdin.close()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.process.stdout.close()
        self.error_file.close()


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def canonical_check(session, schema, table, expression):
    # Old cluster expression trees can deparse with nested ANDs or array casts.
    # PostgreSQL plans both forms into the same expression without executing rows.
    plan = json.loads(session.query("EXPLAIN (VERBOSE TRUE, COSTS FALSE, FORMAT JSON) SELECT (" + expression + ") FROM " + identifier(schema) + "." + identifier(table) + " AS check_row"))
    return plan[0]["Plan"]["Output"]


def constraint_baseline(session):
    constraints = json.loads(session.query("SELECT coalesce(json_agg(x),'[]') FROM (SELECT n.nspname AS schema,c.relname AS table_name,k.conname AS name,k.contype AS kind,k.convalidated AS validated,k.connoinherit AS no_inherit,pg_get_constraintdef(k.oid) AS definition,CASE WHEN k.contype='c' THEN pg_get_expr(k.conbin,k.conrelid) END AS expression FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x"))
    for constraint in constraints:
        expression = constraint.pop("expression")
        if constraint["kind"] == "c":
            constraint["definition"] = canonical_check(session, constraint["schema"], constraint["table_name"], expression)
    return sorted(constraints, key=lambda row: json.dumps(row, sort_keys=True))


def database_baseline(session):
    tables = json.loads(session.query("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public'"))
    result = {"tables": {}}
    for table in tables:
        # Sort row hashes, including duplicates, independent of scan and restore order.
        query = "SELECT json_build_object('rows',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public." + identifier(table) + " t) rows"
        result["tables"][table] = json.loads(session.query(query))
    result["constraints"] = constraint_baseline(session)
    result["indexes"] = json.loads(session.query("SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x"))
    result["grants"] = json.loads(session.query("SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT grantor,grantee,table_schema,table_name,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema='public') x"))
    result["roles"] = json.loads(session.query("SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname !~ '^pg_') x"))
    result["roleMemberships"] = json.loads(session.query("SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members) x"))
    result["rolePasswordDigests"] = json.loads(session.query("SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT rolname,md5(rolpassword) AS digest FROM pg_authid WHERE rolname !~ '^pg_') x"))
    result["financialTotals"] = {}
    for table, date, columns, extra in [
        ("work_records", "business_date", ["actual_service_collected_cents", "total_tip_cents", "employee_total_income_cents", "customer_total_paid_cents"], ["status"]),
        ("gift_card_sales", "business_date", ["cash_cents", "card_cents", "amount_cents"], []),
        ("daily_cash_settlements", "business_date", ["cash_received_cents", "cash_wage_shortfall_cents"], ["status"]),
        ("payroll_settlements", "settlement_date", ["service_wage_cents", "adjustment_cents", "total_paid_cents"], []),
    ]:
        groups = ["store_id", date] + extra
        fields = [identifier(c) for c in groups] + ["count(*) AS records"]
        fields += ["coalesce(sum(" + identifier(c) + "),0)::text AS " + identifier(c) for c in columns]
        query = "SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (SELECT " + ",".join(fields) + " FROM public." + identifier(table) + " WHERE deleted_at IS NULL GROUP BY " + ",".join(identifier(c) for c in groups) + ") x"
        result["financialTotals"][table] = json.loads(session.query(query))
    result["database"] = json.loads(session.query("SELECT json_build_object('owner',pg_get_userbyid(d.datdba),'connectionLimit',d.datconnlimit,'encoding',pg_encoding_to_char(d.encoding),'collate',d.datcollate,'ctype',d.datctype,'acl',(SELECT json_agg(x ORDER BY x::text) FROM (SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type AS privilege,a.is_grantable AS grantable FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a) x)) FROM pg_database d WHERE d.datname=current_database()"))
    return result


def baseline_for(container):
    session = SqlSession(container)
    try:
        session.query("SET TIME ZONE 'UTC'; BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return database_baseline(session)
    finally:
        session.close()


def wait_database(container, user, database):
    for _ in range(90):
        try:
            # PostgreSQL's init server accepts Unix-socket connections before initialization
            # is complete, but does not listen on TCP. Wait for the final server.
            run(["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", user, "-d", database])
            return
        except RecoveryError:
            time.sleep(1)
    raise RecoveryError("Restored PostgreSQL did not become ready")


def restore_dump(container, dump, user, database):
    with open(dump, "rb") as f, tempfile.TemporaryFile() as errors:
        p = subprocess.run(["docker", "exec", "-i", container, "pg_restore", "--single-transaction",
                            "--exit-on-error", "-U", user, "-d", database],
                           stdin=f, stdout=subprocess.DEVNULL, stderr=errors)
        if p.returncode:
            raise RecoveryError("Database restore failed")


def restore_globals(container, payload, user, database):
    roles = json.loads((payload / "roles.json").read_text())
    if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) for name in roles):
        raise RecoveryError("A source cluster role requires a dedicated restore adapter")
    session = SqlSession(container)
    try:
        for name in roles:
            session.query("DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='" + name + "') THEN CREATE ROLE " + identifier(name) + "; END IF; END$$")
    finally:
        session.close()
    sql = "\n".join(line for line in (payload / "globals.sql").read_text().splitlines() if not line.startswith("CREATE ROLE "))
    run(["docker", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database], data=sql.encode())
    access = json.loads((payload / "baseline.json").read_text())["database"]
    target = identifier(database)
    statements = ["ALTER DATABASE " + target + " OWNER TO " + identifier(access["owner"]),
                  "ALTER DATABASE " + target + " CONNECTION LIMIT " + str(int(access["connectionLimit"]))]
    for role in ["PUBLIC"] + roles:
        statements.append("REVOKE ALL ON DATABASE " + target + " FROM " + ("PUBLIC" if role == "PUBLIC" else identifier(role)))
    for acl in access["acl"]:
        if acl["privilege"] not in ["CONNECT", "CREATE", "TEMPORARY"]:
            raise RecoveryError("Unsupported database privilege")
        grantee = "PUBLIC" if acl["role"] == "PUBLIC" else identifier(acl["role"])
        statements.append("GRANT " + acl["privilege"] + " ON DATABASE " + target + " TO " + grantee + (" WITH GRANT OPTION" if acl["grantable"] else ""))
    run(["docker", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database], data=(";\n".join(statements) + ";\n").encode())


def validate_permissions(container):
    # Globals + pg_restore preserve the actual role passwords, ownership and ACLs.
    # Validate the security boundary without rewriting restored grants/password hashes.
    session = SqlSession(container)
    try:
        permissions = json.loads(session.query("SELECT json_build_object('read',has_table_privilege('massage_note_app','users','SELECT'),'write',has_table_privilege('massage_note_app','users','UPDATE'),'ddl',has_schema_privilege('massage_note_app','public','CREATE'),'audit_delete',has_table_privilege('massage_note_app','audit_logs','DELETE'),'outbox_delete',has_table_privilege('massage_note_app','domain_outbox','DELETE'),'login',(SELECT rolcanlogin FROM pg_roles WHERE rolname='massage_note_app'),'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname='massage_note_app'))"))
        if permissions != {"read": True, "write": True, "ddl": False, "audit_delete": False, "outbox_delete": False, "login": True, "superuser": False}:
            raise RecoveryError("Restored database permissions differ")
    finally:
        session.close()


def verify_database(payload, inventory, expected):
    pg = environment(inventory["postgres"])
    name = "mn-recovery-verify-" + secrets.token_hex(6)
    created = False
    started = time.monotonic()
    try:
        run(["docker", "run", "-d", "--pull=never", "--name", name, "--network", "none",
             "--label", "com.massagenote.recovery=verification", "--memory=768m",
             "-v", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
             "-e", "POSTGRES_USER=" + pg["POSTGRES_USER"], "-e", "POSTGRES_DB=" + pg["POSTGRES_DB"], inventory["postgres"]["Image"]])
        created = True
        wait_database(name, pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        restore_globals(name, payload, pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        restore_dump(name, payload / "database.dump", pg["POSTGRES_USER"], pg["POSTGRES_DB"])
        actual = baseline_for(name)
        if actual != expected:
            write_json(payload.parent.parent / "last-validation-difference.json", {
                "sections": sorted(k for k in expected if expected[k] != actual.get(k)),
                "tables": sorted(k for k in expected["tables"] if expected["tables"][k] != actual["tables"].get(k)),
                "databaseFields": sorted(k for k in expected["database"] if expected["database"][k] != actual["database"].get(k)),
                "constraintsSourceOnly": [c for c in expected["constraints"] if c not in actual["constraints"]][:20],
                "constraintsRestoredOnly": [c for c in actual["constraints"] if c not in expected["constraints"]][:20],
                "locales": {"source": {k: expected["database"][k] for k in ["encoding", "collate", "ctype"]},
                            "restored": {k: actual["database"][k] for k in ["encoding", "collate", "ctype"]}}})
            raise RecoveryError("Restored data/schema does not match the exported snapshot")
        validate_permissions(name)
        return {"databaseRestore": "passed", "allPublicTables": len(expected["tables"]),
                "schemaAndPermissions": "passed", "durationSeconds": round(time.monotonic() - started, 2)}
    finally:
        if created:
            run(["docker", "rm", "-fv", name])


def require_space(directory, required):
    if shutil.disk_usage(directory).free < required:
        raise RecoveryError("Insufficient local space; existing backups retained")


def make_manifest(payload, details):
    files = {}
    for path in sorted(payload.rglob("*")):
        if path.is_symlink():
            raise RecoveryError("Symlinks are not allowed in recovery payload")
        if path.is_file() and path.name != "manifest.json":
            files[path.relative_to(payload).as_posix()] = {"sha256": digest_file(path), "bytes": path.stat().st_size}
    required = {"database.dump", "globals.sql", "roles.json", "inventory.json", "baseline.json", "validation.json", "images.tar", "production-compose.json", "proxy.json", "harden-database.sh", "tools/recovery.py", "tools/restore.py", "tools/setup.py", "tools/README.md", "backup-config.json", "rclone.conf", "smtp-password"}
    if (payload / "backup-config.json").is_file() and json.loads((payload / "backup-config.json").read_text()).get("public_info_dir"):
        required.update("public-info/" + name for name in PUBLIC_INFO_FILES)
    if not required.issubset(files):
        raise RecoveryError("Required recovery payload is missing")
    return {"formatVersion": FORMAT, "files": files, **details}


PUBLIC_INFO_FILES = ("Caddyfile", "compose.json", "www/index.html", "www/privacy.html", "www/terms.html")


def public_info_snapshot(directory):
    root = Path(directory)
    result = {}
    for name in PUBLIC_INFO_FILES:
        source = root / name
        if source.is_symlink() or not source.is_file():
            raise RecoveryError("Public information deployment is incomplete")
        result[name] = source.read_bytes()
    return result


def validate_payload(payload):
    manifest = json.loads((payload / "manifest.json").read_text())
    if manifest.get("formatVersion") != FORMAT:
        raise RecoveryError("Unsupported recovery format")
    actual = {p.relative_to(payload).as_posix() for p in payload.rglob("*") if p.is_file() and p.name != "manifest.json"}
    if actual != set(manifest["files"]):
        raise RecoveryError("Recovery file inventory mismatch")
    for name, expected in manifest["files"].items():
        path = payload / name
        if path.is_symlink() or path.stat().st_size != expected["bytes"] or digest_file(path) != expected["sha256"]:
            raise RecoveryError("Recovery file checksum mismatch")
    # Recheck mandatory fields/files even when an archive carries a syntactically valid manifest.
    make_manifest(payload, {})
    if json.loads((payload / "validation.json").read_text()).get("databaseRestore") != "passed":
        raise RecoveryError("Bundle has no successful database restore validation")
    return manifest


def safe_extract(archive, destination):
    with tarfile.open(archive, "r:gz") as tar:
        names = set()
        for member in tar.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or member.name in names or not (member.isdir() or member.isfile()):
                raise RecoveryError("Unsafe recovery archive member")
            names.add(member.name)
        require_space(destination, sum(m.size for m in tar.getmembers()) + 1024 * 1024)
        for member in tar.getmembers():
            target = destination.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with tar.extractfile(member) as src, open(target, "xb") as dst:
                    shutil.copyfileobj(src, dst)
                target.chmod(0o600)


class Drive:
    def __init__(self, config):
        self.config = config
        self.prefix = [config.get("rclone", "rclone"), "--config", config["rclone_config"], "--retries", "1", "--low-level-retries", "2", "--timeout", "2m"]
        self.root = config.get("remote", "mn-backup") + ":"
        # A bound folder and drive.file scope are mandatory; an accidentally unbound root must never be pruned.
        import configparser
        parser = configparser.ConfigParser(interpolation=None)
        parser.read(config["rclone_config"])
        section = parser[config.get("remote", "mn-backup")]
        if section.get("root_folder_id") != config["drive_folder_id"] or section.get("scope") != "drive.file":
            raise RecoveryError("Google Drive scope/folder binding mismatch")

    def command(self, args):
        return run(self.prefix + args)

    def read(self, name):
        return self.command(["cat", self.root + name])

    def listing(self):
        return json.loads(self.command(["lsjson", self.root, "--files-only", "--max-depth", "1"]))

    def delete(self, name):
        candidate = name[:-7] if name.endswith(".sha256") else name
        if not PREFIX.fullmatch(candidate):
            raise RecoveryError("Refusing to delete an unrelated Drive file")
        self.command(["deletefile", self.root + name, "--drive-use-trash=false"])

    def verify(self, name, expected, size):
        with tempfile.TemporaryFile() as errors:
            p = subprocess.Popen(self.prefix + ["cat", self.root + name], stdout=subprocess.PIPE, stderr=errors)
            h, total = hashlib.sha256(), 0
            for block in iter(lambda: p.stdout.read(1024 * 1024), b""):
                h.update(block); total += len(block)
            p.stdout.close()
            if p.wait() or h.hexdigest() != expected or total != size:
                raise RecoveryError("Cloud readback checksum mismatch")

    def available(self):
        quota = json.loads(self.command(["about", self.root, "--json"]))
        if "free" not in quota:
            raise RecoveryError("Google Drive quota could not be verified")
        return quota["free"]


def committed_backups(drive):
    items = {x["Name"]: x for x in drive.listing() if not x.get("IsDir")}
    result = []
    for name in items:
        if PREFIX.fullmatch(name) and name + ".sha256" in items:
            marker = drive.read(name + ".sha256").decode().strip()
            if re.fullmatch(r"[0-9a-f]{64}", marker):
                result.append((name, marker))
    return sorted(result)


def publish(drive, archive, keep=3):
    if keep != 3 or not PREFIX.fullmatch(archive.name):
        raise RecoveryError("Invalid backup retention/name")
    size, checksum = archive.stat().st_size, digest_file(archive)
    if drive.available() < size + 1024 * 1024:
        raise RecoveryError("Insufficient Google Drive space; existing backups retained")
    committed = False
    try:
        drive.command(["copyto", str(archive), drive.root + archive.name, "--immutable"])
        drive.verify(archive.name, checksum, size)
        marker = archive.with_name(archive.name + ".sha256")
        marker.write_text(checksum + "\n"); marker.chmod(0o600)
        drive.command(["copyto", str(marker), drive.root + marker.name, "--immutable"])
        if drive.read(marker.name).decode().strip() != checksum:
            raise RecoveryError("Cloud completion marker verification failed")
        committed = True
        backups = committed_backups(drive)
        if archive.name not in {x[0] for x in backups}:
            raise RecoveryError("New cloud backup was not committed")
        for old, _ in backups[:-keep]:
            drive.delete(old)
            drive.delete(old + ".sha256")
        return {"name": archive.name, "sha256": checksum, "bytes": size,
                "retained": [name for name, _ in backups[-keep:]]}
    finally:
        if not committed:
            # Only this attempt's unique objects; never touch previous backups on failure.
            for name in [archive.name + ".sha256", archive.name]:
                with contextlib.suppress(RecoveryError):
                    drive.delete(name)


def backup_once(config):
    root = Path(config["work_dir"])
    root.mkdir(parents=True, exist_ok=True, mode=0o700); root.chmod(0o700)
    original = inspect_project(config.get("production_project", "mn"))
    images = sorted({c["Image"] for c in original.values()} | {config["proxy_image"]} | ({config["runner_image"]} if config.get("runner_image") else set()))
    image_info = inspect_images(images)
    if len(image_info) != len(images):
        raise RecoveryError("An offline image is missing")
    if any(x.get("Os") != "linux" or x.get("Architecture") != "amd64" for x in image_info):
        raise RecoveryError("Backup image platform is not linux/amd64")
    require_space(root, sum(x["Size"] for x in image_info) * 4 + 1024 ** 3)
    with tempfile.TemporaryDirectory(prefix="run-", dir=root) as temporary:
        work = Path(temporary); payload = work / "payload"; payload.mkdir(mode=0o700)
        pg = original["postgres"]
        session = SqlSession(pg["Id"])
        try:
            session.query("SET TIME ZONE 'UTC'; BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            snapshot = session.query("SELECT pg_export_snapshot()")
            snapshot_at = json.loads(session.query("SELECT to_json(transaction_timestamp())"))
            with open(payload / "database.dump", "wb") as output:
                run(["docker", "exec", pg["Id"], "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --lock-wait-timeout=60s --snapshot="$1"', "sh", snapshot], output=output)
            expected = database_baseline(session)
            write_json(payload / "roles.json", [role["rolname"] for role in expected["roles"]])
            with open(payload / "globals.sql", "wb") as output:
                run(["docker", "exec", pg["Id"], "sh", "-c", 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only --no-tablespaces'], output=output)
        finally:
            session.close()
        write_json(payload / "baseline.json", expected)
        write_json(payload / "inventory.json", original)
        run(["docker", "cp", original["app"]["Id"] + ":/opt/massage-note/harden-database.sh", payload / "harden-database.sh"])
        labels = original["app"]["Config"].get("Labels", {})
        working_dir = labels.get("com.docker.compose.project.working_dir")
        compose_files = labels.get("com.docker.compose.project.config_files", "").split(",")
        if not working_dir or not all(compose_files):
            raise RecoveryError("Production compose source cannot be located")
        command = ["docker", "compose", "--project-directory", working_dir]
        for filename in compose_files:
            command += ["-f", filename]
        compose = json.loads(run(command + ["config", "--format", "json"]))
        write_json(payload / "production-compose.json", compose)
        proxy_source = Path(config["proxy_source"])
        proxy_bytes = proxy_source.read_bytes()
        hostname = urllib.parse.urlsplit(environment(original["app"])["WEB_ORIGIN"]).hostname
        rules = []
        def visit(value):
            if isinstance(value, dict):
                if "frontend" in value and "backend" in value and hostname in json.dumps(value["frontend"]):
                    rules.append(value)
                else:
                    for child in value.values(): visit(child)
            elif isinstance(value, list):
                for child in value: visit(child)
        visit(json.loads(proxy_bytes))
        if not rules:
            raise RecoveryError("Application reverse proxy configuration not found")
        write_json(payload / "proxy.json", rules)
        public_info = public_info_snapshot(config["public_info_dir"]) if config.get("public_info_dir") else None
        if public_info is not None:
            for name, data in public_info.items():
                target = payload / "public-info" / name
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                target.write_bytes(data)
        write_json(payload / "backup-config.json", {k: v for k, v in config.items() if k != "smtp_password"})
        shutil.copyfile(config["rclone_config"], payload / "rclone.conf")
        shutil.copyfile(config["smtp_password_file"], payload / "smtp-password")
        shutil.copytree(Path(__file__).parent, payload / "tools", ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "test_*"))
        report = verify_database(payload, original, expected)
        write_json(payload / "validation.json", report)
        with open(payload / "images.tar", "wb") as output:
            save_images(images, output)
        if stable_inventory(inspect_project(config.get("production_project", "mn"))) != stable_inventory(original):
            raise RecoveryError("Deployment changed during backup; retry required")
        if json.loads(run(command + ["config", "--format", "json"])) != compose or proxy_source.read_bytes() != proxy_bytes:
            raise RecoveryError("Deployment configuration changed during backup; retry required")
        if public_info is not None and public_info_snapshot(config["public_info_dir"]) != public_info:
            raise RecoveryError("Public information configuration changed during backup; retry required")
        name = "mn-recovery-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4) + ".tar.gz.age"
        manifest = make_manifest(payload, {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                                         "snapshotAt": snapshot_at,
                                         "sourceImages": image_info, "proxyImage": inspect_images([config["proxy_image"]])[0]["Id"],
                                         "imageReferences": {ref: inspect_images([ref])[0]["Id"] for ref in images},
                                         "sourceProject": config.get("production_project", "mn")})
        write_json(payload / "manifest.json", manifest)
        plain = work / "bundle.tar.gz"
        with tarfile.open(plain, "w:gz", compresslevel=6) as tar:
            for path in sorted(payload.rglob("*")):
                if path.is_file():
                    tar.add(path, arcname=path.relative_to(payload).as_posix(), recursive=False)
        encrypted = work / name
        run([config.get("age", "age"), "-r", config["age_recipient"], "-o", encrypted, plain])
        plain.unlink()
        return publish(Drive(config), encrypted)


def notify_failure(config, test=False):
    import smtplib
    from email.message import EmailMessage
    password_file = Path(config["smtp_password_file"])
    message = EmailMessage()
    message["From"] = ACCOUNT; message["To"] = ACCOUNT
    message["Subject"] = "Massage Note：备份通知配置测试" if test else "Massage Note：每日云端备份失败"
    text = "这是一封配置测试邮件，说明备份通知发信配置可用。" if test else "每日备份在三次尝试后仍未完成。请检查 NAS 任务日志、Google Drive 授权和空间；已有备份不会因本次上传或校验失败而轮换。"
    message.set_content(text + "\n" + dt.datetime.now(dt.timezone.utc).isoformat())
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(ACCOUNT, password_file.read_text().strip())
        smtp.send_message(message)


def backup(config):
    root = Path(config["work_dir"]); root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(root / "backup.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RecoveryError("A backup is already running") from None
        for attempt in range(3):
            try:
                result = backup_once(config)
                write_json(root / "last-success.json", {"at": dt.datetime.now(dt.timezone.utc).isoformat(), **result})
                return result
            except (RecoveryError, OSError, ValueError, KeyError) as error:
                write_json(root / "last-attempt.json", {"attempt": attempt + 1, "status": "failed", "reason": str(error) if isinstance(error, RecoveryError) else type(error).__name__, "at": dt.datetime.now(dt.timezone.utc).isoformat()})
                if attempt < 2:
                    time.sleep(15 * (attempt + 1))
        try:
            notify_failure(config)
        except Exception:
            raise RecoveryError("Backup failed three times; email notification ALSO failed") from None
        raise RecoveryError("Backup failed three times; failure email sent")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("backup"); p.add_argument("--config", required=True)
    p = commands.add_parser("check-payload"); p.add_argument("directory")
    args = parser.parse_args()
    try:
        if args.command == "backup":
            result = backup(json.loads(Path(args.config).read_text()))
        else:
            m = validate_payload(Path(args.directory)); result = {"valid": True, "files": len(m["files"])}
        print(json.dumps(result, ensure_ascii=False))
    except (RecoveryError, OSError, ValueError, KeyError):
        print("Recovery operation failed; inspect the protected local status files. No secrets are printed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
