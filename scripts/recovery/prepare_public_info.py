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


def sections(source):
    pages = {"index.html": [], "privacy.html": [], "terms.html": []}
    current = "index.html"
    destinations = {
        "privacy policy": "privacy.html", "privacy": "privacy.html", "隐私政策": "privacy.html",
        "instructions and terms of use": "terms.html", "terms": "terms.html", "使用说明与条款": "terms.html", "使用条款": "terms.html",
    }
    for block in source.strip().split("\n\n"):
        if block.startswith((">", '<a id="')): continue
        if block.startswith("**") and "English" in block and "简体中文" in block: continue
        if block.startswith("## "):
            heading = block[3:].strip().casefold()
            if heading not in destinations:
                raise ValueError("Unknown public information section: " + block[3:])
            current = destinations[heading]
            pages[current].append("<h1>" + inline(block[3:]) + "</h1>")
        elif block.startswith("# "):
            pages[current].append("<h1>" + inline(block[2:]) + "</h1>")
        else:
            pages[current].append("<p>" + inline(block.replace("\n", " ")) + "</p>")
    if any(not blocks for blocks in pages.values()):
        raise ValueError("Public information must include overview, privacy, and terms sections")
    return pages


def render_pages(english, chinese):
    en, zh = sections(english), sections(chinese)
    nav = '<nav aria-label="Documentation"><a href="./">Backup overview / 备份说明</a> · <a href="privacy.html">Privacy / 隐私政策</a> · <a href="terms.html">Terms / 使用条款</a></nav>'
    css = "body{margin:0;background:#f7f7f3;color:#18241f;font:17px/1.8 system-ui,sans-serif}main{max-width:46rem;margin:auto;padding:32px 20px;overflow-wrap:anywhere}h1{font-size:1.65rem;line-height:1.4}nav{padding-bottom:20px;border-bottom:1px solid #d8ddd7}a{color:#245b43;text-underline-offset:3px}code{font-size:.95em}p{margin:20px 0}a:focus-visible{outline:2px solid #245b43;outline-offset:4px}"
    pages = {}
    for name in en:
        languages = '<p><a href="#english">English</a> · <a href="#chinese" lang="zh-CN">简体中文</a></p>'
        body = '<section id="english" lang="en">' + "".join(en[name]) + '</section><hr><section id="chinese" lang="zh-CN">' + "".join(zh[name]) + '</section>'
        pages[name] = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Massage Note Backups</title><style>' + css + '</style><main>' + nav + languages + body + "</main></html>\n"
    return pages


def main():
    repo = Path(__file__).resolve().parents[2]
    source = repo / "docs/operations/BACKUP_PUBLIC_PAGE.md"
    pages = render_pages(source.read_text(), source.with_name("BACKUP_PUBLIC_PAGE.zh-CN.md").read_text())
    directory = repo / ".local-ai/recovery/public-info"
    www = directory / "www"; www.mkdir(parents=True, exist_ok=True, mode=0o755)
    directory.chmod(0o700)
    for name, document in pages.items():
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
