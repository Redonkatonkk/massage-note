<a id="恢复验收记录"></a>

# Restoring acceptance records

**English** | **[简体中文](RECOVERY_REPORT.zh-CN.md)**

Date: 2026-10-18 (America/New_York). Tool version: `1.32.2`.

<a id="结论"></a>

## In conclusion

Real **NAS → Google Drive → ARM Mac** full recovery walkthrough passed, automatic backup of NAS daily at **00:00 New York time** is activated. The cloud directory is private to the account owner [Massage Note Backups/production](https://drive.google.com/drive/folders/1PUMZ8jsVBRXinEhdV21qxU3CvzaELhqp). Mac backup services are not normally running.

The NAS time zone is read back as `Eastern`, the rule is `EST5EDT,M3.2.0,M11.1.0`, and daylight saving time is supported. The daily task has been enabled, and the next scheduled trigger is **2026-10-19 00:00**. This acceptance manually runs the same formal entry; the first timed trigger has not yet occurred. Reason: Task configuration, manual running results and actual overnight triggering are different evidences.

<a id="云端恢复证据"></a>

## Cloud recovery evidence

This complete walkthrough uses `mn-recovery-20261018T005154Z-6425583a.tar.gz.age`, size **512,922,422 bytes**. The database snapshot time is **2026-10-17 20:51:09 EDT**; the package generation time and database snapshot time are recorded separately.

- NAS exports consistent snapshots from actual production `1.31.0` to save business data, migration history, role/password summaries, memberships and permissions; after recovery of independent, network-free PostgreSQL, it checks the number and summaries of all public table rows, constraints, indexes, database authorizations and key financial summaries.
- Actual application, PostgreSQL, Redis, HTTPS proxy and runner image archive; production configuration, key, DSM reverse generation, independent description agent and three pages, backup configuration and recovery code are all age-encrypted.
- After uploading to the NAS, it is read back completely. The SHA-256 is `9edebb531b9f28dd8619cc48d9704c87de7f0ca5606a5a5d71ecb72fa2e40d57`, and the completion mark is submitted only after passing it.
- The Mac re-downloads and checks SHA-256 from the real Drive, reading only the private key from the standalone system keychain; verifies and executes the recovery code within the package. The NAS will not be read during the walkthrough, and images will not be pulled from GitHub/GHCR.
- ARM Mac loads the x86 offline image, completes database/permission baseline comparison, Web/API readiness, content readback of three public description pages, Firebase authentication to establish login session, existing business day account query and isolation API test writing.
- Only `127.0.0.1:8443` is bound, the public network DNS, local hosts or system certificate trust are not modified, and real SMS or robot sending is not triggered; after the exercise, the newly added containers, data volumes and plain text configurations are deleted, and only the report is retained.

This time, the download and SHA-256 verification took **12.91 seconds**, the recovery and service verification took **27.56 seconds**, and the complete process including extracting the tools in the package took **45.64 seconds**. Docker has been installed and started; this time does not include installing Docker for the first time, preparing the network, or manually processing the local domain name and certificate. Reason: This is not a fixed recovery timeframe for all failure scenarios.

<a id="第二次独立云端演练"></a>

## The second independent cloud exercise

2026-10-18 Perform the drill again as requested by the account owner, directly query the real Drive directory and re-download the latest `mn-recovery-20261018T135853Z-c1e548f9.tar.gz.age` without using the last downloaded local package. The database snapshot is **2026-10-18 09:57:48 EDT**; the file size is 512,914,948 bytes, and SHA-256 is consistent with the official task record above.

This package contains 32 manifest files and 5 offline images; after recovery, the row number and summary of **42 public tables and a total of 22,201 row records** are consistent with the same production snapshot. Database structure, roles/permissions, HTTPS Web/API, three description page readbacks, login sessions, existing business day account queries and quarantine writes passed again. The recovery code that comes with this package is executed, and its SHA-256 is `e18cce743ebe81fb1273f4700814ad74ff3f92a36284bf2d0b23503197d2e843`.

Re-download and verification took **9.13 seconds**, recovery and service verification took **28.31 seconds**, and the complete process took **48.95 seconds**. During this period, the NAS is not read, the image is not pulled, and the private key comes from an independent Mac keychain; DNS, hosts, or system trust are not modified, and no real external messages are sent. After completion, check again that the temporary containers and volumes are zero, the decryption directory has been deleted, and only non-sensitive reports remain. Reason: Repeat verification using an updated cloud recovery package, and the previous successful record cannot be used to replace this actual execution.

<a id="权限通知与失败场景"></a>

## Permissions, notifications and failure scenarios

- Google Desktop OAuth has been officially released, using only `openid`, email and `drive.file`. Both the parent directory and the production directory are checked as owned by me and not shared; they are independent of the chat connector credentials.
- The NAS directory and recovery source code directory are `0700`, the production configuration, Drive token, Gmail credentials and activation file are `0600`, and the task entry is `0700`; the Mac private key is not in the NAS or Drive.
- The actual notification after the Gmail configuration test and the NAS failed three times has been confirmed in the `jr24839652@gmail.com` inbox. The NAS cannot proactively send out failure emails when it is completely disconnected or lost.
- 26 independent automated tests cover corrupted files, missing configurations, dangerous archive members, interrupted upload/completion marks, insufficient space, fourth safe rotation, failed deletions, and extraneous file retention.
- 4 real Docker checks covering equivalent reconstruction of PostgreSQL legacy CHECK expressions, rejection of real bounds/allowed value changes, constraint validation status, and Caddy configuration parsing for both recovery routes.
- An issue with the recovery agent template was discovered during the initial walkthrough. After repair, a new cloud package was generated and passed through the complete walkthrough again; the old trial production package was not retained as the final usable copy. Reason: NAS database recovery cannot alone prove that full service is recoverable.
- Independent NAS indicates that the agent has been installed, and the DSM entry is switched to `13100`; the remaining paths continue to the original application `3100`. The public network Web/API, three description pages and content readback passed. The original application image was not upgraded along with the backup installation.

Rotate the new package upload, read it back completely, and then delete the old package after completing the mark submission. Only the last three successful backups are retained; there is no need to collect three copies when it is enabled for the first time. There is a recovery instruction `README.txt` in the dedicated directory, which will not touch other files in Drive.

The official task entry is successfully executed manually at **2026-10-18 09:57:45–10:01:52 EDT**. The latest package is `mn-recovery-20261018T135853Z-c1e548f9.tar.gz.age`, 512,914,948 bytes, and SHA-256 is `f06f37388876b0526e766854ba49fd3e10581bd885a3c7ed22917fae42b6a9e6`. After completing the fourth submission this time, the oldest package was rotated; then another old trial production package that failed to pass the full service acceptance was cleaned up, leaving two valid backups and documentation. After a round of normal tasks and the first full Mac recovery has passed, subsequent successful backups will naturally accumulate and stably retain three copies.

<a id="恢复边界"></a>

## Restore boundaries

For recovery operations, see [Disaster Recovery Manual](DISASTER_RECOVERY.md) and [Independent instructions in the package](../../scripts/recovery/BUNDLE_README.md). During actual recovery, first pause the Mac Information Agent, check the pending tasks in the sending log and snapshot, and then decide whether to accept them back.

Firebase, MiniMax, Google Accounts, and external networks must still be valid. Daily backups may lose about a day's worth of data after the most recent successful snapshot; continued failures will result in an earlier recovery point. Actual SMS delivery and browser/external device effects are not included in this command line/API acceptance conclusion. Does not restore the entire DSM, WeChat device login, or Mac Messages system database. Reason: Databases and offline images cannot replicate external vendors and hardware status.
