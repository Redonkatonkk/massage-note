<a id="开发指南"></a>

# Development Guide

**English** | **[简体中文](DEVELOPMENT.zh-CN.md)**

> Applies to version: `1.41.0`

This guide describes the current repository’s development workflow. See [`PRODUCT.md`](../product/PRODUCT.md) for business rules, [`ARCHITECTURE.md`](ARCHITECTURE.md) for code boundaries, and [`API.md`](API.md) for HTTP details.

<a id="环境要求"></a>

## Environment requirements

- Node.js 24
- pnpm 11 (repository locked `pnpm@11.9.0`)
- Docker Engine and Compose v2
- Locally available ports 3000, 4000, 5432, 6379; database and Redis ports can be rewritten through environment variables

<a id="第一次启动"></a>

## First start

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:deploy
pnpm dev
```

Web uses `http://localhost:3000`; confirm availability with `curl --fail` without opening a browser by default. Reason: the user prefers code/command-line validation and a stable acceptance port. API liveness and readiness endpoints are:

```text
http://localhost:4000/api/v1/health
http://localhost:4000/api/v1/health/ready
```

For the operating boundaries of Firebase and MiniMax, see [Security Instructions](../operations/SECURITY.md); when Firebase is not available locally, development login must be explicitly enabled on both the Web and API sides. Reason: One-sided enablement cannot establish a development session, and production authentication is protected by force-off logic.

<a id="本地手工测试数据"></a>

## Local manual test data

The local web app uses the `massage_note` development database, currently populated from a user-authorized production backup snapshot. `massage_note_test` remains the independent automated-test database and is not the web app’s data source. Keep the current snapshot; do not seed on startup or completion. Reason: real historical records support analytics and financial review; synthetic seeding would mix unrelated stores and amounts into that snapshot.

Before replacing local data, verify that `.env` targets the localhost development database and this project’s PostgreSQL container. Download and verify the requested snapshot, restore it to a separate temporary database, and check table counts, valid work records, closings, and amounts before stopping this project’s development services. Keep a local backup and checksums, retain the old database as a recovery point, switch to the verified snapshot database, and apply current migrations. Store backups, restore SQL, and local switch records only in Git-ignored restricted `.local-ai/`. Reason: validation before switching shortens downtime and preserves recovery; production credentials and business data must stay out of version control.

After importing the snapshot locally, map the Owner identity to the fixed local test number `+1 (770) 575-0450`, preserving the original user ID, stores, employees, and business records. Revoke sending-agent authorizations in the local copy. At `http://localhost:3000`, enter `7705750450` and choose the direct development-login action without sending SMS. These adaptations affect only the local copy. Verify row counts and amounts, validate Owner access and analytics through the API, then restart and retain Web/API readiness. Reason: local tests need a repeatable login, and copied production sending credentials must not remain active.

The following local development configuration must be maintained in `.env`; the key is only used to sign local sessions and may not be copied to production. Reason: Development session signing is not a replacement for production authentication.

```dotenv
NEXT_PUBLIC_DEV_AUTH_ENABLED=true
DEV_AUTH_ENABLED=true
DEV_AUTH_SECRET=replace-with-a-local-random-secret-at-least-32-characters
```

<a id="可选固定演示数据"></a>

### Optional fixed demo data

Run `pnpm demo:seed` only when the user explicitly requests synthetic demo scenarios. It applies existing migrations, idempotently refreshes `本地演示店` and fixed test identities, and moves dates to the current day and preceding week. Repeated runs do not accumulate records or clear other stores. Implementation: [`scripts/seed-local-demo.sql`](../../scripts/seed-local-demo.sql). Reason: the seed remains useful for independent payment/settlement scenarios but must not be mixed into the current business snapshot.

<a id="常用命令"></a>

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Web and API in parallel, build shared package before starting |
| `pnpm typecheck` | Check all workspace types |
| `pnpm test` | Runs repository tools, domain rules, contracts, Mac agents, web helpers and API non-database tests |
| `pnpm test:tooling` | Node.js built-in tests that run repository scripts |
| `pnpm test:integration` | Create/migrate standalone test databases and run database and API integration tests |
| `python3 -m unittest discover -s integrations/langbot-plugin/tests -v` | Run LangBot plug-in boundary and parsing tests (CI is not currently executed) |
| `pnpm build` | Check version consistency and build all workspaces |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:validate` | Validate Prisma schema |
| `pnpm db:migrate` | Create new migration locally; cannot be used in production |
| `pnpm db:deploy` | Apply existing migrations, available both locally and in production |
| `pnpm demo:seed` | Apply migrations and create or refresh pinned local demo data |
| `pnpm docker:status` | Check the PostgreSQL/Redis status of this project |
| `pnpm version:check` | Check version number, image tag and document tag |
| `pnpm docs:check` | Check the local file/directory link target of the repository Markdown |
| `pnpm ui:check` | Check the color/rounded source of all style breakpoints and work record panel sharing rules |
| `pnpm ui:mobile` | Check all routes and the DOM cascading style of common spring layers at 320–760px without starting the browser |

The mobile reading order and low-frequency operations are also verified by [Real Component Regression](../../apps/web/app/ui/mobile-reading.test.tsx), including real DOM display switching between 320–900px and desktop, recovery/cancellation confirmation, amount correspondence, permissions and help topic expansion. For the scope of review, please see [Mobile Phone Review Record](MOBILE_REVIEW_2026-10-04.md). Reason: Representative style structures are not a substitute for real components and operational verification, neither of which constitute browser visual testing.

`pnpm test:integration` uses `massage_note_test` by default and will not clear the `massage_note` development database. If the default database port is occupied:

```bash
POSTGRES_HOST_PORT=55432 REDIS_HOST_PORT=56379 pnpm docker:up
MASSAGE_NOTE_TEST_DATABASE_URL='postgresql://massage:massage@localhost:55432/massage_note_test' pnpm test:integration
```

Do not stop, delete, or rebuild containers and data volumes that are not part of this project for testing purposes. Reason: The standalone test database does not authorize manipulation of other project or production data.

<a id="修改规则"></a>

## Modify rules

- Interface changes synchronize the shared contract, Controller, Service, Web calls and [API document](API.md); formula changes first modify the domain functions and corresponding tests. Reason: Multiple callers must use the same input semantics and amount source.
- Writes inherit existing permissions, object ownership, business day locks, versions, idempotency, audit/outbox and transactions, verifying good and failed paths. Reason: Refactoring does not make cross-store, duplicate requests, or half-bills valid writes.
- Only descriptive forward migrations are appended to the database, and published migrations are not changed; `prisma migrate deploy` is used in production, and destructive changes are staged. Reason: Existing databases must be able to be replayed and upgraded according to the same history, and old containers must also be compatible with the transition schema.
- Web refresh reuses `refresh-queue.ts`, and store cut/uninstall invalidates old results; calendar caching rules are subject to [Product Rules](../product/PRODUCT.md). Reason: There is a public implementation for isolating merge requests and expired responses, and repeatedly defining the cache invalidation range will cause conflicts.
- Visual maintenance follows [UI Design](UI_DESIGN.md), style changes run `pnpm ui:check`, `pnpm ui:mobile`; member interaction changes run `pnpm --filter @massage-note/web exec vitest run app/manage/members-panel.test.tsx`. Reason: Variable sources, mobile cascading styles, and draft/conflict processes are covered by corresponding checks respectively; CI runs two style checks simultaneously, and code verification does not represent visual measurement.
- Web SVG to PNG, canvas capacity limit and temporary URL recycling are unified in `apps/web/lib/svg-png.ts`; image themes and line breaks are unified in `packages/domain/src/image-layout.ts`, salary settlement modifications are shared in `employee-settlement-image.ts`, and the page/picture display content of individual daily statement is unified and modified `employee-closing-template.ts`, image layout modification `employee-closing-image.ts`, page structure in `employee-closing-statement.tsx`; synchronization check corresponding to domain, Web `lib/*-image.test.ts` and Mac agent `test/settlement-render.test.ts`/`test/render.test.ts`. Check objects and dates, main income, source summary, chronological details, as well as precise amounts, long text, unknown/zero values and pending settlement prompts; the interval retains the leftmost side of daily summary and long chart capacity boundary, individual daily statement checks two-column work record card, three-column source table, cash/swipe card/gift card payment mark, highlight/discount/add-on, old snapshot compatibility, fixed source width and Web sharing/download adaptation. Reason: Web and proxy use different image conversion environments, and web page CSS inspection cannot cover attachment reading order and complete accounting.
- Loading, double-click protection, and 409 checks are retained; the front end does not count final financial or persistent cache business responses. Reason: Waiting states, failure recovery, and accounting truth cannot be lost through cleanup.
- TypeScript workspace inherits unused variable/parameter checks; domain/contracts tests are placed in `test/`, and production builds exclude tests. Reason: Type checking can find local dead code, and build products should not be mixed into test entries.

<a id="完成前验证"></a>

## Verify before completion

Select necessary verifications based on changes. Checks that have passed and are not affected by subsequent changes are not repeated; the default is only code and command line/API verification, and users will only use the browser when required in specific tasks. Reason: This is the user's long-term verification scope to reduce duplication overhead. The following is a reference command for complete verification during the development phase, not a serial pre-list for ordinary update deployment; follow directly for release [Default update deployment process](../operations/NAS_DEPLOYMENT.md#default-update-deployment-process).

```bash
pnpm version:check
pnpm docs:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Documentation also runs at least `pnpm version:check`, `pnpm docs:check` and `git diff --check`. Link checking covers new Markdown files that are tracked and not ignored by Git, checks local file/directory targets for inline links, images, and quoted links, and skips code examples; external URLs and title anchors are not verified by this command. Reason: Versions and local links are each independently checked, and behavioral statements in the documentation must have implementation evidence. If the document modification involves commands, routing, contracts, amounts or deployment facts, the corresponding code verification must be run; the official release follows the complete [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md).

Release CI runs full verification and image building in parallel; the image stage covers production builds, while ordinary branches and PRs retain their separate build. See the [NAS manual](../operations/NAS_DEPLOYMENT.md) for branch measurements and stage timing. Reason: avoid duplicate serial builds of the same source locally and in CI.

<a id="版本同步位置"></a>

## Version synchronization location

Modification and version rules are subject to [AGENTS.md](../../AGENTS.md). Reason: `scripts/check-version.mjs` for the following sync manifest will verify them item by item.

- Root directory `VERSION`, root directory and `package.json` of all workspaces.
- `CHANGELOG.md`, `Dockerfile` of `APP_VERSION`.
- Image tags for `docker-compose.nas.yml` and `.env.nas.example`.
- English `README.md`, Chinese `README.zh-CN.md`, version tags for current product, API, architecture, development, handoff and NAS documentation.

Published images do not overwrite old version tags. Reason: Production upgrades and rollbacks must locate traceable fixed products.

<a id="文档分工"></a>

## Document division of labor

| Content | Maintenance location |
| --- | --- |
| Overview of external projects | Default English `README.md` and Chinese `README.zh-CN.md`, mutual links at the top |
| Product scope, authority, amount definition | `docs/product/PRODUCT.md` |
| Current modules and data flows | `docs/engineering/ARCHITECTURE.md` |
| HTTP interface | `docs/engineering/API.md` |
| Local development and verification | `docs/engineering/DEVELOPMENT.md` |
| Normal/NAS deployment | `docs/operations/DEPLOYMENT.md`, `docs/operations/NAS_DEPLOYMENT.md` |
| Backup and Troubleshooting | `docs/operations/OPERATIONS.md` |
| Mac Messages agent installation and troubleshooting | `docs/operations/MESSAGES_AGENT.md` |
| Security Boundary | `docs/operations/SECURITY.md` |
| Published changes | `CHANGELOG.md` |

Don't include disposable container IDs, PIDs, temporary tunnels, real domain credentials, or daily development turnover in current documentation. Historical designs that need to be preserved are moved to `docs/archive/` and explicitly marked as archives. Reason: The current manual should be repeatable, temporary identification and old plans are not maintenance rules.

<a id="documentation-language--文档语言"></a>

### Documentation language / Documentation language


All documentation follows the English-first bilingual policy in [AGENTS.md](../../AGENTS.md). New documents and content updates must include both English and Chinese, with synchronized capabilities, architecture, commands, and implementation references. Use the English document as the default entry point; paired files must link to each other prominently at the top, or place English before Chinese in a shared document. Reason: external portfolio reviewers need an English entry point, and Chinese readers need an equivalent, current version.

<a id="修改后的本地测试服务"></a>

## Modified local test service

Every time you complete any project changes, including code, configuration and documentation, you must re-run `pnpm dev`, keep using `http://localhost:3000` for the Web, confirm readiness through the command line for user testing, and do not open the browser by default. First check the process ownership of port 3000/4000, and only restart the service of this project; when the port is occupied by other projects, it is not allowed to terminate or use other ports without authorization. After confirming that the web is accessible and the API `/api/v1/health/ready` is ready, keep the development process running. Reason: User testing must access this code, and fixed port and process ownership can avoid affecting other projects; this requirement does not grant NAS deployment permissions.

<a id="改动交接"></a>

## Change handover

- Report modified modules, actual verification results, unverified external dependencies and necessary migration boundaries. Reason: Local validation does not equal production or external platform acceptance.
- Check `git status --short` and `git diff` before submitting, and only process files for this task. Reason: The same workspace may be hosting other uncommitted tasks at the same time.
- Release authorization and NAS reminders follow [AGENTS.md](../../AGENTS.md). Reason: Avoid duplicating different publishing authorization rules across documents.

<a id="langbot-插件目录"></a>

## LangBot plug-in directory

The plug-in source code and backend are maintained in the same repository. For the entrance, see [Plug-in Development Guide](../../integrations/langbot-plugin/DEVELOPMENT.md). The installation package is output to the plug-in's `dist/`, and the old package is retained in `dist/archive/`; LangBot's running data is located in the `langbot-local/docker/data/` of the workspace brother repository and is not modified as source code.

Documentation uses paired `.md` (English default) and `.zh-CN.md` files, except the plugin’s established `readme/README_zh_Hans.md`. `pnpm docs:check` validates local file links, reciprocal language links within the first eight lines, English/Chinese prose, heading structure, and matching executable examples. It skips prose inside code examples and allows translated `text`/`mermaid` diagrams. It cannot prove translation equivalence or validate external URLs/heading anchors; review those when editing. Reason: structural checks catch missing editions and obvious drift, while technical meaning still needs human review.

## Store data transfer validation

Run the store-data API integration suite against the independent test database and the DataOperationsPanel component tests for changes to import/export. Include full/demo round trips, nested identity removal, precision, append-only application privileges, conflicts, replay and transaction rollback. See [operations](../operations/OPERATIONS.md#store-data-files). Reason: schema validation alone cannot prove restore order, production permissions or safe demonstration data.

## Public portfolio demo

The [portfolio gallery and walkthrough](../portfolio/README.md) provides the GitHub Pages entrance and all page images. The demo reuses the original Web components. `NEXT_PUBLIC_PORTFOLIO_DEMO=true` selects an isolated read-only adapter at build time; normal API, authentication and realtime connections are unavailable. Normal builds continue using the real API. Reason: a public resume link needs a stable, sign-in-free presentation without access to business data.

```bash
pnpm --filter @massage-note/domain --filter @massage-note/contracts build
pnpm demo:build
```

Output is `apps/web/out`, with `/massage-note` as the default path prefix. Use `DEMO_BASE_PATH= pnpm demo:build` for root-path hosting. Builds use a temporary source copy without `.env` and preserve local development caches. `.github/workflows/demo.yml` builds and publishes GitHub Pages after main updates; repository Pages must use GitHub Actions as its source. This is independent of NAS releases.

`apps/web/demo/responses.json` contains synthetic data only. To regenerate it:

```bash
pnpm demo:fixtures
```

The tool requires this project's local PostgreSQL on its default port 5432 and build dependencies. It creates a fresh temporary database, applies migrations and a fixed-date synthetic seed, then generates three months of records and closings through the real API. After saving responses it closes the temporary API and drops that temporary database. It does not read `.env` or an existing business database. The date is fixed to 2026-10-22; changing it requires synchronizing the generator, demo copy, test dates and query ranges. Never replace the public snapshot with a business export. `demo/client.test.ts` covers write blocking, snapshot matching and identity data; `demo/pages.test.tsx` renders 15 original pages/tabs and verifies that initial loading makes no network requests. Reason: isolation between demonstration and business data needs independent executable evidence.
