<a id="google-drive-灾难恢复"></a>

# Google Drive Disaster Recovery

**English** | **[简体中文](DISASTER_RECOVERY.zh-CN.md)**

<a id="目标与当前状态"></a>

## Goals and current status

Backups are performed by the NAS at **America/New_York 00:00** every day, and only the most recent **3 successful full recovery packages** are retained. After the NAS is lost, it is restored on demand on the current Mac, and the local backup service is not usually run. The recovery point is the latest successful backup, and new records of about one day may be lost at most; automatic switching or point-in-time recovery is not provided. Reason: Daily offline recovery packages cannot save writes that have not yet been uploaded, nor can they replace an always-on standby database.

**2026-10-18 The real cloud recovery drill passed and automatic backup has been activated. ** NAS → Drive complete upload and readback, package code → ARM Mac complete recovery, login and account query, isolation write and cleanup all passed. The dedicated OAuth is the official version, and the private directory is [Massage Note Backups/production](https://drive.google.com/drive/folders/1PUMZ8jsVBRXinEhdV21qxU3CvzaELhqp); Gmail test and NAS actual failure notifications have been verified and received. NAS adopts Eastern Daylight Saving Time rules and runs at 00:00 every day. The next scheduled trigger is 2026-10-19 00:00. Reason: Real experiment acceptance and activation facts are recorded here; the first scheduled trigger has not yet occurred, and manual running of the same entry cannot be said to have observed overnight execution.

For complete evidence, time consumption and boundaries, see [Recovery Acceptance Record](RECOVERY_REPORT.md). The two real cloud packages were independently restored and passed, which took about 46 seconds and 49 seconds; the second time, the Drive was directly queried and the latest package was re-downloaded. During this period, the NAS is not read, and the application is not pulled from the image repository. Only the verified cloud package, the recovery code in the package, and the independent keychain private key are used.

<a id="独立目录与恢复包"></a>

## Independent catalog and recovery package

Private OAuth identity usage `jr24839652@gmail.com` private directory `Massage Note Backups/production`, fixed binding directory ID, range is `drive.file`. The first-time directory must be created by that OAuth identity; do not create a directory with the same name in advance with the chat connector, or the directory may not be visible to the private identity. See the first time setup [Tools and Google Settings](../../scripts/recovery/README.md).

Each recovery package includes:

- Full library custom-format `pg_dump`, retains owner and ACL; cluster roles, password digests and role authorizations are saved separately by `pg_dumpall --globals-only`. Reason: Only table data cannot rebuild database accounts and permissions. The existing `--no-owner/--no-acl` interface for manual dump remains unchanged.
- All public business table row numbers/ordered data summaries, database constraints, indexes, role attributes, role memberships, password summary verification and table authorization baselines of the same exported snapshot; also check business receipts, tips, gift card sales, cash handovers and salary settlement amounts by store/date/status. Isolation recovery results must be consistent with baseline. Reason: The data must be compared with the same time. The file is not empty or `pg_restore --list` cannot prove that the business data is consistent.
- NAS actual running applications, PostgreSQL, Redis images, as well as recovery agents and backup runner images; records platform, file system layer and running configuration. Reason: The local source code may not have been released yet, and the image repository may not be available at the time of the incident; the image IDs of old Docker and Mac containerd are represented differently.
- Expanded production Compose, actual container configuration and environment, relevant reverse proxy rules, independent public Compose/Caddyfile/three pages describing the proxy, Drive/SMTP credentials, backup configuration and recovery code. Redis is only responsible for rate limiting and is restored to an empty library; the current application has no independent attachments to mount. Adding unknown running services or persistent mounts will cause the backup to stop, rather than silently missing it.
- Size, SHA-256, format version and database recovery verification report for all member files. Reason: A recovery package cannot be claimed to be complete when keys, configurations or images are missing.

The recovery point time records the `snapshotAt` of the database export transaction, and is saved separately from the compression package completion time. After the old cluster CHECK constraint is rebuilt, the parentheses or array conversion writing of equivalent expressions may change. Therefore, PostgreSQL is used to compare the semantics of the expression results that are only planned but not executed, and at the same time check the verification status and inherited attributes; other constraints, indexes, permissions, and data summaries continue to be compared one by one. Reason: Changes in textual writing do not equate to loss of constraints. True numerical boundaries or allowed value changes must still be discovered.

Age encryption is used as a whole, and the NAS only holds the public key. Private keys are stored in the Mac System Keychain Service `com.massagenote.recovery.age-identity`, do not upload to Drive, do not put it on NAS; restore the default to read from the keychain. Clear text only in permissions `0700` temporary directory,`0600` Process within the file and automatically clean up after normal completion. The temporary directory left behind by an unexpected power outage on the NAS must be cleared after confirming that no backup is running. Reason: Recovery cannot rely on a lost NAS, and cloud configurations and keys cannot be stored in clear text.

<a id="每晚流程"></a>

## Nightly process

1. Obtain exclusive locks and check five production services, actual images, persistent mounts, and local free space. Reason: Prevent overlapping execution and missing new persistent data.
2. Keeping the `pg_export_snapshot` transaction alive, use `pg_dump --snapshot` to export and calculate the same snapshot baseline; save the role, original deployment and related agent configuration. Reason: In-service writing should not cause misalignment of export and verification baselines.
3. Start a temporary PostgreSQL without network, host port, and independent data volume, restore the role and database, and delete the verification container and volume after checking the data, structure, and permissions. Reason: Do not test restore on production database, nor only verify compressed files.
4. Archive offline images; double-check that deployment, Compose, and agent configurations have not changed; generate manifests and encrypt. Reason: The database and running version need to be saved as a set, and any changes during deployment must be backed up again.
5. Check the Drive available space; upload the unique name recovery package, download and calculate SHA-256 in full, then upload and read the `.sha256` completion mark with the same name. Reason: A successful upload request does not mean that the remote file is complete, and uncompleted copies cannot participate in rotation.
6. Only delete older successful packages and tags in the dedicated directory that comply with the naming rules, and permanently delete them without emptying the entire Recycle Bin. Keep the new copy first, allowing a fourth copy to exist briefly during the rotation. Reason: If the upload fails, the existing valid backup cannot be deleted, and the user's other files are not within the management scope of this tool.
7. Up to three attempts; ultimately failed to send a message to the same mailbox via Gmail SMTP. The log only records security status and phases and does not print command parameters, database URLs, tokens, or vendor error text. Reason: Invalid authorization and insufficient space need to be discoverable, and the failure of the notification itself cannot be regarded as delivered.

The NAS must remain powered on and connected to the Internet; it cannot proactively send out failure emails when the NAS is completely disconnected or lost. Reason: This solution does not include independent external survival monitoring, and the machine offline cannot be equated to the failure of the script that can send messages.

<a id="安装到-nas"></a>

## Install to NAS

The Google public help page is provided by the independent `mn-recovery-public-info` project at `127.0.0.1:13100`; DSM forwards the original site entrance to it, only `/backup-info/` provides static content, and other paths continue to forward to the original application `3100`. Use `prepare_public_info.py` and `install-public-info.sh` respectively for generation and installation; the local health check and file readback must be checked before switching, and the public network Web/API and three pages must be checked on the command line after switching. The NAS kernel does not support CFS CPU quotas, the upper limit of container memory usage, and `--cpus` is not set. Reason: Official authorization from Google requires a publicly accessible home page, privacy and terms, and instructions page must be delivered with the complete recovery package.

1. Follow [Setup Instructions](../../scripts/recovery/README.md) to complete tool installation, keychain, OAuth, and Gmail configuration. Use Google Cloud's Desktop app and publish it as In production to avoid the seven-day expiration of the Test authorization; Google login must be manually performed by the user.
2. Run in the Mac project root directory:

   ```sh
   python3 scripts/recovery/prepare_install.py
   ```

   Generate `.local-ai/recovery/nas-install/`, including SHA-256 verified offline tool image, task script and restricted configuration. `--runtime-only` prepares the runner without Google/Gmail credentials in advance, but does not enable backup.
3. Place the contents of the installation directory (including the `recovery/` tool source code subdirectory) into the NAS `/volume1/docker/massage-note-recovery`. The directory is only accessible to administrators, and the configuration and credentials are `0600`. Do not copy the Mac age private key. The tool source code is read-only and covers the `/opt/recovery` of the offline runner, and the actual tools are archived together during backup; the existing application project directory is read-only mounted, and the Docker socket is only used for this backup runner to export and create isolation verification containers. Reason: Docker socket is equivalent to host management rights, the task directory must be restricted, and recovery cannot rely on subsequent code in the repository.
4. Create a user-defined script in the Task Scheduler of DSM and run it as root at `00:00` Eastern time every day (adjusted with daylight saving time). The command is:

   ```sh
   /bin/sh /volume1/docker/massage-note-recovery/nas-task.sh
   ```

   If the API returns `105`, created by the user in an authenticated DSM session, MFA is not bypassed. The task does not update the application image or production Compose.
5. For the first time acceptance, manually run `/bin/sh /volume1/docker/massage-note-recovery/nas-task.sh --verify-install` as root. You must verify that the exit code is 0, that the cloud recovery package and completion flag are present and readable, and finally perform the Mac cloud walkthrough in the next section. After email testing and cloud acceptance are completed, create an `enabled` file in the restricted directory and verify that the daily task is enabled; deleting this file can stop subsequent automatic backups. Also use `setup.py test-mail` to send an email clearly marked as a configuration test and verify receipt. Reason: Creating a scheduled task is not evidence of successful execution. SMTP acceptance does not mean that the user has received it; scheduled tasks created in advance cannot start formal backup without acceptance.

<a id="mac-按需恢复和演练"></a>

## Mac on-demand recovery and walkthrough

Use `--drill` of [recovery command](../../scripts/recovery/README.md) to download the backup from Drive and launch it in the new directory. When loading archived images, check the platform according to content and configuration, and retain the original development image tag; Compose prohibits pulling images and only creates independent projects and volumes. Only the HTTPS proxy publishing port is `127.0.0.1:8443`. Explicitly fails when the port is occupied and does not stop other projects.

Acceptance includes full inventory, age decryption, database consistency with snapshot baselines, roles and audit permissions, x86 image boot on ARM Mac, health/ready interface, Firebase token session establishment, accounting queries, and API test writes in the isolated database. Test writing is only performed in the walkthrough; at the end, the newly added container is closed and the verification data and plaintext configuration are deleted, leaving only non-sensitive reports. Reason: Without a complete recovery walkthrough, there is no guarantee that this Mac can run the recovery product, and ordinary recovery should not automatically add a test store.

The walkthrough does not modify hosts, system certificate trusts, or public DNS, and uses loopback connections and a separate CA to authenticate HTTPS. If a complete browser login is required for real recovery, the user installs the `root.crt` of the recovery directory on Mac, and only resolves the original domain name to `127.0.0.1` on the local machine; accesses the `:8443` HTTPS entry of the original domain name. Firebase mobile login does not support `localhost`. Keeping the original authorized domain name can avoid this limitation. The public network entrance is not switched, and other devices are not connected to the local machine to restore services.

Before recovery, pause the Mac information agent, check the local sending log and the tasks to be sent in the recovery library, and then decide whether to resume it. Firebase, MiniMax, and Google accounts outside of the NAS must still be valid and accessible; the entire DSM, WeChat device login, or Messages system database will not be restored. Real verification code/SMS delivery, browser and external device effects do not belong to the default code/API acceptance conclusion. Reason: Daily database rollbacks cannot undo messages that have already been sent, nor can they replicate external vendor and hardware states.

The project code is finished according to [Development Guide](../engineering/DEVELOPMENT.md); local development services and on-demand disaster recovery instances are managed separately, and no resident standby services are installed.
