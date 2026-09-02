# AI 接管指南

> 最后核对：2026-09-02（America/New_York） · 当前版本：`0.12.45`
> 目标：用最少上下文安全维护 Massage note；历史过程查 Git 和 [`CHANGELOG.md`](../../CHANGELOG.md)。

## 1. 接手顺序

1. 运行 `git status --short --branch`，区分用户改动、生成物和本轮任务；不要覆盖不属于当前任务的变化。
2. 阅读 [`docs/README.md`](../README.md) 的文档索引，再按任务阅读当前产品、架构、开发或 API 文档。
3. 用 `rg` 定位相关代码、契约、schema 和测试。文档与实现冲突时，按文档索引的事实优先级核对并同步修正文档。
4. 修改后按 [`DEVELOPMENT.md`](DEVELOPMENT.md) 运行相称验证；正式发布使用完整发布清单。
5. 所有准备提交的变化，包括纯文档，都按语义版本迭代并更新 `CHANGELOG.md`。

不要使用 `docs/archive/` 判断当前路由、目录或待办；那里只保留初始设计背景。

## 2. 项目定位

Massage note 是面向美国按摩店的中英文记工与财务 Web 应用。它是 pnpm workspace 模块化单体，不是微服务：

```text
apps/web             Next.js App Router Web 应用
apps/api             NestJS REST、SSE、认证、AI 与领域编排
packages/domain      金额、提成、营业日和权限纯函数
packages/contracts   前后端共享 Zod 输入契约
packages/database    Prisma schema、迁移和数据库约束测试
docker               生产数据库加固与 NAS 入口
scripts              测试库、版本、备份、恢复和维护脚本
```

当前模块、路由、依赖方向和数据流只在 [`ARCHITECTURE.md`](ARCHITECTURE.md) 维护。不要编辑 `dist`、`.next`、`out`、Prisma 生成客户端或 `tsconfig.tsbuildinfo`。

## 3. 不可破坏的业务规则

### 财务与历史

- PostgreSQL 是唯一业务真相来源；前端状态、本地草稿和 SSE 不构成第二套账。
- 所有持久金额使用整数美分，领域层最终计算使用 `bigint`；提成以 basis points 表示。禁止用 JavaScript 浮点数完成最终财务计算。
- 财务公式事实来源为 `packages/domain/src/finance.ts`。先改纯函数和测试，再改服务、查询、UI 与 [`PRODUCT.md`](../product/PRODUCT.md)。
- 记工保存项目名称、时长、价格、折扣、提成及来源、工资、店铺时区和营业日截止快照。目录变化不能改写已日结历史。
- 提成优先级固定为：员工项目专属 → 员工默认 → 项目默认 → 全店默认。
- 折扣由店铺承担，不减少员工大费工资。
- 角色和“是否参与记工”是两个维度；Owner 可有服务收入但不成为自己的工资结算对象，参与记工的 Manager 与 Employee 一样结算。

核心公式：

```text
折前大费       = 主要项目 + 额外项目
折后大费       = 折前大费 - 折扣
实收服务费     = 现金大费 + 刷卡大费 + 礼物卡大费
小费           = 现金小费 + 刷卡小费 + 礼物卡小费
员工总收入     = 各项目分别舍入后的大费工资 + 小费
今日/总流水    = 折后大费 + 礼物卡销售 - 礼物卡核销支出
店铺收入       = 折后大费 + 小费 - 员工总收入 + 礼物卡销售 - 礼物卡核销支出
```

礼物卡销售记录面值、折扣规则和实际收款快照；使用侧记录序列号和每次金额，但当前不维护或强制校验余额。个人日结“应提交现金”和每日现金结算是不同口径，不能互相替换；详细定义以产品文档为准。

### 营业日、权限与状态

- 营业日由店铺 IANA 时区和 `HH:mm` 截止时间决定，事实来源是 `packages/domain/src/business-day.ts`。
- 权限事实来源是 `packages/domain/src/permission.ts`；活跃成员与对象归属在 `store-access.service.ts` 再校验。
- Employee 可写当前营业日全员记工，但不能写历史、管理设置或查看他人历史财务。
- 日结后当日业务数据只读；Owner/Manager 必须先取消日结。取消日结会让相关现金结算失效重做，但保留工资账本。
- 店铺、成员、目录、记工、礼物卡销售和工资结算使用软删除/恢复，不直接物理删除业务历史。
- 待认领员工的 `userId` 可为空；自动认领只能按账号注册 First Name 与本店待认领显示名规范化精确匹配。

## 4. 写入一致性

Controller 只做 HTTP 适配。权限、对象归属、状态与事务放在 Service 或 domain；跨表写入必须在同一 Prisma transaction 完成业务数据、审计日志和 outbox。

同一店铺营业日的记工、表格、日结和现金结算写入必须使用 `apps/api/src/common/business-day-lock.ts` 的事务级 advisory lock。不要另建锁键，也不要在锁外检查日结状态。

所有关键写入还要保持：

- `Idempotency-Key`：同键同请求返回原结果，同键不同请求返回 409。
- `version` 乐观锁：更新、删除、恢复和结算不能无条件覆盖。
- 租户与对象归属：每个业务 Service 都验证 `storeId`、成员状态和能力。
- 审计与 outbox：必须和业务变化同事务。
- JSON 安全：BigInt 通过 `JsonSafeInterceptor` 转换，冲突响应的 `latestResource` 也不能退化为 500。
- SSE：只发送变化通知，客户端收到后重新请求 REST。

常规 API 修改顺序见 [`DEVELOPMENT.md`](DEVELOPMENT.md)。字段事实来源为 `packages/contracts/src`，端点说明在 [`API.md`](API.md)。

## 5. 认证与安全

- 生产链路统一为 Firebase ID token → `POST /auth/session` → 服务端 `Secure`、`HttpOnly`、`SameSite=Lax` 会话 Cookie。
- 密码使用带随机盐的 `scrypt-v1`，长度 8–72；任何响应都不能返回密码摘要。
- 登录初始化使用双提交 CSRF；其他 Cookie 写请求要求 `Origin` 精确匹配 `WEB_ORIGIN`。
- 开发登录必须同时满足非生产环境、API `DEV_AUTH_ENABLED=true` 和 Web `NEXT_PUBLIC_DEV_AUTH_ENABLED=true`；生产双侧关闭。
- 不记录或提交手机号、OTP、Cookie、token、私钥、数据库 URL、短信正文或 AI 密钥。
- Firebase 验证码只用于认证，不用于加入审批等自定义业务短信。

完整租户隔离和部署责任见 [`SECURITY.md`](../operations/SECURITY.md)。当前不启用依赖连接会话变量的不完整 PostgreSQL RLS。

## 6. AI 与外部服务

AI 是可选增强；未配置时手动记工和确定性财务必须正常工作。

- 记工：模型理解 → 服务端保存 canonical preview → 用户核对 → 明确确认 → 重新鉴权与幂等写入。
- 财务：后端确定性查询负责数字，模型只解释；AI 没有任意 SQL、URL、文件或通用写工具。
- 文字和语音遵循 `locale`；语音为 6–60 秒 MP4/AAC，最多 8 MB，应用不持久化原音频。
- 外部凭据只通过秘密环境变量注入，不能进入镜像层、文档或前端 bundle。

## 7. 数据库与部署

- Prisma schema 位于 `packages/database/prisma/schema.prisma`；迁移只向前追加，生产只使用 `prisma migrate deploy`。
- 删除列、改类型和大规模变换采用 expand → backfill → contract。
- 管理账号负责迁移，应用账号只做业务 DML，不得成为 superuser、表拥有者或 `BYPASSRLS`。
- 普通生产部署见 [`DEPLOYMENT.md`](../operations/DEPLOYMENT.md)，群晖流程见 [`NAS_DEPLOYMENT.md`](../operations/NAS_DEPLOYMENT.md)，备份恢复见 [`OPERATIONS.md`](../operations/OPERATIONS.md)。

当用户明确说“更新部署”时，视为完整发布授权：同步文档与版本，只提交本次项目文件，push 后等待该 commit 的 CI 与 GHCR 版本镜像成功，再按 NAS 手册备份、迁移、升级项目 `mn` 并完成线上验收。不能把它缩减为只改本地代码，也不能跳过 CI、备份或健康检查。

Mac“信息”代理的安装与排障以 [`MESSAGES_AGENT.md`](../operations/MESSAGES_AGENT.md) 为准。正式实现必须后台静默运行：禁止模拟键盘、粘贴剪贴板、激活 Messages 窗口或按相册“最近项”猜测附件。新 Mac 只给 `Massage Note Attachment Stager.app` 完全磁盘访问；LaunchAgent 必须通过 LaunchServices 以该 App 身份启动暂存，不能直接执行 App 内二进制。暂存程序验证路径、任务 UUID、固定文件名及 PNG/JPEG 文件头，再写入 Messages 自有附件目录，并只返回与任务 UUID 绑定的结果。个人日结发送一张 PNG；员工区间结算只发送一张专门重新排版的 JPEG 长图，顶部保留三张汇总卡，下面按营业日分组排列记工卡片并以“当日总结”收尾；同日卡片必须自动换行，任何项目或付款文字都不得用省略号截断。不生成 PDF、独立摘要图或分页拼接图。不得扩大为 Node/终端全盘访问，也不得读写聊天数据库。

真实部署秘密只可从被 Git 忽略且权限受限的本地文件或系统钥匙串读取，不得复制到文档、输出或 GitHub。恢复具有覆盖性，只能对明确确认的目标数据库执行；未经授权不要删除任何开发或生产数据卷。

## 8. 验证与交接

本地完整基线：

```bash
pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

测试数字会随用例变化，不在本文件维护易过时的“最近通过 N 项”。交接时报告实际命令结果、未验证的外部依赖和任何迁移边界。

版本事实源是根目录 `VERSION`；需要同步的文件清单和文档分工见 [`DEVELOPMENT.md`](DEVELOPMENT.md)。

## 9. 明确不在当前范围

- 工资税、W-2、1099、报税或法律合规计算。
- 退款和负金额；未来应做独立冲正流程。
- 离线业务写入与自动冲突合并。
- 店内共用设备 PIN、原生 iOS 应用。
- 自动维护礼物卡余额或会员余额。
- 依赖连接变量的 RLS。
- AI 直接执行 SQL、访问任意 URL/文件或绕过预览写财务。

进入这些范围前先做产品和技术设计，不要在现有接口中悄悄扩大语义。
