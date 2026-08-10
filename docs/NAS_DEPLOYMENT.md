# GitHub → GHCR → 群晖部署手册

本项目的标准发布链路是：

```text
本机提交并 push main
        ↓
GitHub Actions 先跑完整测试
        ↓ 测试全部通过
构建 linux/amd64 NAS 镜像并推送 GHCR
        ↓
群晖 Container Manager 直接 pull 并重建 mn 项目
```

镜像地址：`ghcr.io/redonkatonkk/massage-note`。当前版本：`0.2.3`。正常升级不再构建和上传约 250 MB 的 tar；`scripts/build-nas-image.sh` 只作为 GHCR 故障时的离线备用方案。

## 1. 永远不要混淆的秘密边界

GitHub 仓库和 GHCR 都可以公开，但生产秘密不能进入二者。

| 配置 | 是否秘密 | 保存位置 | 是否进入镜像构建 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` 四项 | 否，浏览器最终可见 | GitHub Repository Variables、本机 `.env` | 是 |
| Firebase Admin 私钥/邮箱 | 是 | 本机 `.env`、NAS Compose 环境 | 否 |
| MiniMax API key | 是 | 本机 `.env`、NAS Compose 环境 | 否 |
| Google 服务账号 base64 | 是 | 本机 `.env`、NAS Compose 环境 | 否 |
| PostgreSQL/Redis 密码 | 是 | NAS Compose 环境 | 否 |
| DSM 管理凭据、GitHub token | 是 | macOS Keychain | 否 |

本机 AI 首先阅读 `.local-ai/DEPLOYMENT_SECRETS.md`。真实应用秘密的唯一事实源是权限 `0600`、已被 Git 忽略的根目录 `.env`。不得为了“方便”再把私钥复制到 Markdown、脚本、Compose、Actions Secret、Issue 或聊天回复。

检查边界：

```bash
git check-ignore -v .env .local-ai/DEPLOYMENT_SECRETS.md
stat -f '%N mode=%Lp' .env .local-ai/DEPLOYMENT_SECRETS.md
git status --short
```

预期两个本地文件都被忽略、权限为 `600`，`git status` 不出现它们。

## 2. 一次性 GitHub 设置

### 2.1 登录与仓库

```bash
gh auth status
gh repo view Redonkatonkk/massage-note --json visibility,url
```

仓库已经设置为 public。公开意味着任何人都能看代码、历史 Actions 日志和 fork；公开前必须运行第 7 节的秘密扫描。

### 2.2 设置四项公开构建变量

在 GitHub 仓库的 `Settings → Secrets and variables → Actions → Variables` 中创建：

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

这些值来自本机 `.env`，只属于 Firebase Web 客户端配置。不要创建 `FIREBASE_PRIVATE_KEY`、`MINIMAX_API_KEY`、`GOOGLE_CLOUD_CREDENTIALS_BASE64`、数据库密码或 DSM 密码的 GitHub 变量/秘密。

已登录 `gh` 时也可以逐项设置；命令不得回显值：

```bash
gh variable set NEXT_PUBLIC_FIREBASE_API_KEY --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_PROJECT_ID --repo Redonkatonkk/massage-note
gh variable set NEXT_PUBLIC_FIREBASE_APP_ID --repo Redonkatonkk/massage-note
```

每条命令会等待从标准输入读取值。不要把真实值直接写在 shell 命令行。

### 2.3 GHCR 包必须公开

首次工作流成功后会出现 package `massage-note`。打开 GitHub 个人主页的 `Packages → massage-note → Package settings → Change visibility → Public`。

验证匿名拉取；必须不执行 `docker login ghcr.io`：

```bash
docker logout ghcr.io 2>/dev/null || true
docker manifest inspect ghcr.io/redonkatonkk/massage-note:0.2.3 >/dev/null
```

如果匿名检查失败，说明 package 仍为 private。不要把个人访问令牌写入 NAS Compose；先把 package 改为 public。

## 3. 每次发布：本机到 GitHub

### 3.1 修改版本

任何提交都必须更新 `VERSION`、全部 workspace `package.json`、`CHANGELOG.md`、Dockerfile、NAS Compose 默认镜像标签和 PWA cache。完成后运行：

```bash
pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

### 3.2 提交并 push

先确认没有 `.env`、私钥或用户文件进入暂存区：

```bash
git status --short
git diff --check
git diff --cached --name-only
git commit -m "描述本次变化"
git push origin main
```

不要使用 `git add -A` 后不检查。不要提交 `.env`、`.local-ai/`、`artifacts/` 或用户的 `IDEA.md`。

### 3.3 等待 GitHub 构建镜像

`.github/workflows/ci.yml` 的顺序固定为：完整验证 → 构建 NAS 镜像 → 推送 GHCR。Pull Request 只测试，不发布镜像；只有 `main` push 或在 `main` 手动运行 workflow 才发布。

```bash
gh run list --repo Redonkatonkk/massage-note --workflow ci.yml --limit 5
gh run watch --repo Redonkatonkk/massage-note --exit-status
```

成功后产生三个标签：

- `0.2.3`：版本标签，NAS 正式部署使用；
- `latest`：最新 main，仅用于查看，不建议作为生产固定版本；
- `sha-xxxxxxx`：对应 Git 提交，精确排错或回滚使用。

验证线上镜像：

```bash
docker buildx imagetools inspect ghcr.io/redonkatonkk/massage-note:0.2.3
```

## 4. 第一次创建 NAS 项目

1. 在 NAS 的 `/volume1/docker/massage-note-v2` 保存 `docker-compose.nas.yml` 和只存在 NAS 的 `.env`。
2. 以 `.env.nas.example` 为模板填写随机且互不相同的数据库/Redis 密码和所需运行时秘密。
3. 设置 `MASSAGE_NOTE_IMAGE_TAG=0.2.3`、`APP_HTTP_PORT=3100`、`WEB_ORIGIN=https://massagenote.waltonjin.com`。
4. Container Manager 新建项目，项目名固定为 `mn`，使用上述目录的 Compose。
5. DSM 反向代理固定为 `https://massagenote.waltonjin.com:443` → `http://localhost:3100`。

不要新建第二个项目名，否则 Compose 会创建另一套 PostgreSQL/Redis 命名卷，看起来像“数据丢失”。现有生产卷是 `mn_massage-note-postgres` 和 `mn_massage-note-redis`。

## 5. 每次升级 NAS

### 5.1 先备份

升级前导出 PostgreSQL，并确认备份非空且可以解压。不得删除或重建 `mn_massage-note-postgres`。

若可使用 NAS shell：

```bash
cd /volume1/docker/massage-note-v2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-before-upgrade.sql.gz
gzip -t backup-before-upgrade.sql.gz
```

### 5.2 更新版本并拉取

把 NAS `.env` 的 `MASSAGE_NOTE_IMAGE_TAG` 改为已经在 GHCR 验证存在的版本，例如 `0.2.3`，然后：

```bash
cd /volume1/docker/massage-note-v2
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.nas.yml ps
```

Container Manager UI 等价操作：打开项目 `mn` → 编辑 Compose/环境 → 将版本标签改为目标版本 → “构建/启动”。不要点“删除项目并删除数据”。

正常结果：

- `postgres`、`redis`、`app` 为 running/healthy；
- `migrate`、`harden` 为 exited (0)，这是一次性任务成功，不是故障；
- Container Manager 可能因两个一次性容器退出而把项目汇总显示为 WARNING，应以退出码和三个长期容器健康状态判断。

### 5.3 上线检查

```bash
curl --fail https://massagenote.waltonjin.com/
curl --fail https://massagenote.waltonjin.com/api/v1/health
curl --fail https://massagenote.waltonjin.com/api/v1/health/ready
curl --fail https://massagenote.waltonjin.com/sw.js | grep 'massage-note-v0.2.3'
```

再用真实浏览器完成登录、快速记工“项目 + 时长”、经理修改项目档位和财务页冒烟测试。

## 6. 回滚

回滚只改镜像标签，不删除卷：

```bash
# 例：回滚到上一个已知正常版本
sed -i 's/^MASSAGE_NOTE_IMAGE_TAG=.*/MASSAGE_NOTE_IMAGE_TAG=0.2.0/' .env
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
```

如果新版本执行了不向后兼容的数据库迁移，不能盲目回滚应用；应按迁移设计恢复兼容版本或在独立数据库验证备份恢复。禁止直接删除迁移记录或生产卷。

## 7. 公开仓库前的秘密扫描

至少执行：

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git /repo --redact=100 --no-banner
git ls-files | grep -E '(^|/)\.env($|\.)' || true
git status --short
```

本项目在公开前的基线：Gitleaks 扫描全部 Git 历史为 0 findings；真实秘密只在被忽略的 `.env`。任何后续发现都必须先撤销/轮换密钥，再清理 Git 历史；仅删除当前文件不足以消除历史泄漏。

## 8. 离线备用方案

只有 GHCR 或 NAS 外网不可用时才生成 tar：

```bash
pnpm version:check
./scripts/build-nas-image.sh
shasum -a 256 -c artifacts/massage-note-0.2.3-linux-amd64.tar.sha256
```

然后在 Container Manager 的“映像 → 新增 → 从文件新增”导入。恢复网络后应回到 GHCR 流程，避免本机跨架构构建与大文件上传。
