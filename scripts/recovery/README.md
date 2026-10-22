<a id="独立云端恢复包"></a>

# Standalone cloud recovery package

**English** | **[简体中文](README.zh-CN.md)**

This directory provides NAS daily backup and Mac on-demand recovery tools. For the first installation and actual test results, see [Disaster Recovery Manual](../../docs/operations/DISASTER_RECOVERY.md). The existing manual interfaces to `backup-database.sh` / `restore-database.sh` remain unchanged.

<a id="首次-google-设置由账号所有者完成"></a>

## First time Google setup (to be completed by the account owner)

Run the first time on this Mac to prepare tools and keychains:

```sh
python3 scripts/recovery/install_tools.py
python3 scripts/recovery/setup.py init
```

Tool downloads are fixed to the official version and SHA-256 in `toolchain.json`; existing keychain private keys will be retained. Reason: Running recovery packages cannot rely on decryption keys on the NAS, nor can tools use unverified downloads.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create the free project `Massage Note Backup`; this project does not require enabling paid computing resources. Enable [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com). Reason: NAS cannot reuse chat connector tokens, and rclone's shared OAuth client is not a long-term dependency.
2. Configure Branding (application name `Massage Note Backups`, support email `jr24839652@gmail.com`), Audience (External) in Google Auth Platform, and Data Access only add `openid`, email and `https://www.googleapis.com/auth/drive.file`. Set Audience's release status to **In production**, don't stop at Testing. Reason: Testing's offline authorization will expire after seven days; `drive.file` only accesses files created by this application.
3. Create **Desktop app** in Clients and download JSON to the local machine, for example, the project root directory `.local-ai/recovery/oauth-client.json`. Don't send JSON, app passwords, or tokens to chat, and don't commit Git. Reason: Client configuration and offline refresh tokens are separate credentials.
4. Enter the project root directory in the local terminal and execute the following command, then personally open the Google link displayed on the terminal and authorize it with `jr24839652@gmail.com`:

   ```sh
   python3 scripts/recovery/setup.py oauth --client-json .local-ai/recovery/oauth-client.json
   ```

   The authorization program only listens to `127.0.0.1:53682`. It times out in ten minutes and will not automatically open the browser or print the token. Create `Massage Note Backups/production` from this dedicated identity, verify owner and private permissions and bind the folder ID. Reason: The directory created by the chat connector is not visible to the `drive.file` identity, and the directory with the same name cannot be created first with another client.
5. Create a new dedicated password for the NAS in [Google App Passwords](https://myaccount.google.com/apppasswords) (two-step verification must be enabled first), execute in the local terminal and hide the input:

   ```sh
   python3 scripts/recovery/setup.py mail
   ```

   Reason: Different credentials are used for sending emails and uploading to Drive, and the normal Gmail login password cannot be used for SMTP.

   Once complete you can send an email clearly labeled Configuration Test:

   ```sh
   python3 scripts/recovery/setup.py test-mail
   ```

<a id="密钥及恢复"></a>

## Key and recovery

The operation instructions in the independent recovery package can be found in [BUNDLE_README.md](BUNDLE_README.md), which does not rely on relative document links outside the repository. There is also a `README.txt` in the cloud-specific directory, which provides direct access to the recovery commands and private key location instructions for this Mac; it does not contain private keys or vendor credentials.

`setup.py init` saves the age private key in the Mac system keychain and only saves the public key on disk; should be completed before the NAS is lost. NAS only has the public key and cannot decrypt historical recovery packages. The recovery program reads the private key from the system keychain by default; `--identity` is only used for recovery or isolation testing from another safely saved age private key.

Recovery dependencies on Docker, Python 3.9+, age on Mac, and Google/Firebase/MiniMax accounts are still valid; each recovery package contains application, PostgreSQL, Redis, and local HTTPS proxy images, and does not need to be re-downloaded from the image repository.

```sh
python3 scripts/recovery/restore.py restore \
  --config .local-ai/recovery/mac-config.json \
  --age .local-ai/recovery/tools/mac/age \
  --root .local-ai/recovery-drill --drill
```

Omitting `--drill` will keep the recovery service running. Each time a new directory, independent Docker project and data volume are used, only `127.0.0.1:8443` will be published, and no database, Redis or public network entrance will be opened. Stop when the port is occupied, without terminating other processes or automatically changing ports. Only non-sensitive reports are retained at the end of the walkthrough, and recovery containers, volumes, plaintext production configurations, and local TLS private keys are deleted.

After actual recovery, if you want to use the local HTTPS entrance of the original domain name, you must manually install the restored `root.crt` on your Mac and resolve the original domain name to `127.0.0.1` only locally; the recovery script does not automatically change system trust, hosts or public DNS. Reason: The walkthrough cannot change the production portal in use, nor can it cause existing Mac send agents to accidentally connect to old snapshots.

Before resuming, pause the Mac Information Agent, check its local sending logs and the pending tasks in the cloud snapshot, and then decide whether to reconnect. Currently, only the website and its running dependencies are restored, and the entire DSM system, user personal files, WeChat login device status, or Mac's Messages system database are not migrated. Reason: These are external device states, and backing up website databases cannot replicate hardware or third-party login sessions.

<a id="命令行接口"></a>

## Command line interface

- `recovery.py backup --config /protected/config.json`: Exclusive lock, up to three attempts; if failed, the old backup will be retained and sent via Gmail. Credential error responses to commands stderr are not written to the public log.
- `recovery.py check-payload DIRECTORY`: Checks format, required files, file manifest, size, SHA-256 and successful recovery report.
- `restore.py restore --bundle FILE.age --root NEW_DIRECTORY [--identity FILE] [--drill]`: Only load the image and data from the specified recovery package; do not access the original NAS and do not pull the image.
- `restore.py stop --root DIRECTORY`: Clean only recovery items and their volumes that are explicitly identified by the status file.

Each successful backup is one `mn-recovery-时间戳-随机值.tar.gz.age` Add the same name `.sha256` Complete mark. First upload, read back completely and calculate SHA-256, then upload and read back the completion mark, and finally keep three copies according to the success time; do not clean up by days, do not use cross-directory synchronization or empty the entire recycle bin. Reason: Interrupting the upload cannot crowd out the old backup, and other Drive files are not within the management scope of this tool.

The NAS portal requires that the `enabled` activation file exists in the restricted directory by default; it will not be created before full cloud acceptance. For the first time, only use `nas-task.sh --verify-install` to manually execute the backup. The scheduled execution will be activated after the acceptance and email testing are completed. Reason: Tasks in DSM are checked in advance, and automatic backup cannot be started directly without skipping acceptance.
