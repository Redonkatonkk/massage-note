#!/usr/bin/env python3
"""Render the approved OAuth information page without changing the application."""
import html
import re
from pathlib import Path
import shutil

from recovery import write_json


def inline(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return re.sub(r"\[([^]]+)\]\((https://[^)]+)\)", r'<a href="\2">\1</a>', text)


def main():
    repo = Path(__file__).resolve().parents[2]
    source = (repo / "docs/operations/BACKUP_PUBLIC_PAGE.md").read_text()
    directory = repo / ".local-ai/recovery/public-info"
    www = directory / "www"; www.mkdir(parents=True, exist_ok=True, mode=0o755)
    directory.chmod(0o700)
    pages = {"index.html": [], "privacy.html": [], "terms.html": []}
    current = "index.html"
    for block in source.strip().split("\n\n"):
        if block.startswith(">"): continue
        if block.startswith("## "):
            current = "privacy.html" if block[3:] == "隐私政策" else "terms.html"
            pages[current].append("<h1>" + inline(block[3:]) + "</h1>")
        elif block.startswith("# "):
            pages[current].append("<h1>" + inline(block[2:]) + "</h1>")
        else:
            pages[current].append("<p>" + inline(block.replace("\n", " ")) + "</p>")
    nav = '<nav aria-label="说明目录"><a href="./">备份说明</a> · <a href="privacy.html">隐私政策</a> · <a href="terms.html">使用说明与条款</a></nav>'
    css = "body{margin:0;background:#f7f7f3;color:#18241f;font:17px/1.8 system-ui,sans-serif}main{max-width:46rem;margin:auto;padding:32px 20px;overflow-wrap:anywhere}h1{font-size:1.65rem;line-height:1.4}nav{padding-bottom:20px;border-bottom:1px solid #d8ddd7}a{color:#245b43;text-underline-offset:3px}code{font-size:.95em}p{margin:20px 0}a:focus-visible{outline:2px solid #245b43;outline-offset:4px}"
    for name, blocks in pages.items():
        document = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Massage Note Backups</title><style>' + css + '</style><main>' + nav + "".join(blocks) + "</main></html>\n"
        (www / name).write_text(document); (www / name).chmod(0o644)
    shutil.copy2(Path(__file__).with_name("public-info.Caddyfile"), directory / "Caddyfile")
    (directory / "Caddyfile").chmod(0o644)
    root = "/volume1/docker/massage-note-recovery/public-info"
    write_json(directory / "compose.json", {"name": "mn-recovery-public-info", "services": {"public-info": {
        "image": "mn-recovery/proxy:2", "platform": "linux/amd64", "pull_policy": "never",
        "restart": "unless-stopped", "network_mode": "host", "user": "65534:65534",
        "read_only": True, "cap_drop": ["ALL"], "cap_add": ["NET_BIND_SERVICE"],
        "security_opt": ["no-new-privileges:true"],
        "tmpfs": ["/config:uid=65534,gid=65534,mode=0700", "/data:uid=65534,gid=65534,mode=0700", "/tmp"], "mem_limit": "64m",
        "labels": {"com.massagenote.recovery": "public-info"},
        "volumes": [root + "/Caddyfile:/etc/caddy/Caddyfile:ro", root + "/www:/srv/info:ro"]}}})
    print("Public information and loopback proxy configuration prepared; not installed or published.")


if __name__ == "__main__":
    main()
