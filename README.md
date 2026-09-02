# Massage note

当前版本：`0.12.46`

面向美国按摩店的中英文记工与财务管理 Web 应用，支持手机、iPad 和电脑。系统覆盖多店成员、今日记工、礼物卡、提成、确定性财务、日结、现金与工资结算、审计、实时同步和带确认预览的 AI 助手。

## 快速导航

- 想了解业务：[`docs/product/PRODUCT.md`](docs/product/PRODUCT.md)
- 想看代码框架：[`docs/engineering/ARCHITECTURE.md`](docs/engineering/ARCHITECTURE.md)
- 准备本地开发：[`docs/engineering/DEVELOPMENT.md`](docs/engineering/DEVELOPMENT.md)
- 准备部署或排障：[`docs/README.md`](docs/README.md#部署与运行)
- 查全部文档：[`docs/README.md`](docs/README.md)
- 让 AI 接管维护：[`docs/engineering/AI_HANDOFF.md`](docs/engineering/AI_HANDOFF.md)

## 当前能力

- Firebase 美国手机号验证、密码登录和服务端 `HttpOnly` 会话，生产环境硬性关闭开发登录。
- Owner、Manager、Employee 多角色与多店隔离，支持待认领员工、加入审批和店主原子转移。
- 多时长主要项目、额外项目、折扣、四级提成优先级和历史快照。
- 今日/历史营业日记工、待日结日期标记日历、混合付款、礼物卡销售与使用、软删除恢复和多设备 SSE 同步。
- 整数美分确定性计算，覆盖折扣、工资、日结、现金结算、工资账本和财务 CSV。
- 中英文响应式 UI、断网说明、短期本地草稿、个人日结 PNG，以及通过固定 Mac“信息”代理发送员工小结。
- MiniMax 记工/财务助手和短录音转写；写入必须先预览再确认，AI 未配置时核心流程照常可用。
- Docker Compose、GHCR/NAS 镜像、数据库账号加固、Redis 限流、备份恢复脚本和 CI。

## 仓库结构

```text
apps/
  web/          Next.js Web 应用
  api/          NestJS REST、SSE、认证与领域编排
packages/
  domain/       金额、提成、营业日和权限纯函数
  contracts/    前后端共享 Zod 契约
  database/     Prisma schema、迁移和数据库测试
docker/         生产数据库加固与 NAS 入口
scripts/        测试库、版本、备份、恢复和维护脚本
docs/           当前文档与归档设计
```

当前依赖方向、页面路由、API 模块和写入链路见 [`docs/engineering/ARCHITECTURE.md`](docs/engineering/ARCHITECTURE.md)。

## 本地启动

需要 Node.js 24、pnpm 11 和 Docker Compose。

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:deploy
pnpm dev
```

打开 `http://localhost:3000`；API 就绪检查为 `http://localhost:4000/api/v1/health/ready`。本地无 Firebase 时可以显式启用开发登录，生产环境绝不能开启。

需要固定演示数据时运行 `pnpm demo:seed`，然后使用 `+1 (770) 575-0450` 和登录页的“使用此号码直接进入”。脚本会创建 `本地演示店` 及最近一周的多种付款与结算场景；详细说明见 [`docs/engineering/DEVELOPMENT.md`](docs/engineering/DEVELOPMENT.md#固定本地演示数据)。

## 验证

```bash
pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

集成测试使用独立的 `massage_note_test`，不会清空开发主库。完整环境和修改流程见 [`docs/engineering/DEVELOPMENT.md`](docs/engineering/DEVELOPMENT.md)。

## 部署与运维

- 普通 Docker Compose：[`docs/operations/DEPLOYMENT.md`](docs/operations/DEPLOYMENT.md)
- 群晖 Container Manager：[`docs/operations/NAS_DEPLOYMENT.md`](docs/operations/NAS_DEPLOYMENT.md)
- 备份、恢复和排障：[`docs/operations/OPERATIONS.md`](docs/operations/OPERATIONS.md)
- Mac“信息”发送代理：[`docs/operations/MESSAGES_AGENT.md`](docs/operations/MESSAGES_AGENT.md)
- 安全边界：[`docs/operations/SECURITY.md`](docs/operations/SECURITY.md)
- 发布检查：[`docs/operations/RELEASE_CHECKLIST.md`](docs/operations/RELEASE_CHECKLIST.md)
- 版本记录：[`CHANGELOG.md`](CHANGELOG.md)

生产部署必须使用 HTTPS、真实 Firebase 配置、随机且互不相同的数据库/Redis 密码，并在首次营业前完成一次独立数据库恢复演练。
