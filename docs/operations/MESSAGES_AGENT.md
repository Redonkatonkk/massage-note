<a id="mac信息发送代理"></a>

# Mac Messages sending agent

**English** | **[简体中文](MESSAGES_AGENT.zh-CN.md)**

This article is the only installation and troubleshooting guide to fixing the Messages sending agent on your Mac. NAS only saves sending tasks and provides HTTPS API; the local LaunchAgent actively receives the tasks, and then the restricted attachment App calls the local Messages. See [`OPERATIONS.md`](OPERATIONS.md) for general monitoring, database backup and recovery, and [`SECURITY.md`](SECURITY.md) for security boundaries.

<a id="发送内容与运行边界"></a>

## Sending content and running boundaries

| Task Type | Attachments | Routing Requirements |
| --- | --- | --- |
| individual daily statement | A Chinese and English PNG containing confirmed revenue, source grouping and complete transaction without repeated text bubbles | iMessage, RCS or SMS/MMS |
| Employee range settlement | Three summary cards at the top + complete transaction details | All sessions will only send one specially formatted JPEG long image, and no PDF, independent summary image or paged splicing image will be generated |

- Daily closing and interval settlement share a serial processing loop. Normal tasks wait 2 minutes after confirming the result, and wait 5 minutes after failure to receive the next one; the empty queue is still polled every 10 seconds. The next collection time is written to the local log, and restarts to continue waiting; cooling does not occupy the lease of the next task. The heartbeat is executed independently every minute and will not be disconnected due to waiting for transmission or retry. Reason: There is still an asynchronous sending process after the command is accepted. Serial observation, cooling and persistent waiting jointly avoid continuous sending too fast.
- The proxy does not open inbound ports and only makes outbound HTTPS requests to the API; the NAS does not require a Mac to be connected or controlled. Reason: Fixed Mac actively polling and not requiring NAS to gain native control permissions.
- Fixed Macs must remain logged in as the corresponding macOS user. Locking the screen does not affect the operation. Exiting the user will stop the LaunchAgent. Reason: LaunchAgent belongs to the user session, and exiting the session will stop sending.
- The agent does not emulate the keyboard, use the clipboard or photo album, or activate the Messages window. The restricted attachment app reads the sending status of this task in SQLite read-only mode: only matches the fixed attachment path, receiving number and outbound mark, selects the message GUID, sent, delivered, error code and channel; does not select the text, does not enumerate other chat content, and does not write to the database. Reason: Neither AppleScript return nor file upload completion can prove that the message has been sent. Subsequent failures can only be judged by the actual status of the corresponding message. The query must be limited to the sending task.
- The return from AppleScript only means that Messages has accepted the sending instruction, and does not mean that the operator has delivered it; when the result is unclear, it shall not be automatically resent. The actual acceptance is subject to the delivery status of Messages. Reason: The successful call is not a network delivery, and the result is uncertain and retransmission may cause duplication.

The GUID of the previous message of the same task is recorded before each sending. It can be observed for up to 2 minutes after sending, and the status of this new message is read every 5 seconds; the success of the previous round cannot be used as a receipt for this time. The observation can be ended by clear delivery; the SMS without delivery receipt must be observed for the entire window and is still sent with an error code of zero in the end before the task can be ended. Clear failures will lead to a retry with an upper limit; no new records, still to be sent, status reading exceptions or incompatible database structures will be retained for verification. If the write is not successful, there will be no automatic resend. Reason: SMS may not provide delivery receipts, errors take precedence over historical success markers, and cannot be downgraded to false successes when monitoring is unavailable.

The webpage retains the `SENT` field compatibility of the old API, but uniformly displays "Submitted·Unconfirmed Delivery", the time is marked as the submission time, and the color to be verified is used; daily closing, interval settlement and employee subtotals all indicate that the actual status of the information app shall prevail. Reason: Historical `SENT` only proves acceptance of the command, and "sent" in the new version of monitoring does not mean that the recipient phone has received it.

The individual daily statement text message is converted from `apps/messages-agent/src/render.ts` to the shared SVG of `packages/domain/src/employee-closing-image.ts` to PNG via `sips`; the Web-generated image uses the same SVG, and the page and image share the Chinese and English content of `employee-closing-template.ts`. The source width is fixed at **1170 pixels** and the height grows with the two columns of work record cards. The top displays the store, employees, date and confirmed income, and the two lines of cash/swipe card + gift card list service commission and tips; the card displays projects, add-on, pre-discount service fee, actual payment split, tips and current income by time. Cash has no frame, card swiping has a frame, gift card has text, highlight and discount follow the work record card semantics; pending checkout is not included in the summary, unknown and zero values are distinguished, and long content is completely wrapped. Old snapshots default to no tags when they are missing highlight and discount fields. Reason: Pages, saving pictures and sending attachments require the same reading template. The precise income comes from the snapshot when queuing. The historical snapshot cannot be invalidated due to the new display field.

The interval settlement SMS is rendered to JPEG by `apps/messages-agent/src/settlement-render.ts` which renders the shared SVG of `packages/domain/src/employee-settlement-image.ts`; the web salary settlement PNG also uses this template. The two settlement images share the theme, line wrapping and surface drawing of `image-layout.ts`, and follow the lime white background, white surface, ink text, dark green emphasis, thin edges and uniform rounded corners of [UI Design](../engineering/UI_DESIGN.md). The interval picture first explains the store, date range, employees and salary source, and then reads the top income summary, daily summary and time sequence one by one; the main total income is highlighted once, the service fee, tips and total of the selected source are all labeled, and the amount is retained in cents. The picture illustrates the income for the complete period and does not indicate that wages have been paid. Reason: Different output environments require common reading levels and amount tags. Attachments should continue the ledger reading method of this project, and income information and payment facts cannot be confused.

Web page images and text message attachments are generated by different operating environments. Modifying the source code, restarting the Web, or deploying NAS will not update the installed Mac agent; if the text message still shows the old version, first check `~/Library/Application Support/Massage Note Messages Agent/app/package.json` and `app/dist/render.js`, obtain the agent update authorization, and then follow the installation process below to upgrade. Sent attachments will not change with template updates. Reason: Web, NAS and installed agents are independent deliverables, and historical attachments are immutable.

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

The installation script authenticates the "shard/task" two-level probe of the Messages attachment directory through LaunchServices with the identity of this app, and then the AppleScript in the app actually reads the probe and enumerates the Messages account without sending the message. The identity of this App is used for both staging and final sending; after Node reviews the lease before sending, it only submits the verified task UUID, fixed file name, receiving number and image route. The App rebuilds the path, rejects the symbolic link, verifies the file header and executes the package script. The `Contents/MacOS` binary cannot be executed directly as a LaunchAgent child process, nor can it fall back to the background Node's `osascript` to read protected attachments. Reason: Only testing that the App can write files does not prove that another authorized identity can read or transfer files; the same App identity covers temporary storage, reading and sending.

The script uses the SHA-256 combination of two Swift source codes and the sending script module to identify the attached App, and puts the same AppleScript into the App resources. Preserve existing binaries and signatures when the code has not changed; rebuild signatures when installing for the first time or when the source code changes. If the permissions become invalid after the upgrade, close and enable full disk access permissions for the app, and then rerun the installation. Reason: Script resources are also signature products. Re-signing may invalidate existing permissions. Joint verification prevents continued use of the old app after script changes.

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

Interval settlement only records the completion checkpoint of a single long chart. The store name, employees, settlement interval and three summary cards are placed at the top of the long chart, and are grouped below by business day; the first one every day is an independent "summary of the day", which is always placed in the leftmost column of the first row of the day; each subsequent work record uses independent cards and is arranged by time. All column numbers and odd-even numbers follow this order, and the blank card slots are no longer filled for the summary. The long store name, employee name, project name, payment split, mixed payment reminder and amount should be fully wrapped according to the available width. The header and card will increase with the content. No ellipses are allowed to hide the content. When the work record exceeds one row on the same day, it will automatically switch to the next row; the renderer will select a layout between a 1080, 1440, and 1680 pixel source canvas and 2 to 4 columns based on the total number of days and record density, and then compress the output without exceeding 4 MB. The image does not contain a separate cover, paginated headers or page numbers. Reason: Shared SVG and capacity tests are summarized in the leftmost order, and a single snapshot can be retroactively reissued.

Capacity regression testing must cover at least "18 transactions in a single day" and "12 transactions per day for 31 days." The maximum source height of a long image is 32,760 pixels; if it still exceeds the limit while maintaining the complete text and readable font size, it is clearly required to shorten the settlement date range, and the row height cannot be further compressed or the record can be cropped. The agent processes the queue serially, and the sending script retains an additional 15 seconds for Messages to take over the attachment; the source outbox is retained for 30 minutes and then cleared, and the official attachment is managed by Messages. Reason: High-density and long ranges have different capacity boundaries, and accounts cannot be cut if the limits are exceeded.

After rendering and staging are completed, the agent verifies the lease and sending qualification again before calling Messages, and first saves `started` atomically; after the command returns, it saves `submitted` (attachment and last message GUID), and only saves `accepted` after observing the confirmation. When re-acquiring, tasks with `submitted` will continue to be observed and will not be sent again; confirmed tasks will only write server receipts; tasks that only start recording without submitting a receipt will have unclear marking results. If a clear failure occurs, the submission checkpoint will be cleared and saved for a five-minute backoff, and then the server will decide whether to retry; when the completed settlement task is explicitly requeued by the administrator, a new round of checkpoints will begin. The old log remains compatible when it lacks new fields; it stops sending when the log is damaged or unreadable. The log needs to be restored first and cannot be treated as empty history. API requests have a 30-second timeout, and the heartbeat will only report readiness when the attachment App's read-write, automation, and read-only status query probes, and identifiable sending accounts are all available; collection will be suspended if the probe fails. Reason: Leases/permissions may change during rendering, acknowledgment or failure reporting interrupts cannot cause an already started send to be executed again, and observation and backoff status must be preserved across restarts.

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
| Number of attempts increased but failed | Page queue details and local `agent-error.log` |
| Send reports `Access denied`, but the old version of the staging probe passes | Update the attachment App to confirm that it reads and sends it; turn off and on its full disk access permissions and check the automated authorization, and cannot use the background Node to send |
| The heartbeat returns 400 and the number of sending times continues to increase | Check whether it is still an old agent with no limit on the error length; update the agent, first check the historical sending results, and do not directly reset the sending status |
| Installation diagnostics failed | Messages login, automation permissions, full disk access to staging apps, available iMessage/RCS/SMS services |
| `argv 未定义` | AppleScript is required `on run argv` take over `osascript -e ... -- <参数>` |
| macOS 26 account number report `-10000` | When reading `service type` on an account-by-account basis, each must be wrapped in `try`, and additional account types that cannot be converted are ignored |
| PNG display `0 KB / 原大小`, or appear `fileTransfer rejected error 30`, `IMFileTransfer error 15` | Confirm that the path given to AppleScript is in the Messages-specific attachment directory, and then run the temporary program `--diagnose` |
| Non-Apple number picture failure | iPhone SMS forwarding, carrier MMS/RCS and connected SMS accounts |
| The long settlement image cannot be sent | Confirm that the agent has been updated according to this manual (the heartbeat version reads the package `package.json`), and check whether the image exceeds 32,760 pixels or 4 MB; shorten the settlement interval when it exceeds the limit |

When encountering attachment reading problems, do not use emulated keyboards, paste to the clipboard, recent items in the photo album, copy private `com.apple.macl` properties, or manipulate the Messages/Photos database. Official agents do not require Accessibility permissions. Reason: Restricted temporary storage is the existing solution, and there is no source code basis for temporary album operations and private properties.

<a id="卸载"></a>

## Uninstall

```bash
./scripts/uninstall-messages-agent.sh
```

After uninstalling you should confirm that the LaunchAgent has disappeared. If you no longer use the Mac, you should also rotate or revoke the proxy token in your store settings. Reason: Deleting the native process will not automatically invalidate the server token.

The API will requeue after a retry failure at the earliest 60 seconds, and the Mac agent will wait for at least 5 minutes for failure before receiving it again; it can retry a maximum of 3 times (a total of 4 retries for the first send), and the upper limit is reached to mark the failure and stop automatic retries. The actual retry may come later when the queue is busy or the agent is offline. Tasks that have been handed over to Messages but have unclear results still need to be manually checked and will not be automatically resent. Reason: Failure types differentiate between safe retries and indeterminate results, and retry caps protect queues and recipients.
