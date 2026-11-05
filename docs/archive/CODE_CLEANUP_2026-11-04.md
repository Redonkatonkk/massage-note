# Repository cleanup on 2026-11-04

**English** | **[简体中文](CODE_CLEANUP_2026-11-04.zh-CN.md)**

This record describes the cleanup in 1.52.4. The repository started with 708 tracked files and pending work on the ranking and payroll screens.

## Scope and changes

The inventory covered Web, API, domain, contracts, the Prisma schema and 50 migrations, the Mac agent, LangBot, operational scripts, CI, assets and documentation. TypeScript declarations and call sites, repeated code, CSS selectors and route references were compared with the current entry points. Shell syntax and Python, JSON and SVG parsing were also checked.

- Removed styles and the private query branches for the retired finance filters. Monthly reports still use their applied month and highlight scope, and employee details still pass the selected membership.
- Removed an unused SVG panel helper, obsolete range-delivery error translations and unused internal contract declarations. The active payroll-entry schema and audit undo status type still serve their callers.
- Shared the AI action preview, settlement date validation and Markdown file discovery. The assistant page and floating assistant each own their existing conversation state and confirmation effects.
- Removed the outdated finance and gift-card filter rules. The gift-card ledger shows sales and redemptions together, and its mobile fixture now checks the rendered ledger classes. The mobile checker detects routes dynamically, so the guide no longer hardcodes route and fixture counts.

## Retained rules and reasons

| Rule or entry point | Reason |
| --- | --- |
| Month and highlight filters, employee-scoped details and independent table scrolling | The current monthly report and analytics use these paths to connect displayed totals with their records. |
| Shared CSS tokens, dynamic status and payment classes, and mobile checks | Components construct some class names at runtime. Styling checks exercise the actual selectors used by the current markup. |
| Route files, Nest decorators, LangBot manifest/YAML and Swift entry points | Their runtimes invoke them through registration or native launch. |
| Permission checks, leases, idempotency, audit and transaction boundaries | Similar controller and service blocks enforce distinct write conditions, snapshot fields and retry behavior. |
| Published migrations, old delivery records and both attachment checkpoints | Migrations preserve the upgrade path, historical rows remain readable, and active employee-subtotal jobs still use the checkpoints. |
| Local service readiness, version synchronization and bilingual manuals | They verify that the current source is testable locally, can be identified in a release and has equivalent maintenance entry points. |
| NAS and independent agent or plugin procedures | Each artifact has its own update and runtime checks. This change is local source maintenance. |

## Verification

- Workspace type checks, Prisma schema validation, Web production build, version synchronization and bilingual documentation checks passed.
- The test runs covered 557 Web, 144 domain, 122 contract, 56 Mac agent, 66 targeted API, 20 tooling and 34 LangBot tests. The API integration cases used the independent test database. The tooling regression was rerun after updating the payroll selectors.
- CSS checks passed for nine routes and 34 fixtures at seven widths. After restart, Web returned HTTP 200 on port 3000 and API readiness reported a healthy database on port 4000.
