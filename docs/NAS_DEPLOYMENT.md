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

镜像地址：`ghcr.io/redonkatonkk/massage-note`。当前版本：`0.12.18`。正常升级不再构建和上传约 250 MB 的 tar；`scripts/build-nas-image.sh` 只作为 GHCR 故障时的离线备用方案。

## 0. AI 接手后的最短正确路径

不要凭记忆部署。依次执行：

1. 阅读 `docs/AI_HANDOFF.md`、本文件和被忽略的 `.local-ai/DEPLOYMENT_SECRETS.md`。
2. 运行 `git status --short`，保留不属于本次任务的文件；当前用户的 `IDEA.md` 不得顺手提交。
3. 修改代码和版本，完成第 3.1 节的全部本地检查。
4. 只暂存本次文件，检查暂存区和秘密扫描，再 commit、push `main`。
5. 按本次 commit SHA 找到并等待对应的 GitHub Actions run；不能只看最新一条就假定是自己的构建。
6. 先验证版本镜像可匿名读取，再备份数据库、更新 NAS 项目 `mn`。
7. 等迁移任务和重建任务真正结束，检查容器、卷、镜像名、健康接口和真实业务流程。

任何一步失败都停止部署并保留旧容器/卷；不要用删除项目、删除卷或复用旧版本标签“解决”。

## 1. 永远不要混淆的秘密边界

GitHub 仓库和 GHCR 都可以公开，但生产秘密不能进入二者。

| 配置 | 是否秘密 | 保存位置 | 是否进入镜像构建 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` 四项 | 否，浏览器最终可见 | GitHub Repository Variables、本机 `.env` | 是 |
| Firebase Admin 私钥/邮箱 | 是 | 本机 `.env`、NAS Compose 环境 | 否 |
| MiniMax API key | 是 | 本机 `.env`、NAS Compose 环境 | 否 |
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

注意：仓库公开和 GHCR package 公开是两套独立设置。仓库为 public 不代表 NAS 已经能匿名拉镜像。

### 2.2 设置四项公开构建变量

在 GitHub 仓库的 `Settings → Secrets and variables → Actions → Variables` 中创建：

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

这些值来自本机 `.env`，只属于 Firebase Web 客户端配置。不要创建 `FIREBASE_PRIVATE_KEY`、`MINIMAX_API_KEY`、数据库密码或 DSM 密码的 GitHub 变量/秘密。

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

GitHub REST API 可以查询 Package，但目前不提供修改 Package visibility 的端点。不要尝试 `PATCH /user/packages/...`；它会返回 404。首次公开必须由 Package 管理员在上述网页完成。

若 AI 需要用 CLI 查询私有 Package，可先检查 `gh auth status` 是否包含 package scope。没有时运行：

```bash
gh auth refresh -h github.com -s read:packages,write:packages
```

该命令会启动 GitHub device authorization。必须让用户在 GitHub 页面确认；终端一直无输出通常是在等待网页授权，不是卡死。授权完成后只能用 API 查询状态：

```bash
gh api /user/packages/container/massage-note --jq '{name,visibility}'
```

若返回 `private`，打开 `https://github.com/users/Redonkatonkk/packages/container/massage-note/settings`，在 Danger Zone 选择 Public 并按页面要求确认。不得把 `gh auth token` 的输出复制到命令、文件、NAS 或聊天中，也不要创建并硬编码新的 PAT 绕过网页确认。

验证匿名拉取时使用隔离的空 Docker 配置，避免本机已有登录造成假阳性，也不要用 `docker logout` 改坏用户现有登录：

```bash
task_docker_config=$(mktemp -d /tmp/massage-note-docker.XXXXXX)
DOCKER_CONFIG="$task_docker_config" \
  docker manifest inspect ghcr.io/redonkatonkk/massage-note:0.12.18 >/dev/null
rmdir "$task_docker_config"
```

如果匿名检查失败，说明 package 仍为 private。不要把个人访问令牌写入 NAS Compose；先把 package 改为 public。

经验：设置空 `DOCKER_CONFIG` 后 Docker 可能找不到 `buildx` CLI 插件，所以匿名检查使用内置的 `docker manifest inspect`；正常登录环境才使用 `docker buildx imagetools inspect`。

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

版本标签视为不可变产物：哪怕只改文档，也要递增 patch 版本。禁止覆盖已经发布的 `0.x.y` 标签；否则 NAS、浏览器 PWA 缓存和排错记录会指向不同内容。

### 3.2 提交并 push

先确认没有 `.env`、私钥或用户文件进入暂存区：

```bash
git status --short
git diff --check
git diff --cached --name-only
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git commit -m "描述本次变化"
git push origin main
```

不要使用 `git add -A` 后不检查。不要提交 `.env`、`.local-ai/`、`artifacts/` 或用户的 `IDEA.md`。

### 3.3 等待 GitHub 构建镜像

`.github/workflows/ci.yml` 的顺序固定为：完整验证 → 构建 NAS 镜像 → 推送 GHCR。Pull Request 只测试，不发布镜像；只有 `main` push 或在 `main` 手动运行 workflow 才发布。

```bash
release_sha=$(git rev-parse HEAD)
gh run list --repo Redonkatonkk/massage-note --workflow ci.yml \
  --commit "$release_sha" --limit 5
run_id=$(gh run list --repo Redonkatonkk/massage-note --workflow ci.yml \
  --commit "$release_sha" --json databaseId --jq '.[0].databaseId')
test -n "$run_id"
gh run watch "$run_id" --repo Redonkatonkk/massage-note --exit-status
```

`verify` 必须先通过；随后 `publish-nas-image` 才会运行。干净 GitHub runner 没有本机 `.env`、生成物或测试数据库，因此工作流显式提供一次性 PostgreSQL/Redis service，`pnpm typecheck` 的 pre-hook 会先生成 Prisma Client/内部包。不要为了让 CI 绿而上传生产 `.env`。

成功后产生三个标签：

- `0.12.18`：版本标签，NAS 正式部署使用；
- `latest`：最新 main，仅用于查看，不建议作为生产固定版本；
- `sha-xxxxxxx`：对应 Git 提交，精确排错或回滚使用。

验证线上镜像：

```bash
docker buildx imagetools inspect ghcr.io/redonkatonkk/massage-note:0.12.18
```

同时检查 manifest 平台为 `linux/amd64`。群晖不是本机 Mac 的架构环境；不要把未经指定平台的本机构建当作 NAS 产物。

## 4. 第一次创建 NAS 项目

1. 在 NAS 的 `/volume1/docker/massage-note-v2` 保存 `docker-compose.nas.yml` 和只存在 NAS 的 `.env`。
2. 以 `.env.nas.example` 为模板填写随机且互不相同的数据库/Redis 密码和所需运行时秘密。
3. 设置 `MASSAGE_NOTE_IMAGE_TAG=0.12.18`、`APP_HTTP_PORT=3100`、`WEB_ORIGIN=https://massagenote.waltonjin.com`。
4. Container Manager 新建项目，项目名固定为 `mn`，使用上述目录的 Compose。
5. DSM 反向代理固定为 `https://massagenote.waltonjin.com:443` → `http://localhost:3100`。

不要新建第二个项目名，否则 Compose 会创建另一套 PostgreSQL/Redis 命名卷，看起来像“数据丢失”。现有生产卷是 `mn_massage-note-postgres` 和 `mn_massage-note-redis`。

## 5. 每次升级 NAS

### 0.12.18 升级说明

本版本合并记工详情的两个保存入口，并根据付款是否开始填写自动选择“只保存详情”或“校验并确认付款”；首页新增已确认服务费差额红色感叹号，小费为 0 时只显示数字 0。项目设置改为摘要优先、按需展开，额外项目字段在桌面横向紧凑排列。没有数据库迁移，也不修改历史记工、付款或项目数据；部署后需分别验收空白付款保存、完整付款确认、付款不完整拦截、免费服务显式 0、服务费差额标记、零小费显示，以及桌面/390px 项目设置布局。

### 0.12.17 升级说明

本版本包含 0.12.16 的全部财务汇总改动，并修复 CI 在接近店铺 22:00 营业日边界运行时间联动测试时的时钟波动；生产业务逻辑、数据库结构和历史数据均不改变。部署后按 0.12.16 的项目逐项验收。

### 0.12.16 升级说明

本版本重新组织财务汇总：每日小计移动到员工小计之前，日期后增加星期；关键成果以总流水替换客人总付款和员工总收入；“工资与现金结算”卡片组替换为店铺总结算，按当前筛选返回店铺收入、店长与经理作为工人的收入、礼物卡净收入和前四项合计。员工筛选改为复选框多选。没有数据库迁移，也不修改历史记工或礼物卡数据；部署后需核对角色收入公式、礼物卡正负收支、每日/员工小计顺序、中英文星期、多选筛选和 390px 页面无整体横向溢出。

### 0.12.15 升级说明

本版本从今日记工顶部的全店汇总删除“小费总额”卡片，不改变店铺收入公式、员工行小费或财务页面小费数据；部署后需核对顶部仅保留大费总额、折扣总额、礼物卡销售、礼物卡核销支出和店铺收入，并继续验收 0.12.14 的每日流水和 0.12.13 的手机版记工横向滑动。

### 0.12.14 升级说明

本版本调整财务汇总的每日小计：删除全部项目数、记工数、实收服务费、小费和客人总付款，营业日后首先显示由服务端计算的“今日流水 = 折后大费业绩 + 礼物卡销售收入 − 礼物卡核销支出”。没有数据库迁移，也不修改历史记工或礼物卡数据；部署后需核对每日小计列、今日流水金额、中英文显示，以及 0.12.13 的手机版记工横向滑动。

### 0.12.13 升级说明

本版本只调整手机版今日／历史记工的展示：员工行中的所有记工卡片和新增入口改为紧凑横向排列，可左右滑动查看，减少全宽卡片右侧留白。没有数据库迁移，也不修改记工或财务数据；部署后需在手机宽度下核对多张记工卡横向滑动、卡片点击和页面无整体横向漂移。

### 0.12.12 升级说明

本版本把财务筛选的默认付款方式改为全部，并让店铺级全部项目数量、客人总付款、每日小计和日结合计纳入礼物卡销售；卖卡实收记店铺收入，礼物卡大费与小费核销记店铺支出。没有数据库迁移，也不修改历史礼物卡或记工数据；部署后需用同一营业日的一笔卖卡和一笔用卡记录核对今日汇总、财务汇总及日结公式一致。

### 0.12.11 升级说明

本版本完善记工详情的时间联动：修改开始时间时保持当前实际工作时长，增加、移除或更换额外项目时按项目配置分钟数差值调整结束时间；服务端在请求未明确提交结束时间时提供相同兜底。项目管理的额外项目输入框同步改为更合理的响应式列宽。没有数据库迁移，也不修改历史记工；部署后需验收加项增减、开始时间平移以及电脑、iPad、手机三种项目管理布局。

### 0.12.10 升级说明

本版本在今日与历史记工页增加店主、经理的首页日结和取消日结操作：普通日结检查通过时直接完成，真正阻塞时跳到同日期财务日结页；已日结时可填写原因取消。没有数据库迁移，也不修改既有日结、记工、付款或结算数据；部署后需分别验收今日正常日结、历史正常日结、阻塞跳转以及历史取消日结。

### 0.12.9 升级说明

本版本允许在卖卡表单中直接修改系统建议号码并填写自定义礼物卡序列号，同时保留未修改时的并发安全自动分配。服务端会按规范化号码检查同店当前与已软删除历史记录，重复时拒绝保存。没有数据库迁移，也不修改既有礼物卡、付款或财务数据；部署后需分别验收默认自动号码、自定义号码和重复号码提示。

### 0.12.8 升级说明

本版本只移除今日高亮记工卡右上角的星形标志，整张卡片的黄色背景和边框仍然保留。没有数据库迁移，也不修改历史高亮状态、记工、付款或财务数据；部署后需检查高亮卡片仍明显呈黄色，并且右上角只保留实际存在的加项、折扣或待结账标志。

### 0.12.7 升级说明

本版本只调整今日记工卡片的加项提示：移除卡片底部“有加项”文字，有加项时改为右上角绿色“＋”小标志。没有数据库迁移，也不修改历史记工、加项、付款或结算数据；部署后需检查有加项的卡片在手机和桌面上与高亮、折扣、待结账标志同时出现时仍保持清楚。

### 0.12.6 升级说明

本版本把日结检查中的手动改价改为非阻塞提醒：仍显示数量、说明和逐笔记工入口，但可直接正常日结；只有其他真实阻塞项存在时才显示强制日结入口。没有数据库迁移，也不修改历史记工、付款、日结或结算数据。

### 0.12.5 升级说明

本版本统一移除页面金额小数位，并让金额编辑框不再自动补 `.00`。底层金额仍按整数美分保存和计算，没有数据库迁移，也不修改历史付款、提成、工资或结算数据；部署后需检查今日卡片、记工详情、财务、礼物卡、个人日结图片和 AI 答复均只显示整美元。

### 0.12.4 升级说明

本版本调整记工详情的现金/刷卡付款输入顺序与手机布局，并移除单笔自动折扣“移除”按钮的确认弹窗。没有数据库迁移，也不修改历史付款、折扣或结算数据；部署后需检查中英文详情页的刷卡/现金两行输入，以及自动折扣移除和恢复操作。

### 0.12.3 升级说明

本版本只调整今日记工卡片的付款展示：刷卡金额加细线框、现金金额不加框，混合付款直接显示双方金额，并为礼物卡保留独立标识。没有数据库迁移，也不修改任何历史付款、工资或结算数据；部署后需检查一笔纯现金、纯刷卡和混合付款卡片在手机与桌面上的显示。

### 0.12.2 升级说明

本版本修复现金/刷卡付款被空礼物卡序列号错误拦截，以及详情保存成功但付款确认失败后无法直接重试的问题。没有新增数据库迁移；部署后必须用真实登录会话完成一笔普通现金或刷卡的“保存并确认付款”验收。

### 0.12.1 升级说明

本版本修复记工乐观锁冲突响应中的 `BigInt` 序列化错误，并阻止详情页快速重复点击造成并发提交。没有新增数据库迁移；部署后需确认记工版本冲突返回正常 409 业务提示，而不是 500。

### 0.12.0 升级说明

本版本为记工增加高亮状态、首页黄色整卡提示和财务高亮筛选。部署会执行迁移 `20260820210000_work_record_highlight`：为 `work_records` 增加默认关闭的 `is_highlighted` 字段及查询索引。既有记工全部回填为未高亮，金额、付款、提成、日结、现金和工资数据均不修改。

### 0.11.0 升级说明

本版本新增营业日日历即选即跳、财务页原地查看异常订单和礼物卡台账，并为礼物卡增加每店从 1001 开始的自动序列号、面值与满额百分比折扣快照。部署会执行迁移 `20260820180000_gift_card_auto_serial`：为 `stores` 增加序列号计数器与礼物卡折扣设置，为 `gift_card_sales` 增加面值和折扣快照，并把既有卖卡记录按“面值等于原实际收款、折扣为 0”回填。迁移不会修改既有记工付款、工资或现金结算。

### 0.10.0 升级说明

本版本新增每日礼物卡销售与普通记工的礼物卡付款拆分。部署会执行迁移 `20260820120000_gift_cards`：创建 `gift_card_sales`，并为 `work_records` 与 `payment_breakdowns` 增加礼物卡序列号、大费和小费字段，同时更新确定性金额约束。迁移会把已有已确认记录的两项礼物卡金额回填为 0，不修改原现金、刷卡、工资或历史金额。

### 0.9.1 升级说明

本版本修复中英文切换气泡遮挡弹窗关闭按钮，以及手机第三方输入法收起后 AI 记工悬浮窗停留半屏的问题；同时新增 MiniMax MP4/AAC 语音输入。语音与文字共用现有 `MINIMAX_API_KEY`，可选设置 `MINIMAX_TRANSCRIPTION_MODEL=music-cover`，不再需要 Google Cloud Speech 配置。没有新增数据库迁移。

### 0.8.4 升级说明

本版本让员工默认提成优先于项目默认提成，并在保存员工提成时重算该员工未日结的当前营业日记工，使今日小结、个人日结、财务与现金工资字段一致；已日结及历史快照不变。另修复免费项目工资在个人日结收入分配中的守恒边界。没有新增数据库迁移。

### 0.8.3 升级说明

本版本合并成员资料与默认提成保存并增加成功提示，同时在普通员工视角隐藏其他员工的大费、小费和应得行小结；不改变记工可见范围、金额公式，也没有新增数据库迁移。

### 0.8.2 升级说明

本版本修复英语记工卡片中“有加项”状态的独立文本节点漏译；没有新增数据库迁移。

### 0.8.1 升级说明

本版本修复英语界面下现有中文项目简称和记工付款摘要的漏译；不修改项目数据库原值、不改变金额公式，也没有新增数据库迁移。

### 0.8.0 升级说明

本版本新增默认中文、可在任意页面切换并持久保留选择的中英文界面，同时让 AI 文本／语音请求、确定性财务回答、业务错误提示和个人日结图片遵循当前语言。没有新增数据库迁移，也不改变金额公式。

### 0.7.2 升级说明

本版本允许店主和经理在已日结营业日恢复或隐藏员工，并重新组织财务汇总和组成明细布局；不改变任何金额公式，也没有新增数据库迁移。

### 0.7.1 升级说明

本版本修正今日页“全店日结”入口的垂直文字对齐，没有新增数据库迁移。

### 0.7.0 升级说明

本版本允许店主和经理只填写名字预建员工，并在该员工同名注册、使用店铺代码加入时把真实账号绑定到原成员关系，原记工、提成和财务历史不变。部署会执行迁移 `20260815120000_unclaimed_store_memberships`，将 `store_memberships.user_id` 改为可空；迁移只放宽约束，不重写现有成员数据。

### 0.6.13 升级说明

本版本为个人日结增加现金大费分红和现金小费分红，并将现金／刷卡四项已确认收入分配统一放在今日总收入旁；收入基础与应提交现金交接重新分区，生成图片同步更新。现金大费分红按确认付款时的现金比例分摊大费工资，现金小费分红汇总已确认现金小费。本版本没有新增数据库迁移。

### 0.6.12 升级说明

本版本精简财务汇总卡片，移除“老板尚欠”和“本期工资结算”，并为其余 16 项增加支持鼠标、键盘与触屏的词条解释和计算方法提示；累计余额与工资结算功能本身不变。本版本没有新增数据库迁移。

### 0.6.11 升级说明

本版本修复记工详情修改主要项目时长后下工时间未同步的问题；前端即时按开始时间和新时长重算，服务端在请求未明确提交结束时间时提供相同兜底。本版本没有新增数据库迁移。

### 0.6.10 升级说明

本版本只恢复普通员工在当前营业日尚未进入表格时的“上班”入口；点击后为本人建立当天班次并加入表格，不提供“下班”按钮，员工工作状态继续按记工时间段计算。本版本没有新增数据库迁移。

### 0.6.9 升级说明

本版本调整个人日结的展示与确定性汇总：移除记工单数和折后大费，增加刷卡大费分红与刷卡小费分红，并按收入组成、结算往来分组。刷卡大费分红沿用已确认付款的现金/刷卡比例分摊大费工资，刷卡小费分红为已确认刷卡小费合计。本版本没有新增数据库迁移。

### 0.6.8 升级说明

本版本为全店日结异常增加逐笔记工跳转，并在今日/历史记工页为店长和经理增加进入对应营业日财务日结标签的入口。所有新入口只负责页面导航，不会自动执行日结。本版本没有新增数据库迁移。

### 0.6.7 升级说明

本版本修正个人日结“应提交现金”的独立口径：按所有含现金大费的已确认项目折前大费基数合计的 40% 计算，不减折扣，也不使用实际收到的现金大费作为金额基数。现金结算页面的真实现金流核对公式保持不变。本版本没有新增数据库迁移。

### 0.6.6 升级说明

本版本将今日页面顶部总结中的“员工应得”和“待结账”替换为折扣总额与店铺收入；店铺收入按“大费总额－折扣总额＋小费总额－员工应得”计算。本版本没有新增数据库迁移。

### 0.6.5 升级说明

本版本隐藏现金结算页面中当日没有记工的员工，并在个人日结页面及生成图片中以“应提交现金”替换折扣金额。本版本没有新增数据库迁移。

### 0.6.4 升级说明

本版本只调整今日记工卡片的红色折扣标签：整数美元显示为 `off5`、`off10`，不再重复显示 `US$` 与 `.00`；正式财务金额格式不变。本版本没有新增数据库迁移。

### 0.6.3 升级说明

本版本允许在记工详情中只为当前记录持久移除或恢复周一至周四自动折扣，并包含一条只扩展、不删除历史数据的迁移：

- `20260811160000_work_record_auto_discount_suppression`：为记工增加单笔自动折扣停用标记，现有记录默认继续使用自动折扣规则。

迁移后重点验收：打开一笔符合条件的周一至周四记工，移除自动折扣并保存；再次打开仍保持移除，折后大费业绩相应恢复而员工大费工资不变；点击恢复并保存后重新按当前店铺规则应用。

### 0.6.2 升级说明

本版本改进店铺设置保存提示和手机时间框宽度，在今日记工的红色 `off` 标记中显示折扣总额，并进一步阻止手机端从页面底部拉出空白区域。本版本没有新增数据库迁移。

### 0.6.1 升级说明

本版本只修复今日员工状态：已经结清的记工不再参与“下工时间”计算，员工全部待结账项目结清后立即显示“空闲”。本版本没有新增数据库迁移。

### 0.6.0 升级说明

本版本包含两条只扩展、不删除历史数据的迁移：

- `20260811140000_monday_thursday_auto_discount`：为店铺增加周一至周四自动折扣配置，并为记工折扣快照增加系统标记。
- `20260811141000_auto_discount_snapshot_constraint`：更新折扣快照约束，精确允许无目录来源的系统自动折扣，同时继续拒绝非法自定义/预设来源组合。

迁移后重点验收：店铺设置能保存自动折扣开关、门槛和额度；周一至周四达到门槛的新记工显示红色 `off`，折后业绩扣除折扣，但员工大费工资保持折前计算。还要抽查员工历史营业日和个人日结仍只显示本人数据。

### 5.1 先备份

升级前导出 PostgreSQL，并确认备份非空且可以解压。不得删除或重建 `mn_massage-note-postgres`。

若可使用 NAS shell：

```bash
cd /volume1/docker/massage-note-v2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-before-upgrade.sql.gz
gzip -t backup-before-upgrade.sql.gz
```

### 5.2 更新版本并拉取

把 NAS `.env` 的 `MASSAGE_NOTE_IMAGE_TAG` 改为已经在 GHCR 验证存在的版本，例如 `0.12.18`。确认 `app`、`migrate`、`harden` 三个服务最终引用同一个标签，然后：

```bash
cd /volume1/docker/massage-note-v2
docker compose --env-file .env -f docker-compose.nas.yml pull app migrate harden
docker compose --env-file .env -f docker-compose.nas.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.nas.yml ps
```

Container Manager UI 等价操作：打开项目 `mn` → 编辑 Compose/环境 → 将版本标签改为目标版本 → “构建/启动”。不要点“删除项目并删除数据”。

AI 通过 DSM API 自动更新时还必须遵守：

- 每次按项目名 `mn` 查询当前 project ID；不要永久记录临时 UUID。
- API 返回的 Compose 内容含生产秘密，只能写入权限 `0600` 的临时文件，禁止输出完整响应、运行 `jq .` 或贴进日志。
- 以 NAS 当前 Compose 为基础，只替换三个应用镜像标签；不得用仓库示例覆盖生产密码、域名、卷或其他环境。
- 提交更新后持续读取 build stream/task，直到明确成功或失败；收到 update 请求的 task ID 不等于部署完成。
- 无论成功失败都退出 DSM API 会话并清理临时文件。凭据从 macOS Keychain 读取，不进入命令历史。

正常结果：

- `postgres`、`redis`、`app` 为 running/healthy；
- `migrate`、`harden` 为 exited (0)，这是一次性任务成功，不是故障；
- Container Manager 可能因两个一次性容器退出而把项目汇总显示为 WARNING，应以退出码和三个长期容器健康状态判断。

### 5.3 上线检查

```bash
curl --fail https://massagenote.waltonjin.com/
curl --fail https://massagenote.waltonjin.com/api/v1/health
curl --fail https://massagenote.waltonjin.com/api/v1/health/ready
curl --fail https://massagenote.waltonjin.com/sw.js | grep 'massage-note-v0.12.18'
```

再用真实浏览器完成登录、快速记工“项目 + 时长”、经理修改项目档位和财务页冒烟测试。

仅返回 HTTP 200 不足以验收。还要确认 `app`、`migrate`、`harden` 三个应用容器都使用 `ghcr.io/redonkatonkk/massage-note:<目标版本>`，现有两个数据库卷名未变化，三个长期容器健康，`migrate`/`harden` 退出码为 0。浏览器若仍显示旧界面，先检查 `sw.js` cache 名和强制刷新，不要立即重跑数据库迁移。

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
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  git --staged /repo --redact=100 --no-banner
git ls-files | grep -E '(^|/)\.env($|\.)' || true
git status --short
```

本项目在公开前的基线：Gitleaks 扫描全部 Git 历史为 0 findings；真实秘密只在被忽略的 `.env`。任何后续发现都必须先撤销/轮换密钥，再清理 Git 历史；仅删除当前文件不足以消除历史泄漏。

## 8. 离线备用方案

只有 GHCR 或 NAS 外网不可用时才生成 tar：

```bash
pnpm version:check
./scripts/build-nas-image.sh
shasum -a 256 -c artifacts/massage-note-0.12.18-linux-amd64.tar.sha256
```

然后在 Container Manager 的“映像 → 新增 → 从文件新增”导入。恢复网络后应回到 GHCR 流程，避免本机跨架构构建与大文件上传。

## 9. 本次实操形成的排错表

| 现象 | 真实含义/处理 |
| --- | --- |
| `gh api` 返回 package scope 403 | 当前 `gh` OAuth token 缺少 package scope；运行 `gh auth refresh` 并让用户完成网页授权。 |
| `PATCH /user/packages/...` 返回 404 | GitHub REST API 不支持修改 Package visibility；必须进入 Package Settings 的 Danger Zone 操作。 |
| 公开仓库后匿名 pull 仍 unauthorized | GHCR package 仍为 private；单独修改 package visibility。 |
| 空 `DOCKER_CONFIG` 下提示 `docker buildx` 不存在 | 隔离配置隐藏了 CLI plugin 查找信息；匿名验证改用 `docker manifest inspect`。 |
| CI 本机通过、GitHub typecheck 失败 | 干净 runner 缺生成物或 `DATABASE_URL`；修复 pre-hook/测试 service，不上传本机 `.env`。 |
| CI 集成测试试图创建本机 Compose 测试库 | GitHub 应直接使用 workflow 的一次性 service database；不要调用只面向本机 Docker 的准备脚本。 |
| Container Manager 项目显示 WARNING | 先看 `migrate`/`harden` 是否 exited (0)；一次性容器正常退出可能触发汇总警告。 |
| 更新请求很快返回但线上仍是旧版 | DSM API 只返回异步 task；继续等 build stream 完成，再检查实际容器镜像和 `sw.js`。 |
| 上线后像是数据丢失 | 先核对项目名和卷名；新建了另一 Compose project 会创建新卷，禁止删除任何卷。 |
