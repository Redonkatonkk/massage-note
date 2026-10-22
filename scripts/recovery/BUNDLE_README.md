<a id="独立恢复包操作说明"></a>

# Independent recovery package operation instructions

**English** | **[简体中文](BUNDLE_README.zh-CN.md)**

This package contains the production database, roles and permissions, offline images, complete runtime configuration, reverse proxy and public information pages, backup configuration, and recovery tools. `manifest.json` records each file’s SHA-256; `baseline.json` uses the same database snapshot; `validation.json` records the isolated NAS restore result. Configuration and credentials are inside the encrypted package. Restrict the decrypted directory to its owner.

This Mac’s age private key is stored separately in the system keychain: service `com.massagenote.recovery.age-identity`, account `massage-note-production`. Drive’s persistent authorization is in the Mac’s restricted configuration; downloading does not require the original NAS. Recovery requires age, rclone, Python, and Docker. Application, PostgreSQL, Redis, and HTTPS proxy images load from this package; Compose must not pull images.

If the project tools remain available, run `scripts/recovery/restore.py` with the local `mac-config.json` to download and restore. To use only the bundled tools, verify the download against its matching `.sha256`, decrypt and extract it with the independent private key, then run from the package’s `tools` directory:

```sh
python3 tools/restore.py restore \
  --bundle /absolute/path/mn-recovery-TIMESTAMP-RANDOM.tar.gz.age \
  --age /absolute/path/age \
  --root /absolute/path/new-recovery-directory --drill
```

The default reads the separate keychain identity; `--identity` accepts another securely stored age private key. Validate extracted files with `python3 tools/recovery.py check-payload /absolute/path/extracted-payload`. After validating the database, permissions, images, HTTPS/API, login sessions, financial queries, and isolated writes, `--drill` removes this recovery’s containers, volumes, and plaintext, retaining only the report. Use a new recovery directory. An occupied port causes failure without stopping other projects.

Omit `--drill` for a real recovery; the service listens only on `127.0.0.1:8443`. Resolve the original domain to `127.0.0.1` locally and trust the recovery directory’s `root.crt` on the Mac; leave public DNS unchanged. Before restoring, pause the Mac Messages agent and reconcile its local sending log with pending snapshot tasks. Outgoing SMS webhooks are disabled initially. Other devices do not automatically connect to this instance.

The NAS normally backs up daily at 00:00 America/New_York. Retain the latest three successful packages after upload and full readback; notify through Gmail after three failures. `backup-config.json`, `tools/nas-task.sh`, and the bundled tools can recreate task configuration without giving the NAS the decryption private key. Redis rate-limit state is rebuilt. Firebase, MiniMax, and Google accounts must remain valid. The package does not contain the entire DSM system, WeChat device login, or Mac Messages system data.
