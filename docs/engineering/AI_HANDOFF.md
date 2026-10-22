<a id="ai-接管指南"></a>

# AI Maintainer Handoff

**English** | **[简体中文](AI_HANDOFF.zh-CN.md)**

> Last verified: 2026-10-22 (America/New_York) · Current version: `1.34.5`

<a id="接手"></a>

## Taking over

1. Read `git status --short --branch`, follow the root [maintenance rules](../../AGENTS.md), and preserve other work. Reason: the workspace may contain uncommitted changes; maintenance requirements have one canonical entry point.
2. Select the relevant manual from the [documentation index](../README.md), then use `rg` to verify current source, contracts, and tests. Reason: manuals and archives guide navigation but cannot prove an implementation still exists.
3. Use [product rules](../product/PRODUCT.md) for business definitions, [architecture](ARCHITECTURE.md) for modules/transactions, [API](API.md) for interfaces, [development](DEVELOPMENT.md) for validation, and [UI design](UI_DESIGN.md) for visual maintenance. Reason: duplicating financial, caching, scheduling, and styling rules here would create inconsistent entry points.
4. Before frontend changes, read the UI guide's aesthetic goals, decision methods, known problems, and AI work sequence, then inspect the relevant layout and source. Reason: consistent variables alone do not preserve task order, mobile reading, or less-used pages.

<a id="独立交付物"></a>

## Independent deliverables

| Scope | Maintenance entry points | Reason |
| --- | --- | --- |
| Web/API and database migrations | [NAS deployment](../operations/NAS_DEPLOYMENT.md), [release checklist](../operations/RELEASE_CHECKLIST.md) | Local source and development servers do not prove a NAS upgrade; published migrations must remain forward-only. |
| LangBot plugin | [Plugin development](../../integrations/langbot-plugin/DEVELOPMENT.md), [bot manual](../operations/LANGBOT_WORK_BOT.md) | Manifest/YAML dynamically register entry points; plugin versions are independent of the app, and installed copies are not source. |
| Mac Messages agent | [Agent manual](../operations/MESSAGES_AGENT.md) | The installed agent and permission-bearing app run independently; NAS releases do not update attachment templates. |
| Security, backup, and recovery | [Security](../operations/SECURITY.md), [operations](../operations/OPERATIONS.md) | Credentials, databases, and sending state require separate verification and recovery boundaries. |
| Oracle free-instance monitor | [NAS monitor manual](../operations/ORACLE_MONITOR.md) | Only 2 OCPU / 12GB is authorized, without downsizing. Check the independent runner, OCI signing identity, persistent retry tokens, and notifications separately; an app release does not enable monitoring. |

<a id="交接"></a>

## Handover

- Report actual changes and validation, external dependencies, required migrations, and independent artifact updates; follow the [development guide](DEVELOPMENT.md) for local services. Reason: code tests cannot prove WeChat/SMS delivery, NAS state, or installed plugin versions.
- On an explicit `更新部署` (update deployment) request, complete the [default deployment workflow](../operations/NAS_DEPLOYMENT.md#default-update-deployment-process) through NAS acceptance and local service restart. Report the full SHA, release version, CI/NAS results, and actual elapsed time. Reason: release authorization covers the whole chain; a candidate image does not prove release tags or a NAS upgrade.
- Let CI run full verification and image building in parallel; locally perform only the manual's release prechecks. Reuse passed, unaffected checks, anonymous manifest verification, and deployment-script acceptance. Development full-check commands are not a serial release prerequisite; add evidence for failures, migrations, or packaging changes as specified. Reason: future maintainers must preserve this division of work rather than reintroduce duplicate full tests, local image builds, or probes.
- The standing meaning of documentation cleanup and repository cleanup review is defined in the [maintenance rules](../../AGENTS.md). Reason: these are reusable user requirements, not a temporary task record.
