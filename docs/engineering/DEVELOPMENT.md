# 开发指南

> 适用版本：`0.12.46`

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

登录页输入 `7705750450`，点击“使用此号码直接进入”，不发送短信。演示库包含 3 位成员、2 个主要项目、热石加项、两类折扣、礼物卡销售，以及最近 7 天内 12 笔已确认记工，覆盖现金、刷卡、礼物卡、混合付款、折扣、加项和高亮场景。

`pnpm demo:seed` 会先应用现有数据库迁移，然后幂等刷新固定演示记录，并把演示日期移动到执行当天之前的最近一周。重复执行不会累加记录；其他本地店铺和非演示记录不会被清空。固定实现位于 [`scripts/seed-local-demo.sql`](../../scripts/seed-local-demo.sql)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 并行启动 Web 与 API，启动前构建共享包 |
| `pnpm typecheck` | 检查全部 workspace 类型 |
| `pnpm test` | 运行领域、契约、Web 辅助函数和 API 非数据库测试 |
| `pnpm test:integration` | 创建/迁移独立测试库并运行数据库与 API 集成测试 |
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

## 修改顺序

### 接口或业务写入

1. 修改 `packages/contracts` 的 Zod 输入契约与测试。
2. 修改纯领域规则与测试；财务公式必须先在 `packages/domain` 固化。
3. 修改 Controller 的 HTTP 适配。
4. 修改 Service 的权限、对象归属、营业日锁和事务。
5. 在同一事务补齐审计与 outbox；保持幂等和乐观锁。
6. 同步 Web 手写类型、API 调用和中英文 UI。
7. 更新 `PRODUCT.md` 或 `API.md` 中唯一负责该概念的说明。
8. 添加正常、越权、跨店、冲突、幂等和历史快照测试。

### 数据库

1. 先修改 Prisma schema。
2. 用描述性时间戳目录新增向前迁移，不编辑已经发布的迁移。
3. 复杂约束写在 SQL migration，并用数据库集成测试覆盖。
4. 删除列、改类型或大规模数据变化使用 expand → backfill → contract 的多次发布。
5. 生产只运行 `prisma migrate deploy`。

### Web

- 同时检查 `zh-CN` 与 `en-US`。
- 检查手机、iPad/横屏和桌面，确保宽表只在自身容器滚动。
- 保持触控尺寸、loading、重复点击保护和 409 刷新流程。
- 不在浏览器端重新发明财务公式或权限判断。
- 业务页和敏感响应不得加入持久离线缓存。

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

## 版本规则

根目录 `VERSION` 是唯一版本号来源。任何准备提交的代码或文档变化都递增语义版本，并同步：

- 根目录和所有 workspace 的 `package.json`
- `CHANGELOG.md`
- `Dockerfile` 的 `APP_VERSION`
- `docker-compose.nas.yml` 和 `.env.nas.example` 的镜像标签
- README、当前产品/开发/架构/接管文档中的版本标记

最后运行 `pnpm version:check`。不要覆盖已经发布的版本镜像标签。

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

## 改动交接

交接说明至少包含：

- 改了什么，以及没有改什么。
- 受影响的文件或模块。
- 实际运行过的验证命令与结果。
- 尚未验证的外部依赖，例如真实 OTP、MiniMax、GHCR 或 NAS。
- 若有迁移：迁移名、兼容策略和回滚边界。

提交前检查 `git status --short` 和 `git diff`，只处理当前任务文件，保留工作区中不属于本次修改的内容。
