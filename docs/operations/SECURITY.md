<a id="安全说明"></a>

# Safety instructions

**English** | **[简体中文](SECURITY.zh-CN.md)**

<a id="已实施控制"></a>

## Controls implemented

- Firebase Phone Auth verifies the ownership of the phone number; the password uses a random salt `scrypt` digest. After the password verification is successful, the Admin SDK issues a short-term Custom Token. The API uses `Secure`, `HttpOnly`, `SameSite=Lax` session cookies, and session validation includes revocation checking. Reason: Current session verification and revocation rely on the authenticated account, and plain text passwords cannot be used as persistent credentials.
- Production builds hard turn off local development login. Login uses a double-submit CSRF token; other cookie write requests require an exact match of the trusted `Origin`. Reason: The development portal does not provide real authentication, and Origin/CSRF prevents third-party pages from borrowing session writes.
- Each business request verifies valid store members, roles, object ownership and business day at the service layer; there are database integration tests for cross-store isolation, employee financial isolation and role boundaries. Reason: The role menu does not demonstrate object ownership or current membership validity.
- The database migration account is separated from the running account. The running account cannot DDL, nor can it update/delete audits, AI query logs, and real-time events. Reason: There is no need to change the structure or rewrite the traceback log to run the process.
- Amounts use integer cents and database constraints; key writes have transactions, optimistic locking, idempotency keys, soft deletion and same-transaction auditing. Reason: The database and transactions work together to prevent amount inconsistencies, replays, and irreversible deletions.
- Login, join, AI, export, SSE and general writes use Redis distributed rate limiting; when Redis is unavailable, it safely degrades to in-process rate limiting. Reason: An external Redis failure cannot allow the interface to accept requests without limit.
- Web returns CSP; Web/API are set with anti-embedding, MIME, referrer, and permissions policies, and HSTS is enabled for production; user text is rendered as plain text by React. Reason: The actual response headers of `next.config.ts` and API `main.ts` are different, and the CSP of the Web cannot be declared as API implemented control.
- Web does not register service workers and does not persistently cache logged-in business pages. Draft details are retained for up to seven days; normal exit only clears the server session, retaining the local Firebase login status and application preferences so that the same number can be restored without text messages. Revoking all sessions will still invalidate the trusted status. Reason: The persistent business cache may leak data or display old accounts. You cannot misuse the normal exit when unbinding the device.
- AI does not have any SQL, URL, file or financial writing tools; parameters are strictly verified, canonical previews are saved on the server, re-authentication and atomic preemption are performed upon confirmation, and consumption is one-time. Reason: Model output cannot become unconfirmed and unauthenticated business writes.
- LangBot uses a standalone `mnw_` integration token and can only call the read-only work record context and work record event interface. The model does not hold database or ordinary API permissions; each time it only obtains the idiom skill data of the current group-bound store. Employees, standard projects, available time, amount, payment method and message idempotency are re-verified by the backend, and any unclear input will not be recorded. Reason: Standalone tokens should only have access to bound scope, textual and catalog evidence prevents models from fabricating financial facts.
- Voice is only forwarded to MiniMax in memory on the application side, with an 8 MB/60 second upper limit. The application database, disk, and logs do not save the original audio. Reason: The original recording is not accounting data, and size and duration restrictions protect forwarding resources.

<a id="租户隔离说明"></a>

## Tenant isolation instructions

Currently, "API service layer enforces `storeId` scope + object ownership verification + non-superuser database account + cross-store integration testing". PostgreSQL RLS that relies on connection session variables is not currently enabled because the Prisma connection pool can create error isolation semantics if it does not bind the entire request to the same transaction connection. Set-once connection variables must not be used in place of request-level tenant isolation. Reason: The existing Prisma connection pool cannot guarantee that subsequent queries will still use the connection, and the service layer is the current isolation boundary.

<a id="部署责任"></a>

## Deployment responsibilities

- HTTPS/WAF, host patches, Docker updates, managed database PITR, off-site backups, log retention and alerts are the responsibility of the deployment environment. Reason: There are no built-in services for these capabilities, and the responsibilities of the deployment environment and applications must be clearly defined.
- Web and API should be under the same registrable domain, and `WEB_ORIGIN` must be precise; do not use wildcard Origin. Reason: SameSite sessions and accurate Origin verification rely on the actual access address.
- PostgreSQL, Redis and application internal ports only listen on the private network/loopback. Reason: The database and cache do not accept direct requests from the browser.
- The `.env.production` permission is set to 600 and does not enter the image, repository, log or plain text cloud backup; [Disaster recovery package](DISASTER_RECOVERY.md) can contain production configuration and necessary credentials, but must be encrypted using age as a whole, and the private key is stored independently in the Mac keychain. NAS and Drive do not store the private key. Reason: Environment files are not part of the release, but configuration and keys are required for complete recovery after host loss; encryption and independent private keys are necessary boundaries.
- Public GitHub/GHCR only allows saving source code, build products, and `NEXT_PUBLIC_FIREBASE_*` browser public configurations; Firebase Admin, MiniMax, databases, Redis, DSM, and GitHub tokens can only exist in local/NAS restricted environments, system keychains, or controlled encrypted recovery packages. The recovery package only contains the credentials needed to restore the service and does not collect extraneous account secrets. Reason: The purpose and visibility of browser public configuration and back-end credentials are different, and off-site disaster recovery also needs to avoid expanding the scope of credentials.
- Check the temporary file and scan the secret for each release; the complete history scan is used for the first public disclosure or after the history is rewritten, it will not be repeated when there is a valid record and the history has not been rewritten; if the secret has been submitted, it will be revoked/rotated first, and then the history will be cleared. Reason: Simply deleting the current file cannot invalidate the historical secret, and the scanning range must be consistent with the published evidence.
- Firebase test numbers are only used for non-production projects; SMS quotas, budgets, and exception alerts are enabled for production. Reason: Test verification codes cannot be used for production authentication, and shipping costs are managed by the operator.
- Firebase Phone Auth SMS is only used to authenticate verification codes, and the verification code interface cannot be used for business content such as joining applications. Reason: The current implementation uses Firebase for authentication and there is no universal business SMS API.
- MiniMax key uses minimal permissions and sets a consumption budget; core business is still available when AI is turned off. Reason: Model explanation and certainty work record/finance are independent abilities.

<a id="已知边界"></a>

## Known boundaries

- This is a store work record and business accounting tool that does not calculate payroll taxes, W-2/1099 or tax filing results. Reason: The current domain model does not have tax declaration and tax calculation.
- Standalone Docker Compose does not come with a WAF, centralized logging, or PostgreSQL point-in-time recovery; production should be provided by a reverse proxy and hosting infrastructure. Reason: repository Compose only defines application, database and cache.
- When browser MP4/AAC recording capabilities are unavailable, the interface explicitly degrades to text input or system keyboard dictation. Reason: The transcription portal cannot block text work record when the device does not support recording.
- In-store shared device PIN mode is not part of the current implementation. Ordinary exit will retain the local trusted status of the same number, so shared or public devices must use "Revoke All Sessions" or browser private data clearing, and should not rely on ordinary exit to unbind the device. Reason: The current trusted login is saved according to the account, and normal exit only clears the server session.

When a security issue is discovered, retain the request number, time, account role, and remediation steps to avoid duplicating real customer/employee data or any keys. Reason: Reproduction and log correlation do not require exposure of business data or valid credentials.

<a id="mac信息发送代理"></a>

## Mac Messages sending agent

- The proxy token is authorized by the store and only returns plain text when created. The server only saves the SHA-256 digest; the old token becomes invalid immediately after rotation or revocation. Reason: Restricted proxy identities need to be revocable, and the database does not need to store clear text.
- The proxy does not open inbound ports and only polls the HTTPS API. The sending task saves the receiving number and the corresponding daily closing or interval settlement data snapshot, and the access permissions are consistent with the financial daily closing. Reason: Fixed Mac proactively picking up tasks and sending permissions cannot be obtained by inbound control.
- The Attachment App uses `SQLITE_OPEN_READONLY` to query the outbound sending status of this task. The exact attachment path matches the receiving number. The GUID, sending/delivery mark, error code and channel are fixed. It does not read the text or modify the Messages database, and stops confirming success when the status is unreadable. Reason: AppleScript's acceptance of instructions does not mean that asynchronous sending is successful. Failure monitoring requires restricted metadata and failure closure boundaries.
- PNG/JPEG is temporarily stored as `0600` in the outbox of Mac with controlled permissions. After being handed over to Messages, it is kept for 30 minutes for asynchronous reading by the system, and then automatically deleted by the agent. The local log only saves the task ID, attachment type and non-sensitive size, and does not record salary data or attachment content. Reason: The system's asynchronous reading requires short-term retention, and attachments and logs contain potentially sensitive information.
- Canceling the daily closing will cancel the old cycle tasks that have not been sent yet; the person-by-person sending that is not associated with the daily closing will be independently verified, and the task status and permissions will be rechecked before sending by the agent. Reason: Person-by-person snapshots are allowed to be sent when not closed, and each task can no longer be required to have a valid daily closing period.

For installation, file staging, sending routing and special troubleshooting, see [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md).
