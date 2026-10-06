# GitHub → GHCR → 群晖部署

> 当前版本：`1.19.1` · 镜像：`ghcr.io/redonkatonkk/massage-note`
> 历史版本变化统一查看 [`CHANGELOG.md`](../../CHANGELOG.md)，不在本手册重复累积。

标准发布链路：

```text
本机提交并 push main
        ↓
GitHub Actions 完整验证
        ↓
构建 linux/amd64 镜像并推送 GHCR
        ↓
群晖 Container Manager 拉取版本标签并更新 mn 项目
```

正常升级使用 GHCR；`scripts/build-nas-image.sh` 只在 GHCR 或 NAS 外网不可用时生成离线 tar。保留原因：GHCR 保存对应提交产物，离线 tar 是网络故障备用路径。

## 发布入口

发布授权及工作区保留遵循 [维护规则](../../AGENTS.md)，本次证据逐项核对 [发布检查](RELEASE_CHECKLIST.md)，具体执行按下文顺序。保留原因：同一发布政策在多个清单复制会产生不同版本，执行步骤仍需保留以便重复发布。

## 秘密边界

GitHub 仓库和 GHCR 可以公开，生产秘密不能进入二者。保留原因：公开构建无需服务端秘密，泄露后仅删除文件不能撤销凭据。

| 配置 | 是否秘密 | 保存位置 | 进入镜像构建 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` 四项 | 否，浏览器可见 | GitHub Repository Variables、本机 `.env` | 是 |
| Firebase Admin 私钥/邮箱 | 是 | 本机 `.env`、NAS 环境 | 否 |
| MiniMax API key | 是 | 本机 `.env`、NAS 环境 | 否 |
| PostgreSQL/Redis 密码 | 是 | NAS 环境 | 否 |
| DSM 凭据、GitHub token | 是 | 系统钥匙串 | 否 |

根目录 `.env` 与 `.local-ai/` 必须被 Git 忽略，敏感本地文件权限应为 `0600`。不要把真实值写进 Markdown、脚本、Compose 示例、Actions 日志、Issue 或聊天回复。保留原因：这些文件含本机和生产凭据，不能成为公开源码或日志。

```bash
git check-ignore -v .env .local-ai/DEPLOYMENT_SECRETS.md
stat -f '%N mode=%Lp' .env .local-ai/DEPLOYMENT_SECRETS.md
git status --short
```

## 一次性 GitHub 设置

### Repository Variables

在 `Settings → Secrets and variables → Actions → Variables` 配置：

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

这些是浏览器公开配置。不要把 Firebase Admin、MiniMax、数据库或 DSM 凭据放入 GitHub 构建变量。保留原因：浏览器配置本来公开，Admin 与数据库凭据没有构建期用途。

CLI 可以从标准输入逐项读取而不把值写进命令行：

```bash
gh variable set NEXT_PUBLIC_FIREBASE_API_KEY --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_APP_ID --repo Redonkatonkk/massage-note
```

### GHCR 可见性

仓库公开不等于 Package 公开。首次工作流发布后，在 `Packages → massage-note → Package settings → Change visibility` 把 Package 设为 Public。GitHub REST API 不支持修改 Package visibility，不要尝试用 `PATCH /user/packages/...` 绕过网页确认。保留原因：Package 有独立访问控制，匿名 NAS 拉取需要公开可读。

匿名验证使用隔离的 Docker 配置，避免本机登录造成假阳性：

```bash
release_version=$(tr -d '[:space:]' < VERSION)
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" \
  docker manifest inspect "ghcr.io/redonkatonkk/massage-note:$release_version" >/dev/null
rmdir "$task_docker_config"
```

如果失败，先修正 Package 可见性；不要把个人访问令牌写入 NAS Compose。保留原因：匿名权限应由 Package 设置解决，NAS 无需长期个人令牌。

## 每次发布到 GitHub

### 本地检查

版本标签是不可变产物。任何准备发布的变化都先递增版本并同步版本文件：保留原因：升级与回滚需定位不可变版本，不能覆盖旧标签。

```bash
pnpm version:check
git diff --check
git status --short
docker compose --env-file .env.nas.example -f docker-compose.nas.yml config --quiet
```

普通更新部署只做以上预检与暂存区秘密扫描，完整类型检查、单元/集成测试和生产构建由 CI 承担。开发阶段仍按改动做必要验证；新增迁移仍须在生产数据副本演练。CI 失败时针对失败项复现；离线发布或 Dockerfile/依赖打包逻辑变化时才额外构建本地镜像。保留原因：对应提交 CI 承担完整验证，迁移和打包变化另需相关本地证据。

精简流程：预检与提交 → 等待对应完整 SHA 的 CI/GHCR → 一次匿名 Manifest 校验 → 一次 DSM 发布脚本 → 本机收尾。`.local-ai/dsm-release-1.1.1.mjs` 已负责备份验证、生产 Compose 校验、迁移/加固、容器与卷校验、三个公网 200 检查、临时容器清理和退出会话；成功输出完整时不再重复运行 probe 或公网请求。失败、输出缺失或状态异常时才独立诊断。备份、迁移和健康检查始终保留。保留原因：现有本地发布脚本已完成这些检查，成功记录完整时不必重复执行。

暂存后检查文件与秘密扫描，再提交：

```bash
git diff --cached --name-only
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git commit -m "描述本次变化"
git push origin main
```

不要未经检查使用 `git add -A`，也不要提交 `.env`、`.local-ai/`、`artifacts/` 或用户的临时文件。保留原因：暂存区应只含获授权发布内容，不应夹带其他任务与秘密。

### 等待对应 CI

`.github/workflows/ci.yml` 先运行 `verify`，只有 `main` 的非 PR 事件验证通过后才运行 `publish-nas-image`。

```bash
release_sha=$(git rev-parse HEAD)
run_id=$(gh run list --repo Redonkatonkk/massage-note --workflow ci.yml \
  --commit "$release_sha" --json databaseId --jq '.[0].databaseId')
test -n "$run_id"
gh run watch "$run_id" --repo Redonkatonkk/massage-note --interval 30 --exit-status
```

运行记录尚未出现时隔 15–30 秒重试，必须使用完整 SHA，避免短 SHA 查不到记录。保持单个监控进程，避免重复建立轮询；按阶段变化汇报。保留原因：CI 异步创建运行记录，完整 SHA 才能精确关联本次提交。

成功产物包含：

- 语义版本标签：正式部署使用。
- `latest`：仅用于观察，不固定到生产。
- `sha-xxxxxxx`：精确关联提交和排错。

一次确认匿名版本 manifest 与平台（替代前面的存在性示例，不重复执行）：

```bash
release_version=$(tr -d '[:space:]' < VERSION)
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" docker manifest inspect --verbose "ghcr.io/redonkatonkk/massage-note:$release_version"
rmdir "$task_docker_config"
```

目标平台必须是 `linux/amd64`。保留原因：当前群晖镜像目标为 linux/amd64。

## 第一次创建 NAS 项目

1. 在 NAS 的受控目录保存 `docker-compose.nas.yml` 和只存在 NAS 的 `.env`。保留原因：生产配置只保存于受控主机，不来自公开仓库的真实值。
2. 以 `.env.nas.example` 为模板，填写随机且互不相同的 PostgreSQL、应用账号和 Redis 密码，再填运行时 Firebase/MiniMax 秘密。保留原因：模板展示键名而非生产凭据，运行环境负责服务端秘密。
3. `MASSAGE_NOTE_IMAGE_TAG` 使用已验证的语义版本；`APP_HTTP_PORT` 默认可设为 `3100`，`WEB_ORIGIN` 填真实 HTTPS Origin。保留原因：版本与实际 HTTPS Origin 分别决定运行产物和会话来源。
4. Container Manager 新建项目，项目名固定为 `mn`。保留原因：项目名决定 Compose 命名卷，现有生产数据绑定 mn。
5. 反向代理把 HTTPS 入口转发到 NAS 本机的应用端口；数据库、Redis 和内部 API 不对公网开放。保留原因：外层 TLS 和私网端口组成当前安全入口。

不要新建第二个 Compose 项目名，否则会生成另一套 PostgreSQL/Redis 命名卷，看起来像“数据丢失”。已有生产环境必须保留项目 `mn` 及其卷名。保留原因：新项目会另建数据库卷，不能用它替换原业务数据。

### 本地 Mac“信息”代理

NAS 只保存任务并提供 HTTPS API，不能从容器或浏览器直接控制远端 Mac 的“信息”App。本地 Mac 的 LaunchAgent 使用店铺代理令牌主动访问 `https://<production-domain>/api/v1`、领取任务，再通过本机 `/usr/bin/osascript` 调用“信息”；NAS 无需访问 Mac，也不需要为代理开放入站端口。保留原因：Mac 主动领取，不需要 NAS 获得本机 App 控制权限。

固定 Mac 的安装、完全磁盘访问权限、附件路由和排障步骤统一见 [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md)。部署 NAS 本身不需要安装任何 macOS 组件。保留原因：代理是独立交付物，具体权限规则只在代理手册维护。

## 每次升级 NAS

本次版本的功能、迁移和验收重点先查 [`CHANGELOG.md`](../../CHANGELOG.md) 顶部；有数据库迁移时同时核对迁移文件与发布清单。

### 备份

升级前导出 PostgreSQL，并验证文件非空且 gzip 完整。不得删除或重建生产 PostgreSQL 卷。保留原因：迁移可能修改数据，回滚镜像不能替代可用备份。

```bash
cd /volume1/docker/massage-note-v2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > backup-before-upgrade.sql.gz
gzip -t backup-before-upgrade.sql.gz
sha256sum backup-before-upgrade.sql.gz > backup-before-upgrade.sql.gz.sha256
```

通过 DSM Task Scheduler 远程执行备份时，使用一次性“用户定义的脚本”任务，并以 `root` 运行：

1. 任务脚本依次执行 `pg_dump`、非空检查、`gzip -t` 和 SHA-256 生成。保留原因：非空、压缩完整性与校验和分别提供备份证据。
2. 手动运行后读取任务历史，只有 `exit_type=normal` 且 `exit_code=0` 才算成功。保留原因：任务请求成功不代表 pg_dump 已经执行完成。
3. 删除一次性任务，但保留 `.sql.gz` 和 `.sha256` 文件。保留原因：临时远程执行权限应清理，恢复产物仍需保留。

管理员账号拥有最高权限并不代表任意 API 会话都能创建 root 任务。DSM 7 对管理员从公网新设备登录可能触发 Adaptive MFA：普通 API 登录、项目查询和 `PasswordConfirm` 都可能成功，而 root Task Scheduler 仍返回 `105`。不要关闭安全保护或跳过备份；先在同一台部署电脑的 DSM 页面完成二次验证/设备信任，再重试一次性任务。若仍返回 `105`，停止发布并人工检查 DSM 的登录保护与任务计划权限。保留原因：现有 DSM 登录保护影响任务权限，不能因备份失败绕过保护。

生产还应按 [`OPERATIONS.md`](OPERATIONS.md) 定期执行加密逻辑备份和独立恢复演练；临时升级备份不能代替恢复演练。保留原因：升级前快照不证明独立恢复能力。

### 拉取与更新

把 NAS `.env` 的 `MASSAGE_NOTE_IMAGE_TAG` 改为已经验证存在的版本。`app`、`migrate`、`harden` 必须引用同一个标签：保留原因：app 与迁移/加固须运行同版代码和数据库结构。

```bash
cd /volume1/docker/massage-note-v2
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.nas.yml ps
```

Container Manager UI 的等价操作是打开 `mn` → 编辑 Compose/环境 → 更新版本标签 → 构建/启动。不要选择“删除项目并删除数据”。保留原因：删除项目和数据会破坏已有生产卷，更新只替换应用。

若通过 DSM API 自动更新：

- 每次按项目名 `mn` 查询当前 ID，不永久记录临时 UUID。保留原因：临时 ID 可能变化，固定项目名才是可重复定位入口。
- 当前 Compose 响应包含生产秘密，只能写入权限 `0600` 的临时文件，禁止完整输出。保留原因：完整响应包含环境秘密，临时保存也须限制权限。
- 只替换应用镜像标签，不用仓库示例覆盖生产密码、域名、卷或环境。保留原因：示例配置不能覆盖真实域名、凭据及原卷。
- `Project.update` 可能只保存 Compose，不会自动替换正在运行的容器；update 成功后必须调用项目 build，并等待 build stream 到明确成功或失败。保留原因：保存配置不代表运行容器已被替换，build stream 才确认执行结果。
- Compose 文本显示目标标签不等于部署完成；从项目容器详情读取 `Config.Image`，确认 `app`、`migrate`、`harden` 的实际镜像均为目标版本。保留原因：运行容器的 Config.Image 才证明实际使用的产物。
- 无论结果如何都退出 API 会话并清理临时文件。保留原因：会话和含秘密临时文件不应留在部署结束后。

诊断输出使用字段白名单，只允许输出项目/服务名、镜像标签、状态、健康状态、退出码和环境变量键名。生产 Compose 的 `environment`、`command`、healthcheck、URL 和 API 异常响应都可能携带秘密；禁止输出完整 Compose 后再依赖正则遮盖。临时 Compose 与响应文件权限设为 `0600`，完成后立即删除，剪贴板中的凭据也要清空。保留原因：错误对象和完整配置可能携带秘密，事后遮盖不能保证不泄露。

正常状态：`postgres`、`redis`、`app` 为 running/healthy；`migrate`、`harden` 为 exited (0)。Container Manager 可能把一次性容器正常退出汇总成 WARNING，应以退出码和长期容器健康为准。

### 上线验收

```bash
curl --fail 'https://<production-domain>/'
curl --fail 'https://<production-domain>/api/v1/health'
curl --fail 'https://<production-domain>/api/v1/health/ready'
```

还要确认：

- `app`、`migrate`、`harden` 实际镜像都是目标版本。保留原因：应用与一次性服务均须对应同一目标版本。
- 原 PostgreSQL/Redis 卷名未变化。保留原因：卷名决定实际数据位置，换卷会丢失业务可见性。
- 三个长期容器健康，两个一次性任务退出码为 0。保留原因：一次性任务正常退出与长期服务健康使用不同判定。
- 用户自行完成与本版本变化相关的业务验收；自动部署默认仅做命令行/API 检查，明确要求时才使用浏览器。保留原因：真实业务与外部设备效果由用户核对，默认不做浏览器验证。
- 浏览器若仍显示旧界面，先强制刷新并清理该站点的旧缓存，不要盲目重跑迁移。保留原因：旧客户端缓存不代表数据库迁移失败。

## 回滚

应用回滚只修改镜像标签，不删除卷：保留原因：回滚应用不能删除持久业务数据。

```bash
# 手工把 .env 中 MASSAGE_NOTE_IMAGE_TAG 改为已知正常的旧版本后：
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
```

若新版本执行了不向后兼容的迁移，不能盲目回滚应用。按迁移设计恢复兼容版本，或先在独立数据库验证备份恢复；禁止删除迁移记录或生产卷。保留原因：不兼容迁移需恢复兼容 schema 或已验证备份，不能删历史掩盖变化。

## 公开前秘密扫描

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git /repo --redact=100 --no-banner
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git ls-files | rg '(^|/)\.env($|\.)' || true
git status --short
```

如果秘密曾进入 Git 历史，必须先撤销/轮换，再清理历史；只删除当前文件不够。保留原因：已发布秘密必须撤销，当前文件删除不能清掉 Git 历史。

## 离线备用

只有 GHCR 或 NAS 外网不可用时：保留原因：本地离线构建不是普通发布的额外重复步骤。

```bash
pnpm version:check
./scripts/build-nas-image.sh
release_version=$(tr -d '[:space:]' < VERSION)
shasum -a 256 -c "artifacts/massage-note-$release_version-linux-amd64.tar.sha256"
```

在 Container Manager 的“映像 → 新增 → 从文件新增”导入。恢复网络后回到 GHCR 流程。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 仓库公开但匿名 pull 仍 unauthorized | GHCR Package 仍是 private，单独修改 Package visibility |
| 空 `DOCKER_CONFIG` 找不到 `buildx` | 匿名检查使用 `docker manifest inspect` |
| CI 本机通过、GitHub 失败 | 干净 runner 缺生成物或环境；修复 pre-hook/service，不上传 `.env` |
| Container Manager 显示 WARNING | 先确认 `migrate`/`harden` 是否 exited (0) |
| root Task Scheduler 返回 105 | 管理员公网新设备会话可能被 Adaptive MFA 限制；先在 DSM 页面完成二次验证/设备信任，再重试，不要跳过备份 |
| 更新请求返回但线上仍旧版 | `Project.update` 可能只保存 Compose；继续执行 build、等待 stream，并核对容器 `Config.Image` |
| 上线后像数据丢失 | 先核对项目名与卷名；不要删除任何卷 |

## 多设备同步与 SSE 排查

正式入口必须持续透传 `/api/v1/stores/:storeId/events` 的 `text/event-stream` 响应，不能缓存、聚合或等待请求结束才转发。API 已返回 `X-Accel-Buffering: no` 与禁缓存/转换指令；需要确认群晖及外层代理没有忽略这些头。若管理自有 Nginx，对 SSE 路由关闭 `proxy_buffering`、`proxy_cache`，读取超时至少 75 秒，并避免对流做压缩聚合；不要把配置示例直接覆盖到群晖自动生成文件。保留原因：SSE 事件要求持续转发，代理缓存会让多设备一直读到旧状态。

排查时用同账号两台设备登录同店，两边保持前台。在开发者工具 Network 中检查 events 请求为 200、类型为 text/event-stream，约每 2 秒收到 heartbeat。请求长时间 pending 属正常；HTTP 已建立但没有持续事件则需分别对比内部 API 与 HTTPS 入口，定位代理缓冲/超时或 API 查询问题。勿复制登录 Cookie 或 token 到日志、文档或工单。保留原因：响应打开但没持续事件不能证明同步，真实多设备检查应由用户执行。

分别验证新增、编辑、删除与恢复能在另一设备约 2–3 秒加请求耗时更新，再验证锁屏、切换应用和网络恢复。前端会在 10 秒无消息后重连，异常期间低频补读，但这不能替代修复代理链路。数据库晚提交的 30 秒兜底同步仍保留。默认以命令行/API 检查本地事件流与健康状态，多设备页面效果由用户核对；只有具体要求时才使用浏览器。发布授权按维护规则。保留原因：前端重试是故障恢复措施，不能代替修复代理链路。
