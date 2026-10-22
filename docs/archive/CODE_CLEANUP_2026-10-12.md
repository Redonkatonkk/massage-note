<a id="2026-10-12-全仓代码审查与大扫除"></a>

# 2026-10-12 repository-wide code review and cleaning

**English** | **[简体中文](CODE_CLEANUP_2026-10-12.zh-CN.md)**

> One-time check record: The workspace is organized from `1.25.0` to `1.25.1`. Reason: Save scan, clean, and verify evidence for traceability; current rules are not defined on this page.

<a id="范围与方法"></a>

## Scope and Method

The Git workspace is clean when I take over. Manifest and file reading covers all 515 versioned files, 73,002 lines, including Web, API, Mac agent, shared package, database schema/42 migrations, Python/Swift integration, Docker, Shell/Node scripts, CI, configuration, SVG, and 28 copies of Markdown.

TypeScript AST scans import diagrams, export references, method entries, and repeated function bodies; CSS scans selectors without literal references, and then checks dynamic classNames. Candidates compare current calls, shared contracts, transaction services, tests and documentation on a case-by-case basis, and do not equate static scans with manual audits of each business branch. Dependencies, generated code, environment secrets, and runtime data are not removed as source code, and no browser or subagent calls are made.

<a id="已清理"></a>

## Cleaned

| Project | Basis and Processing |
| --- | --- |
| Eight old web helpers | Payroll `payrollEntryFromPreview` / `hasMatchingPayrollEntry`, Navigation `financeCashHref` / `workRecordHref`, Label `employmentTypeLabel`, Time `adjustedSameDayEnd` / `adjustedEndLocalDateTime` / `endLocalDateTimeForDuration` all have no production calls. These implementations and twelve obsolete tests are deleted; existing amount input, revision confirmation, URL resolution, and total duration linkage remain. |
| Eight contract type aliases | Remove repository-wide without reference `InitializeCatalogInput`, `CreateStoreInput`, `ApproveJoinRequestInput`, `UpdateProfileInput`, `ConfirmPaymentInput`, `ClosingDeliveryCompleteInput`, `ClosingDeliveryAuthorizeInput`, `EmployeeSettlementAttachmentInput`; the input/output types still used are retained with the schema. |
| Duplicate lease contract | authorize and complete originally defined the same lease object, but instead reused the same schema, retaining the two interface names and original verification semantics. |
| Web PNG conversion | Duplicate SVG loading, canvas limits, PNG encoding, and temporary URL recycling for both export entries. Concentrated in `apps/web/lib/svg-png.ts`, each entry retains the original scaling strategy, file name and return field. The existing image test covers language, amount, complete content, size and three types of failed recycling. |
| SMS receiving number | The same number used for the first daily closing, individual daily statement sending and interval settlement is judged to share `finance/delivery-recipient.ts`; the number source and receiving qualifications will not be changed. |
| Delivery failure retry | The two delivery services share the failure status calculation of `delivery-lease.ts`, which maintains three append retries, a 60-second interval, no automatic retry for ambiguous results, and identity/lease review before updating. |
| Old static export branch | `WEB_STATIC_EXPORT` only appears in Next configuration; current build post-processing, start and Docker all require standalone server. Remove branches without corresponding delivery links and continue to use standalone and secure response headers. |
| Outdated Documentation | The API's first daily closing description is changed to only those with work record on that day; the security document clearly states that CSP is on the Web, and other public security response headers are set by Web/API respectively. The architecture and development instructions are synchronously shared and implemented; the maintenance entrance clearly states that "code review (general cleaning)" adopts the repository-wide cleaning convention. |

<a id="保留项及原因"></a>

## Reserved items and reasons

| Project | Reason |
| --- | --- |
| Next/Nest/LangBot/Swift Entry | Routes, decorators, lifecycle, manifest/YAML and native App are dynamically called by the framework, ordinary static imports cannot prove useless. |
| Old deep links are compatible with server time | Removing unused web generation functions does not cancel external URL resolution; when the API omits the end time, it still retains the actual duration of calls and tests. |
| Shared types and composition schema | Types used internally in this file or participating in response declarations still have a purpose; they are not deleted due to no cross-file import. |
| Dynamic CSS selector | Classes for payment methods, delivery status, and catalog types are generated from templates, and they all have current page purposes after checking one by one. |
| Short React state packaging and polling | The appearance is repeated but relies on different page states and request life cycles; abstracting them cannot eliminate specific business differences and retain partial implementation. |
| Large transaction service and test fixture | Permissions, business day locks, versions, idempotency, audit/outbox and rollback boundaries are different, business transactions are not merged or broken up by row count. |
| Migrations and historical snapshots | 42 migrations are published upgrade history; old send snapshots, historical checkpoints, and compatibility fields still have read paths. There are no database changes this round. |
| Archives, copyrights and stand-alone products | Archives and licenses must be traceable, and installed plug-ins and Mac agents run independently; this round of source code cleanup does not authorize their replacement or release of NAS. |

<a id="验证"></a>

## Verify

| Scope | Result |
| --- | --- |
| Full workspace type / Prisma schema | Pass |
| domain / contracts | 140 / 92 passes |
| Web (helper functions and React/jsdom) | 270 passes |
| API (with full database suite) | 407 passes |
| Database Constraints | 8 passes |
| Mac Agent | 36 passes, including local image conversion and script compilation; no messages sent |
| LangBot Python | 34 passes |
| repository tools | 10 passes |
| Source code format and syntax | 8 Shell, 9 Node scripts, 3 Python, 17 JSON, 2 SVG passed |
| Style source and mobile cascading | Passed; 8 routes, 31 sets of pages/sections, 320–760px, browser not started |
| production builds/versions/diff formats | `pnpm build` (contains `pnpm version:check`) and `git diff --check` pass |
| Local document link | 29 Markdown, 199 file/directory targets passed |

A total of 1,097 tests passed. Web and API are run in groups, and packages that have passed and are not affected by subsequent changes are excluded from subsequent batches and are not counted repeatedly. The integration test only uses the independent `massage_note_test`, 42 migrations have no pending application items, and do not operate the development or production business libraries.

The final scan included two helpers and review records of this round, with a total of 518 files; 382 TypeScript file syntax passed. After excluding the checked framework page entry, no export function candidates without production references were found.

According to the maintenance agreement, only stop the development process tree belonging to this project and re-run `pnpm dev`. Web fixed 3000, `/login` returns HTTP 200; API 4000's `/api/v1/health/ready` returns `status: ready`, `database: ok`, and the service keeps running.

This round is only cleaning and verification, no new features or database migration, no deployment, no submission. For NAS to take effect, the Web/API needs to be upgraded; the independent Mac agent and LangBot source code have no behavioral changes and do not replace installed products.
