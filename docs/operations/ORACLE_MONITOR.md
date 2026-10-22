<a id="nas-上的-oracle-免费实例监控"></a>

# Oracle Free Instance Monitoring on NAS

**English** | **[简体中文](ORACLE_MONITOR.zh-CN.md)**

<a id="范围与当前状态"></a>

## Scope and current status

The standalone runner is located at [`scripts/oracle-monitor`](../../scripts/oracle-monitor/), only in `us-ashburn-1` Inquiries and applications **2 OCPU / 12GB** of `VM.Standard.A1.Flex`. It does not update the NAS `mn` applications, databases, backup tasks, or DNS, nor automatically deploy applications to new instances. Reason: Obtaining the cloud host, migrating the business and switching the official entrance are different stages; the old and new databases cannot receive production writes at the same time.

**Enabled, last accepted on 2026-10-19 (America/New_York)**: The NAS container runs `mn-oracle-monitor:1.32.11` with a health check of `healthy`. The corrected background check time is `2026-10-19T15:06:47Z`, status `waiting`, 0 creation attempts, and 0 consecutive errors; the actual precheck only queries three availability zones for 2 OCPU / 12GB, none of which has capacity. The previous NAS test email has been confirmed to be in the inbox, and the one-time update task has been deleted. Reason: Record the actual request specifications and NAS operation evidence to avoid continuing to use the old version of downgrade logic in the background after local correction.

No cloud instance was obtained this time, and the application is still served by the existing NAS. Subsequent status is subject to the restricted directory `state/state.json` and container health check. Reason: Capacity will change, and deployment records cannot replace real-time status; successful instance acquisition does not mean that business migration is completed.

<a id="执行和费用边界"></a>

## Execution and cost boundaries

- Normally, three availability zones are queried every 300 seconds, and only 2 OCPU/12GB are checked and applied for without downgrading; no email is sent if there is no inventory. Temporary API failures and current throttling will be gradually backed off to one hour, and applications will be suspended due to authentication or configuration errors. Reason: The user only authorizes this configuration; query signals are not resource reservations, and frequent failures cannot trigger high-frequency creation.
- Single containers, file locks, fixed monitoring tags, persistent state, and OCI retry tokens work together to prevent duplicate creation. After the network times out, the original token is reused and the instance is retrieved; it is paused if the result cannot be confirmed after more than 20 hours. Reason: The loss of the creation response does not mean that the creation failed. You cannot change the token and create another one.
- Read the instances and disks in the entire tenant visible partition before creation, including stopped instances and undeleted disks; the total amount must not exceed 2 A1 OCPU, 12GB memory, and 200GB startup disk/block storage. New instances use a fixed 50GB startup disk. Stop when there are other models or the resource cannot be read completely, and idleness is not assumed. Reason: Free credits are accumulated based on actual resources, rather than calculated separately for each process or running instance.
- Only use the explicitly configured Ubuntu 24.04 ARM official platform image and pre-built public network subnet; do not apply for other models, dedicated hosts, reserved capacity, additional disks or upgrade paid accounts. Oracle's free policy and final bill are still subject to the account's then-current rules. Reason: Script limits do not replace vendor credits or mistake trial credits for long-term free use.
- The successful creation is subject to the instance `RUNNING` and the public IP has been obtained, and then stop calling the creation API. If the email fails, only the notification will be retried and not re-created. Reason: The request is accepted, the instance is ready, and the email is delivered are different evidences.

<a id="身份安装与验收"></a>

## Identity, installation and acceptance

1. Establish independent identities and groups for monitoring, and limit creation permissions to independent partitions; only capacity reporting, full-tenant resource reading, target partition instance creation, designated network usage, and platform image reading capabilities are granted, and billing management, identity management, or instance deletion capabilities are not granted. Reason: Signing keys stored long-term on the NAS should not use account owner permissions.
2. API signing keys are stored in the restricted `config/api-key.pem`; instance SSH private keys continue to be stored only on Mac, and the runner only requires the SSH public key. The two cannot be mixed. Reason: API signature and server login are different credentials, and background application does not require obtaining the server login private key.
3. Put Compose, configuration, SSH public key and offline image into `/volume1/docker/massage-note-oracle-monitor`. The installer reads the UID/GID from the existing SMTP password file and writes it into a private `.env` so that the container and config/state files use the same identity; the directory is `0700` and the credentials file is `0600`. Read-only mounts the existing backed-up Gmail application password, does not mount business data or Docker sockets, and does not publish any NAS inbound ports. Reason: After removing all capabilities, the container cannot override the permissions of other file owners; the original owner of the password file can read the credentials without copying the password or relaxing permissions.
4. Check image digest and archive SHA-256, execute [`install.sh`](../../scripts/oracle-monitor/install.sh), which only loads the image and checks resources/capacity. Only if the check is successful and the test email sent by the NAS is received and confirmed, create `config/enabled` and execute `docker compose -f compose.yml up -d`. Reason: The presence of credentials, SMTP acceptance, or container startup alone do not prove that the monitoring link is available.
5. When creation is successful or authentication/configuration exception occurs, a single email is sent using the existing backup notification mailbox; SMTP acceptance status and restricted run reports are recorded. The email contains region, CPU/memory, instance ID, IP, instance creation time, and console entry, but does not include the key. Reason: Users need to know when they can proceed with deployment, logs and emails cannot carry credentials.

The program uses Oracle's official Python SDK. For fixed dependencies, see [`requirements.txt`](../../scripts/oracle-monitor/requirements.txt). Deploy containers with a read-only root file system, a 256MB memory limit, no Linux capabilities, and capped logs. Reason: Background capacity checks do not require business-level resources or host permissions.

<a id="暂停与排障"></a>

## Pause and Troubleshooting

Execute `docker compose -f compose.yml stop` in this directory to pause; do not delete the persistent state or change the monitoring label and then blindly restart. Check `state/state.json`, the actual Oracle resources and the original request token before restoring; terminating the instance or deleting the disk is a separate operation. Reason: The status file is proof against repeated creation. Stopping monitoring does not mean releasing the allocated cloud resources.

When the NAS is completely disconnected or stops running, it cannot query or send emails; SMTP acceptance does not guarantee that emails will definitely enter the inbox, so spam should be checked. This tool does not promise inventory, acquisition timelines, permanent reservation of instances, or guarantees of future fee policies. Reason: Background polling does not provide Oracle capacity guarantees and does not constitute independent NAS liveness monitoring.
