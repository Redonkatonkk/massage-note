<a id="api-使用说明"></a>

# API usage instructions

**English** | **[简体中文](API.zh-CN.md)**

> Applies to version: `1.40.1`
> The precise input fields are subject to the Zod schema of `packages/contracts/src`; this page is responsible for HTTP paths, common semantics and cross-end conventions.

The HTTP API of this system is shared by current Chinese and English web applications and future native clients. The default prefix is `/api/v1`, all business amounts use integer cents, dates use `YYYY-MM-DD`, and time points use ISO 8601 strings with time zones.

<a id="认证与通用规则"></a>

## Certification and General Rules

- First-time registration verifies the phone number by Firebase Phone Auth and submits both a name and an 8- to 72-character password in `POST /auth/session`; the password is only saved in a randomly salted `scrypt` digest.
- Old users can exchange their password for Firebase Custom Token, or they can continue to use verification codes. The client eventually submits the Firebase ID Token to `POST /auth/session`, and the server returns the `HttpOnly` session cookie.
- Browser business requests carry session cookies; LangBot and Mac send proxy interfaces use independent Bearer credentials respectively. Reason: The identity systems of these portals are different, and the integrated interface cannot be mistakenly remembered as the browser session interface.
- Key writes in existing stores must send the `Idempotency-Key` request header; it is recommended to use UUID. The same key and the same request will return the first result, and the same key with different content will return a conflict. There is no `storeId` when creating a store, so "store owner + self-selected store code + same configuration" is used for semantic deduplication; for joining application, "user + store + pending review status" is used to deduplicate semantics. Reason: Identity, idempotency, and version protection are performed by the current authentication and writing services and cannot be bypassed by clients.
- The `version` in modify, delete and restore requests is the optimistic locking version. If the resource has been modified by other devices, the interface returns `409` and the latest resource. The client should refresh and let the user recheck.
- The web store business path contains `storeId`; the integration interface determines the store from restricted binding or proxy identity. The server verifies membership, role capabilities and object ownership, and cannot rely on front-end hidden buttons to implement permissions. Reason: Neither the client parameters nor the interface can prove tenant ownership.
- Normal requests and responses use JSON; CSV export, audio upload, and SSE streaming use the corresponding format. The error format is `{ code, messageZh, requestId, latestResource? }`. `latestResource` with conflicting versions must also be JSON-safely converted. Reason: The database `BigInt` amount cannot degrade the expected 409 response to 500, nor can it handle streaming or binary requests as JSON.

<a id="主要端点"></a>

## Primary endpoint

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health`, `/health/ready` | Survival and dependency readiness checks |
| GET | `/auth/csrf` | CSRF Cookie and token before initializing SMS login |
| POST | `/auth/account-status` | Determine the new account, password account or old account whose password needs to be reset by phone number |
| POST | `/auth/password` | Verify phone number and password and issue Firebase Custom Token |
| POST | `/auth/session` | Use Firebase ID Token to establish a session; save name/password when registering for the first time or upgrading an old account |
| POST | `/auth/dev-session` | Local development login used only when non-production and both sides are explicitly enabled |
| DELETE | `/auth/session`, `/auth/sessions` | Exit the current device and revoke all device sessions |
| GET | `/me` | Current account, profile status and active store membership |
| PATCH | `/me/profile`, `/me/password` | Update name information, set or modify password |
| GET | `/stores` | List the valid stores of the current user |
| POST | `/stores` | Create a store; the store owner fills in the globally unique 6-digit code |
| GET | `/stores/resolve-code/:code` | Parse the store code before joining and display the store name for confirmation |
| GET/PATCH/DELETE | `/stores/:storeId` | Store details, settings and soft deletion; settings include work record and gift card automatic discount |
| POST | `/stores/:storeId/owner-transfer` | Atomic transfer of store owner identity |
| POST | `/stores/:storeId/join-requests` | Submit a joining application; register the First Name and automatically bind the account when it matches the employee to be claimed |
| GET | `/stores/:storeId/join-requests` | The store owner or manager views the join request |
| POST | `/stores/:storeId/join-requests/:joinRequestId/approve`, `reject` | Approval of join application |
| GET | `/stores/:storeId/members` | Member list; the associated account will also return the registered phone number for backfilling the SMS receiving number |
| POST | `/stores/:storeId/members` | The store owner or manager creates an employee to be claimed with `{ "name": "小林" }`, no last name or phone number is required |
| PATCH/DELETE | `/stores/:storeId/members/:membershipId` | Update member information/role or soft deletion membership relationship; when turning on the individual daily statement SMS, there must be at least one dedicated number and associated account registered phone number, otherwise the update will be refused |
| POST | `/stores/:storeId/members/:membershipId/restore` | Restore membership |
| GET | `/stores/:storeId/catalog` | Project directory |
| POST | `/stores/:storeId/catalog/setup` | Set the project directory in batches for the first time |
| POST | `/stores/:storeId/catalog/items` | Add main, additional or discounted items |
| PATCH/DELETE | `/stores/:storeId/catalog/items/:itemId` | Modify or soft deletion items |
| POST | `/stores/:storeId/catalog/reorder` | Atomicly adjust the complete order of a category of items |
| POST | `/stores/:storeId/catalog/items/:itemId/restore` | Restore soft deletion items |
| GET | `/stores/:storeId/members/:membershipId/commissions` | Read employee default and project-specific commissions |
| PUT | `/stores/:storeId/members/:membershipId/commissions/default`, `item` | Save employee default or project-specific commission; recalculate according to rules not closed current business day |
| GET | `/stores/:storeId/business-days/current` | The device's current business day, device time zone and compatible old cutoff fields |
| GET | `/stores/:storeId/business-days/open-work-dates` | Query business days that have valid work records but are not closed within the date range, for today's work record and financial daily closing calendar marking; `dateFrom` and `dateTo` are required, both include endpoints, and the range is up to 63 days; Owner/Manager returns the whole store date, and employees only return their own work record dates |
| GET | `/stores/:storeId/boards/:businessDate` | Today's or historical work record table; contains valid gift card sales and store sales summary on that day; when ordinary employees view the history, only their own row, shift, work record and personal statistics are returned, and the whole store's card sales records are not returned |
| GET | `/stores/:storeId/lost-customers?businessDate=YYYY-MM-DD` | Read the valid customer records of the selected business day, sort by the occurrence time, return `id`, `storeId`, `businessDate`, `occurredTime` (local to the device `HH:mm`), `customerCount` (number of guests), `note` (note, default is empty string), `isWalkIn` (whether to go directly to the store) and `version`; the current business day is open to all active members, and the historical date is only readable by the owner and manager |
| POST | `/stores/:storeId/lost-customers` | Record a runner; body is `{ "businessDate": "YYYY-MM-DD", "occurredTime": "HH:mm", "customerCount": 1, "note": "可选备注", "isWalkIn": true }`, `isWalkIn` is an optional Boolean value, when omitted it is `false`;need `Idempotency-Key` |
| PATCH/DELETE | `/stores/:storeId/lost-customers/:recordId` | Modify customer time, number of people, remarks, Walk-in source or soft deletion; `customerCount` is optional, 1-999 integer, 1 when added and omitted, retain the original number of people when modified and omitted; remarks can be up to 500 characters and remove leading and trailing blanks, PATCH omits `note` Keep the original note, pass an empty string to clear it; PATCH omit `isWalkIn` to retain the original mark, pass `false` to cancel; use `version`, `Idempotency-Key`, business day lock, and write audit and outbox in the transaction |
| POST | `/stores/:storeId/shifts/clock-in`, `shifts/:shiftId/clock-out` | Commute to and from get off work; currently the Web only displays "to work" for ordinary employees who meet the conditions |
| POST | `/stores/:storeId/boards/:businessDate/rows` | Add daily employee rows |
| PATCH | `/stores/:storeId/boards/:businessDate/rows/:rowId` | Hide/restore daily employee rows; closed History allows, today/future closed Must be canceled first |
| POST | `/stores/:storeId/boards/:businessDate/reorder` | Atomic adjustment of daily employee row order |
| POST | `/stores/:storeId/boards/:businessDate/rank` | Store manager or manager generates today's or future date employee order by last visible attendance rank (past dates return DAILY_RANKING_PAST_DAY_NOT_ALLOWED); using business day lock, table version and idempotency key |
| POST | `/stores/:storeId/boards/:businessDate/rows/:rowId/remove` | Remove accidentally added employees who have no activities for the day |
| POST | `/stores/:storeId/work-records` | Create duration-only pending records, preset/custom services or placeholders; daily ranking will not increase the work record field or limit the work record entry |
| POST | `/stores/:storeId/work-records/detailed` | Atomically create a full record using `{ create, details, payment? }`; requires an idempotency key and initial versions of `1`; zero receipts permit an unselected service |
| GET/PATCH/DELETE | `/stores/:storeId/work-records/:recordId` | work record details, modification highlight / excluding scheduling and other fields and soft deletion |
| POST | `/stores/:storeId/work-records/:recordId/save` | Details and payment are saved atomically; the body is `{ details, payment }`, both must have the same base `version`, and the idempotency key is required |
| POST | `/stores/:storeId/work-records/:recordId/confirm-payment` | Confirm cash/card/gift card service fee and tips split; submit serial number when using gift card, or pass `giftCardIsOnline: true` to use the same field as user name |
| GET | `/stores/:storeId/work-records/deleted` | work record Recycle Bin |
| POST | `/stores/:storeId/work-records/:recordId/restore` | Restore soft deletion work record |
| GET | `/stores/:storeId/gift-card-sales` | The store manager or manager reads the gift card account grouped by serial number and user name, the next physical card serial number and multiple usage records |
| POST | `/stores/:storeId/gift-card-sales` | Record the gift card sold; submit the business day, face value, cash, card swipe and operator. The physical card serial number is atomically assigned from 1001 to each store on the server side. Online card sales are recorded by user name; both new additions and modifications allow cash + card swipe and the payment after discount is different.`amountCents` Save the actual receipt total (must be greater than 0), the discount snapshot is not affected by the difference |
| PATCH/DELETE | `/stores/:storeId/gift-card-sales/:saleId` | Modify or soft deletion card sales records; use `version`, `Idempotency-Key`, business day lock and audit |
| GET | `/stores/:storeId/gift-card-sales/deleted` | The store manager views deleted card sales records |
| POST | `/stores/:storeId/gift-card-sales/:saleId/restore` | Restore deleted card sales records |
| GET | `/stores/:storeId/closings/:businessDate/preview` | Whole store daily closing preview |
| GET | `/stores/:storeId/closings/:businessDate/members/:membershipId/preview` | individual daily statement preview; employees can only read the individual; return the target employee's work record sorted by start time, project/add-on name, each `grossFeeBaseCents` pre-discount service fee, `discountTotalCents` discount and `isHighlighted` highlight Marks, cash/card/gift card actual receipt split, single salary income, as well as cash/card service fee dividends, cash/card tips dividends and corresponding totals; only confirmed payments are included; the daily summary "cash service fee" uses `cashLargeFeeDividendCents` to represent the cash service commission payable to employees in the store (the pre-discount commission is divided according to the cash payment ratio, excluding cash tips); `cashToSubmitToStoreCents` Only old definition compatibility is retained; no store-wide or other people’s data is included |
| POST | `/stores/:storeId/closings/:businessDate`, `.../cancel` | Normal/forced daily closing and cancellation of daily closing; cash settlement status does not prevent normal daily closing, daily closing does not automatically settle cash; cancellation only requires `version`, `reason` can be omitted |
| GET | `/stores/:storeId/closings/:businessDate/deliveries` | Store owner or manager views individual daily statement SMS delivery history, errors and Mac agent status |
| POST | `/stores/:storeId/closings/:businessDate/deliveries/batch` | After daily closing, add all member idempotencies that are opened, have valid numbers, and have work records on the day to the sending queue. |
| DELETE | `/stores/:storeId/closings/:businessDate/deliveries/:deliveryId` | The store owner or manager cancels a single employee daily closing SMS task that is still in queue |
| POST | `/stores/:storeId/closings/:businessDate/deliveries/members/:membershipId` | Send or reissue an employee's individual daily statement; not closed can also be sent, press the business day and request keys to save the snapshot at that time |
| GET/POST/DELETE | `/stores/:storeId/closing-delivery-agent/status`, `credential` | View agent status, generate one-time agent token or revoke token |
| POST | `/closing-delivery-agent/jobs/claim`, `jobs/:id/authorize`, `complete`, `fail`, `heartbeat` | Mac agent uses Bearer token to claim lease tasks, review before sending and write back the results |
| GET | `/stores/:storeId/cash-settlements/:businessDate` | The day's cash settlement list only includes employees with work records on that day, for the financial daily closing performance column to read; employees only return themselves |
| POST | `/stores/:storeId/cash-settlements/:businessDate/settle-all` | Batch settlement of outstanding employees |
| POST | `/stores/:storeId/cash-settlements/:businessDate/:membershipId/settle`, `reopen` | Single settlement or rollback; "Cash settled" of individual daily statement reuses this interface, rollback `reason` can be omitted |
| GET/POST | `/stores/:storeId/payroll-settlements` | Query or add salary settlement ledger |
| GET/PATCH/DELETE | `/stores/:storeId/payroll-settlements/:settlementId` | Payroll settlement details, modifications and soft deletion |
| POST | `/stores/:storeId/payroll-settlements/:settlementId/restore` | Restore salary settlement |
| GET | `/stores/:storeId/employee-settlements/preview` | Owner/Manager previews employee interval settlement according to `membershipId`, `dateFrom`, `dateTo` and `paymentScope=CASH|NON_CASH|ALL` plus optional `amountType=SERVICE|TIP|ALL` (defaults to `ALL`); only includes confirmed and undeleted work records, up to 999 transactions |
| GET | `/stores/:storeId/employee-settlements/calendar` | Owner/Manager press `membershipId`, `month=YYYY-MM` to query the cash/non-cash status of the confirmed work record date in the month |
| POST | `/stores/:storeId/employee-settlements/confirm` | Owner/Manager confirms settlement based on preview revision and deduction amount, atomic registration actual payment and scope confirmation; requires idempotency key |
| GET/POST | `/stores/:storeId/employee-settlements/deliveries` | Check the interval settlement SMS queue, or add the immutable snapshot after recalculation by the server to the single JPEG long image sending queue |
| DELETE | `/stores/:storeId/employee-settlements/deliveries/:deliveryId` | Cancel the interval settlement sending task that is still queued |
| POST | `/stores/:storeId/employee-settlements/deliveries/:deliveryId/retry` | Retry a failed long image sending task |
| POST | `/stores/:storeId/employee-settlements/deliveries/:deliveryId/retry-detail` | Resend the long image generated by the original immutable snapshot for failed or completed tasks; clear the long image/entire order completion time |
| POST | `/employee-settlement-delivery-agent/jobs/claim`, `jobs/:id/authorize`, `checkpoint`, `complete`, `fail` | The Mac agent receives the interval settlement task and writes back a single JPEG long picture of the progress |
| GET | `/stores/:storeId/finance/summary` | Financial summary, daily/employee subtotal and cumulative balance; total contains total turnover and store total settlement, daily row contains `dailyTurnoverCents`; `highlightFilter` supports `ALL`, `ONLY_HIGHLIGHTED`, `EXCLUDE_HIGHLIGHTED` |
| GET | `/stores/:storeId/finance/details` | Composition details consistent with summary filtering, including highlight status |
| GET | `/stores/:storeId/finance/my-balance` | The current member’s accumulated due, acquired, paid and outstanding/overpaid |
| GET | `/stores/:storeId/finance/export.csv` | UTF-8 CSV export consistent with rollup filtering and protected against formula injection, including highlight marker columns |
| GET | `/stores/:storeId/audit-logs` | Query audit by time, object, action and operator |
| GET | `/stores/:storeId/events` | SSE real-time event streaming supporting `Last-Event-ID` |
| POST | `/stores/:storeId/ai/work/messages` | Generate work record operation preview, do not write directly |
| POST | `/stores/:storeId/ai/finance/messages` | Answer financial questions using backend deterministic statistics |
| POST | `/stores/:storeId/ai/work/transcribe` | Speech to text |
| GET/DELETE | `/stores/:storeId/ai/previews/:previewId` | View or cancel one-time AI previews |
| POST | `/stores/:storeId/ai/previews/:previewId/confirm` | Re-authenticate and confirm AI preview once |
| GET | `/stores/:storeId/work-bot` | Owner/Manager View group bindings, employee bindings, project slang and recent robot operations |
| POST/PATCH/DELETE | `/stores/:storeId/work-bot/aliases...` | Owner/Manager manages store-level project aliases and their project and duration mapping |
| POST | `/integrations/langbot/work-context` | Use a dedicated Bearer token to read the real-time slang skills of the current group for the model to understand |
| POST | `/integrations/langbot/work-events` | Submit restricted work record events using a dedicated Bearer token; the plugin parses the original text and uses the WeChat message idempotency key |
| DELETE | `/stores/:storeId/work-bot/groups/:bindingId`, `members/:bindingId` | Owner/Manager Unbind the group or employee WeChat; refuse to unbind if there is a robot recording in progress |

LangBot's `work-context` also returns the names and short names of enabled `discounts` and `addons`. `FINISH` supports `memberName/memberMention` to specify employees, and `discounts/addons: [{ name, mention }]`; new `ADJUST` to add discounts or add-ons individually using the same optional fields. The operation is positioned based on the only pending payment record of employees working in the same store, including manual work records; no accounting is written for multiple matches, and the preset amount and commission are read by the server.

The web page supports `/finance?store=<storeId>&tab=closing&date=<businessDate>` to directly open the daily closing and employee cash settlement of the entire store on the specified business day; the old `tab=cash` is compatible with `closing` and retains the store and date; when clicking the document in the daily closing exception list, the financial page reads `GET /work-records/:recordId` in place and opens a single work record Pop-up window without leaving the current page. `/?store=<storeId>&date=<businessDate>&record=<recordId>` Deep links can still be used to directly open the specified work record of today's page from outside. Reading does not automatically perform daily closing or modify records. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

Both AI messaging endpoints accept an optional `conversationId` (UUID). A session is created when omitted in the first round; the same ID in the subsequent response is returned, and the server verifies the store, user and assistant types, and returns `AI_CONVERSATION_NOT_FOUND` if the match fails. The history is read by the server and does not require the client to upload the message list.

Saved success/question/preview rounds are passed to the model as user/assistant messages in chronological order, including complete responses and saved query and preview context; error logs are not replayed. The new log saves the member ID and role scope, and does not replay it if the current scope is inconsistent; if the old log lacks a scope, it only retains the user's questions and prompts for re-query, and does not restore the old business results. For continued financial questions, first use model parsing for complete screening, and then go through the original authentication and deterministic financial queries; when parsing without calling the filtering tool, `AI_QUERY_AMBIGUOUS` is returned. When the model is not configured, the original single-sentence security downgrade logic is still used. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

Historical results are snapshots, and the latest business data needs to be re-queried; historical preview is not an executed record, nor can it replace the current preview confirmation. The current implementation has no history summaries or automatic truncation, and long sessions are still limited by the model context capacity; session IDs are not automatically restored after a front-end refresh. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

Request body accepted for both AI message endpoints `locale: "zh-CN" | "en-US"`, defaults when omitted `zh-CN`. This field determines the language of model prompts, deterministic financial answers, and safety downgrade instructions. The speech transcription endpoint receives a browser-generated MP4/AAC raw request body, limited to 6–60 seconds and no larger than 8 MB, via the same `MINIMAX_API_KEY` call `MINIMAX_TRANSCRIPTION_MODEL`(default `music-cover`) built-in ASR;`Accept-Language` It is decided that the primary recognition language is, and the other language remains as a candidate. Other business errors continue to return to stability `code` and `messageZh`; The Web English interface displays English instructions based on stable error codes, and unknown error codes use general English prompts that do not reveal internal information.

Unclaimed employees created by store owners or managers have normal member IDs and can immediately enter today's form, work record, and configure commissions, except that `userId` is temporarily empty. When an employee joins with a store code after registration, the server only uses the First Name in the account registration information to perform standardized and accurate matching on the name of the employee to be claimed in the store; successful matching returns `{ "autoMatched": true, "membership": ... }` and binds the account to the original membership relationship, so existing records will not be moved or lost. If there is no match, the pending application with `autoMatched: false` will still be returned. The display name temporarily filled in the join form cannot be used to impersonate other employee accounts. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

The main project uses `priceOptions` to represent one or more duration price ranges, for example:

```json
{
  "fullName": "Body Massage",
  "shortName": "Body",
  "priceOptions": [
    { "durationMinutes": 30, "priceCents": 6000 },
    { "durationMinutes": 60, "priceCents": 10000 }
  ]
}
```

Submit `serviceItemId` and `serviceDurationMinutes` when creating a preset service or selecting one in record details. If the project has only one level, the server can supplement the selection if it is compatible with the old client; if the project has multiple levels, the missing duration will return `SERVICE_PRICE_OPTION_REQUIRED`. When the work record is updated and `endAt` is not explicitly submitted, the server will retain the current actual working time after modifying `startAt`, and adjust the end time according to the total difference between the old and new configuration minutes of the main project and additional projects; the explicitly submitted `endAt` still takes precedence. The work record still saves the name, duration, price and commission snapshot. Subsequent modification or deletion of the price range will not change the historical record. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

Quick entry submits `{ employeeMembershipId, startAt, durationMinutes: 120 }`, optionally with `isHighlighted` and `isDispatchExcluded`. `durationMinutes` must be an integer from 1 to 720, or explicit `null` when no duration is known and cannot be combined with `serviceItemId`, `serviceDurationMinutes`, `customService` or placeholder mode. It creates a `PENDING_PAYMENT` record with `serviceSnapshot: null`, an end time calculated from its duration, and no service, commission, add-on, discount or payment snapshot. Required database amount columns remain zero for storage; clients display them as unfilled, not as a free service. Zero-receipt PATCH/save may keep the service unselected; confirm-payment without a service returns `SERVICE_SELECTION_REQUIRED`. Existing versions, permissions, date locks, idempotency and atomic save still apply. Personal closing records include optional `serviceSelected: false` so current templates show unfilled prices; older snapshots without this flag retain their display. Reason: duration-only work has a known time range without established financial facts.

Detailed entry opens a local form without writing. Saving calls `POST /stores/:storeId/work-records/detailed`: `create` follows the existing creation fields, including duration-only or unknown-duration pending records, `details` follows PATCH with `version: 1`, and optional `payment` follows the payment contract with `version: 1`. The server creates and applies all details and payment within one transaction; failure leaves no record. Omitting payment saves as pending, even without a service. New Web detail forms prefill 60 minutes; `durationMinutes: null` leaves `endAt` and `actualDurationMinutes` null instead of inventing a duration. Unassigned metadata updates preserve the missing service snapshot and unknown time fields; positive receipts still require service selection. The existing `/work-records/:recordId/save` also accepts all-zero cash/card/gift-card fee and tip amounts: it sets `PENDING_PAYMENT`, deletes the payment breakdown and clears receipt, tip, income and cash-allocation fields plus manual settlement flags. Service/commission snapshots remain, and ordinary writes still reopen affected cash settlements. Positive gift card receipts still confirm payment; explicit confirm-payment keeps its prior contract. Reason: complete creation and returning a paid record to pending must retain atomicity, versions, permissions, locks and idempotency.

Store settings can be written to automatically discount Monday to Thursday through the same `PATCH /stores/:storeId`; the three fields must be submitted together. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

```json
{
  "version": 3,
  "mondayThursdayAutoDiscountEnabled": true,
  "mondayThursdayAutoDiscountThresholdCents": 10000,
  "mondayThursdayAutoDiscountAmountCents": 1000
}
```

When enabled, the threshold and amount must be positive numbers, and the discount amount cannot be higher than the threshold. The system determines Monday to Thursday based on the business day of the work record, and generates an automatic discount snapshot when the pre-discount service fee of the "main project + additional project" of the non-highlight work record reaches the threshold; this snapshot is used together with the ordinary discount to calculate the post-discount performance and does not enter the employee salary formula. Modifying settings will not overwrite historical work records in batches, and will only be judged according to the current rules when creating or editing work records again. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

The same store setting interface can also save the automatic discount of gift card full percentage; the three fields must be submitted together, and the threshold and ratio are both 0 when closed. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

```json
{
  "version": 4,
  "giftCardAutoDiscountEnabled": true,
  "giftCardAutoDiscountThresholdCents": 10000,
  "giftCardAutoDiscountBps": 500
}
```

The above example indicates that the gift card face value is full `$100.00` hourly discount `5%`. When selling cards, the current threshold and ratio will be written into the sales snapshot. Modifying the store settings later will not change the existing card sales records.

Extra items `addons[].durationMinutes` save this order's added time when explicitly submitting numbers, `null` means no added time; only when this field is omitted, the directory minutes of the default project are used.

Work record details can be used to disable or restore automatic discounts for a single record via `PATCH /stores/:storeId/work-records/:recordId`:

```json
{
  "version": 4,
  "automaticDiscountSuppressed": true
}
```

When set to `true`, the server will delete the automatic discount snapshot and keep the disabled status permanently, and it will not be automatically added back when edited again; when set to `false`, it will be re-judged based on the current business day, pre-discount service fee and store settings. This field covers existing work record permissions, business day locks, version conflicts, idempotency, auditing and cash settlement fallback rules. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

Quick creation, PATCH and save.details support the optional Boolean field `isDispatchExcluded` (default `false`), which is returned in responses and Kanban records; independent of `isHighlighted`, it only controls the shuffle on the right side of the Kanban board and does not change the number of work records, automatic discounts, financial highlight filtering, handling fees or wages. Omitting the update field retains the original value, explicit `false` can be canceled. Submission of this field is prohibited during placeholder creation, and placeholder editing continues to be read-only; forward migration of the database makes the old records default to `false`, and audit records the values before and after modifications. Reason: Schedule display cannot borrow the highlight tag with the meaning of amount, and the caller needs to maintain an independent state.

Both quick work record and detail modification can submit the Boolean field `isHighlighted`, which is used for gray-green highlight cards, financial filtering and credit card processing fee calculation, while excluding automatic discounts from Monday to Thursday. Creating a new highlight work record will not generate the automatic discount. When editing to highlight, the existing automatic discount snapshot will be deleted, and the manual discount and actual payment will be retained. After canceling the highlight, it will be judged according to the current rules again, but `automaticDiscountSuppressed` will not be lifted. This rule also applies to robots reusing the work record editing service and does not rewrite historical data in batches. Handling fee rules: 2.5% for unhighlighted credit card payments, $3 for each highlight work record including credit card payments. Financial summary, details and CSV use the same `highlightFilter`. Reason: The domain layer already has a highlight fee branch. The old saying "do not enter any amount formula" will mislead financial inquiries and changes.

Confirm payment can be submitted outside the original cash and card fields gift card split:

```json
{
  "version": 4,
  "cashServiceCents": 2000,
  "cardServiceCents": 0,
  "giftCardSerialNumber": "GC-2026-0001",
  "giftCardServiceCents": 8000,
  "cashTipCents": 0,
  "cardTipCents": 0,
  "giftCardTipCents": 2000
}
```

`giftCardSerialNumber` is required when the sum of gift card service fee and tips is greater than 0; `giftCardIsOnline: true` means that this field saves the user name (text, leading zeros are retained), omitted or `false` means the physical card serial number. The user name only removes the leading and trailing blanks, and does not query the system account number or sales registration; the payment snapshot and audit are saved simultaneously. When the gift card is not used, the serial number can be omitted or `null`, and both gift card amounts are 0. Gift card service fee enters the actual service fee and payment ratio of this order, gift card tips enters employee income; both are non-cash payments and do not increase the employee's cash settlement amount.

Example of card selling request:

```json
{
  "businessDate": "2026-08-20",
  "faceValueCents": 15000,
  "cashCents": 5000,
  "cardCents": 9250,
  "operatorMembershipId": "00000000-0000-4000-8000-000000000000"
}
```

If the store rule is "full `$100.00` Discount `5%`”, the discount requested above is `$7.50`, payable after discount and actual receipt are both `$142.50`. The response contains an automatically assigned `serialNumber`, `faceValueCents`, `discountThresholdCents`, `discountRateBps`, `discountCents` and `amountCents`, this example exactly satisfies `faceValueCents - discountCents = amountCents`; all responses `amountCents = cashCents + cardCents`, the actual payment received may be different from the discount payable. The serial number of the physical card in the same store is unique. The automatic number is incremented within the transaction and is not reused after soft deletion. The interface displays the system recommended number by default, and can also be changed to a custom number. The server checks the current and soft deletion historical records according to the normalized results to prevent duplication. All actual receipts are added to store revenue and do not enter employee commissions, wages or cash settlements; subsequent service fees and tips paid by customers using gift cards are all included in gift card write-off expenses.

Project sorting submits the complete list of undeleted projects and the current version, for example `{ "type": "SERVICE", "items": [{ "id": "...", "version": 2 }] }`. The server verifies the list, project ownership and all versions in the same transaction, and then unifies the writing order; when the list is incomplete or any version expires, `CATALOG_ORDER_CONFLICT` is returned, leaving no half-set of sorting.

Today's work record page only calls `POST /stores/:storeId/shifts/clock-in` to support ordinary employees to add themselves to the current business day table, without calling the off-duty interface. If you find that you still have an unfinished shift on the old business day when you go to work on a new business day, the old shift will be ended atomically and the `shift.stale_auto_closed` audit will be recorded, and then the current shift and your own table row will be created; if you go to work repeatedly on the same business day, `SHIFT_ALREADY_OPEN` will be returned. `clock-out` continues to be reserved for old clients and is compatible with historical auditing. The employee page does not provide a corresponding button; employee work status is still completely calculated by the work record time period. Reason: The caller must comply with the current contract, permissions, and compatibility semantics, and cannot use the old process to infer the write results.

<a id="记工占位"></a>

### Work record placeholder

`POST /stores/:storeId/work-records` may submit `{ employeeMembershipId, startAt, isPlaceholder: true }` to create a placeholder; it is prohibited to submit `serviceItemId`, `serviceDurationMinutes`, `durationMinutes`, `customService`, `isHighlighted` or `isDispatchExcluded` simultaneously, including an explicit `false` flag. When `isPlaceholder` is omitted or `false` is submitted, the original normal work record verification is still used. Reason: The placeholder does not select the project, highlight will affect the business rules, and the two creation branches must be clearly distinguished.

Placeholder response `status: "PLACEHOLDER"`, `startAt` is only used for date attribution and kanban card sequence, the required amount is zero, the end time, duration and payment fields are empty, the project snapshot is empty, the add-on and discount arrays are empty. Kanban `workRecords` retains placeholders, but the number of work and all financial, daily closing, business analysis, salary, robot query and work occupancy exclude placeholders; only placeholders do not generate financial calendar marks. Reason: The placeholders must be permanently synchronized and the history can be viewed, and cannot form service or payment facts.

The placeholder uses the original DELETE and restore interfaces, retains permissions, business day locks, versions, idempotency, auditing and outbox, and does not roll back cash settlement; PATCH, save and confirm-payment return `400 PLACEHOLDER_READ_ONLY`. The recycle bin can be restored by the administrator. The database expands the state and restricts placeholder business fields through new forward migration; old service records and creation requests remain compatible. Reason: Deletion recovery is still controlled writing, and space without business content cannot be replaced by ordinary editing or payment portals.

<a id="财务查询参数"></a>

## Financial query parameters

`finance/summary`, `finance/details` and `finance/export.csv` use the same set of query parameters:

- `dateFrom`, `dateTo`: business day range, both including endpoints.
- `membershipIds`: Comma-separated member IDs; ordinary employees will only get their own data even if they pass in other people.
- `paymentMethod`: `CASH`, `NON_CASH` or `ALL`, when omitted, the default is `ALL`; `NON_CASH` means card swiping and gift card.
- `amountType`: `SERVICE`, `TIP` or `ALL`.
- `highlightFilter`: `ALL`, `ONLY_HIGHLIGHTED` or `EXCLUDE_HIGHLIGHTED`.

When the store owner or manager does not qualify employees and selects the full amount, the summary, details and CSV include store-level gift card sales: `itemCount = recordCount + giftCardSaleCount`, `customerTotalPaidCents = actualServiceCollectedCents + totalTipCents + giftCardSalesAmountCents`. Employee subtotal, clear employee filter, service fee only, tips only or highlight work record only without apportionment of sales card records. `giftCardRedemptionCents = giftCardServiceCents + giftCardTipCents`, `storeIncomeCents = calculateDailyTurnover({ discountedFeePerformanceCents, giftCardSalesAmountCents, giftCardRedemptionCents }) + totalTipCents - employeeIncomeCents` (equivalent to new revenue plus cash/card tips and then minus employee income, gift card services and tips Each will be deducted only once). Reason: The same filter should correspond to consistent summary, detail, and payment facts, and historical unknown values cannot be guessed.

`finance/summary` of each `days []` row extra returns `dailyTurnoverCents = discountedFeePerformanceCents + giftCardSalesAmountCents - giftCardRedemptionCents`. Daily rows returned simultaneously `totalIncomeCents = 店铺收入 + 店长收入 + 经理收入`, reusing the Kanban field formula without additionally adding or subtracting gift card net income or credit card fees. The above fields are calculated by the server using integer cents; the first three columns of the Web daily subtotal display the date, week, and today's turnover in sequence, and the last column displays the total revenue, and hides the total number of projects, work records, actual service charges, tips, and total guest payment columns.

`finance/summary.days[]` Added `recentClosedRevenue: { averageCents, dayCount } | null`, which is the closed average revenue of the whole store for this business day and the previous 29 days. After discount, the performance is minus the gift card service fee and then the actual receipt of the sales card, excluding tips, and the financial filter is not used. The object is returned only if the row is closed, otherwise it is null; the amount is an integer cent, and an empty daily closing counts as zero. The Web places this column after today's turnover.

`finance/summary.totals` also returns:

- `totalTurnoverCents = discountedFeePerformanceCents + giftCardSalesAmountCents - giftCardRedemptionCents`;
- `ownerWorkerIncomeCents`: `OWNER` role as worker's service commission and tips;
- `managerWorkerIncomeCents`: the total service commission and tips of all `MANAGER` roles as workers;
- `giftCardNetIncomeCents = giftCardSalesAmountCents - giftCardRedemptionCents`;
- `creditCardFeeCents`: The total of the selected card swiping service fee and card swiping tips without highlight work record is `2.5%`, rounded to cents, plus each highlight work record containing the selected card swiping amount `$3.00`; partial card swiping is still charged as one, highlight but no card swiping amount is not charged, gift card payment and selling card swiping are not included;
- `totalIncomeCents = storeIncomeCents + ownerWorkerIncomeCents + managerWorkerIncomeCents - creditCardFeeCents`.

These fields use current date, employee, payment method, amount type, and highlight filters. `finance/summary.employees[]` also returns the employee's current `defaultCommissionBps` and whether there is `hasDifferentItemCommission` that is unique to different projects; the Web and employee subtotal text messages directly display this setting, without using the filtered salary to infer the ratio. The daily subtotal of the web is located in the operational analysis, using the date boundary of the analysis response and the current highlight condition to request summary/details, the payment and amount types are fixed to all, and the employee is not limited; after the date, the weekday localized to the current interface language is displayed. The employee range of financial summary continues to use check box multi-select, and empty selection represents all employees. Reason: The same filter should correspond to consistent summary, detail, and payment facts, and historical unknown values cannot be guessed.

Payroll settlement list supports members and `includeDeleted=true`; returns `paymentScope` (`CASH` / `NON_CASH` / `ALL`, history not specified as `null`) per record. The new simplified request for `POST /stores/:storeId/payroll-settlements` is `{ membershipId, periodStart, periodEnd, totalPaidCents, paymentScope, amountType? }`, the total amount uses non-negative integer cents, and the registration date is automatically recorded according to the natural date in the device time zone. Manual registration does not generate settlement confirmation. Lists and details additionally return nullable `confirmation` (`payrollSettlementId`, `unsettledCents`, `deductionCents`, `createdAt`). Modify `PATCH` to accept the same fields and require `version`, retaining the original registration date; source and old amount split cannot be mixed into the same total request. Split fields from old clients are still compatible, and old sources don't backfill guess values. The audit list supports `dateFrom`, `dateTo`, `entityType`, `action`, `actorUserId` and cursor paging. Reason: The same filter should correspond to consistent summary, detail, and payment facts, and historical unknown values cannot be guessed.

The employee range preview retains complete `records` / `summary`, and adds `payment: { unsettledCents, fullyConfirmed, revision }`; the amount is an integer cent, and revision is the 64-character hexadecimal revision value generated by the server. The calendar response is `{ membershipId, month, days }`, each day contains `businessDate`, `hasCash`, `hasNonCash`, `cashSettled`, `nonCashSettled`, `cashConfirmed`, `nonCashConfirmed`, `cashUnsettledCents`, `nonCashUnsettledCents`. Yellow status and cash wage gap can exist at the same time. Reason: The same filter should correspond to consistent summary, detail, and payment facts, and historical unknown values cannot be guessed.

Preview, confirmation, delivery and compact payroll requests accept `amountType=SERVICE|TIP|ALL`, defaulting to `ALL` for older clients. Responses and immutable delivery snapshots retain it; payroll PATCH can edit it. Confirmations cover only the selected earnings types, and daily cash receipts are deducted by service/tip component. Older backups missing the new field are normalized after checksum verification. Reason: paying tips must not settle unpaid service wages.

The payment confirmation request is `{ membershipId, dateFrom, dateTo, paymentScope, amountType?, deductionCents, revision }`, and the server does not accept the actual payment specified by the client. The response is a payroll ledger record with `confirmation`, and the actual payment is recalculated by the server as the outstanding amount minus deductions. Actual payment of $0 is allowed; empty work record, store owner, excess deduction or range rejected. Old revisions return `409 SETTLEMENT_DATA_CHANGED`, closed ranges return `409 SETTLEMENT_ALREADY_CONFIRMED`, deduction excess returns `400 SETTLEMENT_DEDUCTION_TOO_LARGE`. Retries on failure keep the same request with the idempotency key, using the new key after regeneration. The associated ledger modification, soft deletion and recovery can be confirmed immediately and the old documents and snapshots of the team leader chart will not be changed. Reason: The same filter should correspond to consistent summary, detail, and payment facts, and historical unknown values cannot be guessed.

<a id="错误与排查"></a>

## Errors and troubleshooting

- `400`: The field format or business rules are not met, for example, all payment splits are left blank.
- `401`: The session is invalid or revoked.
- `403`: Insufficient role permissions or cross-store access attempted.
- `404`: The object does not exist, is disabled, or does not belong to the current store.
- `409`: Version conflict, duplicate store code, closed date writing or idempotency key conflict.
- `429`: Login, join, AI, export or write frequency is too high.

The response header `X-Request-Id` and error body `requestId` can be used to correlate service logs and audits. The only source of truth for interface fields is the Zod contract in `packages/contracts/src`; modifications to the interface should update the contract tests and this article simultaneously.

<a id="记工机器人自然语言说明"></a>

### Work record robot natural language description

`GET /stores/:storeId/work-bot` returns `instructions` and `instructionsVersion`.
`PATCH /stores/:storeId/work-bot/instructions` accepts `{ instructions, version }`, requires store settings management permission, up to 12,000 characters; version conflict returns 409. Keep an audit log for records.

`work-context` provides natural language `instructions`; compatible fields `aliases` now come from all enabled project directories, where `alias` is the project UUID. The AI selects the item UUID according to the instructions, and the server still checks the store, activation status, and available price brackets. To specify an explicitly agreed default duration, use `durationSource: "SKILL"`, and the explicit duration continues to provide the original `durationMention`. The old aliases interface is only used for compatibility with existing access.

`work-events` The original text evidence verification is retained `@员工` name text; returned when the parsing result does not match the original text `outcome: "INTENT_EVIDENCE_REJECTED"` and unaccounted instructions, no accounting is performed. General help remains `HELP`. Reason: Description and model intent must still pass live catalog, original text evidence and permission verification.

<a id="事务实时同步与发送重试"></a>

### Transactions, real-time synchronization and send retries

- When a webpage is "saved" involving details and payment, `/work-records/:recordId/save` is called. If any step fails, it will be rolled back; you can still PATCH if you modify the details individually. 409 should be re-read and checked, and old fields should not be automatically resent with new versions. Reason: Business, audit and status must be submitted together, and independent connections and leases still need to be authenticated.
- The creation, details, payment, audit and preview consumption of AI confirmations are in the same transaction; concurrent confirmations return `AI_PREVIEW_EXECUTING`. The payment items omitted in the AI UPDATE are retained, and the switching method must explicitly set the original method to zero; the original gift card amount and serial number are retained. Reason: Business, audit and status must be submitted together, and independent connections and leases still need to be authenticated.
- SSE shares 2-second outbox polling with the same instance and store. Each connection still independently verifies member and account status. Slow polling will not be cancelled. Multiple connections with the same account will receive notifications. Send `heartbeat` every round, new connection and every 30 seconds `store.changed` without event ID (`reason: resync`), overwriting the previous state of the shared cursor and delaying the commit transaction. The interface and event payload remain compatible, and the client reads REST completely after resuming the connection. Responds to explicit setting of `X-Accel-Buffering: no` and disable caching/conversion directives; releases store polling when no subscription is available. Reason: Business, audit and status must be submitted together, and independent connections and leases still need to be authenticated.
- The sending agent's authorization, checkpoint, completion, and failure writebacks all check for unexpired leases and current tokens; lease expiration returns `DELIVERY_LEASE_INVALID`.
- The sending interface fields remain compatible: `SENT`/`sentAt` is the task completion and submission time, which does not prove the delivery of the recipient phone. The new version of the Mac agent first observes the new message status corresponding to the exact attachment and number, and clearly writes back `MESSAGES_DELIVERY_FAILED` and `retryable: true` if the message fails to be sent; the server is still limited to a maximum of three retries, and Mac's persistent backoff will delay the actual retrieval for at least five minutes. Reason: The historical agent only accepts receipts for instructions. Asynchronous failure cannot be confused with task submission, nor can it bypass the existing retry limit.
- Task completion (`SENT`/`sentAt`) remains compatible and does not itself prove delivery. Optional completion `receipt` contains `messageGuid`, `state` (`SENT` or `DELIVERED`), `errorCode: 0` and nullable `service`. Lists return nullable `deliveryStatus`, `deliveryMessageGuid`, `deliveryErrorCode`, `deliveryService` and `deliveryCheckedAt`; only a real `DELIVERED` observation displays Delivered. Under both `/closing-delivery-agent` and `/employee-settlement-delivery-agent`, `GET jobs/receipts` returns up to 20 terminal tasks from the last 30 days, ordered by oldest check; `POST jobs/:id/receipt` accepts `{ attemptCount, receipt }` with `MISSING`, `PENDING`, `SENT`, `DELIVERED` or `FAILED`. Store authentication and attempt/status guards reject stale observations, retries clear previous receipts, and changed receipts are audited transactionally. Reconciliation never queues a message; missing metadata cannot erase a known result. Reason: delayed/manual retries must update the web without treating command submission as receipt or sending duplicates.
- The idempotency content sent by the employee subtotal includes date, employee list, payment method, amount type, highlight filter and receiving number; the same key replacement filter returns `IDEMPOTENCY_KEY_REUSED`.

<a id="完整微信记工与数据查询"></a>

### Complete WeChat work record and data query

`POST /integrations/langbot/work-context` returns protocol version 2, the store's current business day/time zone, employee ID and real-time intent JSON Schema. `work-events` extends QUERY and MANAGE; QUERY supports the last 1–366 business days or complete start and end dates, employee/status/highlight filtering, grouping by record/day/employee, and 20 paging per page. The total covers the complete range. MANAGE supports CREATE, UPDATE, PAYMENT, DELETE, and RESTORE. The input facts must be based on the original text. Editing and payment share transactions; see `packages/contracts/src/work-bot.ts` for the complete contract. Reason: Binding names is not authentication, and queries and writes are performed based on actual member permissions.

`PATCH /stores/:storeId/work-bot/members/:bindingId/verification` accepts `{version, verified}`, requires `STORE_SETTINGS_MANAGE`. Before verification, write the current day according to the restrictions of ordinary employees. After verification, the authorization will still be based on the actual member role; historical financial inquiries need to be verified, and employees can only read me. Rebind different identities to cancel verification, query replay and re-authenticate.

The amount of off-duty services represents actual receipts and does not automatically cover the original price of the project. For complete usage and deployment sequence, see [LangBot work record robot](../operations/LANGBOT_WORK_BOT.md). Reason: Binding names is not authentication, and queries and writes are performed based on actual member permissions.

<a id="群机器人上工开始时间"></a>

### Start time of group robot work

The start time of START is parsed from rawText by the API, using the store time zone and occurredAt as the base. Example: Send "jessie goes to work at 1:00, one hour of hard work" at 13:28, starts at 13:00, and is expected to end at 14:00. Unspecified time periods 1–12 o'clock take the hours that have occurred in the last 12 hours; clear AM/PM or 24-hour time periods take the last 24 hours. Supports "one o'clock in the afternoon", "ten thirty" and full-width time. "Today" limits the local day. Unwritten times use message time; invalid, multiple, daylight saving time ambiguity or unsupported date/relative time returns START_TIME_UNCLEAR and does not create a work record. Historical supplementary records are processed on the web page. Business day, permissions, and daily closing locks continue to be verified based on the resolved start time.

<a id="个人日结状态与独立短信"></a>

### Individual daily statement status and independent text messages

`isHighlighted` and `discountTotalCents` are added to the personal preview one by one. The newly queued SMS snapshot saves these two fields; the old snapshot is unmarked by default when rendering. Reason: Pages and attachments need to retain the highlights and discounts of daily work record cards, and saved snapshots cannot be backfilled or recalculated.

Personal preview returns `cashSettlement: { status, version, settledAt }`; when there is no record, it is `UNSETTLED`, version 0. Only target employee status is returned, cash writes are still protected by administrative rights.

The SMS task stores `businessDate` independently; not closed the `closingId` of the person-by-person task and the `closing` in the list are null, the agent returns `cycleNo: 0`, and PNG does not display the cycle. Tasks associated with a valid daily closing are still canceled when the cycle is canceled; tasks not associated with a cycle retain a snapshot when queued. Migrate `20260910010000_independent_member_closing_delivery` to backfill business day from the old period and relax the period foreign key non-null restriction; old records are retained. Aperiodic tasks must be processed before rolling back the application, and non-empty constraints cannot be restored directly. Reason: not closed The person-by-person task has been designed with a nullable period, and personal status cannot be leaked to other members.

<a id="今日看板顶部总收入"></a>

### Today’s total revenue at the top of the board

`GET /stores/:storeId/boards/:businessDate` top level `statistics.totalIncomeCents` Calculated by server-side integer cents:`storeIncomeCents + 店长大费工资及小费 + 所有经理大费工资及小费`. Member roles are read based on the members associated with the current record, regardless of whether the row is hidden; using the same undeleted record range of the Kanban board (including known wages and tips to be settled), the employee history is still limited to the individual. Kanban does not query expenditures and does not return the average daily expenditure field; changes to expenditure accounts do not change the total income. This field does not add additional gift card net income or deduct credit card fees, which is different from `finance/summary` The total settlement field. Top revenue reads the new `revenueCents = discountedFeePerformanceCents - giftCardServiceCents + giftCardSalesAmountCents`;Original `discountedFeePerformanceCents` It is still only the service performance after discount, and the total amount of gift card is read. `giftCardSalesAmountCents`.

The gift card only affects the total income, financial daily subtotal and financial summary of the work record page once: card sales increase according to actual receipts, and card use decreases according to the total of service fees and tips; these income and expenses have been included in the store income, and the gift card net income field is only used to display the composition and will not be added or subtracted again. The total financial settlement will continue to deduct credit card handling fees; the work record page and daily subtotals will retain the pre-handling fee calculations, and the expenditure page will be calculated independently. Reason: Revenue and costs are reconciled separately, and the gift card component cannot increase total revenue again.

Revenue is uniformly included in actual income when selling cards, and only the gift card service amount is excluded when using cards; gift card tips are not included in revenue, and service performance, employee wages and tips income are still calculated normally. gift card service fee is summarized according to the valid records of the corresponding query. If not filled in, it is zero; revenue and its average value can be negative and rounded to cents. Historical data queries directly use the new formula, without database migration, and without rewriting daily closing/sending snapshots. Reason: Changing operating statistics cannot duplicate deductions and write-offs or rewrite already saved salary and delivery vouchers.

<a id="营业日日历已日结金额"></a>

### Business day calendar closed amount

`GET /stores/:storeId/business-days/open-work-dates` retains `dates` not closed date array and returns `closedDates: [{ date, discountedFeePerformanceCents, revenueCents }]`. Only the current CLOSED date is returned, and the amount is summarized by the database by business day. The discounted item amount (integer cents) of the undeleted work record is returned. The calendar display adds `revenueCents`, which is the discounted service performance minus the gift card service fee and the actual receipt of the card sold; the store owner/manager can see the whole store, closed without work record and no sold card shows zero; employees only return the date and amount of the work record they have. Canceling daily closing no longer returns the amount for that date. The front end only displays dollar values, without currency, units or labels; the work record page reuses the monthly cache within the page, retains the same month mark during refresh, and reads it when the financial page is opened; old requests cannot overwrite the expired context. For caching rules, see [Product Rules](../product/PRODUCT.md). Reason: Samples, permissions, and cache lifetime jointly determine the visible amount, and the daily closing is not zero samples.

The closed work record Kanban board returns `statistics.recentClosedRevenue: { dayCount, averageCents }` to the owner and manager. The window is the selected day and the previous 29 calendar days, and only the current `CLOSED` date is included. `dayCount` is the actual number of closed dates (1–30), not a fixed 30; `averageCents` is the undeleted work record of the entire store on these dates. The discounted service performance minus the gift card service fee plus the actual receipts from the undeleted card sales is divided by `dayCount`, rounded to the nearest cent. The day's work record and card sales are summarized and counted only once. Missing daily closing or not closed dates will not be counted, closed but no work record and no sold cards will be counted as zero, and will not be made up outside the window. Returns `null` when the selected day is not closed, after canceling daily closing or when requested by an employee.

`finance/summary.totals` added `averageRevenueCents: number | null` and `averageRevenueDayCount: number`. Calculate the currently filtered discounted service fee performance minus gift card service fee and the average of the actual receipts from the cards sold based on the deduplicated `CLOSED` business day within the selected date range (including both ends). Daily closing days without matching work records and cards sold are counted as zero, and field layer integer cent rounding is used; if there is no closed date, `null` and `0` are returned respectively. It does not include the not closed date and tips; selling cards follows the permissions and filtering rules of store-level sales, and is not limited to 30 days.

`PATCH /stores/:storeId/boards/:date/rows/:rowId` Hide or restore employee rows by store owner/manager. When the device date context is determined to be a past date, the closed historical days is allowed to adjust only `isHidden`, retain employee rows, shifts, work records and daily closing snapshots including empty rows, and return `{ row, board, removed: false }`. Continue to verify daily closing today/in the future; when hiding employees without any work record (including deleted history), delete the employee row and shift in the same transaction, and return `removed: true`, `row` is the updated snapshot before removal; if there is a work record, it is only hidden. All paths retain business day locks, ownership, idempotency, row version, table version and audit/outbox. Hidden dates are not included in subsequent rotation history, and other employee historical positions are renumbered according to visible rows; today's initial automatic generation, active generation, and future automatic scheduling share this rule, and today's generated sequence needs to be actively regenerated. Reason: Attendance correction only changes the basis of work scheduling, and cannot delete history or change closed finance.

<a id="设备日期上下文"></a>

### Device date context

The web request sends `X-Device-Time` (current ISO time of the device) and `X-Device-Timezone` (IANA time zone); both must be provided and valid at the same time, otherwise 400 is returned. The current business day and current day write permissions use the device date, and the new work record is assigned according to the local natural date of the device at the start time. Robot/backend calls without this request header fall back to the current time of the server and store time zone. `businessCutoffLocal` is compatible with historical cutoff snapshots but does not participate in date regression; business day is retained when the start time of existing records has not changed. Reason: A consistent device context must be used within the request, the old expiration field no longer determines the date of return.

<a id="记工百分比折扣"></a>

### Work record percentage discount

Work record updates and merges saved `discounts[]` support optional `rateBps` (0–10000, or `null`). `amountCents` continues to be required to be compatible with existing requests; when a non-empty `rateBps` is provided, the server ignores the amount and recalculates the reduction amount based on the total of this main project and all add-ons, rounded to cents. Omit or pass `null` to indicate a fixed amount. The snapshot returns both `rateBps` and calculated `amountCents`; when `discounts` is not submitted, the original ratio is retained and recalculated according to the amount of this project. The sum of multiple discounts is still subject to the total discount not exceeding the pre-discount service fee. Reason: The proportional deduction is recalculated based on the pre-discount basis of the current order, and the old amount or excessive discount cannot be trusted.

<a id="首次日结的自动发送副作用"></a>

### Automatic sending side effect of first daily closing

`POST /stores/:storeId/closings/:date` synchronizes and persists the eligible employee summary tasks when the daily closing is successful for the first time, without additional calls to the batch sending interface; the response structure remains unchanged. Only the first daily closing cycle of the day is triggered. Existing SENT/QUEUED/CLAIMED tasks are skipped by store, business day, and member, including manual sending before daily closing. Only members who are employed, have enabled receiving, have a valid number and have a work record on the day will participate; the results can be viewed through the existing sending list interface. Reason: `ClosingsService` filters recipients based on the number of preview jobs, daily closing and first queue are saved atomically, and re-sending cannot be repeated after cancellation and re-closing.

The automatic daily closing at 23:30 in the store time zone is executed by internal API scheduling and no new HTTP interface is opened. The automatic mode requires that all check items are abnormal, does not allow forced daily closing, and will not restart daily closing on a canceled date. Reason: Daily closing is saved atomically with the first queue, and re-sending cannot be repeated if the re-closing is cancelled.

The bound `POST /integrations/langbot/work-context` response adds `storeId` for the plug-in to persistently learn to isolate by store; the unbound response does not contain this field. The protocol version is still 2.

<a id="多人员指令"></a>

## Multiple personnel instructions

`Ling Jessie 上工 大力` It means that Ling and Jessie work separately, sharing clear projects and store default duration. The plug-in recognizes the complete employee name and does not spell multiple people into one name; each person can have different specific projects and durations. The common amount for multiple people off work must be clearly stated as the amount per person. If the total or allocation is unclear, please clarify first. Reason: The amount and identity of each person must be clear, message-level idempotency and the same transaction to prevent partial or repeated submission.

The parsing result uses `{ "kind": "BATCH", "actions": [...] }`, containing 2-10 START, FINISH or ADJUST. Each item must have memberName/memberMention. Employees must not be repeated, nested or with recordId. The original text is verified item by item, and permissions and directories are reviewed item by item; BATCH_COMPLETED will be returned only when all transactions are successful, and all writes will be rolled back if any failure occurs. Message-level idempotency saves the merged reply, and resending the original message will not be executed again. It is necessary to upgrade the API and build and install the plug-in package. Reason: The amount and identity of each person must be clear, message-level idempotency and the same transaction to prevent partial or repeated submission.

Please refer to [Agent Manual](../operations/MESSAGES_AGENT.md) for sending retry, cooling and handling of ambiguous results. Reason: The sending limit is maintained in the unified operation manual and cannot be mixed in the multi-person work record protocol.


<a id="business-analytics-trends--经营分析顶部趋势"></a>

## Business analytics trends / top trends in business analytics


The existing `GET /stores/:storeId/finance/analytics` response adds `trends: FinanceAnalyticsTrends | null`. No closing on or before `dateTo` returns null. Otherwise `asOf` is that latest closed date; `revenue7`, `revenue30`, `records30`, and `income30` each return `current` / `previous` (`dateFrom`, `dateTo`, `closedDayCount`, `value`), `changeTenthsPercent`, `difference`, `direction`, and `status`. Money values/differences are signed integer-cent strings; service averages are one-decimal strings. Missing samples use null, not zero. `changeTenthsPercent: 125` means +12.5%; direction is UP/DOWN/FLAT or null. Status is COMPARABLE, NO_SAMPLES, NO_BASELINE, NEW, ZERO_BASELINE, or NEGATIVE_BASELINE. Positive baselines use the unrounded change ratio, both-zero gives 0%, and nonpositive baselines use the explicit status and absolute difference. Reason: clients must distinguish missing history and noncomparable changes from actual zero growth.


Windows are inclusive: current7 = [asOf−6, asOf], previous7 = [asOf−13, asOf−7], current30 = [asOf−29, asOf], previous30 = [asOf−59, asOf−30]. The selected start never clips them. All four follow `highlightFilter` and use only closed dates; average revenue and service counts divide by each window's closed-day count, including empty closings. Counts exclude deleted/placeholder work and card sales. Income follows the existing Finance Summary settlement, including owner/manager worker income and period-level card fees. The service reads the anchor and narrow 60-day financial projections in the existing RepeatableRead transaction, without calling full summaries per window, new HTTP calls, or migrations. Daily subtotals and income bars retain their existing selected-range, pre-fee definition. Reason: trend windows and daily financial details have different scopes and must not share a misleading amount label.

<a id="经营分析"></a>

## Business analysis

`GET /stores/:storeId/finance/analytics`: Only active members of the current store with the `FINANCE_READ_STORE` capability can read.

The query is an independent `FinanceAnalyticsQuery`: optional `dateFrom`, `dateTo` (ISO business day period, inclusive) and `highlightFilter` (`ALL`, `ONLY_HIGHLIGHTED`, `EXCLUDE_HIGHLIGHTED`, press `ALL` if omitted). If the start day is omitted, the earliest valid business/daily closing day of the whole store will be taken. If the end day is omitted, the current business day will be taken; when there is no history, the start day is equal to the end day. The highlight condition filters the work record of the current range and moving average window, and the independent `weekdayComparison` always compares three ranges; `ONLY_HIGHLIGHTED` does not include store-level gift card sales, and other modes include valid card sales; the number of runners and closed sample dates are not affected by the highlight condition. Reject reverse, future end dates, invalid highlight values, and other filter parameters. Reason: The aggregation comes from historical business dates. Except for the clearly marked three groups of week comparisons, the charts and windows use the same filter. The independent runners and daily closing facts do not change with the work record mark.

Web revenue calendar directly consumes the current `finance/analytics.days[].revenueCents`, retains cents, and does not request `business-days/open-work-dates`; month browsing does not change the filter. The daily subtotal and turnover and income column chart share the `dateFrom` / `dateTo` of the analysis response and the same `highlightFilter` request for the existing `finance/summary`. The column chart only totals `days[].dailyTurnoverCents`, `storeIncomeCents`, `totalIncomeCents` (before fees) by day/natural week/natural month. There is no additional request for switching cycles. Click the date or subtotal amount to request the day. `finance/details`, both use the whole store, `paymentMethod=ALL`, `amountType=ALL`. No new interface is added; the average curve uses the following server average field. Reason: The analysis scope and day-by-day composition must use the server results, and the unfiltered calendar cannot cover the current conditions.

Responses to `FinanceAnalyticsResponse`: `dateFrom`, `dateTo`, `hasData`, `trends`, and `hours` (24 items hour/count), `days` (businessDate/count/lostCustomerCount/hours/revenueCents/averageCents/averageDayCount/average30Cents/average30DayCount/cumulativeAverageCents/cumulativeAverageDayCount), `weekdays` (7 items weekday/closedDayCount/calendarDayCount/averageCents/hours). Weekday represents Monday with 0; the amount is a decimal string of whole cents, and if there is no daily closing amount/no average sample, it is null; weekdays.hours is the cumulative number of 24 items; days.hours is the number of 24 hourly transactions of the business day. Dates with no data in the work record and runners are padded with zeros. Only the dates of runners are still returned, and the hours follow the time zone snapshot of the work record. The number of daily runners is summed according to the `customerCount` of the valid records; the daily quantity chart displays the number of runners above the number of work records, and no additional section is drawn for 0 runners.

The response also contains required `weekdayComparison`: `hasData` independently indicates whether the comparison range has valid work record, sales card or daily closing; `days[]` returns `businessDate`, `highlightedRevenueCents`, `nonHighlightedRevenueCents`, `revenueCents`; `weekdays[]` returns `weekday`, `closedDayCount`, `highlightedAverageCents`, `nonHighlightedAverageCents`, `averageCents`. The three groups always come from the same date range, the same read transaction and the same deduplicated closed samples, and are not changed by `highlightFilter`; highlight does not contain selling cards, non-highlight and all contain valid selling cards. not closed daily amounts and no-sample averages are null, and empty daily closings are the string "0"; each average is independently rounded from an integer cent total. The web's weekly chart and the three-column daily table after clicking only read this aggregation, and other charts and details continue to use the current filter; the column top numbers retain actual cents or integer counts, and only scroll within the chart when dense. Reason: Simultaneous comparison of three groups requires consistent denominators and read snapshots, and cannot rely on additional requests for splicing or addition and rounding average.

Pauke's writing inherits the work record business day permission: ordinary employees can only write the current business day, and owners and managers can write not closed historical business day; future dates are not allowed to be written, and the daily closing business day is locked. The occurrence time uses the device's local `HH:mm` wall time, which is consistent with the device time zone rules of the work record page business day. Walk-in records the number of people, time of occurrence, optional remarks, and the source of the walk-in, and does not generate services, income, wages, or other financial amounts; the source does not change the number of people counted.

For statistical scope, see [Product Rules](../product/PRODUCT.md) "Operation Analysis and Expenditure". The backend excludes deleted businesses in the consistent read transaction and reads the 29 days before the selected start date; `averageCents` / `averageDayCount` is the average number of closed samples on the current day and the previous 6 days, `average30Cents` / `average30DayCount` is the average number of closed samples on the current day and the previous 29 days, `cumulativeAverageCents` / `cumulativeAverageDayCount` only accumulates the times from the selected start date to the current day. closed date. The average value of the not closed day is null, the number of samples is 0, the empty daily closing count is zero, and the cents are rounded; no work record or walkout details are transmitted, and no accounts are written. Walkout records are saved in independent database tables and created through forward migration.

The hourly statistics interface still returns a complete 24 hours; the two hourly charts on the front end jointly cut off the first and last hours without work record, and retain the zero value in the middle. Reason: The aggregation comes from historical business dates, and display cropping cannot change the complete statistics and permissions.

<a id="排序解释快照"></a>

### Sorting explanation snapshot

`GET /stores/:storeId/boards/:businessDate` of `ranking.explanation` Returns the interpreted snapshot when it was last generated, if unsaved `null`. only have `MEMBERSHIP_MANAGE` Members of a capability are readable, other members are always returned `null`, including a personal history view.

The snapshot follows the shared contract `RankingExplanation`: `schemaVersion: 1`, `generatedAt` and `entries`; each contains `membershipId`, `displayName`/`employmentType` when generated, `lastBusinessDate`/`lastPosition`, `generatedPosition` and `ties`. The same position comparison item records the other party's `membershipId`, whether this member is ahead of `ahead` and the reason `EMPLOYMENT_TYPE` / `RECENT_ATTENDANCE` / `STABLE_ID`.

Existing `POST .../rank` saves both order and snapshot within the original business day lock, version check and idempotency transactions. Regenerate the replacement snapshot. Manual reordering, employee row changes, and member data changes will not overwrite the snapshot. The front-end displays changes based on the current list comparison, and cannot use current data to re-calculate the reasons at that time. Old data is not backfilled for speculative interpretation. Reason: The explanation should reflect the decision made at the time of generation, and old reasons cannot be inferred from current data.

<a id="网上卖卡与用户名使用"></a>

### Selling cards online and using usernames

Sales POST/PATCH can submit `isOnline: true`, at which time `serialNumber` saves the required user name (1-120 character text), no system account is required; the physical card number is not assigned or incremented when created, allowing multiple purchases with the same user name, independent of the physical card with the same number. If you omit `isOnline`, the creation will be processed as an entity card, and if you modify it, the original mode will be retained; explicitly switching to username mode requires submitting the username at the same time. Amount, permission, business day lock, version, idempotency and soft deletion rules follow the original process.

For example, the online card selling request is `{ "businessDate": "2026-10-15", "isOnline": true, "serialNumber": "001001", "faceValueCents": 10000, "cashCents": 10000, "operatorMembershipId": "员工 UUID" }`;Payment request passed `giftCardIsOnline: true` and `giftCardSerialNumber: "001001"` Mark it for use and submit the service fee or tips amount as usual. Omit/turn off mode when gift card is not used and serial number is null.

The ledger `sales` retains all valid sales, and the `usageRecords` of online sales is empty; the new `onlineAccounts: [{ username, sales, usageRecords }]` is accurately grouped by the username after removing the leading and trailing blanks, and the usage of unregistered sales will also be returned, with upper and lower case and leading zeros retained. Entity cards `sales[].usageRecords` and `legacyUsages` are only associated with entity cards. The summary write-off is the total of registered physical cards, old cards and `onlineAccounts` usage, and cannot be accumulated repeatedly for each online sale. Reason: The username allows multiple purchases and may be the same number as the physical card. The usage facts must be grouped independently.

<a id="老礼物卡使用台账"></a>

### Old gift card usage ledger

The gift card ledger response retains `sales` and `nextSerialNumber`, and adds `legacyUsages: [{ serialNumber, usageRecords }]`. Each group is a serial number that does not have a valid sales registration but has not been deleted in this store and has been used in the confirmed work record; the serial numbers are merged according to the same normalization rules as sales. The usage details structure is the same as `sales[].usageRecords`, supporting the use of only gift card tips. Old cards are not included in the quantity or amount sold; the front-end directly displays single uses, folds and summarizes multiple uses, and sorts the two types of cards naturally by serial number. Reason: Old cards only have usage facts and cannot make up income without sales data.

<a id="百分比折扣目录"></a>

### Percent discount catalog

`catalog/setup` of `discountItems []`, `catalog/items` of `DISCOUNT` Both create and update accept optional `rateBps`(integer 0–10000,`null` represents a fixed amount). Create still offers `amountCents`; The Web configuration ratio is passed as 0. After selection, the work record service will calculate the actual reduction based on the pre-discount items and add-on. Submit at the same time when switching back to a fixed amount `rateBps: null` and `amountCents`. The catalog response returns this ratio; web pages, AI, and robots carry the ratio when selecting preset discounts, and historical snapshots do not change due to modifications to the catalog. The database is migrated to `20260928010000_discount_catalog_percentage`.

<a id="每周排工模板"></a>

### Weekly work schedule template

- `GET /stores/:storeId/weekly-dispatch`: store owner/manager reads `{ version, effectiveFrom, schedule }`. `version` is the store version; `schedule` contains an array of seven member IDs from `monday` to `sunday`.
- `PUT /stores/:storeId/weekly-dispatch`: Submit `{ version, schedule }` and `Idempotency-Key`; check management permissions, member ownership/validity, version, save templates, audits and outboxes within the transaction. The configuration takes effect immediately from the current date of the device. If a version conflict occurs, 409 is returned. You should reopen the pop-up window to read and verify.
- `POST /stores/:storeId/boards/:businessDate/replace-weekly-dispatch`: The store owner/manager submits `{ version, schedule }` and `Idempotency-Key`, uses the current check of the target date corresponding to the week to cover all employee rows, does not save the template, and subsequently automatically refreshes to retain this coverage; verifies the store version, target personnel validity, business day lock and daily closing. Any work record (including pending settlement and deletion history) returns 409 `WEEKLY_DISPATCH_HAS_WORK_RECORDS`, and the transaction rollback retains the original schedule; the historical date is rejected. When automatic ranking is turned on, the order is recalculated, audit and outbox are written, and `{ applied, addedCount, ranked }` is returned. Reason: Existing shared contracts and services define this boundary, and client behavior must be consistent with actual input and saved results.
- `POST /stores/:storeId/boards/:businessDate/apply-weekly-dispatch`: Web called before loading the board. Currently serving members can trigger the established rules for that day, and only managers can trigger future days. The business day lock protects initialization and refresh, and returns `{ applied, addedCount?, ranked? }`; historical, closed, unvalidated and applied current dates are skipped. Future dates are allowed to be refreshed, and the rows added to the system are synchronized according to the latest template, and recalculated according to the latest attendance order; when the latest reordering operation of the board is manual `reorder`, the order is retained, new employees are appended to the end, and list synchronization returns `ranked: false`. Automatic sequence updates are restored after active `rank`; the first template initialization also respects the existing manual sequence. Returns `applied: false` when there are no changes, does not increment the version or send outbox repeatedly. Reason: Existing shared contracts and services define this boundary, and client behavior must be consistent with actual input and saved results.

`stores.weekly_dispatch_json`, `weekly_dispatch_effective_from` and `daily_boards.weekly_dispatch_applied_at` by migration `20260928120000_weekly_dispatch` Add to. Template initialization reuses the rotation field sorting and ranking explanation snapshots. When the store does not enable daily opening ranking, it will only be added in the order of the template; the people scheduled on the current date remain unchanged; future dates will continue to be updated. Automatically managed member IDs are saved in `board.weekly_dispatch_applied` audited `managedMembershipIds`, compatible with old auditing `addedMembershipIds`, only remove automatic rows that are template canceled and do not have any work record or shift, leaving manually added rows. Reason: Existing shared contracts and services define this boundary, and client behavior must be consistent with actual input and saved results.


<a id="成员每日全部结清"></a>

### All members are cleared every day

- `POST /stores/:storeId/members`, `PATCH /stores/:storeId/members/:membershipId` accept optional boolean `dailySettlementEnabled`. Omitted as `false` for new members, retained if omitted for updates; member responses contain this field. Reason: Historical paychecks use current snapshots, and conflicts and rollbacks must prevent repeated payments.
- Personal preview returns `dailySettlementEnabled` and `dailySettlementPayoutCents` (all confirmed service commission + credit card/gift card tips, excluding cash tips). The closed date uses a snapshot of the settings and amounts at the time of settlement.
- Single-player `settle` and `settle-all.settlements[]` accept optional `dailySettlementEnabled` as a preview settings check; return 409 for version or settings changes. Save `additionalServiceWagePaidCents` (all service commissions minus cash earned wages) and `nonCashTipPaidCents` when enabled. The work record to be checked out returns `DAILY_SETTLEMENT_PENDING_PAYMENT`, and the effective salary confirmation of the day is covered by `DAILY_SETTLEMENT_PAYROLL_CONFLICT`; the transaction is rolled back. The same idempotency request reuses the original results.
- The cash list is supplemented by `dailySettlementEnabled`, `dailySettlementPayoutCents` and the above amount snapshots. Salary calendar date supplement `dailySettlementEnabled`; effective daily full settlement covers cash and non-cash confirmation, and the outstanding amount is zero. Salary balances and summaries count additional paid wages/non-cash tips as paid, which only takes effect when each daily closing counts as `SETTLED` and is not deleted. The rollback and automatic rollback are invalid, and other payroll ledger confirmations will continue to be valid.

<a id="店铺支出"></a>

## Store expenses

All paths are located in `/stores/:storeId/expenses` and only active store owners/managers have `EXPENSE_MANAGE` permissions. All writes require an `Idempotency-Key`; writes other than those created carry a project `version`, returning 409 for conflicts with the latest project. The amount input is a non-negative integer cent, the response amount is a cent string (including summary), and the date does not include time. Reason: Project version protection rules and bills, cycle changes cannot hide recorded accounts.

| Methods | Relative paths | Requests and behaviors |
| --- | --- | --- |
| GET | `?month=YYYY-MM` | Returns the monthly total, number of days in the month, daily average, period/one-time total, missing periods, apportionment details and items (including deleted items and rule history) |
| POST | Empty path | Create `kind=ONCE`: `name,note?,occurredOn,amountCents`; or `kind=RECURRING`: `name,note?,rule` |
| PATCH | `/:id` | `version` plus optional `name,note`; one-time items can be updated `occurredOn,amountCents` |
| POST | `/:id/rules` | `version,rule`, append rules and close the last valid rule; HTTP 200 |
| POST | `/:id/stop` | `version,effectiveFrom`, stop the new cycle from the beginning of this cycle; HTTP 200 |
| POST | `/:id/periods` | `version,ruleId,periodStart,amountCents`, write/replace the actual amount of the entire period; HTTP 200 |
| DELETE | `/:id/periods` | `version,ruleId,periodStart`, clear actual amount override |
| DELETE | `/:id` | `version`, soft deletion item |
| POST | `/:id/restore` | `version`, restore item; HTTP 200 |

`rule` is `{ startDate, unit: DAY|MONTH, interval, amountCents }`, the period interval is 1–1200; the start day of the monthly period must be the first day of each month. `amountCents` is the commonly used whole-period amount. The server sets the `defaultAmountFrom` of the new rule to `startDate`; the request is compatible with the optional `amountMode: FIXED`, and `BUDGET` is rejected for creation, appending rules and updates. The calling end cannot specify `defaultAmountFrom` by itself. Rule changes must be made at the starting point of the latest rule's subsequent period, and stopping is allowed at the starting point of the latest rule; stopped rules can be restarted at the start of the subsequent period on or after their stop date. If you refuse to cover the effective scope of future actual bills, you must first cancel the corresponding single-period coverage. Reason: Project version protection rules and bills, cycle changes cannot hide recorded accounts.

The monthly response is `totalCents = recurringCents + oneTimeCents`, `dailyAverageCents` is the total divided by `daysInMonth` and rounded to cents. Added `recurringCents` (all period costs are allocated in the current month), `oneTimeCents` (one-time payment in the month) and `missingPeriodCount` (the number of periods is not entered in the intersecting period), and removed `budgetCents`. `itemSummaries` returns `{ itemId, allocatedCents, missingPeriodCount }` for each item with details in the current month. The total is calculated by the server: `allocatedCents=null` when all are not recorded, and the recorded total is returned when some are not recorded. The real zero is `"0"`.

`lines` contains project/rule ID, complete period start and end date (all included), `periodAmountCents` (full period amount), `allocatedCents` (this month's allocation) and `hasOverride`, remove `source`. If there is no single period bill before taking effect, the two amounts will be `null`; if there is a bill (including zero), the entire period will be covered. The response rule returns `defaultAmountFrom` and does not return the old `amountMode`. After canceling the single-period modification, if the cycle start date is not earlier than this date, the usual amount will be restored, otherwise it will be restored to not entered. The `endExclusive` of the rule is the date to stop starting a new period, without truncating the already started period. The expenditure interface is independent of business day daily closing, and supplementary recording is not prohibited due to closed. Reason: Stop only constrains new cycles. Existing cycles and independent expense accounts cannot be truncated by closing or new rules.

The upgrade boundary of the old budget rules is aligned upward with the legal period based on the first of the month in the store's time zone when the migration is executed, and the fixed rules use the original starting date. Forward migration does not rebuild rules or bills, and retains complete coverage across monthly cycles; the old amount model is only for storage compatibility. Reason: Unrecorded history cannot be filled by estimation, and the UTC month cannot replace the local month of the store.

## Store data operations

Only an active Owner may use `/stores/:storeId/data`. Managers retain access to the audit list. Shared file contracts are in [`store-data.ts`](../../packages/contracts/src/store-data.ts).

| Method and path | Request and result |
| --- | --- |
| `GET /stores/:storeId/data/export?mode=full` | Downloads one full JSON file. Use `mode=anonymized` for a demo file. Optional `previewId` marks a full recovery download for that preview. |
| `POST /stores/:storeId/data/import/preview` | `{ backup }`; returns `previewId`, ten-minute expiry, target name/fingerprint, source summary, mode and per-table counts. |
| `POST /stores/:storeId/data/import/confirm` | `{ backup, previewId, confirmName }` and `Idempotency-Key`; atomically replaces this store and returns `{ imported, storeId, mode }`. |

The file has `format: "massage-note-store"`, `formatVersion: 1`, application version, export mode/time, source summary, data and SHA-256 checksum. Hash the UTF-8 canonical JSON of all fields except `checksum`, with object keys sorted lexicographically and array order retained. BigInt amounts and Decimal positions are decimal strings; dates retain their saved values. Required fields and references must match the supported schema. Import payloads are limited to 50 MiB; only these two POST routes have a larger JSON parser limit.

Preview stores only actor, target, hashes, expiry and completion metadata. Confirm rechecks Owner access, exact target name, recovery download, file checksum and target fingerprint. A changed/expired preview returns 409; an invalid file returns 400. The same key and request replay the completed result. A fixed-order write lock covers mutable import tables, including background writers; reads continue, lock wait is bounded to five seconds, and the transaction to sixty seconds. Constraint failures roll back the entire replacement. Append-only audit/outbox privileges remain intact.

The target store ID/code and current Owner account remain; the source Owner profile binds to that account, while other member profiles have no login binding. Sending is disabled, delivery credentials revoked, robot groups removed and pending AI changes cancelled. Original target audits remain, imported history is deduplicated by origin ID, and operation names remain readable through actor snapshots. One import audit triggers a full client refresh; imported historical rows do not generate individual events. See [operations](../operations/OPERATIONS.md#store-data-files) for backup scope and recovery instructions.

### Homepage cash change

`GET /stores/:storeId/boards/:businessDate` adds `statistics.cashChangeCents` as a signed integer number of cents or `null`. Owner/Manager receive the active closing's `totalsSnapshotJson.store.cashChangeCents`; open days, legacy snapshots and employee views return null. Employee views also return `closing: null`, including the current day. Store closing previews add `storeTotals.cashChangeCents`; new manual, forced and automatic closings save it atomically. The value uses expected wages, is independent of cash-settled status and remains fixed until the day is reopened and closed again. Cash receipts include gift-card cash sales; ordinary employee payouts use cash-allocated wages, daily-full payouts use all service wages plus card/gift-card tips. Owner/manager wages and cash tips are excluded. Reason: clients must distinguish missing history from zero and must not recalculate or expose store totals.
