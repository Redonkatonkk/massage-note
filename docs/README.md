<a id="项目文档"></a>

# Project documentation

**English** | **[简体中文](README.zh-CN.md)**

Project overview: **[English README](../README.md)** · **[中文 README](../README.zh-CN.md)**. Every manual has an English default edition and a matching Chinese edition, linked at the top.

This is the documentation entry point for Massage Note. Choose the manual for the task below. Reason: documents have distinct responsibilities, so ordinary tasks need only the relevant current evidence; repository-wide cleanup follows the maintenance rules.

```text
docs/
  product/       Current products and business rules
  engineering/   architecture, development、API and AI take over
  operations/    Deployment, operations, security, release and Mac Agent Manual
  archive/       Historical design and one-time inspection records
```

<a id="按任务查找"></a>

## Find by task

| Task | Main documents | Read when needed |
| --- | --- | --- |
| Quickly understand the project | [English README](../README.md), [Chinese README](../README.zh-CN.md) | [`PRODUCT.md`](product/PRODUCT.md), [`ARCHITECTURE.md`](engineering/ARCHITECTURE.md) |
| Confirm the role, process or amount | [`PRODUCT.md`](product/PRODUCT.md) | Test in the corresponding field |
| Locate a module, route, or write link | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.md) | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) |
| Modify code or database | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.md), corresponding tests |
| Learn aesthetics, maintain UI and navigation | [UI design and aesthetic guidelines](engineering/UI_DESIGN.md) | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) |
| View the mobile reading review scope | [Mobile review record](engineering/MOBILE_REVIEW_2026-10-04.md) | [Real component regression](../apps/web/app/ui/mobile-reading.test.tsx) |
| Call or modify the HTTP interface | [`API.md`](engineering/API.md) | Shared contracts, Controllers and integration tests |
| Normal Linux production deployment | [`DEPLOYMENT.md`](operations/DEPLOYMENT.md) | [`SECURITY.md`](operations/SECURITY.md) |
| Synology releases or upgrades | [Default update deployment process](operations/NAS_DEPLOYMENT.md#default-update-deployment-process) | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.md) |
| Monitoring, database backup or recovery | [`OPERATIONS.md`](operations/OPERATIONS.md) | [`SECURITY.md`](operations/SECURITY.md) |
| Apply for Oracle free instance and email notification on NAS | [`ORACLE_MONITOR.md`](operations/ORACLE_MONITOR.md) | [`OPERATIONS.md`](operations/OPERATIONS.md) |
| Google Drive full recovery package, midnight backup, Mac on-demand recovery | [`DISASTER_RECOVERY.md`](operations/DISASTER_RECOVERY.md) | [Google First Time Setup](../scripts/recovery/README.md) |
| Install or troubleshoot the Mac Messages agent | [`MESSAGES_AGENT.md`](operations/MESSAGES_AGENT.md) | [`SECURITY.md`](operations/SECURITY.md) |
| Install or troubleshoot the WeChat work record robot | [`LANGBOT_WORK_BOT.md`](operations/LANGBOT_WORK_BOT.md) | [`SECURITY.md`](operations/SECURITY.md), [`API.md`](engineering/API.md), [Plug-in Development Guide](../integrations/langbot-plugin/DEVELOPMENT.md) |
| Modify or package the LangBot plug-in | [Plug-in Development Guide](../integrations/langbot-plugin/DEVELOPMENT.md) | [Package Description](../integrations/langbot-plugin/README.md), [Chinese Description](../integrations/langbot-plugin/readme/README_zh_Hans.md) |
| Prepare for official release | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.md) | Root directory [`CHANGELOG.md`](../CHANGELOG.md) |
| Let AI take over maintenance | [`AI_HANDOFF.md`](engineering/AI_HANDOFF.md) | Select the document above by specific task |

<a id="事实来源优先级"></a>

## Source of truth priority

When the documentation is inconsistent with the implementation, first stop spreading the old statement and check it in the following order:

1. Database constraints and Prisma schema: `packages/database/prisma`. Reason: This is the actual boundary of persistent fields and acceptable states for the database.
2. Shared input contract: `packages/contracts/src`. Reason: HTTP input is subject to actual validator definition.
3. Pure domain rules and tests: `packages/domain/src`, `packages/domain/test`. Reason: Deterministic algorithms for amounts and sorting are implemented here.
4. API services and integration tests: `apps/api/src`, `apps/api/test`. Reason: Permissions, transactions, and compatibility behavior require evidence of actual call chains.
5. Current product and API documentation. Reason: The document is responsible for describing the implementation and does not create fields and interfaces independently.
6. Archive design, used only to understand historical decisions. Reason: The old routing, staging, and rules no longer apply to the current code.

When the document description is inconsistent with the current implementation, clean up and correct the document first; when it is necessary to change the existing behavior, implement it separately according to user authorization, and synchronize the code and testing. Reason: No functions will be added to this round of cleanup, and authorized work should not be repeatedly confirmed due to old document requirements.

<a id="归档"></a>

## Archive

[`archive/`](archive/) Saves records of historical designs, early implementations, and one-time inspections:

- [`INITIAL_ARCHITECTURE_PLAN.md`](archive/INITIAL_ARCHITECTURE_PLAN.md): Pre-coding architecture, ER diagrams, routing assumptions and stage plans.
- [`INITIAL_AI_DEVELOPMENT_PROMPT.md`](archive/INITIAL_AI_DEVELOPMENT_PROMPT.md): A one-time AI prompt initially used to start the project.
- [`CODE_REVIEW_2026-09-08.md`](archive/CODE_REVIEW_2026-09-08.md): 1.0.7 review and fix log.
- [`CODE_CLEANUP_2026-09-29.md`](archive/CODE_CLEANUP_2026-09-29.md): 1.13.7 repository cleanup inventory, implemented changes, and retained items.
- [`CODE_CLEANUP_2026-10-04.md`](archive/CODE_CLEANUP_2026-10-04.md): 1.18.4 repository-wide cleanup evidence, outdated rules and retention reasons.
- [`CODE_CLEANUP_2026-10-12.md`](archive/CODE_CLEANUP_2026-10-12.md): 1.25.1 repository-wide code review, dead code and duplicate implementation cleanup and verification evidence.
- [`LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.md`](archive/LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.md): Early 1.0.2 cross-project integration records.

All rules, routes, directories, and "to-be-implemented" in the archive are historical references only and are not current requirements. Reason: Keep these files for decision-making and version tracing, and do not allow one-time prompts to regain control of current maintenance.

Document responsibilities are shown in the task index above; version, verification and local development service rules are based on the root directories [`AGENTS.md`](../AGENTS.md) and [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md).
