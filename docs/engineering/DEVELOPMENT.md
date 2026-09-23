# 开发指南

> 适用版本：`1.9.4`

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

打开 `http://localhost:3000`。API 存活与就绪检查分别是：

```text
http://localhost:4000/api/v1/health
http://localhost:4000/api/v1/health/ready
```

Firebase 和 MiniMax 都可以不配置。没有 Firebase 时，只能在本地把 Web 与 API 两侧的开发登录显式打开；生产环境始终禁止开发登录。

## 固定本地演示数据

本地开发统一使用以下演示身份：

- 登录号码：`+1 (770) 575-0450`
- 店铺：`本地演示店`
- 角色：店主，可查看和管理财务、工资计算与结算单

`.env` 中须保持以下本地开发配置；密钥只用于签署本机开发会话，不得复制到生产环境：

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
| `pnpm test` | 运行领域、契约、Web 辅助函数和 API 非数据库测试 |
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

`pnpm test:integration` 默认使用 `massage_note_test`，不会清空 `massage_note` 开发库。若默认数据库端口被占用：

```bash
POSTGRES_HOST_PORT=55432 REDIS_HOST_PORT=56379 pnpm docker:up
MASSAGE_NOTE_TEST_DATABASE_URL='postgresql://massage:massage@localhost:55432/massage_note_test' pnpm test:integration
```

不要为了测试停止、删除或重建不属于本项目的容器与数据卷。

## 修改规则

- 接口修改同步共享契约、Controller、Service、Web 调用及对应主文档；财务公式先在领域函数固化。
- 业务写入保持权限、归属、营业日锁、事务内审计/outbox、幂等和版本检查，并验证正常及失败路径。
- 数据库变化使用描述性前向迁移，不改已发布迁移；生产只运行 `prisma migrate deploy`，破坏性变化分阶段迁移。
- Web 记工刷新沿用 `apps/web/lib/refresh-queue.ts`，切店和卸载使旧结果失效。
- 响应式样式放在 `apps/web/app/responsive.css`，复用共享组件，检查 320、390、768、1280px、中英文及展开状态。
- 保留 loading、重复点击保护和 409 重新核对流程，不在浏览器另算财务或持久缓存敏感业务响应。

## 完成前验证

默认完整基线：

```bash
pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

文档整理也至少运行版本检查、Markdown 链接检查和 `git diff --check`。若文档修改涉及命令、路由、契约、金额或部署事实，还要运行相应代码验证；正式发布遵循完整 [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md)。

## 版本同步位置

修改与版本规则以 [AGENTS.md](../../AGENTS.md) 为准。以下清单保留，因为 `scripts/check-version.mjs` 会逐项校验：

- 根目录 `VERSION`、根目录及所有 workspace 的 `package.json`。
- `CHANGELOG.md`、`Dockerfile` 的 `APP_VERSION`。
- `docker-compose.nas.yml` 和 `.env.nas.example` 的镜像标签。
- README、当前产品、API、架构、开发、接管及 NAS 文档的版本标记。

已发布镜像不覆盖旧版本标签。

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

不要把一次性容器 ID、PID、临时 tunnel、真实域名凭据或逐日开发流水写入当前文档。历史设计需要保留时移到 `docs/archive/`，并明确标为归档。

## 修改后的本地测试服务

每次完成任何项目改动，包括代码、配置和文档，都要重新运行 `pnpm dev`，保持 Web 使用 `http://localhost:3000`，并打开页面供用户测试。先检查 3000/4000 端口的进程归属，只重启本项目服务；端口被其他项目占用时不得擅自终止或改用其他端口。确认 Web 可访问以及 API `/api/v1/health/ready` 就绪后，保持开发进程运行。该要求不授予 NAS 部署权限。

## 改动交接

- 报告修改模块、实际验证结果、尚未验证的外部依赖和必要的迁移边界。
- 提交前检查 `git status --short` 和 `git diff`，只处理本次任务文件。
- 发布授权与 NAS 提醒遵循 [AGENTS.md](../../AGENTS.md)。

## LangBot 插件目录

插件源码与后端在同一仓库维护，入口见 [插件开发指南](../../integrations/langbot-plugin/DEVELOPMENT.md)。安装包输出到插件的 `dist/`，旧包保留在 `dist/archive/`；LangBot 的运行数据位于工作区兄弟仓库的 `langbot-local/docker/data/`，不作为源码修改。
