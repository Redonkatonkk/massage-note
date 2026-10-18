#!/usr/bin/env python3
"""Build the offline NAS worker and prepare a private installation directory."""
import argparse
import gzip
import json
import os
from pathlib import Path
import shutil
import sys

from recovery import RecoveryError, digest_file, run, save_images, write_json


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-only", action="store_true", help="Prepare image files without Google/Gmail credentials")
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[2] / ".local-ai/recovery")
    a = parser.parse_args()
    tools = Path(__file__).resolve().parent
    repo = tools.parents[1]
    version = (repo / "VERSION").read_text().strip()
    lock = json.loads((tools / "toolchain.json").read_text())
    directory = a.directory.resolve(); directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    build = directory / "build"; (build / "tools/linux").mkdir(parents=True, exist_ok=True)
    shutil.copytree(tools, build / "recovery", dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "test_*"))
    for name in ["age", "rclone"]: shutil.copy2(directory / "tools/linux" / name, build / "tools/linux" / name)
    shutil.copy2(tools / "Dockerfile", build / "Dockerfile")
    runner = "mn-recovery/runner:" + version
    run(["docker", "build", "--platform", "linux/amd64", "--build-arg", "PYTHON_IMAGE=" + lock["docker"]["python:3.12-alpine"],
         "--build-arg", "DOCKER_CLI_IMAGE=" + lock["docker"]["docker:28-cli"], "-t", runner, build])
    run(["docker", "pull", "--platform", "linux/amd64", lock["docker"]["caddy:2-alpine"]])
    proxy = "mn-recovery/proxy:2"
    run(["docker", "tag", lock["docker"]["caddy:2-alpine"], proxy])
    install = directory / "nas-install"; install.mkdir(exist_ok=True, mode=0o700); install.chmod(0o700)
    image_tar = directory / "runner-images.tar"
    try:
        with open(image_tar, "wb") as output: save_images([runner, proxy], output)
        with open(image_tar, "rb") as source, gzip.open(install / "runner-images.tar.gz", "wb", compresslevel=6) as target:
            shutil.copyfileobj(source, target)
    finally:
        image_tar.unlink(missing_ok=True)
    checksum = digest_file(install / "runner-images.tar.gz")
    (install / "runner-images.tar.gz.sha256").write_text(checksum + "  runner-images.tar.gz\n")
    parts = []
    for stale in install.glob("runner-images.tar.gz.part-*"):
        stale.unlink()
    with open(install / "runner-images.tar.gz", "rb") as source:
        number = 0
        while True:
            block = source.read(64 * 1024 * 1024)
            if not block: break
            name = "runner-images.tar.gz.part-%03d" % number
            (install / name).write_bytes(block); parts.append(name); number += 1
    (install / "runner-images.tar.gz").unlink()
    (install / "runner-image-reference").write_text(runner + "\n")
    shutil.copy2(tools / "nas-task.sh", install / "nas-task.sh"); (install / "nas-task.sh").chmod(0o700)
    shutil.copy2(tools / "load-runtime.sh", install / "load-runtime.sh"); (install / "load-runtime.sh").chmod(0o700)
    shutil.copytree(tools, install / "recovery", dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "test_*"))
    missing = [n for n in ["drive.json", "rclone.conf", "smtp-password", "recipient.txt"] if not (directory / n).exists()]
    if not missing:
        drive = json.loads((directory / "drive.json").read_text())
        nas = "/volume1/docker/massage-note-recovery"
        config = {"work_dir": nas + "/work", "production_project": "mn", "runner_image": runner, "proxy_image": proxy,
                  "proxy_source": "/host-dsm-proxy/ReverseProxy.json", "age_recipient": (directory / "recipient.txt").read_text().strip(),
                  "public_info_dir": nas + "/public-info",
                  "rclone_config": nas + "/rclone.conf", "smtp_password_file": nas + "/smtp-password",
                  "drive_folder_id": drive["production_folder_id"], "remote": "mn-backup"}
        config["schedule"] = {"timezone": "America/New_York", "hour": 0, "minute": 0,
                              "attempts": 3, "successfulCopies": 3, "taskName": "Massage Note Cloud Backup"}
        write_json(install / "config.json", config)
        for name in ["rclone.conf", "smtp-password"]: shutil.copyfile(directory / name, install / name); (install / name).chmod(0o600)
    write_json(directory / "installation-status.json", {"runtimePrepared": True, "credentialsPrepared": not missing, "missing": missing,
                                                       "runner": runner, "helperArchiveSha256": checksum, "parts": parts, "scheduled": False})
    print(json.dumps({"installationDirectory": str(install), "runtimePrepared": True, "credentialsPrepared": not missing, "missing": missing}, ensure_ascii=False))
    if missing and not a.runtime_only:
        raise RecoveryError("Complete Google/Gmail setup before installation")


if __name__ == "__main__":
    try: main()
    except Exception:
        print("Installation preparation did not complete; no credentials are printed.", file=sys.stderr)
        sys.exit(1)
