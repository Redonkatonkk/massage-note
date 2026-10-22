<a id="运维备份与恢复"></a>

# Operations, backup and recovery

**English** | **[简体中文](OPERATIONS.zh-CN.md)**

<a id="日常检查"></a>

## Daily inspection

Check container health, disk capacity, recent backups, and API readiness status. Reason: Just because the container is running does not mean that dependencies are ready or that backups are available.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since=24h api web migrate harden
curl --fail https://api.massage-note.example.com/api/v1/health/ready
```

Configure external monitoring for `/api/v1/health/ready` and track disk, database and backup failures; the alarm threshold is determined by the actual deployment. Use `X-Request-Id` for error troubleshooting and do not post cookies, tokens, complete phone numbers or keys to the work order. Reason: The repository does not have the fixed monitoring threshold implementation claimed in the old document, and the request number is enough to correlate the logs.

<a id="云端完整恢复"></a>

## Complete recovery in the cloud

The Google Drive full recovery package for NAS every night at 00:00 New York time, the last three successful backup rotations, independent age private keys, and Mac on-demand walkthroughs are available in the [Disaster Recovery Manual](DISASTER_RECOVERY.md). The activation status is subject to this manual and the actual task/cloud recovery report. Reason: The following manual logical backup only has the database and cannot replace the complete recovery package of configuration, keys and offline images; creating the script does not mean that the online scheduled task has been enabled.

<a id="手动逻辑备份"></a>

## Manual logical backup

`scripts/backup-database.sh` requires PostgreSQL client. It is recommended that a read-only backup account or a controlled management account execute it daily and synchronize the directory to an encrypted storage different from the application host. Reason: The script relies on pg_dump, and the off-site copy avoids host failure and data and backup loss.

```bash
DATABASE_URL='postgresql://...' \
BACKUP_DIR='/srv/massage-note-backups' \
BACKUP_RETENTION_DAYS=30 \
BACKUP_ENCRYPTION_KEY='replace-with-a-strong-key-stored-separately' \
./scripts/backup-database.sh
```

The script uses custom-format `pg_dump`, AES-256-CBC/PBKDF2 (when configuring keys), permission tightening, and SHA-256 checksums. Encryption keys must not be placed in the same location as backup files. Standalone Compose's logical backup is not a point-in-time recovery; use managed PostgreSQL with PITR/WAL archiving enabled when smaller RPO is required. Reason: Verification verifies transmission integrity, encryption protects backups, independent keys and WAL capabilities cannot be replaced by ordinary dumps.

<a id="恢复演练"></a>

## Recovery drill

Restoration will overwrite the target database and must not be performed on a production database that is still in operation first. Create an independent empty library, check the target URL, and execute after explicitly setting `CONFIRM_RESTORE=YES`. Reason: The recovery script will overwrite the target database and there is no triple confirmation mechanism as mentioned in the old documentation.

```bash
DATABASE_URL='postgresql://.../massage_note_restore_test' \
BACKUP_FILE='/srv/massage-note-backups/massage-note-YYYYMMDDTHHMMSSZ.dump.enc' \
BACKUP_ENCRYPTION_KEY='...' \
CONFIRM_RESTORE=YES \
./scripts/restore-database.sh
```

Then perform a current version migration of the recovery repository and start a set of temporary APIs:

```bash
DATABASE_URL='postgresql://.../massage_note_restore_test' pnpm db:deploy
```

The drill is considered successful only after the following content has been accepted: number of stores/members, latest business day, payment split of the latest work record, daily closing snapshot, cash and payroll ledger, and audit records; check the daily total through API or database, and users can spot-check the page if needed. Reason: Successful recovery must verify business integrity, and the default verification does not call the browser. Record recovery time and backup time to derive actual RPO/RTO.

<a id="数据维护"></a>

## Data maintenance

Execute regularly with database management account:

```bash
psql "$ADMIN_DATABASE_URL" --set=ON_ERROR_STOP=1 --file=scripts/maintenance.sql
```

Maintenance only deletes expired idempotency caches, expired/long-consumed AI previews, and outboxes that have exceeded the event reconnect window; it will not delete work records, payments, daily closings, salaries, or audits. There should still be a backup available before execution. Reason: The maintenance script only cleans the running cache, but production deletions still need to be reversible.

<a id="故障处理"></a>

## Troubleshooting

- **API ready failed**: Check the PostgreSQL health and migration container logs first. Do not rebuild database volumes repeatedly. Reason: Rebuilding the volume cannot repair missing migration or connection configuration, and will also cause loss of business data.
- **Redis failure**: The interface current limit will degrade to a single instance memory count; business data can still be written. Restore Redis as soon as possible to avoid inconsistent rate limiting caused by horizontal expansion. Reason: Degrade counts are separated by process, multiple instances will amplify the number of acceptable requests.
- **AI/MiniMax/Voice Failure**: Core work records and finance do not rely on external AI; the interface should prompt to use manual or text input instead. Reason: Manual business path has no vendor dependencies.
- **Real-time connection failure**: Business submission is still based on the database response; refreshing the page will re-read the source of truth. Check if the reverse proxy is buffering or shutting down SSE prematurely. Reason: REST and database saving results are the business truth.
- **Suspected duplicate work record**: Do not delete database rows directly. First check the audit and idempotency records, then soft deletion from the interface and write down the reasons. Reason: Directly deleting rows will destroy auditing and recovery, and the business interface already has soft deletion.
- **Key leak**: Immediately rotate the corresponding supplier key/database password, restart the service, and check the audit and access logs within the time range; if the Firebase private key is leaked, the service account key must be revoked. Reason: Old secrets must be revoked, deleting the file will not invalidate the credentials.

Mac Messages sending agent installation, permissions, attachment routing, and specialized troubleshooting have been centralized into [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md).
