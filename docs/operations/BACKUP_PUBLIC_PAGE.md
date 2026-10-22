# Massage Note Backups

**English** | **[简体中文](BACKUP_PUBLIC_PAGE.zh-CN.md)**

> The account owner authorized publication at https://massagenote.waltonjin.com/backup-info/ . This source generates the Google OAuth application homepage, privacy policy, and usage terms.

Massage Note Backups is the account owner’s personal disaster recovery tool. It encrypts complete website recovery packages, saves them to the owner’s Google Drive, and restores them to the owner’s Mac when needed. It offers no public registration or commercial backup service.

It requests only Google account identity, email, and access to the specific Drive files used by this application (`drive.file`). Backups use a dedicated private directory. After each new upload passes full readback verification, only the latest three successful backups are retained.

<a id="隐私政策"></a>

## Privacy policy

Google identity and email confirm that the backup destination belongs to the account owner. Drive access creates the dedicated directory, uploads/downloads encrypted recovery packages, verifies integrity, and deletes older backups beyond the three-package retention limit.

Recovery packages contain the website database, application images, and configuration needed for recovery. They are encrypted in full before upload. The decryption private key is stored separately in the owner’s Mac system keychain; the uploading device does not hold it. Offline authorization credentials remain in restricted device configuration for subsequent automatic backups.

The tool does not sell Google user data, use it for advertising or model training, or share backup directories with other users. Only the account owner and explicitly authorized maintenance operations may use the configuration and backups. The owner can revoke authorization through Google account third-party connections and delete backups in Drive. Copies already downloaded to the owner’s devices must be deleted separately.

Use of Google API data follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including Limited Use requirements. Google’s own data processing follows its relevant policies.

<a id="使用说明与条款"></a>

## Instructions and Terms of Use

The tool is for the account owner alone; it does not accept other users’ data or provide services to the public.

Backups run daily at 00:00 America/New_York. The recovery point is the latest successful backup; later data may be lost. Restored services are local-only and do not automatically replace the public service. Pause outgoing messages and reconcile historical tasks before recovery.

Backup and recovery require the relevant devices, network, and external services such as Google/Firebase to remain available. File verification, isolated database restores, and complete service recovery drills determine whether a backup is usable. To stop using the tool, stop the NAS backup task and revoke Google authorization.
