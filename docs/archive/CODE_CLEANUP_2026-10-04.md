<a id="2026-10-04-全仓代码与文档整理"></a>

# 2026-10-04 repository-wide code and document organization

**English** | **[简体中文](CODE_CLEANUP_2026-10-04.zh-CN.md)**

> One-time inspection record: based on workspace `1.18.3` organized to `1.18.4`. Reason: Record scanning basis, cleaning and verification evidence to facilitate traceability; this page does not define current rules.

<a id="扫描范围与方法"></a>

## Scan range and method

At the time of taking over there were 49 modified files and 10 new files that had not been ignored. This round keeps this work as a full file snapshot, scanning Git traces and new files not ignored, totaling 481 text files, 70,739 lines: Web, API, Mac agent, shared package, database schema/39 migrations, Python/Swift integration, Docker, Shell/Node scripts, CI, configuration, SVG, and all 26 copies of Markdown.

Use TypeScript AST to scan for references, unimported modules, and identical function bodies; statically check CSS classes and dynamic classNames; and compare rules in contracts, domain functions, services, existing tests, and documentation. No reference is only used as a candidate, and the dynamic entry and compatible fields of the framework need to be checked separately. Dependencies, generated files, and ignored environment/running data are not deleted as source code, and real credentials are not output. No browser or sub-agent was used in this round.

<a id="已清理"></a>

## Cleaned

| Project | Basis and Processing |
| --- | --- |
| Financial Calculation Adapter | `FinanceCalculatorService` only appears in AppModule registration and forwarding self-test, without business injection or call; remove the test of service, registration and mirror implementation, and the actual service continues to call existing domain functions. |
| gift card usage details | New sales and old card groups have the same mapping; share the `serializeUsageRecord` of this query, and the fields, BigInt and order are maintained. |
| Image formatting | Duplicate XML escaping, currency and time display for SVG files shared by Mac renderer and web; focus on domain `image-format.ts`, remove proxy old helper files. |
| Old CSS | Verified 23 non-page reference classes, removed 73 invalid rules and streamlined 11 shared selectors, covering three styles and media queries; the structures involved in the old cash area, member cards, balances, deadlines, etc. no longer exist. |
| Outdated Rules | Delete requirements such as non-automatic daily closing, all read-only amount rounding, old brand/side column/font size, old member editing partition, card selling and running guest always side by side, settlement summary on the far right, etc. |
| Temporary and false requests | Descriptions such as removal of Photos diagnostic rules, triple confirmation of recovery URL, fixed monitoring threshold commitment, repeated scanning of the complete history for each release, and replacement of the managed database without configuration changes. |
| Duplicate documents | Products are compressed to 172 lines by business theme; the handoff and release list is changed to responsibility entry and release evidence, cache, amount, plug-in/agent restrictions are maintained centrally, and the reasons for retained rules are explained one by one. |

<a id="保留项及原因"></a>

## Reserved items and reasons

| Project | Reason |
| --- | --- |
| Framework dynamic entry | Next routing, Nest decorator/life cycle, LangBot manifest/YAML and Swift App entry do not rely on ordinary static imports and cannot be deleted based on the number of references. |
| Compatible interfaces and historical fields | Old cutoff, off-duty, salary split, robot aliases and queued attachment fields still have code or historical data reading paths. |
| Dynamic CSS class | Payment method, delivery status and directory type are generated from template strings. No hits in static literal scanning does not mean it is useless. |
| Transaction services and similar test fixtures | Permissions, locks, auditing and transaction boundaries are different; independent fixtures ensure test isolation and do not merge different business processes to reduce the number of lines. |
| Shared Contracts and Types | Some schemas/types used only in this document are still involved in composition or generation declarations, and these are not mistaken for unreachable code. |
| Migration and first version constraint snapshot | 39 migrations are published upgrade history and cannot be rewritten according to the latest model; there are no database changes in this round. |
| Historical documents and licenses | Archives are uniformly marked with historical references and are not current requirements; change records, design sources and third-party copyrights still need to be traced. |
| Original unsubmitted work and independent products | This round is only cleaned up on the workspace baseline, and changes to members, styles, caching and scheduling functions are retained; NAS, installed agents and plug-ins are not released/replaced. |

<a id="验证"></a>

## Verify

| Scope | Result |
| --- | --- |
| Full workspace type / Prisma schema | Pass |
| domain / contracts | 102 / 77 passes |
| Web (including React/jsdom) | 210 passes |
| API non-database | 241 passes; database suite skipped as originally gated |
| Mac Agent | 36 passes, including true native image conversion and script compilation; no messages sent |
| repository tools | 8 passes |
| gift card database integration | Standalone `massage_note_test`, 11 passed, 39 unapplied migration items |
| Shell / Node / Python syntax | 8 / 7 / 3 files passed |
| Production Builds/Versions/Styles/Documentation Links/Diff Format | Via |

A total of 685 tests passed; the database only directed execution of the gift card path involved this time, and other skipped packages were not recorded as passed. The shared formatting has passed the existing Web/proxy image regression verification, and there is no new mirroring implementation test.

Restart the development service of this project according to the maintenance agreement. The Web is fixed at 3000 and the API is 4000. The command line confirms that the Web is accessible and the API is ready and keeps running. NAS and standalone Mac agent updates require corresponding release authorization; they have not been deployed in this round and there are no new migrations.
