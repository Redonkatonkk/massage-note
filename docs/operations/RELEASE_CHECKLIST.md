<a id="发布检查清单"></a>

# Release Checklist

**English** | **[简体中文](RELEASE_CHECKLIST.zh-CN.md)**

For release authorization, please follow [Maintenance Rules](../../AGENTS.md), and for execution steps, please follow [NAS Manual](NAS_DEPLOYMENT.md); for ordinary Linux deployment, use [Deployment Overview](DEPLOYMENT.md). The list only maintains release evidence, and the business definitions can be found in [Product Rules](../product/PRODUCT.md). Reason: Publishing lists should no longer replicate color schemes, card placements, or financial formulas that easily become outdated.

When the user asks for "Update Deployment" press [Default update deployment process](NAS_DEPLOYMENT.md#default-update-deployment-process) Execution; this list is used to record results and does not constitute an additional round of local complete verification or branch benchmarking. Reason: Valid evidence for the same submission can be reused, and the release entry must be consistent.

<a id="构建与数据"></a>

## Build and data

- [ ] The version file, CHANGELOG, and document tags are consistent, and `pnpm version:check`, `pnpm docs:check`, and `git diff --check` pass. Reason: The source code and delivery entry must correspond to the same version.
- [ ] The `verify`, `build-nas-image` and `publish-nas-image` of this complete commit SHA are all successful, and the Compose expansion is valid; the checks that have passed and are not affected by subsequent changes are not repeated. Reason: Another commit or the green light of only a branch candidate image does not prove the official product. Full verification is undertaken by parallel CI.
- [ ] The fixed version of the GHCR manifest can be read anonymously and the platform is `linux/amd64`. Reason: NAS pull does not rely on local login, and the image architecture must match the operating environment.
- [ ] The new migration has been drilled on the production copy; the backup before release is non-empty and verified to be valid, and the independent recovery drill is recorded. Reason: Mirror rollback cannot reverse incompatible database changes, and the existence of backup does not mean that it can be restored.
- [ ] The database migration/running account is separated, and the original project and volume name are retained. Reason: Permission hardening and existing data cannot be replaced by new accounts or new volumes during updates.

<a id="配置与安全"></a>

## Configuration and security

- [ ] HTTPS, accurate Origin, Firebase, intranet port and proxy configuration comply with [Security Instructions](SECURITY.md). Reason: Cookie, login, and cross-store permissions rely on full production configuration.
- [ ] The production and development login is closed, and the temporary changes are completed to complete the secret scan; the complete history scan is executed after the first disclosure or history rewriting, and will not be repeated when there is a valid record. Reason: Prevent development credentials or production secrets from entering public source code and images while avoiding repeated scans without changes.
- [ ] SSE does not buffer, retains event headers, and supports the existing 8 MB limit for recording requests. Reason: Successful return from the interface may also be truncated or delayed by the proxy. Streaming and audio requests must be configured separately.

<a id="业务与独立交付物"></a>

## Business and independent deliverables

- [ ] Role/cross-store isolation, amount snapshots, failed rollbacks and conflicts were checked based on this change, and the relevant automated tests passed. Reason: Consolidation cannot change existing authorizations and accounts, and the business scope is determined by current product documentation and testing.
- [ ] Users complete real business acceptance related to this change; default code, command line/API verification, and use the browser only when specific requirements are required. Reason: This is the scope of user verification, and local builds cannot prove real device effects.
- [ ] When involving Mac agent or LangBot, check the installed product and actual running version; the actual sending result will be confirmed separately. Reason: NAS updates do not upgrade independent processes, and AppleScript accept delivery does not prove delivery.

<a id="上线后"></a>

## After going online

- [ ] The actual image of `app`, `migrate`, `harden` is the target version; the project `mn` is retained with the original PostgreSQL/Redis volume. Reason: Saving the Compose label does not mean that the container has been replaced. Changes in the project name will create a new database volume.
- [ ] Long-term container health, one-time tasks exited (0), Web and API liveness/readiness checks passed. Reason: Launch, migration, and dependency availability require different evidence.
- [ ] Record version, migration, time, executor and rollback judgment, observe errors, disk, backup and delivery costs. Reason: Fault location and recovery need to correspond to this actual release, not historical operating records.
- [ ] According to the manual, the total time taken to hand over CI, NAS and update deployment respectively, with complete SHA and running links; the unexecuted/unmeasured stage and cache status are clearly marked. Reason: Parallel jobs should not be added together, and branch benchmarking cannot pretend that formal deployment is completed.
