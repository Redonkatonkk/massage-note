<a id="2026-09-08-代码审查与修复记录"></a>

# 2026-09-08 Code review and repair records

**English** | **[简体中文](CODE_REVIEW_2026-09-08.zh-CN.md)**

> Historical references, not current rules. Reason: Save evidence of current design, review or delivery for traceability; all old requirements no longer bind the current code.

> Archive: Reason is to document evidence of a fix for 1.0.7, not as a current rule or backlog.

Applicable version: `1.0.7`. This round checks product, architecture, API, development, deployment, security, and agent documentation, and examines domain calculations, input contracts, database constraints, API write links, web state management, LangBot plug-ins, and Mac information agents. The original robot natural language instructions, bookkeeping, add-on/discounts and financial daily modifications in the workspace are retained and included in the regression.

<a id="已确认并修复"></a>

## Confirmed and fixed

| Scope | Issues and Impact | Fixes and Verification |
| --- | --- | --- |
| AI confirmation | Payment fails after creation/modification is successful, leaving some records; preview and business writing are not in the same transaction | Preview occupation, business writing, auditing and consumption are submitted once; integration test injection fails midway, verification has no residue and can be retried |
| AI concurrency | Concurrent confirmation of the same preview may wait for a long time, and the processing status is easily inconsistent with the result | Transaction level try advisory lock; retain repeated consumption and version verification; concurrent integration testing |
| AI payment | Modifying only one tip will clear unmentioned payments, including gift cards | Merge explicitly given fields, retain the remaining payments and card numbers; pending payment records reject confirmation of only tips; integration testing |
| Web page saving | Details successful, payment failed, the interface is only half-completed once saved | Added `POST /work-records/:recordId/save` atomic interface; failed rollback and idempotency retry integration test |
| Optimistic locking | Automatically adopt the new version number after a conflict, and the next retry may overwrite other people's modifications | Keep the user's original version, requiring reloading for verification; continue to use back-end version conflict protection |
| Kanban association | Work records created by API, AI, and robots may not have employee rows and cannot be seen in normal kanban boards | Shared row filling function; called for creation, cross-day modification, recovery, and robot start-up; historical repair migration test |
| Robot occupation | After the web page is confirmed, deleted or reassigned, the robot still thinks that the employee is working | The corresponding occupation pointer is cleared with the same transaction; the integration test verifies that the employee can start working again |
| Cross-day concurrency | When moving two records in the opposite direction, the opposite order of business day locks can cause deadlock | Sort locks by date, and then perform writability and version checks |
| Robot amount | Negative numbers, extra decimals, mixed payment types, or two amounts being referenced repeatedly/exchanged | Strictly extract independent amount evidence, check the order and payment method; analytical regression testing |
| Robot duration | `160 分钟` be regarded as `60` evidence; pure blank evidence is accepted | Numeric boundaries, hour conversion and non-null evidence checking; analytical regression testing |
| Robot permissions | Deactivated binding senders may still be registered; deactivated stores still accept requests | Check the store, sender account and member status each time; deactivate member integration testing |
| Robot to be paid | Write a fake zero payment snapshot to the pending payment record after add-on/discount | Keep the payment related fields empty and recalculate the due project salary; Integration test |
| Robots duplicate messages | Different senders/texts with the same message ID may be regarded as the original request | The request identity and content are compared within the transaction and the unique key replay branch |
| Financial filtering | Duplicate employee IDs cause balances such as boss arrears to be accumulated repeatedly | Deduplication in query context; integration test compares single and repeated filtering |
| Amount accumulation | Multiple safe integers are out of bounds after being added, daily closing/interval summary is silently distorted | Aggregation retains BigInt, check the safe range when output; Amount out of bounds regression test |
| CSV | Leading whitespace, tabs, and newlines bypass formula guard | Extended dangerous prefix identification; CSV regression testing |
| Send idempotency | Employee subtotal sending only compares some fields, and the same key can return another filter result | Calculate hash for complete normalized request, compatible with old task audit records; filter change regression test |
| Send to queue | Tasks and auditing are written separately, failure or concurrency may leave unaudited tasks | Enqueuing and auditing are the same transactions, locking on request; individual daily statement reviews status and repeated tasks in the business day lock |
| Cancel/Retry | The audit fails after the task status changes, and an error is returned but the operation has taken effect | Cancel, retry, resend and audit the same transaction; real database error verification rollback |
| Send lease | Old leases that have expired or been replaced can still complete/fail writeback, overwriting new task status | Both reads and final condition updates verify token, CLAIMED status and validity period; expire and replace leases after reads Integration testing |
| Sending qualifications | Agent credentials for deleted stores can still be used; task qualifications may change during rendering | Authentication checks store status; agents are authorized again after rendering/temporary storage and before actual sending |
| Agent recovery | Damaged local journals are treated as empty records, increasing the risk of repeated sending | Empty journals are allowed only if the file does not exist; damage or read failure stops, temporary files are replaced atomically; journal regression testing |
| Send by proxy | Sending exceptions are treated as route lookup failures and are retransmitted through a different channel; the request may hang permanently | Route lookup and actual sending are captured separately, and the sending result is uncertain and will not be automatically resent; HTTP request times out, and the capability report includes the attachment temporary storage capability |
| SSE | Slow queries are constantly being canceled; connections continue to read after revoking permissions; late submission events fall before the cursor | `exhaustMap`, continuous permission verification, periodic resync; slow polling, revocation and compensation event testing; Web reconnect refresh |
| Financial page | Old requests overwrite new results after date/filter switching; background refresh closes the details being viewed | Request generation isolation, discard outdated results, distinguish background refresh and active query; LatestRequest test |
| Browser boundaries | Storage disabled/full causing page exceptions; non-existent daylight saving time is automatically rewritten | Storage downgrade packaging and store time round-trip verification; storage and daylight saving time testing |
| Speech input | Strict Mode mount cleanup makes components considered uninstalled for a long time; repeatable startup during microphone request | Remount reset flag, mutual exclusion protection in startup; type and build verification |
| Login and password | Empty request body can be 500; concurrently set password override; expired Firebase cache blocks subsequent logins | Input type verification, password condition update, cache invalidation fallback; API and Web regression testing; production front-end closes development login |
| Store owner transfer | Can be transferred to an unclaimed account, resulting in no store owner who can log in | The target is required to be an associated and valid user, and the front-end is synchronously filtered; member integration test |
| AI preview | The floating layer outputs the original amount object; the cents are rounded, the device time zone is used, and the clearing end time displays the old value | The two entrances share the display logic, the amount is kept in cents, the store time zone is used, and null and unmodified are distinguished; preview test |
| LangBot plug-in | Time value/URL judgment is not strict, plug-in regression is not included in CI | Strict input verification, Python test is added to CI |

Unified HTTP exception handling has also been verified by real Nest HTTP requests: native middleware rejection can correctly return 429, without the need for additional error forwarding patches.

<a id="验证"></a>

## Verify

The local independent test database `massage_note_test` was used, the online database was not modified, and no messages were sent to real phone numbers or WeChat groups.

| Check | Results |
| --- | --- |
| `pnpm typecheck` | All workspace types and Prisma schema checks passed |
| `pnpm test` | Domain 46, Contract 48, Messages Agent 29, Web 70, API Unit 96 passed; database test is skipped by configuration under this command |
| `pnpm test:integration` | Database 7, API 182 passed; the number of APIs includes the above 96 unit tests |
| LangBot Python unittest | 6 passes (local command; publishing CI maintains existing workflow permission boundaries) |
| `pnpm build` | Version checking, shared packages, API, proxy, Next.js and standalone packaging passed |
| Production product smoke check | Temporarily start the standalone login page, HTTP 200, phone number form and security response header are normal; the production environment does not display the development login entrance; close the temporary process after checking |
| Differences and scripts | `git diff --check`, installation/uninstallation and backup/restore/mirror script syntax check passed |

After removing the API duplication count, there are 388 automated tests in total. Fixing does not mean proving that there are no unknown defects; this round of evidence focuses on covered business rules, concurrency and failure recovery scenarios.

<a id="数据迁移与上线边界"></a>

## Data migration and online boundaries

- The current workspace contains two forward migrations: the original `20260908010000_work_bot_instructions` and the new `20260908020000_repair_work_record_board_links`. The new migration only repairs the dashboard association and cleans up the invalid robot occupation, and does not change the payment or financial snapshot.
- The new migration has been executed in the test database; the replenishment SQL is executed twice consecutively using an isolated temporary table to verify that the hidden rows and original order are retained, and the version is not increased repeatedly.
- Before release, verify the migration time and lock impact on the production data copy according to the release list. When the history is large, scan and write ranges need to be evaluated with actual data volumes.
- No production deployments, code pushes, or installed Mac agents restarted. Real Firebase SMS, MiniMax, WeChat group callbacks, macOS message delivery, and NAS image deployment still require corresponding environment acceptance; these external links are not marked as verified in this round.
- Messages does not have an end-to-end idempotency interface, and there is still an indeterminate window for processes to crash between sending an accept and acknowledgment record. The current policy stops automatically changing channels and retransmitting when an uncertain error is known, and retains the manual verification path.

Business/API, bots, Mac agents, and version documentation are synced. Subsequent maintenance is subject to corresponding module testing, sharing contracts and database constraints.
