# 开发指南

> 适用版本：`1.21.0`

本文只记录当前仓库的开发流程。业务含义看 [`PRODUCT.md`](../product/PRODUCT.md)，代码边界看 [`ARCHITECTURE.md`](ARCHITECTURE.md)，HTTP 细节看 [`API.md`](API.md)。

## 环境要求

- Node.js 24
- pnpm 11（仓库锁定 `pnpm@11.9.0`）
- Docker Engine 与 Compose v2
- 本地可用的 3000、4000、5432、6379 端口；数据库和 Redis 端口可通过环境变量改写

## 第一次启动

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:deploy
pnpm dev
```

Web 固定使用 `http://localhost:3000`，用 `curl --fail` 确认可访问，不默认调用浏览器。保留原因：遵循用户的代码验证偏好，并确保验收端口稳定。API 存活与就绪检查分别是：

```text
http://localhost:4000/api/v1/health
http://localhost:4000/api/v1/health/ready
```

Firebase 和 MiniMax 的运行边界见 [安全说明](../operations/SECURITY.md)；本地没有 Firebase 时，Web 与 API 两侧须显式开启开发登录。保留原因：单侧启用不能建立开发会话，生产认证另由强制关闭逻辑保护。

## 固定本地演示数据

本地演示数据使用以下固定身份。保留原因：`seed-local-demo.sql` 按这些标识幂等刷新演示记录，其他本地数据不能被清空。

- 登录号码：`+1 (770) 575-0450`
- 店铺：`本地演示店`
- 角色：店主，可查看和管理财务、工资计算与结算单

`.env` 中须保持以下本地开发配置；密钥只用于签署本机开发会话，不得复制到生产环境。保留原因：开发会话签名不能替代生产身份验证。

```dotenv
NEXT_PUBLIC_DEV_AUTH_ENABLED=true
DEV_AUTH_ENABLED=true
DEV_AUTH_SECRET=至少32个字符的本地随机字符串
```

首次建立或需要刷新演示数据时运行：

```bash
pnpm docker:up
pnpm demo:seed
pnpm dev
```

登录页输入 `7705750450`，点击“使用此号码直接进入”，不发送短信。演示库包含 1 位店主和 4 位员工、5 个主要项目、热石加项、两类折扣、礼物卡销售，以及过去 6 天 12 笔和执行当天 22 笔已确认记工（店主 3 笔，小美 4 笔，安娜 5 笔，莉莉 6 笔，大卫 4 笔），覆盖现金、刷卡、礼物卡、混合付款、折扣、加项和高亮场景。

`pnpm demo:seed` 会先应用现有数据库迁移，然后幂等刷新固定演示记录，并把演示日期移动到执行当天及之前的最近一周。重复执行不会累加记录；其他本地店铺和非演示记录不会被清空。固定实现位于 [`scripts/seed-local-demo.sql`](../../scripts/seed-local-demo.sql)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 并行启动 Web 与 API，启动前构建共享包 |
| `pnpm typecheck` | 检查全部 workspace 类型 |
| `pnpm test` | 运行仓库工具、领域、契约、Mac 代理、Web 辅助函数和 API 非数据库测试 |
| `pnpm test:tooling` | 运行仓库脚本的 Node.js 内置测试 |
| `pnpm test:integration` | 创建/迁移独立测试库并运行数据库与 API 集成测试 |
| `python3 -m unittest discover -s integrations/langbot-plugin/tests -v` | 运行 LangBot 插件边界与解析测试（CI 当前未执行） |
| `pnpm build` | 检查版本一致性并构建全部 workspace |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:validate` | 校验 Prisma schema |
| `pnpm db:migrate` | 本地创建新迁移；不能用于生产 |
| `pnpm db:deploy` | 应用现有迁移，本地和生产均可用 |
| `pnpm demo:seed` | 应用迁移并创建或刷新固定本地演示数据 |
| `pnpm docker:status` | 查看本项目 PostgreSQL/Redis 状态 |
| `pnpm version:check` | 检查版本号、镜像标签和文档标记 |
| `pnpm docs:check` | 检查仓库 Markdown 的本地文件/目录链接目标 |
| `pnpm ui:check` | 检查全部样式断点的颜色/圆角来源和记工面板共享规则 |
| `pnpm ui:mobile` | 核对全部路由与常用弹层在 320–760px 的 DOM 层叠样式，不启动浏览器 |

手机阅读顺序和低频操作另由 [真实组件回归](../../apps/web/app/ui/mobile-reading.test.tsx) 验证，包含真实 DOM 在 320–900px 与桌面的展示切换、恢复/取消确认、金额对应、权限与帮助主题展开。复核范围见 [手机复核记录](MOBILE_REVIEW_2026-10-04.md)。保留原因：代表性样式结构不能替代真实组件和操作验证，二者都不构成浏览器视觉实测。

`pnpm test:integration` 默认使用 `massage_note_test`，不会清空 `massage_note` 开发库。若默认数据库端口被占用：

```bash
POSTGRES_HOST_PORT=55432 REDIS_HOST_PORT=56379 pnpm docker:up
MASSAGE_NOTE_TEST_DATABASE_URL='postgresql://massage:massage@localhost:55432/massage_note_test' pnpm test:integration
```

不要为了测试停止、删除或重建不属于本项目的容器与数据卷。保留原因：独立测试数据库不授权操作其他项目或生产数据。

## 修改规则

- 接口变化同步共享契约、Controller、Service、Web 调用与 [API 文档](API.md)；公式变化先修改领域函数和对应测试。保留原因：多个调用端必须采用相同输入语义和金额来源。
- 写入沿用现有权限、对象归属、营业日锁、版本、幂等、审计/outbox 与事务，验证正常和失败路径。保留原因：重构不能使跨店、重复请求或半笔账成为有效写入。
- 数据库只追加描述性前向迁移，不改已发布迁移；生产使用 `prisma migrate deploy`，破坏性变化分阶段。保留原因：已有数据库必须能按同一历史重放升级，旧容器也需兼容过渡 schema。
- Web 刷新复用 `refresh-queue.ts`，切店/卸载使旧结果失效；日历缓存规则以 [产品规则](../product/PRODUCT.md) 为准。保留原因：合并请求与过期响应隔离已有公共实现，重复定义缓存失效范围会产生冲突。
- 视觉维护遵循 [UI 设计](UI_DESIGN.md)，样式变化运行 `pnpm ui:check`、`pnpm ui:mobile`；成员交互变化运行 `pnpm --filter @massage-note/web exec vitest run app/manage/members-panel.test.tsx`。保留原因：变量来源、手机层叠样式和草稿/冲突流程分别由对应检查覆盖；CI 同步运行两项样式检查，代码验证不代表视觉实测。
- 图片主题与换行统一在 `packages/domain/src/image-layout.ts`，工资结算修改共享 `employee-settlement-image.ts`，个人日结修改共享 `employee-closing-image.ts`；同步检查对应 domain、Web `lib/*-image.test.ts` 与 Mac 代理 `test/settlement-render.test.ts`／`test/render.test.ts`。核对对象与日期、主要收入、来源汇总、时间顺序明细，以及精确金额、长文字、未知／零值和待结账提示；区间保留每天总结最左及长图容量边界，个人日结保留固定源宽和 Web 分享／下载适配。保留原因：Web 与代理使用不同图片转换环境，网页 CSS 检查不能覆盖附件阅读顺序和完整账目。
- 保留 loading、重复点击保护和 409 核对；前端不另算最终财务或持久缓存业务响应。保留原因：等待状态、失败恢复和账目真相不能因清理丢失。
- TypeScript workspace 继承未使用变量/参数检查；domain/contracts 测试放 `test/`，生产构建排除测试。保留原因：类型检查能发现局部死代码，构建产物不应混入测试入口。

## 完成前验证

按改动选择必要验证，已通过且未受后续改动影响的检查不重复；默认仅代码、命令行/API 验证，用户在具体任务中要求时才使用浏览器。保留原因：这是用户的长期验证范围，减少重复开销。以下是完整命令，发布预检与 CI 分工见 [NAS 手册](../operations/NAS_DEPLOYMENT.md)。

```bash
pnpm version:check
pnpm docs:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

文档整理也至少运行 `pnpm version:check`、`pnpm docs:check` 和 `git diff --check`。链接检查覆盖 Git 已跟踪和未忽略的新 Markdown 文件，检查行内链接、图片与引用式链接的本地文件/目录目标，跳过代码示例；外部 URL 与标题锚点不在此命令的校验范围。保留原因：版本和本地链接各有独立检查，文档中的行为声明还须有实现证据。若文档修改涉及命令、路由、契约、金额或部署事实，还要运行相应代码验证；正式发布遵循完整 [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md)。

## 版本同步位置

修改与版本规则以 [AGENTS.md](../../AGENTS.md) 为准。以下同步清单的保留原因：`scripts/check-version.mjs` 会逐项校验它们。

- 根目录 `VERSION`、根目录及所有 workspace 的 `package.json`。
- `CHANGELOG.md`、`Dockerfile` 的 `APP_VERSION`。
- `docker-compose.nas.yml` 和 `.env.nas.example` 的镜像标签。
- README、当前产品、API、架构、开发、接管及 NAS 文档的版本标记。

已发布镜像不覆盖旧版本标签。保留原因：生产升级和回滚须定位可追溯的固定产物。

## 文档分工

| 内容 | 维护位置 |
| --- | --- |
| 产品范围、权限、金额定义 | `docs/product/PRODUCT.md` |
| 当前模块与数据流 | `docs/engineering/ARCHITECTURE.md` |
| HTTP 接口 | `docs/engineering/API.md` |
| 本地开发与验证 | `docs/engineering/DEVELOPMENT.md` |
| 普通/NAS 部署 | `docs/operations/DEPLOYMENT.md`、`docs/operations/NAS_DEPLOYMENT.md` |
| 备份与故障处理 | `docs/operations/OPERATIONS.md` |
| Mac“信息”代理安装与排障 | `docs/operations/MESSAGES_AGENT.md` |
| 安全边界 | `docs/operations/SECURITY.md` |
| 已发布变化 | `CHANGELOG.md` |

不要把一次性容器 ID、PID、临时 tunnel、真实域名凭据或逐日开发流水写入当前文档。历史设计需要保留时移到 `docs/archive/`，并明确标为归档。保留原因：当前手册应可重复执行，临时标识与旧计划不是维护规则。

## 修改后的本地测试服务

每次完成任何项目改动，包括代码、配置和文档，都要重新运行 `pnpm dev`，保持 Web 使用 `http://localhost:3000`，通过命令行确认就绪供用户测试，默认不打开浏览器。先检查 3000/4000 端口的进程归属，只重启本项目服务；端口被其他项目占用时不得擅自终止或改用其他端口。确认 Web 可访问以及 API `/api/v1/health/ready` 就绪后，保持开发进程运行。保留原因：用户测试须访问本次代码，固定端口和进程归属可避免影响其他项目；该要求不授予 NAS 部署权限。

## 改动交接

- 报告修改模块、实际验证结果、尚未验证的外部依赖和必要的迁移边界。保留原因：本地验证不等于生产或外部平台验收。
- 提交前检查 `git status --short` 和 `git diff`，只处理本次任务文件。保留原因：同一工作区可能同时承载其他未提交任务。
- 发布授权与 NAS 提醒遵循 [AGENTS.md](../../AGENTS.md)。保留原因：避免在各文档复制不同发布授权规则。

## LangBot 插件目录

插件源码与后端在同一仓库维护，入口见 [插件开发指南](../../integrations/langbot-plugin/DEVELOPMENT.md)。安装包输出到插件的 `dist/`，旧包保留在 `dist/archive/`；LangBot 的运行数据位于工作区兄弟仓库的 `langbot-local/docker/data/`，不作为源码修改。
