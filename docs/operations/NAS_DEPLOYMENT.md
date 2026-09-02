# GitHub → GHCR → 群晖部署

> 当前版本：`0.12.45` · 镜像：`ghcr.io/redonkatonkk/massage-note`
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

正常升级使用 GHCR；`scripts/build-nas-image.sh` 只在 GHCR 或 NAS 外网不可用时生成离线 tar。

## 发布总原则

1. 不凭记忆部署，先阅读本手册、[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) 和本地被忽略的部署秘密说明。
2. 保留不属于本次任务的工作区变化，只提交当前发布内容。
3. 本地完整验证通过后才 push。
4. 必须按本次 commit SHA 等待 CI，不能用另一条 run 或 `latest` 代替。
5. 先确认版本镜像存在且可匿名读取，再备份和更新 NAS。
6. 更新后核对镜像、迁移、卷、容器、健康接口和真实业务流程。
7. 任何一步失败都停止并保留旧容器和卷；不以删除项目或数据卷排错。

## 秘密边界

GitHub 仓库和 GHCR 可以公开，生产秘密不能进入二者。

| 配置 | 是否秘密 | 保存位置 | 进入镜像构建 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` 四项 | 否，浏览器可见 | GitHub Repository Variables、本机 `.env` | 是 |
| Firebase Admin 私钥/邮箱 | 是 | 本机 `.env`、NAS 环境 | 否 |
| MiniMax API key | 是 | 本机 `.env`、NAS 环境 | 否 |
| PostgreSQL/Redis 密码 | 是 | NAS 环境 | 否 |
| DSM 凭据、GitHub token | 是 | 系统钥匙串 | 否 |

根目录 `.env` 与 `.local-ai/` 必须被 Git 忽略，敏感本地文件权限应为 `0600`。不要把真实值写进 Markdown、脚本、Compose 示例、Actions 日志、Issue 或聊天回复。

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

这些是浏览器公开配置。不要把 Firebase Admin、MiniMax、数据库或 DSM 凭据放入 GitHub 构建变量。

CLI 可以从标准输入逐项读取而不把值写进命令行：

```bash
gh variable set NEXT_PUBLIC_FIREBASE_API_KEY --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_APP_ID --repo Redonkatonkk/massage-note
```

### GHCR 可见性

仓库公开不等于 Package 公开。首次工作流发布后，在 `Packages → massage-note → Package settings → Change visibility` 把 Package 设为 Public。GitHub REST API 不支持修改 Package visibility，不要尝试用 `PATCH /user/packages/...` 绕过网页确认。

匿名验证使用隔离的 Docker 配置，避免本机登录造成假阳性：

```bash
release_version=$(tr -d '[:space:]' < VERSION)
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" \
  docker manifest inspect "ghcr.io/redonkatonkk/massage-note:$release_version" >/dev/null
rmdir "$task_docker_config"
```

如果失败，先修正 Package 可见性；不要把个人访问令牌写入 NAS Compose。

## 每次发布到 GitHub

### 本地检查

版本标签是不可变产物。任何准备发布的变化都先递增版本并同步版本文件：

```bash
pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
git diff --check
git status --short
```

暂存后检查文件与秘密扫描，再提交：

```bash
git diff --cached --name-only
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git commit -m "描述本次变化"
git push origin main
```

不要未经检查使用 `git add -A`，也不要提交 `.env`、`.local-ai/`、`artifacts/` 或用户的临时文件。

### 等待对应 CI

`.github/workflows/ci.yml` 先运行 `verify`，只有 `main` 的非 PR 事件验证通过后才运行 `publish-nas-image`。

```bash
release_sha=$(git rev-parse HEAD)
run_id=$(gh run list --repo Redonkatonkk/massage-note --workflow ci.yml \
  --commit "$release_sha" --json databaseId --jq '.[0].databaseId')
test -n "$run_id"
gh run watch "$run_id" --repo Redonkatonkk/massage-note --exit-status
```

成功产物包含：

- 语义版本标签：正式部署使用。
- `latest`：仅用于观察，不固定到生产。
- `sha-xxxxxxx`：精确关联提交和排错。

确认版本 manifest 与平台：

```bash
release_version=$(tr -d '[:space:]' < VERSION)
docker buildx imagetools inspect "ghcr.io/redonkatonkk/massage-note:$release_version"
```

目标平台必须是 `linux/amd64`。

## 第一次创建 NAS 项目

1. 在 NAS 的受控目录保存 `docker-compose.nas.yml` 和只存在 NAS 的 `.env`。
2. 以 `.env.nas.example` 为模板，填写随机且互不相同的 PostgreSQL、应用账号和 Redis 密码，再填运行时 Firebase/MiniMax 秘密。
3. `MASSAGE_NOTE_IMAGE_TAG` 使用已验证的语义版本；`APP_HTTP_PORT` 默认可设为 `3100`，`WEB_ORIGIN` 填真实 HTTPS Origin。
4. Container Manager 新建项目，项目名固定为 `mn`。
5. 反向代理把 HTTPS 入口转发到 NAS 本机的应用端口；数据库、Redis 和内部 API 不对公网开放。

不要新建第二个 Compose 项目名，否则会生成另一套 PostgreSQL/Redis 命名卷，看起来像“数据丢失”。已有生产环境必须保留项目 `mn` 及其卷名。

### 本地 Mac“信息”代理

NAS 只保存任务并提供 HTTPS API，不能从容器或浏览器直接控制远端 Mac 的“信息”App。本地 Mac 的 LaunchAgent 使用店铺代理令牌主动访问 `https://<production-domain>/api/v1`、领取任务，再通过本机 `/usr/bin/osascript` 调用“信息”；NAS 无需访问 Mac，也不需要为代理开放入站端口。

固定 Mac 的安装、完全磁盘访问权限、附件路由和排障步骤统一见 [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md)。部署 NAS 本身不需要安装任何 macOS 组件。

## 每次升级 NAS

本次版本的功能、迁移和验收重点先查 [`CHANGELOG.md`](../../CHANGELOG.md) 顶部；有数据库迁移时同时核对迁移文件与发布清单。

### 备份

升级前导出 PostgreSQL，并验证文件非空且 gzip 完整。不得删除或重建生产 PostgreSQL 卷。

```bash
cd /volume1/docker/massage-note-v2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > backup-before-upgrade.sql.gz
gzip -t backup-before-upgrade.sql.gz
```

生产还应按 [`OPERATIONS.md`](OPERATIONS.md) 定期执行加密逻辑备份和独立恢复演练；临时升级备份不能代替恢复演练。

### 拉取与更新

把 NAS `.env` 的 `MASSAGE_NOTE_IMAGE_TAG` 改为已经验证存在的版本。`app`、`migrate`、`harden` 必须引用同一个标签：

```bash
cd /volume1/docker/massage-note-v2
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.nas.yml ps
```

Container Manager UI 的等价操作是打开 `mn` → 编辑 Compose/环境 → 更新版本标签 → 构建/启动。不要选择“删除项目并删除数据”。

若通过 DSM API 自动更新：

- 每次按项目名 `mn` 查询当前 ID，不永久记录临时 UUID。
- 当前 Compose 响应包含生产秘密，只能写入权限 `0600` 的临时文件，禁止完整输出。
- 只替换应用镜像标签，不用仓库示例覆盖生产密码、域名、卷或环境。
- update 返回的 task ID 不代表完成；继续等待 build stream 到明确成功或失败。
- 无论结果如何都退出 API 会话并清理临时文件。

正常状态：`postgres`、`redis`、`app` 为 running/healthy；`migrate`、`harden` 为 exited (0)。Container Manager 可能把一次性容器正常退出汇总成 WARNING，应以退出码和长期容器健康为准。

### 上线验收

```bash
curl --fail 'https://<production-domain>/'
curl --fail 'https://<production-domain>/api/v1/health'
curl --fail 'https://<production-domain>/api/v1/health/ready'
```

还要确认：

- `app`、`migrate`、`harden` 实际镜像都是目标版本。
- 原 PostgreSQL/Redis 卷名未变化。
- 三个长期容器健康，两个一次性任务退出码为 0。
- 真实浏览器可登录并完成与本版本变化相关的业务冒烟。
- 浏览器若仍显示旧界面，先强制刷新并清理该站点的旧缓存，不要盲目重跑迁移。

## 回滚

应用回滚只修改镜像标签，不删除卷：

```bash
# 手工把 .env 中 MASSAGE_NOTE_IMAGE_TAG 改为已知正常的旧版本后：
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
```

若新版本执行了不向后兼容的迁移，不能盲目回滚应用。按迁移设计恢复兼容版本，或先在独立数据库验证备份恢复；禁止删除迁移记录或生产卷。

## 公开前秘密扫描

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git /repo --redact=100 --no-banner
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git ls-files | grep -E '(^|/)\.env($|\.)' || true
git status --short
```

如果秘密曾进入 Git 历史，必须先撤销/轮换，再清理历史；只删除当前文件不够。

## 离线备用

只有 GHCR 或 NAS 外网不可用时：

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
| 更新请求返回但线上仍旧版 | DSM 是异步任务，继续等 build stream 并核对实际镜像 |
| 上线后像数据丢失 | 先核对项目名与卷名；不要删除任何卷 |
