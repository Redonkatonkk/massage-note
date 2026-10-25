<a id="github--ghcr--群晖部署"></a>

# GitHub → GHCR → Synology Deployment

**English** | **[简体中文](NAS_DEPLOYMENT.zh-CN.md)**

> Current version: `1.37.0` · Mirror: `ghcr.io/redonkatonkk/massage-note`
> Historical version changes can be viewed in a unified manner [`CHANGELOG.md`](../../CHANGELOG.md) and will not be accumulated repeatedly in this manual.

Standard release link:

```text
Submit locally and push main
  ├─ verify：Complete inspection and testing
  └─ build-nas-image：Production builds, candidate images, and caching
                ↓ Both are successful
publish-nas-image：for the same digest Release official label
                ↓
Back up and verify → NAS Pull version → Migrate/harden → renew mn → Health acceptance
```

Normal upgrade uses GHCR; `scripts/build-nas-image.sh` only generates offline tar when GHCR or NAS external network is unavailable. Reason: GHCR saves the corresponding submitted products, and offline tar is a backup path for network failures.

<a id="发布入口"></a>

## Release entrance

Release authorization and workspace retention follow [Maintenance Rules](../../AGENTS.md). This time the evidence is checked item by item [Release Check](RELEASE_CHECKLIST.md). The specific execution is in the following order. Reason: Copying the same release policy in multiple manifests will produce different versions, and the execution steps still need to be retained for repeated releases.

<a id="默认更新部署流程"></a>

## Default update deployment process

After the user explicitly requests "update deployment", subsequent AI will be executed continuously as shown below by default; when the user only requests to modify documents, code or test CI, the NAS will not be updated accordingly. Reason: Release authorization and verification scope respectively determine whether to switch to the production environment. Existing release authorization should not stop again and wait for the same confirmation after CI is successful.

| Sequence | Basis for execution and completion |
| --- | --- |
| 1. Confirm the scope | Check the Git status, handoff guide and CHANGELOG, keep irrelevant work; confirm that this submission contains the current workflow and Dockerfile, increment and synchronize the version. The release branch is still `main`. |
| 2. Local preflight | Run version, diff, Compose verification and staging area secret scan as follows; check the local link when the document changes. Types, tests, and builds that have passed the development phase and are not affected by subsequent changes will no longer be rerun in full. |
| 3. Submit and push | Only temporarily store the authorized content this time, submit and push `main`, record the complete SHA; do not use unverified `git add -A`. |
| 4. Waiting for official CI | Only one monitoring process remains for this full SHA; `verify` is in parallel with `build-nas-image`, and subsequently `publish-nas-image` must succeed. A green light or candidate tag for branch testing is not a substitute for an official release. |
| 5. Check the image | Do an anonymous manifest check for the official semantic version, check the corresponding digest and `linux/amd64`; no longer build or export tar locally. |
| 6. Update NAS | Run the existing DSM release script once to complete backup and verification, production configuration verification, migration/reinforcement, verification of actual image and original volume, container health, and three public network 200 checks. Only when everything is completed will it be considered online. |
| 7. Closing handover | Restart according to the development guide and keep the project Web 3000/API ready. By default, command line/API verification is used; report version, SHA, CI/NAS results, migration and backup results, and the time stipulated below. |

This sequence unifies the existing steps and does not add a new round of complete local testing, image building, branch benchmarking or browser acceptance. Only when CI fails can the failed items be reproduced; new migrations must be drilled on a copy of the production data; Dockerfile/dependency packaging changes must be supplemented with relevant image verification; only go offline for backup if GHCR or NAS external network is unavailable. Reason: Speed comes from deduplicating work, and backups, migrations, permission hardening and health checks are always retained.

When the DSM script is successful and the acceptance output is complete, the probe or public network request will not be executed repeatedly; if it fails, the output is missing, or the status is abnormal, it will be diagnosed separately. The script is not distributed with the repository. If it does not exist on the newly acquired machine, follow the same steps in this manual and retain complete evidence. Reason: Native accessibility tools are not available on every computer, but their absence is not a reason to skip production inspections.

<a id="秘密边界"></a>

## Secret border

The GitHub repository and GHCR can be made public, production secrets cannot enter either. Reason: Public builds do not require server-side secrets, and credentials cannot be revoked by simply deleting files after a leak.

| Configuration | Secret or not | Save location | Enter image building |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` four items | No, visible to the browser | GitHub Repository Variables, native `.env` | Yes |
| Firebase Admin private key/email | Yes | Local `.env`, NAS environment | No |
| MiniMax API key | Yes | Native `.env`, NAS environment | No |
| PostgreSQL/Redis password | Yes | NAS environment | No |
| DSM credentials, GitHub token | Yes | System keychain | No |

Root directories `.env` and `.local-ai/` must be ignored by Git, and sensitive local file permissions should be `0600`. Don't write real values into Markdown, scripts, Compose samples, Actions logs, Issues, or chat responses. Reason: These files contain local and production credentials and cannot be made public source or logs.

```bash
git check-ignore -v .env .local-ai/DEPLOYMENT_SECRETS.md
stat -f '%N mode=%Lp' .env .local-ai/DEPLOYMENT_SECRETS.md
git status --short
```

<a id="一次性-github-设置"></a>

## One-time GitHub setup

### Repository Variables

Configure in `Settings → Secrets and variables → Actions → Variables`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

These are browser public configurations. Don't put Firebase Admin, MiniMax, database, or DSM credentials into GitHub build variables. Reason: The browser configuration is inherently public, and the Admin and database credentials have no build-time use.

The CLI can read items from standard input without writing the values to the command line:

```bash
gh variable set NEXT_PUBLIC_FIREBASE_API_KEY --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_APP_ID --repo Redonkatonkk/massage-note
```

<a id="ghcr-可见性"></a>

### GHCR Visibility

Repository publicity is not equal to Package publicity. After publishing the workflow for the first time, set Package to Public in `Packages → massage-note → Package settings → Change visibility`. GitHub REST API does not support modifying Package visibility. Do not try to use `PATCH /user/packages/...` to bypass web page confirmation. Reason: Packages have independent access control, and anonymous NAS pulls need to be publicly readable.

Anonymous verification uses an isolated Docker configuration to avoid false positives caused by local login:

```bash
release_version=$(tr -d '[:space:]' < VERSION)
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" \
  docker manifest inspect "ghcr.io/redonkatonkk/massage-note:$release_version" >/dev/null
rmdir "$task_docker_config"
```

If that fails, fix Package visibility first; do not write personal access tokens to NAS Compose. Reason: Anonymous permissions should be addressed by Package settings, NAS does not require long-term personal tokens.

<a id="每次发布到-github"></a>

## Every time you publish to GitHub

<a id="本地检查"></a>

### Local check

Version labels are immutable artifacts. Any changes to be released must first increment the version and synchronize the version file: Reason: Upgrades and rollbacks need to target the immutable version and cannot overwrite old tags.

```bash
pnpm version:check
pnpm docs:check # 本次包含 Markdown 变化时运行
git diff --check
git status --short
docker compose --env-file .env.nas.example -f docker-compose.nas.yml config --quiet
```

Ordinary update deployment only performs the above pre-check and secret scanning of the staging area, and complete type checking, unit/integration testing and production builds are undertaken by CI. During the development phase, necessary verification is still required for changes; new migrations must still be practiced on the production data copy. Reproduce the failed items when CI fails; additionally build local images when publishing offline or when Dockerfile/dependency packaging logic changes. Reason: Full verification is required for submission to CI, and relevant local evidence is required for migration and packaging changes.

Streamlined process: pre-checking and submission → waiting for CI/GHCR corresponding to the complete SHA → one anonymous manifest verification → one DSM release script → native closing. `.local-ai/dsm-release-1.1.1.mjs` has been responsible for backup verification, production Compose verification, migration/reinforcement, container and volume verification, three public network 200 checks, temporary container cleanup and exiting the session; no more probe or public network requests will be run again when the successful output is complete. Independent diagnosis is made only when there is failure, missing output or abnormal status. Backups, migrations, and health checks are always retained. Reason: The existing local publishing script already completes these checks and does not need to be repeated when successful logging is complete.

After temporary storage, check the file and secret scan, and then submit:

```bash
git diff --cached --name-only
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git commit -m "描述本次变化"
git push origin main
```

Don't use `git add -A` without checking, and don't commit `.env`, `.local-ai/`, `artifacts/`, or user's temporary files. Reason: The staging area should only contain authorized content and should not contain other tasks and secrets.

<a id="等待对应-ci"></a>

### Waiting for corresponding CI

On non-PR `main` events, `.github/workflows/ci.yml` runs `verify` and `build-nas-image` in parallel. The build creates a commit-specific candidate image; `publish-nas-image` promotes that same digest to release tags only after both jobs succeed. Branch/PR builds retain production-build verification without publishing release tags.

Push-triggered CI runs on branches only; creating a Release tag does not rerun verification of the same commit. Pull requests and manual dispatch remain available. Reason: the branch workflow already verifies the release commit, so tag creation should not duplicate the full suite. See the [GitHub Actions branch/tag filter reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore).

The image build is responsible for the production build check of this type of run, and `verify` will no longer build again; ordinary branch push and PR will continue to perform production builds within `verify`. Depend on the lock file and workspace installation configuration `pnpm fetch` first, and then install it offline; GHCR `buildcache-main` saves the middle layer, and only writes `buildcache-benchmark` for manual branch testing. Reason: Package version increments should not download dependencies repeatedly, and benchmarks cannot override the official build cache. The solution is based on [pnpm fetch](https://pnpm.io/cli/fetch) and [Docker registry cache](https://docs.docker.com/build/cache/backends/registry/).

You need to measure the image build time on an independent branch. You can run it manually:

```bash
gh workflow run ci.yml --repo Redonkatonkk/massage-note \
  --ref <branch> -f build_nas_image=true
```

The actual branch test only generates `ci-<run_id>-<attempt>` candidate images, does not generate formal labels, and does not update NAS; complete verification and image building will be performed. After each run, `report-timing` takes time in the run summary recording phase; the end-to-end time is calculated from run creation to completion, and the first new cache and subsequent reuse should be recorded separately. Reason: Timings must include actual checking and caching overhead, and hot caching or branched builds cannot be passed off as full production deployments.

The above manual branch measurement is only used to verify the turnover line modification or troubleshooting performance. For ordinary releases, push `main` directly without additional testing. Reason: Regular release itself already has complete CI and stage time consumption. Repeated speed testing will increase waiting and CI consumption.

```bash
release_sha=$(git rev-parse HEAD)
run_id=$(gh run list --repo Redonkatonkk/massage-note --workflow ci.yml \
  --branch main --commit "$release_sha" --json databaseId --jq '.[0].databaseId')
test -n "$run_id"
gh run watch "$run_id" --repo Redonkatonkk/massage-note --interval 30 --exit-status
```

If the running record has not yet appeared, try again after 15–30 seconds. You must limit `main` and use the complete SHA to avoid selecting the branch benchmark of the same submission or failing to find the record due to a short SHA. Maintain a single monitoring process to avoid repeatedly establishing polling; report changes according to stages. Reason: CI creates run records asynchronously, and the official branch is co-located with the full SHA for this release.

Successful products include:

- Semantic version tag: For formal deployment.
- `latest`: For observation only, not pinned to production.
- `sha-xxxxxxx`: Accurately associate submission and troubleshooting.

Confirm the anonymous version manifest and platform once (replacing the previous existence example and not repeating it):

```bash
release_version=$(tr -d '[:space:]' < VERSION)
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" docker manifest inspect --verbose "ghcr.io/redonkatonkk/massage-note:$release_version"
rmdir "$task_docker_config"
```

The target platform must be `linux/amd64`. Reason: The current Synology image target is linux/amd64.

<a id="发布计时与交接"></a>

### Release timing and handover

The time is recorded starting from the local release preflight. After completion, the following ranges are distinguished, and the time consuming of parallel jobs is not added up:

| Indicators | Timing Range |
| --- | --- |
| Total CI time | Corresponding to the creation of the complete SHA operation until all jobs are completed, including queuing, cache saving, official label release and timing summary; each job time is also read from the running summary. |
| NAS time-consuming | DSM release script or equivalent operations start to completion of backup, migration, application update and all online acceptance. |
| Total time spent on update deployment | From the start of local release pre-inspection to NAS acceptance and local service closing, all are completed. |

The handover also gives the version, full SHA, CI running link, official label release status, NAS actual version, migration/backup and health results. Stages that have not been executed or measured are clearly marked and do not fill in estimated values; branch speed measurement must indicate that formal label release and NAS updates are not included, and distinguish between first cache and cache reuse. Reason: The actual measurement scope must be traceable, and a single CI result is not a complete release time-consuming or future time-consuming commitment.

<a id="第一次创建-nas-项目"></a>

## Creating a NAS project for the first time

1. Save `docker-compose.nas.yml` in the controlled directory of the NAS and `.env` that only exists on the NAS. Reason: Production configuration is only saved on the managed host, not the actual values from the public repository.
2. Use `.env.nas.example` as a template, fill in random and different PostgreSQL, application account and Redis password, and then fill in the runtime Firebase/MiniMax secret. Reason: Templates display key names instead of production credentials, and the runtime environment is responsible for server-side secrets.
3. `MASSAGE_NOTE_IMAGE_TAG` uses the verified semantic version; `APP_HTTP_PORT` can be set to `3100` by default, and `WEB_ORIGIN` fills in the real HTTPS Origin. Reason: The version and actual HTTPS Origin determine the running product and session origin respectively.
4. Container Manager creates a new project, and the project name is fixed to `mn`. Reason: The project name determines the Compose naming volume and the existing production data binding mn.
5. The reverse proxy forwards the HTTPS entry to the local application port of the NAS; the database, Redis and internal API are not open to the public network. Reason: Outer layer TLS and private network port constitute the current security entrance.

Do not create a second Compose project name, otherwise another set of PostgreSQL/Redis named volumes will be generated, which will look like "data loss". Existing production environments must retain the project `mn` and its volume name. Reason: The new project will create a new database volume, which cannot be used to replace the original business data.

<a id="本地-mac信息代理"></a>

### Native Mac Messages agent

NAS only saves tasks and provides HTTPS API, and cannot directly control the Messages App on the remote Mac from the container or browser. The local Mac's LaunchAgent uses the store proxy token to actively access `https://<production-domain>/api/v1`, receive tasks, and then call Messages through the local `/usr/bin/osascript`; the NAS does not need to access the Mac, nor does it need to open the inbound port for the agent. Reason: The Mac automatically receives it and does not require the NAS to obtain native App control permissions.

Fixed Mac installation, full disk access, attachment routing, and troubleshooting steps are unified in [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md). Deploying the NAS itself does not require any macOS components to be installed. Reason: Agents are independent deliverables, and specific permission rules are only maintained in the agent manual.

<a id="每日异地恢复包"></a>

## Daily off-site recovery package

See standalone Google Drive directories, New York midnight tasks, encryption keys, and Mac on-demand recovery [Disaster Recovery Manual](DISASTER_RECOVERY.md). The backup runner is installed independently and does not update `mn` Application mirroring; it will be enabled only after real upload, complete readback and isolation recovery pass. Reason: Pre-launch database backups are not a substitute for a daily disaster recovery package that includes configuration and offline images, nor are creation scripts proof of availability.

<a id="每次升级-nas"></a>

## Upgrade your NAS every time

The functions, migration and acceptance of this version focus on checking the top of [`CHANGELOG.md`](../../CHANGELOG.md) first; when there is database migration, check the migration file and release list at the same time.

<a id="备份"></a>

### Backup

Export PostgreSQL before upgrading and verify that the file is not empty and gzip is complete. Production PostgreSQL volumes must not be deleted or rebuilt. Reason: Migration may modify data, and rollback images cannot replace available backups.

```bash
cd /volume1/docker/massage-note-v2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > backup-before-upgrade.sql.gz
gzip -t backup-before-upgrade.sql.gz
sha256sum backup-before-upgrade.sql.gz > backup-before-upgrade.sql.gz.sha256
```

When performing backups remotely via DSM Task Scheduler, use a one-time "user-defined script" task and run as `root`:

1. The task script sequentially performs `pg_dump`, non-null check, `gzip -t` and SHA-256 generation. Reason: Non-empty, compression integrity and checksum respectively provide backup evidence.
2. Read the task history after manual operation. Only `exit_type=normal` and `exit_code=0` will be considered successful. Reason: The success of the task request does not mean that pg_dump has been executed.
3. Remove the one-time tasks but keep the `.sql.gz` and `.sha256` files. Reason: Temporary remote execution permissions should be cleared and the recovery product still needs to be retained.

Just because the administrator account has the highest permissions does not mean that any API session can create root tasks. DSM 7 may trigger Adaptive MFA for administrators logging in from a new device on the public network: normal API login, project query, and `PasswordConfirm` may all succeed, but the root Task Scheduler still returns `105`. Do not turn off security or skip backups; complete 2-step verification/device trust on the same deployment computer's DSM page before retrying the one-time task. If it still returns `105`, stop publishing and manually check DSM's login protection and task scheduling permissions. Reason: Existing DSM login protection affects task permissions and protection cannot be bypassed due to backup failure.

Production should also regularly perform encrypted logical backups and independent recovery drills according to [`OPERATIONS.md`](OPERATIONS.md); temporary upgrade backups cannot replace recovery drills. Reason: Pre-upgrade snapshots do not demonstrate independent recovery capabilities.

<a id="拉取与更新"></a>

### Pull and update

Put NAS `.env` of `MASSAGE_NOTE_IMAGE_TAG` Change to a version that has been verified to exist.`app`, `migrate`, `harden` Must reference the same tag: Reason: app and migration/reinforcement must run the same version of code and database structure.

```bash
cd /volume1/docker/massage-note-v2
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.nas.yml ps
```

The equivalent operation for the Container Manager UI is to open `mn` → Edit Compose/Environment → Update Version Tag → Build/Launch. Do not select "Delete items and delete data". Reason: Deleting projects and data will destroy existing production volumes, updates only replace applications.

If updating automatically via DSM API:

- Each time the current ID is queried according to the project name `mn`, the temporary UUID is not permanently recorded. Reason: The temporary ID may change, and the fixed project name is the repositionable entry.
- The current Compose response contains production secrets and can only write to temporary files with permissions `0600`, disabling full output. Reason: The complete response contains the environment secret, and temporary storage also requires restricted permissions.
- Only replace the application image tag, do not overwrite production passwords, domains, volumes or environments with repository examples. Reason: The sample configuration cannot cover the real domain name, credentials, and original volume.
- `Project.update` may only save Compose and will not automatically replace the running container; after the update is successful, you must call the project build and wait for the build stream to clearly succeed or fail. Reason: Saving the configuration does not mean that the running container has been replaced, and the execution result is confirmed by the build stream.
- The Compose text shows that the target label does not mean that the deployment is completed; read `Config.Image` from the project container details and confirm that the actual images of `app`, `migrate`, and `harden` are all target versions. Reason: Running the Config.Image of the container proves the actual product used.
- Regardless of the result, exit the API session and clean up temporary files. Reason: Sessions and temporary files containing secrets should not be left behind after deployment ends.

Diagnostic output uses a field whitelist that only allows output of project/service names, image labels, status, health status, exit codes, and environment variable key names. The `environment`, `command`, healthcheck, URL and API exception response of the produced Compose may carry secrets; it is forbidden to rely on regular masking after outputting the complete Compose. Temporarily set Compose and response file permissions to `0600`, delete them immediately after completion, and clear the credentials in the clipboard. Reason: Wrong objects and complete configurations may carry secrets, and covering them up afterward cannot guarantee that they will not be leaked.

Normal status: `postgres`, `redis`, `app` are running/healthy; `migrate`, `harden` are exited (0). Container Manager may summarize the normal exit of a one-time container into a WARNING, which should be based on the exit code and long-term container health.

<a id="上线验收"></a>

### Online acceptance

```bash
curl --fail 'https://<production-domain>/'
curl --fail 'https://<production-domain>/api/v1/health'
curl --fail 'https://<production-domain>/api/v1/health/ready'
```

Also confirm:

- The actual images of `app`, `migrate` and `harden` are all target versions. Reason: Both the application and the one-time service must correspond to the same target version.
- The original PostgreSQL/Redis volume name remains unchanged. Reason: The volume name determines the actual data location. Changing the volume will lose business visibility.
- Three long-term containers are healthy, and two one-time tasks have exit codes of 0. Reason: The normal exit of a one-time task is different from the healthy use of long-term services.
- Users complete the business acceptance related to changes in this version by themselves; automatic deployment only performs command line/API checks by default, and uses the browser only when explicitly required. Reason: The actual business and external device effects are verified by the user, and browser verification is not performed by default.
- If the browser still displays the old interface, force refresh and clear the old cache of the site first, and do not blindly rerun the migration. Reason: The old client cache does not mean that the database migration failed.

<a id="回滚"></a>

## Rollback

Application rollback only modifies the mirror label and does not delete the volume: Reason: Rolling back the application cannot delete persistent business data.

```bash
# 手工把 .env 中 MASSAGE_NOTE_IMAGE_TAG 改为已知正常的旧版本后：
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
```

If the new version performs backward-incompatible migrations, the application cannot be rolled back blindly. Restore a compatible version according to the migration design, or verify the backup recovery on an independent database first; deleting migration records or production volumes is prohibited. Reason: Incompatible migration requires restoring compatible schema or verified backup, and history cannot be deleted to cover up changes.

<a id="公开前秘密扫描"></a>

## Secret scan before publication

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git /repo --redact=100 --no-banner
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git ls-files | rg '(^|/)\.env($|\.)' || true
git status --short
```

If the secret has ever entered Git history, it must be undone/rotated first, and then the history is cleared; deleting the current file is not enough. Reason: Published secrets must be revoked, and deleting the current file cannot clear Git history.

<a id="离线备用"></a>

## Offline backup

When only GHCR or NAS external network is unavailable: Reason: Local offline build is not an extra repetitive step for normal release.

```bash
pnpm version:check
./scripts/build-nas-image.sh
release_version=$(tr -d '[:space:]' < VERSION)
shasum -a 256 -c "artifacts/massage-note-$release_version-linux-amd64.tar.sha256"
```

Import in Container Manager's "Image → New → New from File". Return to the GHCR process after restoring the network.

<a id="常见问题"></a>

## FAQ

| Phenomenon | Treatment |
| --- | --- |
| repository is public but anonymous pull is still unauthorized | GHCR Package is still private, modify it separately Package visibility |
| Empty `DOCKER_CONFIG` not found `buildx` | Anonymous inspection using `docker manifest inspect` |
| CI local machine passed, GitHub failed | Clean runner is missing the generated creature or environment; fix pre-hook/service, do not upload `.env` |
| Container Manager displays WARNING | First confirm whether `migrate`/`harden` is exited (0) |
| root Task Scheduler returns 105 | The administrator's new device session on the public network may be restricted by Adaptive MFA; first complete the secondary verification/device trust on the DSM page, then try again, and do not skip the backup |
| The update request returns but the version is still online | `Project.update` may only save Compose; continue to execute build, wait for stream, and check the container `Config.Image` |
| Like data loss after going online | Check the project name and volume name first; do not delete any volumes |

<a id="多设备同步与-sse-排查"></a>

## Multi-device synchronization and SSE troubleshooting

The official entrance must continue to be transparently transmitted `/api/v1/stores/:storeId/events` of `text/event-stream` Responses cannot be cached, aggregated, or wait for the request to complete before forwarding. API has returned `X-Accel-Buffering: no` and disable caching/conversion instructions; you need to confirm that Synology and external proxies do not ignore these headers. If you manage your own Nginx, turn off SSE routing. `proxy_buffering`, `proxy_cache`, read timeout is at least 75 seconds, and avoid compression and aggregation of streams; do not directly overwrite configuration examples into Synology automatically generated files. Reason: SSE events require continuous forwarding, and proxy caching will keep multiple devices reading the old state.

During the investigation, use two devices with the same account to log in to the same store, and both parties stay at the front desk. Checking the events request in the developer tool Network is 200, the type is text/event-stream, and a heartbeat is received about every 2 seconds. It is normal for requests to be pending for a long time; if HTTP has been established but there are no persistent events, you need to compare the internal API and HTTPS entries respectively to locate proxy buffering/timeout or API query issues. Do not copy login cookies or tokens to logs, documents, or tickets. Reason: Responding to open but not persisted events does not prove synchronization, true multi-device checking should be performed by the user.

Verify that adding, editing, deleting and restoring can request time-consuming updates in about 2-3 seconds on another device, and then verify locking the screen, switching applications and network recovery. The front end will reconnect after 10 seconds of no messages, and low-frequency supplementary reading will be performed during the abnormal period, but this cannot replace the repair of the proxy link. The 30-second back-up sync for late database commits is still retained. By default, the command line/API is used to check the local event stream and health status, and the effect of multi-device pages is checked by the user; only use the browser when required. Release authorization is subject to maintenance rules. Reason: Front-end retry is a failure recovery measure and cannot replace repairing the proxy link.
