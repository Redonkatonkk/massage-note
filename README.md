# Massage note

当前版本：`0.1.0`。后续任何 AI 修补或开发都必须在同一次修改中迭代版本号；完整规则见[《AI 接管与修改指南》](docs/AI_HANDOFF.md)。

面向按摩店的全中文记工与财务管理系统，支持手机、iPad 和电脑。当前仓库已包含可投入部署的第一版：真实数据库、短信登录、多店与成员、今日记工、四级提成、确定性财务、日结、现金与工资结算、审计、实时同步、PWA 和带确认预览的 AI 助手。

## 已实现能力

- Firebase 美国手机号验证、密码登录和服务端 `HttpOnly` 会话；新用户注册必须填写姓名并设置密码，老用户可用验证码补设密码，本地开发登录只能在非生产环境显式开启。
- 退出仅结束服务端会话并保留本机 Firebase 登录状态；再次输入同一号码时可免短信恢复登录。
- 创建/加入多家店铺、审批、角色、参与记工、停用恢复、店主原子转移与店铺软删除。
- 主要项目、额外项目、折扣和“员工项目 → 项目默认 → 员工默认 → 全店默认”四级提成。
- 全中文响应式今日表格、快速记工、详情修改、付款确认、打卡、排序、隐藏、软删除与恢复。
- 大费、小费、折扣、工资、现金保留/上交、老板尚欠与超额支付的整数美分确定性计算。
- 正常/强制/取消日结、现金结清/回退和工资支付/调整账本。
- 财务筛选、可追溯明细、CSV 导出、管理页和完整审计查询。
- PostgreSQL Outbox + SSE 多设备变更通知；断线后以 REST 真相重新加载。
- 可安装 PWA、断网提示、七天内编辑草稿恢复；敏感业务页不写入持久离线缓存。
- MiniMax 记工/财务助手、Google 语音转写、服务器 canonical 预览、一次性幂等确认；外部 AI 未配置时安全降级。
- Docker 生产编排、非 root 应用容器、独立数据库运行账号、Redis 限流、健康检查、备份恢复脚本与 CI。

## 工程结构

- `apps/web`：Next.js 中文响应式 Web/PWA
- `apps/api`：NestJS REST、SSE、认证、AI 与领域编排
- `packages/domain`：无框架依赖的金额、工资、提成和营业日规则
- `packages/contracts`：前后端共享 Zod 契约
- `packages/database`：PostgreSQL、Prisma schema 与迁移
- `docker`：生产数据库初始化和权限加固
- `scripts`：集成库准备、备份、恢复与维护脚本

## 本地启动

需要 Node.js 24、pnpm 11 和 Docker Compose。

1. 将 `.env.example` 复制为 `.env`。本地无 Firebase 时可保留文件中的开发登录配置；生产绝不能开启它。
2. 执行 `pnpm install`。
3. 执行 `pnpm docker:up` 启动 PostgreSQL 与 Redis。
4. 执行 `pnpm db:generate && pnpm db:deploy`。
5. 执行 `pnpm dev`。
6. 打开 `http://localhost:3000`；API 就绪检查为 `http://localhost:4000/api/v1/health/ready`。

AI 是可选增强：不填写 MiniMax 或 Google 配置，不影响手动记工、结算和后端财务计算。

## 质量命令

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`test:integration` 会创建并迁移独立的 `massage_note_test`，不会清空开发主库。执行前需要本地 PostgreSQL 容器处于健康状态。

## 生产交付

- [AI 接管与修改指南](docs/AI_HANDOFF.md)
- [部署说明](docs/DEPLOYMENT.md)
- [群晖 Container Manager 部署](docs/NAS_DEPLOYMENT.md)
- [API 使用说明](docs/API.md)
- [运维与备份恢复](docs/OPERATIONS.md)
- [安全说明](docs/SECURITY.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- 软件内中文帮助：登录后打开 `/help`
- 产品与金额定义：[PRD.md](PRD.md)
- 架构与实施记录：[ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md](ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md)

生产部署必须使用 HTTPS、真实 Firebase 配置、随机且互不相同的数据库/Redis 密码，并在首次营业前完成一次从备份恢复到独立数据库的演练。
