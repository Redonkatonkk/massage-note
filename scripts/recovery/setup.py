#!/usr/bin/env python3
"""Run interactively on the Mac. Secrets never pass through chat or shell history."""
import argparse
import configparser
import ctypes
import datetime as dt
import getpass
import http.server
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.parse
import urllib.request

from recovery import ACCOUNT, RecoveryError, run, write_json, notify_failure

SERVICE = "com.massagenote.recovery.age-identity"
KEY_ACCOUNT = "massage-note-production"
DEFAULT = Path(__file__).resolve().parents[2] / ".local-ai" / "recovery"


class IdentityMissing(RecoveryError):
    pass


def keychain_get():
    security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
    function = security.SecKeychainFindGenericPassword
    function.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32,
                         ctypes.c_char_p, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    function.restype = ctypes.c_int32
    service, account = SERVICE.encode(), KEY_ACCOUNT.encode()
    length, value = ctypes.c_uint32(), ctypes.c_void_p()
    status = function(None, len(service), service, len(account), account, ctypes.byref(length), ctypes.byref(value), None)
    if status == -25300: raise IdentityMissing("Recovery identity not found")
    if status != 0: raise RecoveryError("Recovery identity cannot be accessed; check macOS Keychain authorization")
    try:
        return ctypes.string_at(value, length.value).decode().strip()
    finally:
        security.SecKeychainItemFreeContent(None, value)


def keychain_add(secret):
    # Pass the secret to Security.framework in memory, never as a process argument.
    security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
    function = security.SecKeychainAddGenericPassword
    function.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32,
                         ctypes.c_char_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p]
    function.restype = ctypes.c_int32
    service, account, value = SERVICE.encode(), KEY_ACCOUNT.encode(), secret.encode()
    if function(None, len(service), service, len(account), account, len(value), value, None) != 0:
        raise RecoveryError("Could not store recovery identity in macOS Keychain")


def init(directory):
    age_keygen = directory / "tools" / "mac" / "age-keygen"
    try:
        identity = keychain_get()
    except IdentityMissing:
        identity = run([age_keygen]).decode()
        keychain_add(identity)
    recipient = run([age_keygen, "-y", "-"], data=identity.encode()).decode().strip()
    if not recipient.startswith("age1"):
        raise RecoveryError("Invalid age recipient")
    (directory / "recipient.txt").write_text(recipient + "\n")
    (directory / "recipient.txt").chmod(0o600)
    write_json(directory / "keychain.json", {"service": SERVICE, "account": KEY_ACCOUNT, "recipient": recipient})
    print("Recovery identity saved in macOS Keychain; only the public recipient is written to disk.")


def request_json(url, token=None, body=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=30) as response:
        return json.load(response)


def oauth(directory, client_path):
    client = json.loads(Path(client_path).read_text()).get("installed")
    if not client:
        raise RecoveryError("Download an OAuth Desktop application JSON, not a service-account key")
    state = secrets.token_urlsafe(32)
    result = {}

    class Callback(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if self.path.split("?", 1)[0] != "/callback" or query.get("state") != [state]:
                self.send_error(400); return
            if "code" in query:
                result["code"] = query["code"][0]
                self.send_response(200); self.end_headers()
                self.wfile.write("授权回调已接收。请返回终端查看完成结果，可以关闭此页面。".encode())
            else:
                result["error"] = True; self.send_error(400)

        def log_message(self, *args):
            pass  # Callback URLs contain an authorization code.

    verifier = secrets.token_urlsafe(64)
    import base64, hashlib
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    with http.server.HTTPServer(("127.0.0.1", 53682), Callback) as server:
        server.timeout = 600
        redirect = "http://127.0.0.1:53682/callback"
        params = {"client_id": client["client_id"], "redirect_uri": redirect, "response_type": "code",
                  "scope": "openid email https://www.googleapis.com/auth/drive.file", "access_type": "offline",
                  "prompt": "consent", "login_hint": ACCOUNT, "state": state,
                  "code_challenge": challenge, "code_challenge_method": "S256"}
        print("请亲自在浏览器打开以下 Google 授权链接（程序不会自动打开浏览器）：", flush=True)
        print("https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params), flush=True)
        server.handle_request()
    if not result.get("code"):
        raise RecoveryError("Google authorization was not completed")
    body = urllib.parse.urlencode({"code": result["code"], "client_id": client["client_id"],
                                  "client_secret": client["client_secret"], "redirect_uri": redirect,
                                  "grant_type": "authorization_code", "code_verifier": verifier}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), timeout=30) as response:
        token = json.load(response)
    if not token.get("refresh_token"):
        raise RecoveryError("Google did not issue an offline refresh token")
    profile = request_json("https://openidconnect.googleapis.com/v1/userinfo", token["access_token"])
    if profile.get("email") != ACCOUNT or not profile.get("email_verified"):
        raise RecoveryError("Wrong Google account; required " + ACCOUNT)

    def folder(name, parent):
        query = "trashed=false and mimeType='application/vnd.google-apps.folder' and name='" + name + "' and '" + parent + "' in parents"
        found = request_json("https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode({"q": query, "fields": "files(id,name)", "pageSize": 100}), token["access_token"])["files"]
        if len(found) > 1:
            raise RecoveryError("Duplicate backup folders; manual selection required")
        if found:
            return found[0]["id"]
        return request_json("https://www.googleapis.com/drive/v3/files?fields=id", token["access_token"],
                            {"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent]})["id"]

    parent = folder("Massage Note Backups", "root")
    production = folder("production", parent)
    # Verify owner and sharing before binding destructive retention to this folder.
    metadata = request_json("https://www.googleapis.com/drive/v3/files/" + production + "?fields=id,owners(emailAddress),permissions(type,role,emailAddress)", token["access_token"])
    if not any(x.get("emailAddress") == ACCOUNT for x in metadata.get("owners", [])):
        raise RecoveryError("Unexpected backup folder owner")
    if any(x.get("type") != "user" or x.get("emailAddress") != ACCOUNT for x in metadata.get("permissions", [])):
        raise RecoveryError("Backup folder is shared; refusing to continue")
    token["expiry"] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=token["expires_in"])).isoformat()
    saved_token = {k: token[k] for k in ["access_token", "refresh_token", "token_type", "expiry"]}
    parser = configparser.ConfigParser(interpolation=None)
    parser["mn-backup"] = {"type": "drive", "scope": "drive.file", "client_id": client["client_id"],
                           "client_secret": client["client_secret"], "root_folder_id": production,
                           "token": json.dumps(saved_token)}
    conf = directory / "rclone.conf"
    fd = os.open(str(conf), os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as stream:
        parser.write(stream)
    write_json(directory / "drive.json", {"email": ACCOUNT, "parent_folder_id": parent,
                                         "production_folder_id": production,
                                         "url": "https://drive.google.com/drive/folders/" + production})
    write_json(directory / "mac-config.json", {"rclone_config": str(conf.resolve()), "rclone": str((directory / "tools/mac/rclone").resolve()),
                                              "drive_folder_id": production, "remote": "mn-backup"})
    print("独立私有备份目录和 NAS 持续授权已准备好：")
    print("https://drive.google.com/drive/folders/" + production)


def mail(directory):
    password = getpass.getpass("Gmail 应用密码（隐藏输入，不是 Google 登录密码）: ").replace(" ", "")
    if len(password) != 16 or not password.isalnum():
        raise RecoveryError("Expected a 16-character Gmail app password")
    path = directory / "smtp-password"
    fd = os.open(str(path), os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(password + "\n")
    print("NAS 专用发信凭据已保存到本机受限文件；未发送邮件。")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init"); sub.add_parser("mail"); sub.add_parser("test-mail")
    p = sub.add_parser("oauth"); p.add_argument("--client-json", type=Path, required=True)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True, mode=0o700); args.directory.chmod(0o700)
    try:
        if args.command == "init": init(args.directory)
        elif args.command == "mail": mail(args.directory)
        elif args.command == "test-mail":
            notify_failure({"smtp_password_file": str(args.directory / "smtp-password")}, test=True)
            write_json(args.directory / "mail-verified.json", {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "sent"})
            print("配置测试邮件已发送给 " + ACCOUNT)
        else: oauth(args.directory, args.client_json)
    except Exception:
        print("设置未完成。请检查文件、授权账号和终端提示；程序不会输出凭据或 Google 错误响应。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
