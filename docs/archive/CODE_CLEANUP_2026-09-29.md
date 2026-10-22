<a id="2026-09-29-全仓代码与文档整理"></a>

# 2026-09-29 repository-wide code and document organization

**English** | **[简体中文](CODE_CLEANUP_2026-09-29.zh-CN.md)**

> Historical references, not current rules. Reason: Save evidence of current design, review or delivery for traceability; all old requirements no longer bind the current code.

> One-time inspection record, based on `1.13.6` Organize to `1.13.7`. The current development rules are still based on [Development Guide](../engineering/DEVELOPMENT.md) and [Architecture](../engineering/ARCHITECTURE.md) shall prevail.

<a id="范围与方法"></a>

## Scope and Method

The Git workspace was clean when I took it over, with a total of 425 version-controlled files. Checks cover root configuration, CI, `apps/web`, `apps/api`, `apps/messages-agent`, three shared packages, database schema/migrations, LangBot plugin, Docker, scripts and all Markdown documentation.

Employs file manifests, directory size and ignore rule checks, TypeScript unused variables/parameters checks, duplicate snippet scans, contract and key implementation comparisons, documentation target checks, and partition read-only reviews for three Luna subagents. Only the usage, size and ignoring of generated files and local data are checked; dependencies or caches are not reviewed line by line, and local credentials are not output.

<a id="优化清单与实施"></a>

## Optimization list and implementation

| Optimization items | Check basis | Implementation |
| --- | --- | --- |
| Unify the Web API base address | The login page and `lib/api.ts` repeatedly read the same environment variables and fallback addresses | Login reuses the existing `apiBase` and maintains dedicated login error handling; the configuration sources of business requests and SSE are consistent. |
| Reuse existing shared types | Web repeatedly defines roles, scheduling weeks/templates, and interval settlement payment ranges | Roles are imported from domain, scheduling types are derived from `WeeklyDispatchInput`, and payment ranges are re-exported from contracts; keep the original Web import entry. |
| Combined sending agent authentication | The voucher parsing, query, revocation/store check and hash comparison of daily closing and interval settlement services are exactly the same | Extract [`delivery-agent.ts`](../../apps/api/src/finance/delivery-agent.ts), and the same hash function is also reused for voucher issuance; each task is still accessed according to the store and lease to which the agent belongs. |
| Remove duplicate snapshot packaging | Runker `snapshot()` completely repeats the parameter type of `serialize()` and forwards it directly | Audit directly reuses the original serialization result, and the field and deletion time appending methods remain unchanged. |
| Organize contract tests and imports | The business analysis test is located in `src/`, and the original build configuration will compile it to `dist/`; directory contracts are repeatedly imported into `common.js` | The tests are moved to [`contracts/test`](../../packages/contracts/test/), the domain/contract build explicitly excludes `*.test.ts`, and the merge is repeated. |
| Solidify useless code inspection | Five TypeScript workspaces use unused variables/parameter options and all pass | Enable two checks in the common `tsconfig.base.json` and reuse the original type checking command. |
| Solidified document link verification | Maintenance rules require checking local links, but the repository has no corresponding command | Add `pnpm docs:check` and tool testing; cover local inline links, images and reference targets, and access CI. External URLs and title anchors are not included in the verification scope. |
| Improve Docker context exclusions | Git has ignored Python cache and plug-in packages, Docker lacks similar rules and TypeScript incremental caching rules | `.dockerignore` adds corresponding exclusions; retains the existing rules for root directories and nested dependencies. |
| Improve navigation and description | The README directory tree misses the message agent and integrated directory, and the navigation is repeated; the architecture module table misses the runner; the test description misses the Mac agent | Complete the directory/module and plug-in development entrance, update commands, sharing helpers and existing single-day scheduling coverage instructions, move the version policy to the top of the Changelog, and synchronize application versions. |

<a id="保留项及原因"></a>

## Reserved items and reasons

- **Large components and transaction services**: The work record editor, Kanban, finance, scheduling and directory services are longer, but their status is coupled with the transaction boundary. This round of extraction has clear logic of repeated evidence and is not split as a whole according to the number of lines.
- **Remaining handwritten Web response types**: Most contracts define input validation, and there is no equivalent response type that can be directly replaced; no new response protocols are added through organization. Existing equivalent types are reused according to the table above.
- **Database migration and constraint snapshot**: Published migrations remain intact; `constraints.sql` is clearly the first version of the constraints snapshot. Subsequent constraints are maintained by forward migration and should not be overwritten according to the latest schema.
- **Test layout**: Web helper function tests are adjacent to the source code; API integration tests follow the `DATABASE_INTEGRATION_TESTS` gate; proxy tests are in `test/`. These layouts are consistent with existing tooling, and only contract tests that would be mixed into shared package builds are migrated.
- **Integrated dynamic entries and package instructions**: LangBot YAML/manifest dynamically references Python events and entries, and fewer static references does not mean dead code; Chinese and English package READMEs have their own purposes, and the plug-in version is independent of the application version.
- **History, dependencies and local files**: Archive design, plug-in history installation packages, `node_modules`, `.next`, generated Prisma Client, `.local-ai` and local environment files are retained. The approximately 1.7 GB working directory is mainly for dependencies and web build cache, and will not be deleted as useless source code.
- **Domain and delivery boundaries**: Financial integer operations, permissions, business day locks, versions, idempotency, auditing/outbox, database structure and existing product functionality remain unchanged. No NAS will be released, no plug-ins or message agents will be reinstalled in this round.

<a id="验证"></a>

## Verify

See the command entry [Development Guide](../engineering/DEVELOPMENT.md#verify-before-completion). This round passed the repository-wide type check and Prisma schema verification.`pnpm build` instead of calling `pnpm version:check`;Confirm domain/contract `dist/` Test product not included.

| Test range | Number of passes |
| --- | ---: |
| repository tools | 4 |
| domain | 81 |
| contracts | 62 |
| messages-agent | 33 |
| Web | 153 |
| Database Constraints | 7 |
| API Units and Integration | 367 |
| Total (no repeated statistical directional reruns) | 707 |

The database test uses standalone `massage_note_test`, which has 34 migrations and no migrations to be applied. The Mac agent's AppleScript compilation and SVG conversion tests failed within the sandbox and all passed after allowing system compiler/converter access; only scripts were compiled and test attachments were generated, no sending was performed.

`pnpm docs:check` checks 130 local file/directory targets of 24 copies of Markdown; `git diff --check` checks for whitespace errors in this change. Rerun `pnpm dev` as agreed, Web 3000's `/login` returns HTTP 200, API 4000's `/api/v1/health/ready` returns `status: ready`, `database: ok`, and the service remains running.

No browser is invoked; local verification does not replace acceptance of real WeChat, SMS, NAS or installed agents. The LangBot plug-in source code has not been modified, and its independent Python tests have not been rerun.
