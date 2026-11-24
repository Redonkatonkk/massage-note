<a id="mac信息发送代理"></a>

# Mac Messages sending agent

**English** | **[简体中文](MESSAGES_AGENT.zh-CN.md)**

This article is the only installation and troubleshooting guide to fixing the Messages sending agent on your Mac. NAS only saves sending tasks and provides HTTPS API; the local LaunchAgent actively receives the tasks, and then the restricted attachment App calls the local Messages. See [`OPERATIONS.md`](OPERATIONS.md) for general monitoring, database backup and recovery, and [`SECURITY.md`](SECURITY.md) for security boundaries.

<a id="发送内容与运行边界"></a>

## Sending content and running boundaries

| Task type | Content | Routing |
| --- | --- | --- |
| Individual daily statement | Four plain-text lines with name, date, confirmed daily earnings and a 14-day personal snapshot link | iMessage, RCS or SMS |
| Employee subtotal | One image | iMessage, RCS or SMS/MMS |
| Tomorrow’s dispatch order | Dated text with the visible staff order, or a confirmed no-dispatch message | iMessage, RCS or SMS |

Enable the feature under **Store settings → Dispatch and notifications** after updating NAS and the installed agent. The queue can resume later on the same local day and expires at local midnight. Posted receipts can still be reconciled after midnight. Changing the settings cancels tasks that have yet to start.

- Daily closing and employee subtotals share a serial processing loop. Normal tasks wait 2 minutes after confirming the result, and wait 5 minutes after failure to receive the next one; the empty queue is still polled every 10 seconds. The next collection time is written to the local log, and restarts to continue waiting; cooling does not occupy the lease of the next task. The heartbeat is executed independently every minute and will not be disconnected due to waiting for transmission or retry. Reason: There is still an asynchronous sending process after the command is accepted. Serial observation, cooling and persistent waiting jointly avoid continuous sending too fast.
- The proxy does not open inbound ports and only makes outbound HTTPS requests to the API; the NAS does not require a Mac to be connected or controlled. Reason: Fixed Mac actively polling and not requiring NAS to gain native control permissions.
- Fixed Macs must remain logged in as the corresponding macOS user. Locking the screen does not affect the operation. Exiting the user will stop the LaunchAgent. Reason: LaunchAgent belongs to the user session, and exiting the session will stop sending.
- The signed app observes Messages receipts in SQLite read-only mode. It matches the specific outbound task and recipient using the prepared text or controlled attachment and returns only the GUID, state, error code and channel. The app runs in the background and leaves the chat database untouched.
- The return from AppleScript only means that Messages has accepted the sending instruction, and does not mean that the operator has delivered it; when the result is unclear, it shall not be automatically resent. The actual acceptance is subject to the delivery status of Messages. Reason: The successful call is not a network delivery, and the result is uncertain and retransmission may cause duplication.

The agent records the previous GUID before sending and polls the new message every 5 seconds for two minutes. A Delivered receipt ends observation early. An SMS with only a Sent flag completes the window as Sent · delivery unconfirmed. A Mac error or a missing receipt remains Check delivery. The agent continues observing through temporary Mac errors and only checks receipts after dispatch begins.

Daily statements and employee subtotals show Delivered, Sent · delivery unconfirmed, or Check delivery. Older `SENT` tasks show Submitted · delivery unconfirmed until a receipt arrives. Check the recipient’s phone before manually resending. See [API](../engineering/API.md) for receipt fields and endpoints.

Receipt reconciliation runs independently every minute, including after restarts and during cooldown. It checks the exact outbound task and recipient for up to 30 days and stops on delivery confirmation. A late Sent or Delivered receipt updates a task that was awaiting review. When devices disagree, the recipient’s phone can confirm actual receipt. Apply the NAS migration and update Web/API before upgrading the installed Mac agent.

The API prepares the daily text under the current lease using the queued amount and the configured HTTPS Web origin. Its first three lines identify the employee, business date and confirmed income. The fourth gives the personal snapshot link. The Mac agent stores the prepared text in restricted local storage for resuming receipt observation. The production page opens the queued date and allows history reads for the same employee.

Payroll interval statements use a separate 14-day share workflow. The agent handles personal daily texts and employee subtotal images.

New employee subtotal attachments use the shared cool-gray ledger palette. Employee names wrap on a separate line above the role and record count, and each row grows to fit its tallest card. Reason: long names and amounts need to remain readable in the attachment.

Update NAS before upgrading the installed Mac agent. The new API accepts daily claims from agents declaring `text-v1`. Verify that the installed `app/package.json` and the store's latest agent heartbeat show the release version. Preserve `journal.json` when upgrading so pending attachment and text submissions can resume receipt monitoring.

<a id="安装前准备"></a>

## Preparation before installation

1. Install Node.js 24 LTS and the pnpm version declared in the repository, and confirm that `node --version` and `pnpm --version` are available in the new login shell. LaunchAgent should not rely on Nodes in the Codex, IDE, or temporary cache directory. Reason: The installation script and LaunchAgent depend on a stable runtime path.
2. Sign in to the Messages App on the target Mac. When sending pictures to a non-Apple number, the iPhone with the same Apple account also needs to turn on text message forwarding and have the operator support MMS/RCS. Reason: The sending accounts available locally and the paired iPhone determine the actual routing.
3. Generate store-level tokens in production "Store Settings → Mac Information Agent". The token is only displayed once and is only saved in the current user's `~/Library/Application Support/Massage Note Messages Agent/agent.env` after installation. The permission must be `0600`. Reason: Clear text tokens are only available at the time of issuance, and configuration must be restricted to readability by the current user.

<a id="安装"></a>

## Install

Run in the target macOS desktop user session logged into Messages:

```bash
MASSAGE_NOTE_API_URL='https://<production-domain>/api/v1' \
MASSAGE_NOTE_AGENT_TOKEN='<设置页生成的令牌>' \
./scripts/install-messages-agent.sh
```

The first run will install the interfaceless `~/Applications/Massage Note Attachment Stager.app`. If the script stops in status 2:

1. Open "System Settings → Privacy & Security → Full Disk Access". Reason: The installation diagnostic return status 2 indicates that the temporary app permission needs to be granted.
2. Only add and enable `Massage Note Attachment Stager.app`, do not grant wider permissions to Node, Terminal or Messages as a whole. Reason: The temporary app is a designated authorization identity, and wider permissions are not required by the current implementation.
3. Rerun the installation script with the same command; allow `Massage Note Attachment Stager.app` to control Messages when asked for automation permissions. The agent enumeration account still uses the existing automated authorization of the Node/terminal. Reason: The authorized identity for final sending is the attachment app. Account enumeration and attachment sending require the automation permissions of the corresponding identity respectively.

The installation script authenticates the "shard/task" two-level probe of the Messages attachment directory through LaunchServices with the identity of this app, and then the AppleScript in the app actually reads the probe and enumerates the Messages account without sending the message. The identity of this App is used for both staging and final sending; after Node reviews the lease before sending, it only submits the verified task UUID, fixed file name, receiving number and delivery route. The app rebuilds the path, rejects symbolic links, validates the task file and calls the bundled sending script. The `Contents/MacOS` binary cannot be executed directly as a LaunchAgent child process, nor can it fall back to the background Node's `osascript` to read protected attachments. Reason: Only testing that the App can write files does not prove that another authorized identity can read or transfer files; the same App identity covers temporary storage, reading and sending.

The script uses the SHA-256 combination of two Swift source codes and the sending script module to identify the attached App, and puts the same AppleScript into the App resources. Preserve existing binaries and signatures when the code has not changed; rebuild signatures when installing for the first time or when the source code changes. If the permissions become invalid after the upgrade, close and enable full disk access permissions for the app, and then rerun the installation. Reason: Script resources are also signature products. Re-signing may invalidate existing permissions. Joint verification prevents continued use of the old app after script changes.

After deployment, the installer copies hardlinked runtime files into independent files and imports both renderers to verify their dependencies before starting the agent. Reason: legacy pnpm deployment can hardlink workspace outputs; a later local build can otherwise update the installed domain entry point without installing its new modules, crashing the agent and leaving tasks queued. For an existing broken installation, rerun the installer with the saved credentials; preserve `journal.json` so accepted messages are not sent again.

During maintenance, you can add `--no-start` at the end of the installation command: first build, disable and stop the old agent, then replace the installation file and verify permissions, and keep the sending service disabled; after checking the historical results and obtaining actual sending authorization, re-enable it according to the normal installation process. Permission check failures also remain disabled. Reason: The running old agent cannot continue to receive tasks or read the running files being replaced. Updates, probes or re-login should not implicitly reissue the backlog of SMS messages.

<a id="安装后验证"></a>

## Post-install verification

```bash
launchctl print "gui/$(id -u)/com.massagenote.messages-agent"
stat -f '%Lp %Su' "$HOME/Library/Application Support/Massage Note Messages Agent/agent.env"
tail -n 50 "$HOME/Library/Application Support/Massage Note Messages Agent/agent-error.log"
```

The normal result is LaunchAgent `state = running`, configuration permissions `600`, and the store settings show that the agent was recently online. When reinstalling, the script will wait for the old service registration of `bootout` to disappear completely before calling `bootstrap`; do not regard the occasional `Bootstrap failed: 5` as a Messages permission issue. Reason: Repeated registration will fail when the old service is not completely exited and should not be misdiagnosed as attachment permission.

<a id="附件暂存与重试"></a>

## Attachment temporary storage and retry

The agent first sends the attachment as `0600` Permission to write `~/Library/Application Support/Massage Note Messages Agent/outbox`. The staging app verifies the source path, task UUID, fixed file name, and PNG/JPEG file header, and then writes: Reason: The staging app only accepts controlled directories, tasks, and verified images, and cannot be an arbitrary file copyer.

```text
~/Library/Messages/Attachments/MassageNote/<top two>/<Task UUID>/
```

Refuse to overwrite when the same task already has different content. App only in `stager-results/<任务 UUID>.json` Returns success or failure; the agent deletes the result file immediately after reading it, and checks that the return path must be exactly equal to the task target. "Information" is never called without a clear successful result. Reason: Clear receipts and precise paths prevent sending other tasks or unsuccessfully staged attachments.

Employee-subtotal deliveries retain immutable snapshots, attachment checkpoints, receipts, retries and serial cooldown. The API only claims EMPLOYEE_SUMMARY jobs; the share migration cancels pending RANGE_SETTLEMENT jobs. Reason: removing range images must preserve subtotal messaging.

The source outbox is cleaned after 30 minutes; Messages manages staged attachments. Test personal text and subtotal delivery logic plus interruption and retry recovery. Reason: attachment lifetime and accepted-message recovery remain independent of public share links.

Immediately before dispatch, the API records the start against the current lease and the agent atomically saves `started`. After Messages returns, the agent saves `submitted` and the previous GUID. An expired lease can resume observation or writeback, including after a lost completion response. A start with no local submission record goes to receipt reconciliation. A manager’s explicit subtotal resend starts a new round with its own GUID baseline. Restore an unreadable journal before resuming. API requests have a 30-second timeout. Readiness requires working stager probes and an enabled Messages account.

For child process errors, the actual failure reason is retained on stderr first, the complete phone number is hidden, and the heartbeat `lastError` and task failure `message` are limited to the 1000 characters allowed by the interface. Reason: Node's exception text may include the entire script and parameters. Overlong errors will cause failure to write back and heartbeat to return 400 at the same time, causing the original task to continuously re-acquire the lease.

<a id="路由规则"></a>

## Routing rules

Database, permissions and auditing always save E.164 numbers. For `+1` numbers, convert them to ten-digit local numbers when passed to Messages:

- PNG is given priority to the connected SMS account, upgraded from paired iPhone to RCS or sending SMS/MMS; when there is no SMS, it falls back to RCS/iMessage. Reason: SMS pairing supports non-Apple recipients and leaves other channels available in the absence of an account.
- The settlement chart preferentially uses the existing one-to-one conversation with the number, so that Messages retains the actual available iMessage or RCS routing; when the conversation cannot be found, it will be addressed in the order of SMS/RCS/iMessage accounts. Reason: There is already a one-to-one session that retains the actual route, which cannot be inferred based on the local account type alone.
- The checkout process no longer hands over any document attachments to Messages, preventing operators from downgrading documents to SMS that subsequently fail. Reason: Existing long images use image attachments, and sending old documents/PDFs will trigger routing by different operators.
- "This machine has an iMessage account" does not mean that the recipient number has registered for iMessage, and routing cannot be determined based on this alone. Reason: The sender's login and the receiving number's registration status are not the same fact.
- The next route is only tried if the sending has not started and the conversation/recipient cannot be found. Once the send command is called, the exception will be handled as an indeterminate result, and the route will not be automatically changed to be sent again, requiring manual verification. Reason: Changing channels and retrying after sending starts may send the same financial data repeatedly.

<a id="故障速查"></a>

## Quick troubleshooting

| Phenomenon | Priority Check |
| --- | --- |
| Queue shows "Queue, Attempt 0" | LaunchAgent Status, API URL, Token and Network |
| Agent repeatedly exits with `ERR_MODULE_NOT_FOUND` after a local build | Reinstall the agent to restore missing dependencies and isolate runtime files from workspace hardlinks; preserve the sending journal |
| Number of attempts increased but failed | Page queue details and local `agent-error.log` |
| Send reports `Access denied`, but the old version of the staging probe passes | Update the attachment App to confirm that it reads and sends it; turn off and on its full disk access permissions and check the automated authorization, and cannot use the background Node to send |
| The heartbeat returns 400 and the number of sending times continues to increase | Check whether it is still an old agent with no limit on the error length; update the agent, first check the historical sending results, and do not directly reset the sending status |
| Installation diagnostics failed | Messages login, automation permissions, full disk access to staging apps, available iMessage/RCS/SMS services |
| `argv 未定义` | AppleScript is required `on run argv` take over `osascript -e ... -- <参数>` |
| macOS 26 account number report `-10000` | When reading `service type` on an account-by-account basis, each must be wrapped in `try`, and additional account types that cannot be converted are ignored |
| PNG display `0 KB / 原大小`, or appear `fileTransfer rejected error 30`, `IMFileTransfer error 15` | Confirm that the path given to AppleScript is in the Messages-specific attachment directory, and then run the temporary program `--diagnose` |
| Non-Apple number picture failure | iPhone SMS forwarding, carrier MMS/RCS and connected SMS accounts |

When encountering attachment reading problems, do not use emulated keyboards, paste to the clipboard, recent items in the photo album, copy private `com.apple.macl` properties, or manipulate the Messages/Photos database. Official agents do not require Accessibility permissions. Reason: Restricted temporary storage is the existing solution, and there is no source code basis for temporary album operations and private properties.

<a id="卸载"></a>

## Uninstall

```bash
./scripts/uninstall-messages-agent.sh
```

After uninstalling you should confirm that the LaunchAgent has disappeared. If you no longer use the Mac, you should also rotate or revoke the proxy token in your store settings. Reason: Deleting the native process will not automatically invalidate the server token.

The API requeues only eligible failures before dispatch. It allows up to three retries, with requeueing after at least 60 seconds and a persistent agent cooldown of at least five minutes after a failure. A Mac error after dispatch remains available for receipt reconciliation.

New settlement and employee-summary attachments use `$` for USD in either language through the shared image formatter. Install the updated agent independently of NAS; already generated or sent attachments remain unchanged. Reason: the installed renderer and historical image files are separate from the website.
