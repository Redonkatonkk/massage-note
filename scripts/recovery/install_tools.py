#!/usr/bin/env python3
"""Download only pinned, SHA-256 verified official recovery binaries."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[2] / ".local-ai/recovery/tools")
    args = parser.parse_args()
    lock = json.loads(Path(__file__).with_name("toolchain.json").read_text())
    for item in lock["binaries"]:
        with urllib.request.urlopen(item["url"], timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise SystemExit("Official binary checksum mismatch; installation stopped")
        destination = args.directory / item["platform"]
        destination.mkdir(parents=True, exist_ok=True)
        if item["name"].endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for tool in item["tools"]:
                    matches = [n for n in archive.namelist() if n.endswith("/" + tool)]
                    if len(matches) != 1: raise SystemExit("Unexpected release archive")
                    (destination / tool).write_bytes(archive.read(matches[0]))
        else:
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                for tool in item["tools"]:
                    matches = [n for n in archive.getmembers() if n.isfile() and n.name.endswith("/" + tool)]
                    if len(matches) != 1: raise SystemExit("Unexpected release archive")
                    (destination / tool).write_bytes(archive.extractfile(matches[0]).read())
        for tool in item["tools"]: (destination / tool).chmod(0o755)
        print("Verified and installed:", item["name"])


if __name__ == "__main__": main()
