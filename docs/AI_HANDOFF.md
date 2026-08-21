# AI 接管指南

> 最后核对：2026-08-21（America/New_York）
> 当前版本：`0.12.10`
> 目标：用最少上下文安全修改 Massage note；历史过程请查 Git 和 `CHANGELOG.md`。

## 1. 接手顺序

1. 运行 `git status --short --branch`，先区分用户改动、生成物和本轮任务；不要覆盖不属于你的变化。
2. 阅读本文件。产品或金额规则看 [`PRD.md`](../PRD.md)，当前接口看 [`API.md`](API.md)。
3. 按任务定位代码和测试；文档与实现冲突时，以 Prisma schema、Zod 契约、领域函数和自动化测试为准，并同步修正文档。
4. 修改后至少运行 `pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`。
5. 所有准备提交的修改（包括纯文档）都必须迭代版本并更新 `CHANGELOG.md`。

运行要求：Node.js 24、pnpm 11、Docker Compose。Web 默认在 `http://localhost:3000`，API ready 检查为 `http://localhost:4000/api/v1/health/ready`。

## 2. 产品与架构

Massage note 是面向美国按摩店的中英文记工与财务 Web/PWA，默认中文，用户可在任意页面切换并在本机持久保存偏好。Web 会从目录与记工快照 API 响应中注册店铺自定义项目名，英语界面按按摩行业词库自动显示英译，不改写 API 数据、表单编辑值或历史快照。它是 pnpm workspace 模块化单体，不是微服务：

```text
apps/web             Next.js App Router Web/PWA
apps/api             NestJS REST、SSE、认证、领域编排和 AI
packages/domain      金额、提成、营业日和权限纯函数
packages/contracts   前后端共享 Zod 输入契约
packages/database    Prisma schema、迁移和数据库约束测试
docker               生产数据库初始化与权限加固
scripts              集成库、备份、恢复和维护脚本
```

主要页面：

| 路径 | 用途 |
| --- | --- |
| `/` | 今日/历史营业日记工 |
| `/finance` | 财务、日结、现金和工资结算 |
| `/manage` | 店铺、成员、目录、提成、回收站、审计 |
| `/profile` | 资料、密码、店铺切换、退出 |
| `/login` | Firebase 手机验证、密码或开发登录 |
| `/assistant` | 旧书签兼容入口；AI 主入口在今日和财务悬浮窗 |
| `/help`、`/offline` | 中英文帮助、断网降级 |

店铺上下文来自有效成员关系与本地偏好 `massage_note_store_id`，不编码在 URL。切换店铺时必须重置店铺相关页面状态和 AI 对话，API 仍须重新校验成员关系。

常用入口：

- API：`auth`、`users`、`stores`、`boards`、`work-records`、`gift-cards`、`finance`、`audit`、`realtime`、`ai`。
- Web：`massage-note-app.tsx`、`today-board.tsx`、`gift-card-sales.tsx`、`record-editor.tsx`、`finance-page-client.tsx`、`manage-page-client.tsx`、`floating-ai-assistant.tsx`。
- `apps/web/lib/types.ts` 有手写响应类型；响应结构变化时需手动同步。

不要编辑 `dist`、`.next`、`out`、Prisma 生成客户端或 `tsconfig.tsbuildinfo`。

## 3. 不可破坏的业务规则

### 3.1 财务

- PostgreSQL 是唯一业务真相来源；前端缓存和 SSE 只负责体验与通知。
- 所有持久金额使用整数美分，领域层使用 `bigint`；提成用 basis points（`10000 = 100%`）。禁止用 JavaScript 浮点数完成最终财务计算。
- 公式事实来源为 `packages/domain/src/finance.ts`。先改纯函数和测试，再改服务、查询和 UI。
- 记工创建时必须快照项目名称、金额、时长、提成及来源、工资、折扣、店铺时区和营业日截止时间。历史数据不能随当前目录变化。
- 提成优先级是员工项目专属 → 员工默认 → 项目默认 → 全店默认。保存员工默认或项目专属提成会重算该员工未日结的当前营业日记工、重开受影响的现金结算；已日结及更早历史快照保持不变。
- 一个主要项目拥有一个或多个 `priceOptions`（时长/价格档位）。新记工必须以项目和时长共同解析价格；项目提成仍属于项目层。数据库暂时保留 `service_items` 的旧时长/价格列用于滚动部署兼容，新业务不得读取它们。

核心公式：

```text
折前大费       = 主要项目 + 额外项目
折后大费       = 折前大费 - 折扣
实收服务费     = 现金大费 + 刷卡大费 + 礼物卡大费
付款差额       = 实收服务费 - 折后大费
小费           = 现金小费 + 刷卡小费 + 礼物卡小费
大费工资       = 各项目分别 roundHalfUp(金额 × 提成 / 10000) 后相加
员工总收入     = 大费工资 + 小费
```

折扣由店铺承担，不减少员工大费工资。服务费差额允许存在，但必须提示并保存。现金/刷卡/礼物卡大费至少填写一项；三种小费可以同时留空并按 0 处理。使用礼物卡时必须保存序列号，未使用时序列号可以省略或为 `null`；礼物卡属于非现金付款，不增加员工现金结算。记工详情的“保存并确认付款”是详情 PATCH 与付款确认两阶段操作：第一阶段成功后前端必须立即采用响应中的最新 `version`，否则第二阶段失败后的重试会永久撞上旧版本冲突。

每日卖卡使用独立 `gift_card_sales` 记录：新表单默认显示每店计数器从 1001 提供的建议号码，未修改时由服务端在事务内自动分配，也允许提交自定义序列号。序列号按 NFKC、大小写和空白规范化后同店防重，已软删除号码也不得用于新销售；`face_value_cents - discount_cents = amount_cents = cash_cents + card_cents > 0`。折扣使用售出时的门槛和比例快照，操作人必须是本店在职成员。实际收款全部计入店铺收入、不参与员工分成，也不进入员工现金结算；`店铺收入 = 折后大费业绩 + 小费 - 员工总收入 + 礼物卡销售实际收款`。消费侧按规范化序列号汇总多条使用记录，但当前不维护或强制校验礼物卡余额，以兼容上线前已售卡。

个人日结“应提交现金”与每日现金结算是两个口径：个人日结固定按所有含现金大费的已确认项目折前大费基数合计的 40% 计算，不减折扣，也不读取实际收到的现金大费作为金额基数；现金结算仍按真实现金流和实际取得工资核对。个人日结的现金大费分红等于已确认记工按现金付款比例分配的工资，刷卡大费分红等于未通过现金分配的剩余工资（包括免费项目工资）；现金小费和刷卡小费分红分别汇总已确认的对应小费。混合付款沿用确认付款时的比例分摊，四项分红之和等于已确认记工的大费工资与小费合计。

周一至周四自动折扣是店铺级规则：按记工营业日判断星期，以主要项目加额外项目的折前大费判断门槛，命中后生成 `isAutomatic` 折扣快照。自动折扣可以和手动折扣同时存在，但同样不进入员工工资公式；店铺设置变化不得批量改写历史记录。记工详情允许为单笔记录持久设置 `automaticDiscountSuppressed`，移除或恢复自动折扣只影响该记录，不改变全店规则。

记工高亮使用 `work_records.is_highlighted` 持久字段，默认 `false`。它只影响今日卡片展示、财务记工集合筛选和导出标记，不得进入金额、提成、日结、现金或工资公式。`highlightFilter` 的 `ALL`、`ONLY_HIGHLIGHTED`、`EXCLUDE_HIGHLIGHTED` 必须同时作用于财务汇总、组成明细和 CSV。

只有 `SETTLED` 的现金结算进入余额。Owner 可参与记工并计入经营统计，但不成为工资结算对象；参与记工的 Manager 与 Employee 一样结算。

### 3.2 营业日、权限与状态

- 营业日由店铺 IANA 时区和 `HH:mm` 截止时间决定；截止前属于当日，等于或晚于截止时间属于下一营业日。事实来源：`packages/domain/src/business-day.ts`。
- 角色与“是否参与记工”是两个维度。权限事实来源：`packages/domain/src/permission.ts`；对象归属和活跃成员校验在 `store-access.service.ts`。
- Employee 可写当天全员记工，但不能写历史、查看他人历史财务或管理设置。Manager 不能转移店主或删除店铺。
- 日结后禁止修改当日记工；Owner/Manager 必须先取消日结。取消日结会使相关现金结算失效重做，但保留工资账本。
- 店铺、成员、目录、记工和工资结算使用软删除/恢复。`/me` 和店铺切换器必须过滤已删除或非活跃店铺。
- Owner/Manager 可创建 `userId = null` 的待认领员工；员工加入店铺时只按账号注册 First Name 与本店待认领显示名做规范化精确匹配，并在原 membership 上绑定账号，禁止按加入表单临时名字冒领。

## 4. 写入一致性与 API 规则

Controller 只做 HTTP 适配；权限、状态和对象归属在 Service 或 domain 校验。跨表业务写入必须在同一 Prisma transaction 内完成业务数据、审计日志和 outbox。

同一店铺营业日的记工、表格、日结和现金结算写入必须先取得 `apps/api/src/common/business-day-lock.ts` 的事务级 advisory lock。不要另建不同的锁键或在锁外检查日结状态，否则会重新引入“日结同时写入”的竞态。

其他强制规则：

- 关键写入使用 `Idempotency-Key`；同键同请求返回原结果，同键不同请求返回 409。
- 可修改资源使用 `version` 乐观锁；更新、删除、恢复和现金结算不能无条件覆盖。
- 批量现金结清只更新未结清行，不能重写已结清行的版本、时间、操作人或备注。
- SSE 只发送变化通知，客户端收到后重新请求 REST；不要把 SSE payload 变成第二套数据源。
- 所有权限都由 API 最终执行；隐藏前端按钮不构成权限控制。

常规 API 修改顺序：contracts/Zod → 契约测试 → Controller 解析 → Service 权限和事务 → 审计/outbox → Web 类型与调用 → `docs/API.md` → 正常、越权、跨店、冲突和幂等测试。

统一错误结构：

```json
{
  "code": "STABLE_MACHINE_CODE",
  "messageZh": "给用户看的中文说明",
  "requestId": "日志关联编号",
  "latestResource": null
}
```

API 业务错误继续提供稳定 `code` 与简体中文 `messageZh`；Web 默认显示中文，英语模式在 `apps/web/lib/i18n.ts` 按稳定错误码显示英语说明，未知错误码必须安全降级为通用英语提示。页面固定文案、动态状态、无障碍标签和个人日结图片也必须随语言切换。BigInt 响应由 `JsonSafeInterceptor` 安全转换，超过 JavaScript 安全整数范围时应拒绝而非丢精度。异常过滤器附加的 `latestResource` 同样必须调用 `toJsonSafe`；过滤器本身绝不能因不可序列化字段把 409 冲突响应变成 500。

## 5. 认证与安全

生产登录最终统一为 Firebase ID Token → `POST /auth/session` → Firebase Admin 验证 → 服务端会话 Cookie。支持新用户短信注册、老用户密码登录和同设备 Firebase 状态恢复。

- 密码使用随机盐 `scrypt-v1`，长度 8–72；`/me` 只返回 `hasPassword`，绝不能返回摘要。
- 验证码确认和 API 会话建立是两个错误边界。Firebase 成功但 API 失败不能显示“验证码错误”。
- 登录初始化使用双提交 CSRF；其他 Cookie 写请求要求 `Origin` 精确匹配 `WEB_ORIGIN`。
- Cookie 必须为 `Secure`、`HttpOnly`、`SameSite=Lax`。普通退出只清服务端会话；撤销全部会话是独立操作。
- 开发登录仅在非生产且 API `DEV_AUTH_ENABLED=true`、Web 构建 `NEXT_PUBLIC_DEV_AUTH_ENABLED=true` 时可用；生产必须双侧关闭。
- 不得记录或提交手机号、OTP、Cookie、token、私钥、数据库 URL、短信正文或 AI 密钥。

Firebase Web Phone Auth 的真实短信不能在 `localhost` 上验收，应使用 Firebase Authorized domains 中的稳定 HTTPS 域名。不要把临时 tunnel 域名写入生产配置；测试结束应删除其授权。

Firebase Phone Auth 的短信通道只用于认证验证码，不提供自定义业务短信正文或审批链接能力。加入申请等业务提醒不得借用验证码短信；未来若确需手机号短信，必须单独接入合规短信供应商并设计用户同意、发送人注册和退订机制。

## 6. AI 与外部服务

AI 是可选增强，未配置时手动记工和确定性财务必须正常工作。

- 记工：模型理解 → 服务端保存 canonical preview → 用户查看差异/警告 → 明确确认 → 重新鉴权并幂等写入。未确认、取消、过期、重复或并发确认都不能重复写业务数据。
- 财务：后端确定性查询负责数字，模型只负责解释；AI 没有任意 SQL、URL、文件或通用写工具。
- AI 消息契约接受 `locale`（`zh-CN` / `en-US`，默认中文）；财务确定性回答、安全降级提示和语音识别主要语言都必须遵循当前选择。
- 文本默认 MiniMax 中国站 `https://api.minimaxi.com`、模型 `MiniMax-M3`。
- 语音录制为 6–60 秒的 MP4/AAC，通过 MiniMax `music-cover` 音频预处理接口内置的 ASR 转写，与文本模型共用 `MINIMAX_API_KEY`；上限 8 MB，应用不持久化原始录音。
- 外部凭据只通过秘密环境变量注入，不能进入镜像层、文档或前端 bundle。

当前外部认证项目沿用历史不可变 Firebase project ID `massagebook-fc6ba`；这不是产品命名规范。新建代码、包、容器和数据库继续使用 `Massage note` / `massage-note` / `massage_note`。

生产上线前仍需人工完成：稳定 HTTPS 域名下“真实 OTP → 服务端会话 → 首页”的完整验收、真实短录音转写验收，以及 Firebase/MiniMax 的预算和用量告警。

## 7. 数据库与部署

Prisma schema 位于 `packages/database/prisma/schema.prisma`。迁移只向前追加；生产只用 `prisma migrate deploy`，不要编辑旧迁移或运行 `migrate dev`。删列、改类型和大规模变换采用 expand → backfill → contract。

`0.12.0` 新增迁移 `20260820210000_work_record_highlight`，为记工增加默认关闭的高亮字段和财务查询索引。`0.11.0` 的 `20260820180000_gift_card_auto_serial` 与 `0.10.0` 的 `20260820120000_gift_cards` 仍必须按顺序先执行。部署后需确认三条迁移均已成功记录。

```bash
pnpm db:generate
pnpm --filter @massage-note/database validate
pnpm test:integration
```

生产数据库使用分离身份：管理账号负责迁移，应用账号只做业务 DML。当前不启用 RLS；租户隔离依赖服务层 `storeId`、对象归属校验、受限数据库账号和跨店测试。不要在 Prisma 连接池上加入依赖连接变量的不完整 RLS。

公开仓库的标准 NAS 发布链路是 `main` push → CI 全部通过 → GHCR `linux/amd64` 镜像 → 群晖项目 `mn` 拉取版本标签。完整命令、环境变量边界和回滚步骤见 [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md)。本机部署 AI 必须先读被 Git 忽略的 `.local-ai/DEPLOYMENT_SECRETS.md`；真实秘密只从权限 `0600` 的 `.env` 或 macOS Keychain 读取，不得复制进本文档或 GitHub。

发布交接的关键事实：

- GitHub repository public 与 GHCR package public 是独立状态；每次部署前用隔离、未登录的 Docker 配置验证匿名 manifest。
- `gh auth refresh -s read:packages,write:packages` 会等待用户在 GitHub device authorization 页面确认；终端沉默不代表构建卡死。
- 必须按本次 commit SHA 找 CI run，等 `verify` 和 `publish-nas-image` 全部成功后才允许部署，不能用 `latest` 猜测。
- 生产固定使用不可变语义版本标签；`latest` 只供观察。任何提交都递增版本，禁止覆盖旧版本镜像。
- 更新 NAS 必须保留项目名 `mn`、现有 PostgreSQL/Redis 命名卷和生产 Compose 环境；`app`、`migrate`、`harden` 三个镜像标签同步更新。
- DSM update 是异步任务；API 返回 task ID 后继续等待 build stream，再核对实际镜像、退出码、卷和外部健康接口。

生产参考编排是 `docker-compose.prod.yml`。应用端口只绑定 loopback，由同站点 HTTPS 反向代理公开：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

备份、恢复和完整上线规则分别见 [`OPERATIONS.md`](OPERATIONS.md)、[`DEPLOYMENT.md`](DEPLOYMENT.md)、[`SECURITY.md`](SECURITY.md) 和 [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)。恢复具有覆盖性，只能对明确确认的目标库执行；未经授权不要删除开发或生产数据卷。

## 8. 本地验证与当前基线

```bash
pnpm install
pnpm docker:up
pnpm db:generate && pnpm db:deploy
pnpm dev

pnpm version:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm audit --prod
```

`test:integration` 使用独立的 `massage_note_test`，会重建测试 schema，不应指向开发主库、生产库或任何含人工数据的库。
若本机默认的 PostgreSQL/Redis 端口已被其他项目占用，可用 `POSTGRES_HOST_PORT`、`REDIS_HOST_PORT` 启动本项目 Compose，并把 `MASSAGE_NOTE_TEST_DATABASE_URL` 指向对应 PostgreSQL 端口；不得为测试停止不属于本项目的容器。

最近一次核心质量核对（2026-08-21，版本 0.12.10）：

- `version:check`、typecheck 和生产构建通过；Next 生成 11 个路由。
- 单元/非集成测试 156 项通过；数据库约束测试 4 项、API 全量测试 96 项通过。
- 礼物卡与记工高亮迁移已在独立 `massage_note_test` 测试库部署；除礼物卡完整流程、高亮字段创建、三种财务筛选和 CSV 标记外，还覆盖页面整美元显示、整数付款摘要、安全的金额输入回填、自动与自定义礼物卡序列号防重、首页日结分流、记工卡片加项标志以及无独立星标的高亮说明。
- `pnpm audit --prod` 为 0 个已知漏洞；间接 `nanoid` 与 `deepmerge-ts` 依赖继续通过 workspace override 固定在已修复版本。

测试数字会随用例变化。交接时记录实际命令结果，不要机械复制本节。

## 9. 高频回归点

- 修改财务公式时先改 domain 测试；每个项目分别舍入，不能合并后只舍入一次。
- 个人日结页面和生成图片均不显示记工单数、折后大费或折扣金额；总收入旁必须集中显示现金／刷卡大费和小费四项已确认分红，应提交现金必须与收入分红分区显示。
- 历史财务读取快照，不从当前目录重算。
- 日结锁、现金版本锁、幂等、审计和 outbox 必须作为一个整体维护。
- 全店日结的 `MANUAL_PRICE` 是非阻塞提醒：必须保留记录入口和日结快照，但不能禁用普通日结，也不能单独触发强制日结入口；其他阻塞项仍按 `blocking` 字段处理。
- 全店日结异常项必须在财务页原地打开单笔记工弹窗，不能把整个页面导航到今日页。今日与历史记工页都向 Owner/Manager 提供“日结”：先读取同日预览，没有阻塞项或仅有非阻塞提醒时直接普通日结，存在真正阻塞项时跳到财务日结标签；已日结时改为“取消日结”，取得有效日结版本并要求原因后取消。
- 隐藏员工只改变当天表格的可见状态，不删除记工或改变财务；店主和经理在已日结营业日仍可恢复或隐藏员工，但其他历史修改继续要求先取消日结。
- 记工主要项目时长变化时，结束时间必须按开始时间和新时长重算；前端即时更新，服务端在未明确提交 `endAt` 时兜底，不能继续沿用旧结束时间。
- 财务汇总卡片不显示“老板尚欠”和“本期工资结算”，但不得删除累计余额和工资账本功能；其余 18 项（含礼物卡大费与小费）都要按用途分组并保留可悬停、聚焦和触屏点击的“！”解释与公式提示，卡片本身继续打开独立组成明细；明细宽表只能在弹窗内滚动，不能扩大页面宽度。
- 高亮按钮必须同时存在于快速记工和详情顶部，首页整张高亮卡只使用黄色背景，不另显示右上角星标；财务高亮筛选不得只改前端列表，汇总、明细和 CSV 必须采用同一后端筛选。
- Owner/Manager 可能参与记工；角色不等于工资对象。
- 现金、刷卡与礼物卡小费可同时为空；大费仍至少填一种。礼物卡金额大于 0 时序列号必须非空。
- CSV 文本以 `= + - @` 开头时必须防公式注入。
- AI preview 未确认不写入，重复/并发确认只执行一次。
- 今日页只在普通员工尚未加入当前营业日表格时提供“上班”，用来建立本人班次和表格行；不提供“下班”。员工行状态仍只由当前时间是否落在记工时间段内决定。当前营业日允许员工查看同事的记工卡片，但同事行的大费、小费和应得小结不可见；历史营业日需显式选择后查看，普通员工的历史表格必须在服务端缩小为本人数据，不能只靠前端隐藏他人行。
- 底部主导航保持“今日、财务、店铺设置、我的”四项；不要重新加入独立 AI 项。
- UI 修改须同时检查中英文、全局语言选择、触控、loading、重复点击、409 刷新及手机/iPad/桌面布局。
- 清理测试数据必须精确定位，禁止用宽时间范围或未经核对的递归删除。

## 10. 排错顺序

- API 不就绪：查 `/health/ready` → PostgreSQL/Redis → 迁移 → API 日志。
- 类型异常：重建 contracts、生成 Prisma Client；不要改生成物。
- 金额异常：用 domain 纯函数复算 → 查记工快照 → 查付款拆分 → 查查询口径。
- 409：查 `version`、幂等键、日结状态和营业日锁；不要强制覆盖。
- 403：查 `Origin`、活跃成员、店铺状态、角色和对象 `storeId`。
- 实时不刷新：先验证 REST，再查 outbox、SSE 游标和代理缓冲。
- OTP 提示异常：区分 Firebase `confirm()` 与后续 session/CSRF/API/mixed-content 错误。
- AI 失败：先确认核心手动流程，再查供应商；不要降低业务校验换取模型成功。

## 11. 版本与文档维护

根目录 [`VERSION`](../VERSION) 是版本事实源。任何准备提交的变化都必须按语义化版本升级，并同步：

- 根目录和全部 workspace `package.json`
- `CHANGELOG.md`
- `Dockerfile` 的 `APP_VERSION`
- NAS Compose 镜像标签与 NAS 文档产物名
- PWA service worker cache 名
- README 和本文件当前版本

运行 `pnpm version:check`。未同步版本的修改不算完成。

当用户说“更新部署”时，视为完整发布授权：先更新相关产品/API/运维文档和语义版本，再只提交本次项目文件并 push Git，等待该 commit 的 CI 验证和 GHCR 版本镜像成功，然后严格按 NAS 手册完成备份、迁移、项目 `mn` 升级与线上验收。不得把“更新部署”缩减为只改本地代码，也不得跳过 CI、备份或 NAS 健康检查。

文档归属：产品/金额改 `PRD.md` 和 `/help`；API 改 `docs/API.md`；环境和发布改 env 模板及部署文档；安全边界改 `SECURITY.md`；运维改 `OPERATIONS.md`。本文件只保留接管所需的稳定事实，不再记录 PID、临时容器 ID、一次性 tunnel 地址或逐日开发流水账。

## 12. 明确不在首版范围

- 工资税、W-2、1099、报税或法律合规计算。
- 退款和负金额；未来应做独立冲正流程。
- 离线业务写入和自动冲突合并。
- 店内共用设备 PIN、原生 iOS 应用。
- 依赖连接变量的 RLS。
- AI 直接执行 SQL、访问任意 URL/文件或绕过预览写财务。

进入这些范围前先做产品和技术设计，不要在现有接口中悄悄扩大语义。
