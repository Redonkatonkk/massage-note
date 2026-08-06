# AI 接管与修改指南

> 最后核对：2026-08-06（America/New_York）  
> 适用仓库：`massage-note` / 产品名“Massage note”  
> 当前版本：`0.1.0`  
> 用途：让后续 AI 或工程师在不重新猜测业务规则的情况下，安全接管、排错、扩展和发布。

## 1. 先读结论

这是一个面向美国按摩店的全中文记工与财务 Web/PWA。首版核心功能已经实现并经过单元测试、数据库集成测试、API 集成测试、生产构建、Docker 生产编排、备份恢复和真实浏览器验收。

系统最重要的原则是：

1. PostgreSQL 是业务唯一真相来源，前端缓存和 SSE 都不是。
2. 所有金额以整数美分保存和计算；禁止用 JavaScript 浮点数承担最终财务计算。
3. 项目名称、价格、时长、提成和店铺营业日配置在记工时保存快照，历史账目不能跟随当前设置漂移。
4. 权限必须由 API 服务层验证；前端隐藏按钮不是权限控制。
5. 关键写入使用事务、乐观锁、幂等、审计日志和 outbox。修改时不能只完成其中一部分。
6. 所有用户可见界面、校验错误和业务提示使用简体中文。
7. AI 只能生成服务器保存的预览，用户明确确认后才能写业务数据；外部 AI 未配置时核心记工和财务仍必须可用。

开始工作前依次阅读：

1. 本文档。
2. [`PRD.md`](../PRD.md)：产品和金额定义。
3. [`ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md`](../ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md)：设计背景与完整数据模型思路。
4. [`API.md`](API.md)：当前 API 表面。
5. 涉及上线时再读 [`SECURITY.md`](SECURITY.md)、[`DEPLOYMENT.md`](DEPLOYMENT.md)、[`OPERATIONS.md`](OPERATIONS.md) 和 [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)。

若文档与代码冲突，当前代码、Prisma schema、Zod 契约和自动化测试是事实来源；发现冲突后应同步修正文档。

### 1.1 版本号是每次 AI 修改的强制项

当前基线版本为 `0.1.0`，唯一版本事实源是仓库根目录的 [`VERSION`](../VERSION)。任何 AI 进行的修补或开发，只要产生准备提交的文件变化（包括代码、配置、文档、容器或依赖变更），都必须在同一次修改中迭代版本号；禁止沿用修改前的版本号交付。

1. 按语义化版本选择增量：兼容修补升 PATCH，新功能升 MINOR，不兼容变更升 MAJOR。
2. 同步更新 `VERSION`、根目录及全部工作区 `package.json`、`CHANGELOG.md`、容器镜像标签与 PWA 缓存名。
3. 运行 `pnpm version:check`，确认所有包版本与 `VERSION` 完全一致。
4. 发布和交接时明确记录新版本、验证结果与镜像摘要。若本次没有迭代版本号，则修改不算完成，不得提交或部署。

## 2. 当前实现状态与外部服务

### 2.1 已完成范围

- Firebase 美国手机号验证、密码登录、本机可信状态恢复与服务端 `HttpOnly` 会话。
- 仅限本地显式开启的免短信开发登录；生产构建硬关闭。
- 用户资料、多店铺、6 位自选店铺代码、加入申请与审批。
- Owner、Manager、Employee 三角色，以及与角色分离的“参与记工”属性。
- 店主转移、成员停用/恢复、店铺软删除。
- 主要项目、额外项目、折扣、四级提成及历史配置快照。
- 今日/历史记工表、上下班、员工行添加/隐藏/排序、快速和自定义记工。
- 付款确认、现金/刷卡大费和小费拆分、差额警告、软删除/恢复。
- 财务汇总、组成明细、员工/每日小计、CSV 导出。
- 正常/强制/取消日结、现金逐人/全部结算和回退、工资结算账本。
- 审计查询、PostgreSQL outbox、SSE 多设备变更通知。
- PWA、断网提示和最长 7 天的本地未提交草稿；不支持离线写业务数据。
- MiniMax 文本助手、Google 语音转写、AI 记工预览和确定性财务问答；今日与财务页提供对应的悬浮助手，供应商均可不配置。
- Docker 生产编排、数据库账号分离、权限加固、Redis 限流、健康检查、备份恢复和 CI。

### 2.2 2026-08-04 至 2026-08-05 外部服务配置：本机已完成

本机当前使用同一个 Google/Firebase 项目 `massagebook-fc6ba`。这是改名前已经创建的外部不可变项目 ID，仅为兼容现有认证和语音服务而保留，不是当前产品名；新建的仓库、包、容器、数据库、缓存和界面一律使用 `Massage note` / `massage-note` / `massage_note`。以下配置已经实际创建并验证：

#### Firebase 短信登录

- Firebase Authentication 已初始化，Phone 登录提供方已启用。
- 已注册 Web 应用“Massage note Web”。2026-08-05 为排查真实短信问题启用了 Firebase Hosting，并把一次静态导出发布到默认站点 `https://massagebook-fc6ba.web.app`；这只是短信发送验证入口，不替代本仓库最终的同源 Web/API 生产部署方案。
- 根目录 `.env` 已配置 Firebase Web 四项公开配置，以及 Admin SDK 的 `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY`。
- Admin SDK 私钥来自 Firebase 默认 Admin 服务账号；真实值只在本机 `.env` 和 Downloads 中的原始 JSON，不得复制到本文、日志、测试或提交记录。
- `.env` 与原始 JSON 权限已收紧为 `0600`，`.env` 已由 `.gitignore` 忽略。
- Firebase 项目现已处于 Blaze 按量付费方案，并已关联 Cloud Billing 账号“Firebase 付款”。Firebase Authentication 仍未升级为 Identity Platform；不要把 Blaze 和 Identity Platform 升级混为一谈。正式营业前仍需人工确认预算、费用告警、短信用量监控和是否需要 Identity Platform 的额外能力。

#### Google Cloud Speech-to-Text

- `speech.googleapis.com` 已在 `massagebook-fc6ba` 中启用。
- 已创建专用服务账号 `workbook-speech@massagebook-fc6ba.iam.gserviceaccount.com`，显示名“Massage note语音识别”。
- 该账号只授予 `Cloud Speech Client`（`roles/speech.client`）角色，不复用权限更大的 Firebase Admin 私钥。
- 专用 JSON 已整体 Base64 写入 `.env` 的 `GOOGLE_CLOUD_CREDENTIALS_BASE64`，同时配置 `GOOGLE_CLOUD_PROJECT_ID=massagebook-fc6ba`。
- 验证证据：专用账号成功取得短期访问令牌；对 Speech-to-Text 发出的无效音频探测到达 API 并返回 gRPC code 3（无效参数），而不是未认证、无权限、API 未启用或结算错误。该探测证明凭据链路有效，但正式发布仍应使用真实短录音做一次中文/英文转写验收。
- 原始语音服务账号 JSON 仍保存在本机 Downloads，权限为 `0600`；确认部署端已安全保存后可人工删除或轮换，禁止提交仓库。

#### MiniMax 中国开放平台

- 根目录 `.env` 已配置用户提供的 Token Plan Key；本文不记录真实密钥。
- 中国站 OpenAI 兼容基础地址为 `https://api.minimaxi.com`，Provider 会调用 `/v1/chat/completions`。
- 2026-08-05 使用该密钥实时请求 `/v1/models`，返回列表首项包含精确模型 ID `MiniMax-M3`；随后以 `MiniMax-M3` 发出极短对话请求，HTTP 200、供应商状态码 0、响应模型 `MiniMax-M3`、`finish_reason=stop`。
- MiniMax 公开文档抓取内容当时仍只列到 M2.7，因此本项目以用户账号实时 `/v1/models` 结果和成功调用作为 M3 可用性的证据。
- 已将 `.env`、`.env.example`、`.env.production.example`、`apps/api/src/ai/language-model.provider.ts`、`apps/api/src/ai/ai.service.ts` 与 `docker-compose.prod.yml` 的模型默认值统一为 `MiniMax-M3`；中国站默认地址也已同步到源码和生产编排。
- 用户曾在对话中直接粘贴 MiniMax 密钥。虽然密钥未写入受跟踪文件，严格安全场景仍建议在 MiniMax 控制台轮换后更新部署密钥。

#### 本次本机配置验证边界

- Firebase Web/Admin、Google Speech 和 MiniMax 均已完成配置级或供应商 API 级验证。
- Firebase 现已是 Blaze，并启用了默认 Hosting 站点；Authorized domains 也为真实短信排障加入了一个临时 `trycloudflare.com` 域名。没有新建或修改银行卡，没有配置最终生产域名、生产服务器 `.env.production`、托管 PostgreSQL、托管 Redis 或正式 DNS。
- 密码与导航更新完成后已使用标准 Node 24 运行时通过整仓类型检查、全部单元测试、数据库/API 集成测试、API 构建和默认 Turbopack standalone 生产构建。

### 2.3 2026-08-05 密码、个人页、导航与悬浮 AI 更新：已完成

- `users.password_hash` 与迁移 `20260805120000_user_password` 已加入，Prisma Client 已重新生成。
- `PasswordService` 使用随机盐 `scrypt-v1`；密码长度为 8 至 72 字符，摘要不会出现在 `/me` 响应。
- `POST /auth/account-status` 区分新用户、密码用户和未设密码的老用户；`POST /auth/password` 校验成功后只签发 Firebase Custom Token，最终仍由 Firebase ID Token 建立可撤销会话。
- 新用户自动发送验证码，验证后必须填写姓名并设置密码。历史老用户第一次验证码登录时必须补设密码；已有密码的老用户仍可选择验证码登录。
- 普通退出只清除服务端 Cookie，不调用 Firebase `signOut`，也不清除 `massage_note_*` 本地偏好。同设备再次输入相同号码时直接刷新服务端会话；不同号码才进入账号查询流程。
- 新增 `PATCH /me/password`。`GET /me` 返回 `hasPassword`（不返回摘要）：已有密码必须验证当前密码后修改；历史验证码注册且 `password_hash IS NULL` 的用户可在有效登录会话中首次设置密码。
- 我的页面新增密码卡片，按 `hasPassword` 显示“首次设置密码”或“修改密码”；两次新密码不一致时由前端先拦截。后端仍是最终校验来源。
- 我的页面新增店铺切换器，列出所有有效成员关系及角色，选择后写入 `massage_note_store_id`；今日、财务和店铺设置继续以这个本地偏好作为当前店铺。
- 底部导航统一为四项：今日、财务、店铺设置、我的。独立“AI 助手”入口已移除，首次项目设置页的说明也已同步。
- 今日页右下角嵌入“记工助手”悬浮球；财务页右下角嵌入“财务助手”悬浮球。点击展开页面内对话框。记工助手仍必须先生成预览并由用户确认，财务助手仍只读。
- `/assistant` 旧直达路由暂时保留以兼容已有书签，但不再出现在底部主导航；新入口的事实来源是 `apps/web/app/floating-ai-assistant.tsx`。
- PWA 安装按钮已移到左下角，避免与右下角 AI 悬浮球重叠。
- 店铺刚创建但目录项目尚未设置时，页面仍提供四项底部导航；完成目录设置后，今日页显示记工悬浮助手。此前“创建店铺后找不到财务、AI、店铺设置和我的”的入口问题已修复。
- 本轮主要代码落点：`packages/contracts/src/user.ts`、`apps/api/src/auth/auth.module.ts`、`apps/api/src/users/users.controller.ts`、`apps/api/src/users/users.service.ts`、`apps/web/lib/types.ts`、`apps/web/app/profile/profile-page-client.tsx`、`apps/web/app/app-nav.tsx`、`apps/web/app/floating-ai-assistant.tsx`、`apps/web/app/massage-note-app.tsx`、`apps/web/app/finance/finance-page-client.tsx`、`apps/web/app/assistant/assistant-page-client.tsx` 和 `apps/web/app/globals.css`。

### 2.4 2026-08-05 零小费结算更新：已完成

- 付款确认仍要求现金大费或刷卡大费至少填写一项；这项保护没有放宽。
- 现金小费与刷卡小费现在可以同时留空。前端提交时将两个空值明确转为 0，`confirmPaymentSchema` 对省略字段也统一补 0，因此可直接把该单置为 `CONFIRMED`。
- 记工详情的提示和 placeholder、`/help` 当天记工说明、contracts 测试均已同步；不要恢复“没有小费请明确填 0”的旧规则。
- 真实浏览器已用当前订单将两个小费输入框清空后执行“保存并重新确认付款”。结果为现金大费 US$80.00、小费 US$0.00、待结账 0 单，API/Web 日志无错误。
- 本轮主要代码落点：`packages/contracts/src/work-record.ts`、`packages/contracts/test/work-record.test.ts`、`apps/web/app/record-editor.tsx` 和 `apps/web/app/help/page.tsx`。

### 2.5 当前质量状态

- `pnpm db:generate`、`pnpm typecheck`、`pnpm --filter @massage-note/api build` 已通过。
- `pnpm test` 已通过：domain 30 项、contracts 29 项、API 非集成 36 项；Web 无测试文件。
- `pnpm test:integration` 已通过：database 3 项、API 完整集成模式 70 项。
- 默认 `pnpm build` 已通过，并生成包含 `/profile` 的全部页面。
- Firebase 排障改动后，`pnpm --filter web typecheck`、默认 `pnpm --filter web build`、`WEB_STATIC_EXPORT=true` 静态导出，以及带 `API_PROXY_TARGET` 的 standalone 构建均已通过。
- 密码哈希已用编译后的服务做成功/失败口令运行时验证，并有 Vitest 覆盖。
- 新增 `packages/contracts/test/user.test.ts` 和 `apps/api/test/users.service.test.ts`，覆盖无密码老账号首次设密、错误当前密码拦截和正确修改密码。
- 真实浏览器已验证：老账号分流、开发登录、姓名保存、创建店铺、首次项目设置；四项底部导航；今日/财务悬浮助手展开与快捷问题填入；我的页面老账号首次设密状态、密码不一致拦截和店铺选择器；双小费留空后重新确认付款。测试未提交或更改用户密码。
- 当前本地常规入口为 `http://localhost:3000`，API 为 `http://localhost:4000/api/v1`；最后一次验收时两者均使用最新生产构建运行。

### 2.6 2026-08-05 Firebase 真实短信与 HTTPS 登录排障：当前现场

本节记录 2026-08-05 对真实美国手机号短信链路做出的排查、云端修改、源码修改、发布和当前运行状态。手机号属于个人数据，本文只记录末四位，不保存完整号码或验证码。

#### 已确认的根因和测试结果

1. 最初在 `http://localhost:3000/login` 反复出现 `auth/invalid-app-credential`，随后出现 `auth/too-many-requests`。Firebase Phone Auth 官方 Web 文档明确说明 `localhost` 不能作为手机号认证的托管域名：`https://firebase.google.com/docs/auth/web/phone-auth`。`localhost` 即使列在 Authorized domains 中，也不能用于真实 Web Phone Auth。
2. Firebase 控制台的短信使用量在最初排查时没有发送记录，说明旧号码末四位 `7901` 的早期失败发生在应用验证/reCAPTCHA 阶段，并非项目日短信配额已经用完。
3. Firebase 没有提供可人工取消单号码反滥用冷却的控制台开关。升级 Blaze 或 Identity Platform 也不会取消单号码、IP、设备或行为风控；不要通过连续点击消耗尝试次数。
4. 把 production-style 静态前端发布到授权 HTTPS 域名 `https://massagebook-fc6ba.web.app/login/` 后，使用新号码末四位 `1999` 成功发出真实短信。页面进入“第 2 步，共 2 步 / 输入短信验证码”，并显示验证码已发送。
5. 用户在该页面输入其确认正确的验证码后看到“验证码不正确”。代码审查发现旧版 `verifyCode()` 把 Firebase `confirm()` 和后续 API 会话创建放在同一个 `catch` 中；任何后续网络、CSRF 或 API 错误都会被错误显示为“验证码不正确”。同时该静态托管构建的 `NEXT_PUBLIC_API_BASE_URL` 是 `http://localhost:4000/api/v1`，HTTPS 页面访问它会被浏览器的 mixed-content 规则阻止。因此旧提示不能作为验证码错误的证据。
6. 已把 Firebase 验证错误与 API 会话错误拆开：只有 `ConfirmationResult.confirm()` 返回的 Firebase 错误才显示验证码错误；后续 API 失败会明确显示“验证码已通过，但登录服务连接失败”。
7. 为完整登录复测建立了同源临时 HTTPS 入口，并再次向号码末四位 `1999` 成功发送新验证码。交接时页面停在新的验证码输入步骤，等待用户本人输入；完整的“输入新验证码 → 建立服务端会话 → 进入首页”尚未得到最终验收，不能写成已完成。

#### Firebase/Google Cloud 控制台修改

- 项目 ID：`massagebook-fc6ba`；项目号：`1011332765811`。
- Phone 登录提供方已启用，SMS region allowlist 包含美国。
- 项目已是 Blaze；Authentication 仍未升级到 Identity Platform。
- `reCAPTCHA Enterprise API` 已启用。
- Identity Platform/Firebase Authentication 服务代理已创建：`service-1011332765811@gcp-sa-identitytoolkit.iam.gserviceaccount.com`，并授予 `roles/identitytoolkit.serviceAgent`。
- Phone reCAPTCHA 配置为 `AUDIT`，`useSmsBotScore=true`，toll fraud protection 未启用。Enterprise 获取失败时 Web SDK 会回退到 v2。
- Firebase Web API key 的 Application restrictions 为 `None`，API restrictions 已包含 Firebase Phone Number Verification API、Identity Toolkit API 等所需 API；API key 限制不是本次故障来源。
- Firebase Hosting 默认站点已存在并启用：`projects/massagebook-fc6ba/sites/massagebook-fc6ba`。2026-08-05 通过 Firebase Hosting REST API 发布版本 `98c856c2a0ed9470`，release `1785957009279000`。
- 当前 Authorized domains：`localhost`、`massagebook-fc6ba.firebaseapp.com`、`massagebook-fc6ba.web.app`，以及临时测试域名 `label-engineering-unsubscribe-diploma.trycloudflare.com`。最后一个域名只服务于当前临时通道；通道停用后应从 Authorized domains 删除。
- 没有执行 Identity Platform 升级，没有关闭 reCAPTCHA/反滥用保护，也没有用虚构号码代替用户要求的真实号码。

#### 源码修改

`apps/web/app/login/login-form.tsx`：

- 为 Firebase Phone Auth 常见错误增加了精确中文映射，包括 `invalid-app-credential`、`captcha-check-failed`、`too-many-requests`、`code-expired` 和 `invalid-verification-code`。
- 发送失败时记录不含手机号和 token 的结构化控制台日志 `[firebase-phone-auth]`。
- 本地开发登录开启时使用可见 reCAPTCHA v2 容器；production-style 构建使用绑定到发送按钮的 invisible reCAPTCHA。
- 发送按钮增加固定 ID `send-verification-code`；失败 catch 不再立即清理仍在回调中的 verifier，避免 Google iframe 异常遮蔽真实 Firebase 错误。
- 验证码确认与 API 会话创建已经分成两个错误边界。Firebase 确认错误使用 `[firebase-phone-verify]` 日志；会话建立错误使用 `[session-bootstrap]` 日志并显示准确的连接/服务错误。

`apps/web/next.config.ts`：

- 增加 `WEB_STATIC_EXPORT=true` 开关：只在该开关下使用 `output: "export"` 和 `trailingSlash`；默认仍是 `standalone`。
- 静态导出时不返回 Next runtime headers，避免把不支持的运行时 headers 当成已生效。
- 增加可选 `API_PROXY_TARGET` rewrite，把同源 `/api/:path*` 转发到 `${API_PROXY_TARGET}/api/:path*`。当前临时 standalone 构建使用 `http://127.0.0.1:4000`。
- CSP 的 API origin 解析现在同时支持绝对 URL 和 `/api/v1` 这种同源相对路径。

`apps/web/app/manifest.ts`：

- 增加 `export const dynamic = "force-static"`，使 `manifest.webmanifest` 能参与 Next 静态导出。

#### 两种 HTTPS 入口的边界

| 地址 | 当前用途 | 限制 |
| --- | --- | --- |
| `https://massagebook-fc6ba.web.app/login/` | 已证明 Firebase 能真实发送短信 | 当前已发布版本仍把 API 指向本机 HTTP，只适合验证“发送短信”，不能作为完整登录入口；最新错误拆分尚未重新发布到该站点 |
| `https://label-engineering-unsubscribe-diploma.trycloudflare.com/login` | 当前完整同源登录复测入口 | Cloudflare Quick Tunnel 临时域名，无 SLA、进程退出后地址失效；只用于测试，不是最终生产部署 |

临时入口的数据路径是：

```text
浏览器 HTTPS trycloudflare.com
  → cloudflared 容器
  → 本机 Next standalone :3000
  → Next /api rewrite
  → 本机 Nest API :4000
  → 本机 PostgreSQL / Redis
```

该结构使登录页和 `/api/v1` 对浏览器表现为同一 HTTPS origin，避免 mixed content 和第三方 Cookie 问题。Firebase 已精确授权该临时 hostname；不要授权通配 `*.trycloudflare.com`。

#### 当时排障现场的进程与恢复方式（历史快照）

该轮 Firebase 排障最后核对时，以下 URL 均返回 HTTP 200；PID、Quick Tunnel 和临时域名不是当前常规本地运行状态：

- `http://localhost:3000/login`
- `http://localhost:3000/api/v1/health`（Next 同源代理）
- `http://localhost:4000/api/v1/health`
- `https://massagebook-fc6ba.web.app/login/`
- `https://label-engineering-unsubscribe-diploma.trycloudflare.com/login`
- `https://label-engineering-unsubscribe-diploma.trycloudflare.com/api/v1/health`

当时本机监听：Web PID `98171`（`:3000`），API PID `98172`（`:4000`）。Cloudflare 容器 ID 为 `91fa3b7a6a7f`，镜像 `cloudflare/cloudflared:latest`。这些值只是历史诊断证据；接管时应以 `lsof`、`docker ps` 和 HTTP health 为准。

改名前的本地 Docker 项目仍以旧容器名运行：`workbook-postgres-1`（PostgreSQL 17）和 `workbook-redis-1`（Redis 8）在最后核对时均为 `healthy`，已持续运行约 25 小时。它们仅是需要保留数据的历史运行实例；新建环境必须使用 `massage-note-postgres-1`、`massage-note-redis-1`。Quick Tunnel 容器名为 Docker 自动生成值，不应写入启动脚本依赖。

当时 Web 是专为临时 HTTPS 通道构建的 production-style standalone：

```bash
NEXT_PUBLIC_API_BASE_URL=/api/v1 \
NEXT_PUBLIC_DEV_AUTH_ENABLED=false \
API_PROXY_TARGET=http://127.0.0.1:4000 \
pnpm --filter web build

cd apps/web/.next/standalone/apps/web
PORT=3000 HOSTNAME=0.0.0.0 API_PROXY_TARGET=http://127.0.0.1:4000 node server.js
```

当时 API 必须用临时 HTTPS origin 启动，否则登录后的写请求会被 Origin 校验拒绝：

```bash
cd apps/api
WEB_ORIGIN=https://label-engineering-unsubscribe-diploma.trycloudflare.com node dist/main.js
```

当时 Quick Tunnel 等价启动命令：

```bash
docker run --rm cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --url http://host.docker.internal:3000
```

仓库命令在当前桌面环境中可能找不到系统 `node`/`pnpm`；实际运行时使用了 Codex bundled Node 24 和 pnpm 11。上述命令表达环境和顺序，必要时替换为已配置的绝对 runtime 路径。

#### 当前验证、自动化和清理责任

- 已通过 `pnpm --filter web typecheck`。
- 已通过 Next 静态导出构建、默认 standalone 构建和带同源 API rewrite 的 standalone 构建。
- 已验证本地页面、静态资源、API、Hosted 登录页和临时 HTTPS 页面/代理 health 均为 200。
- 已两次在授权 HTTPS 域名上看到真实号码末四位 `1999` 进入“验证码已发送”步骤；验证码内容未由 AI 读取、记录或输入。
- 先前用于旧号码低频重试的 heartbeat automation `firebase`（名称“Firebase 短信验证码低频复测”）已在第一次成功发送后删除，避免继续发短信。
- 下一步只能由号码持有人在当前临时 HTTPS 页面输入最新验证码，然后验证是否成功建立 `massage_session` 并进入首页。不要要求用户把 OTP 写进聊天、日志或本文。
- 测试结束后应停止 Quick Tunnel，从 Firebase Authorized domains 删除临时 hostname，并把本地 API/Web 恢复到期望的常规开发或正式部署配置。Quick Tunnel 公开暴露本机应用，只应在明确测试窗口内保持运行。
- 最终生产仍应使用稳定的自有 HTTPS 域名和同站点 Web/API 反向代理，或部署可持久运行的正式后端；不要把随机 Quick Tunnel URL 写入 `.env.production` 或作为发布承诺。

## 3. 实际工程结构

这是 pnpm workspace 模块化单体，不是微服务。

```text
apps/
  api/                    NestJS REST、认证、领域编排、SSE、AI
  web/                    Next.js App Router 中文 Web/PWA
packages/
  contracts/              前后端共享 Zod 输入契约
  domain/                 无框架依赖的金额、提成、营业日、权限纯函数
  database/               Prisma schema、生成客户端、SQL 迁移和约束测试
docker/
  postgres/               生产应用账号初始化与迁移后权限加固
scripts/                  集成库准备、standalone 打包、备份、恢复、维护
docs/                     API、部署、安全、运维、发布和本接管指南
.github/workflows/ci.yml   类型、测试、集成测试和构建
```

早期架构文档提到过 `packages/ui`、`packages/config` 和 `/s/[storeId]/...` 路由，这些没有落地。当前前端真实路由为：

| 路径 | 当前用途 |
| --- | --- |
| `/` | 今日或选定营业日记工表、快速记工 |
| `/login` | Firebase 手机验证码或本地开发登录 |
| `/finance` | 财务、现金结算、日结、工资结算 |
| `/manage` | 店铺、成员、项目提成、回收站、审计 |
| `/assistant` | 兼容已有书签的旧 AI 全页入口；不在主导航中 |
| `/profile` | 个人资料、密码设置/修改、店铺切换与保留可信状态的退出入口 |
| `/help` | 店内用户中文帮助 |
| `/offline` | 断网降级页 |

店铺上下文由当前登录用户的成员关系和前端状态选择，不在 URL 中编码。不要为了“对齐旧计划”随意重构全部路由。

### 3.1 后端模块定位

| 目录 | 职责 | 常见修改入口 |
| --- | --- | --- |
| `apps/api/src/auth` | Firebase、密码、Cookie、Guard 与开发登录 | 登录、注册与会话 |
| `apps/api/src/users` | 当前用户和姓名资料 | 个人资料 |
| `apps/api/src/stores` | 店铺、成员、目录、提成、权限校验 | 多店与配置 |
| `apps/api/src/boards` | 营业日、班次、员工行和排序 | 今日表格 |
| `apps/api/src/work-records` | 记工创建、更新、付款、删除恢复 | 记工核心 |
| `apps/api/src/finance` | 计算适配、汇总、日结、现金和工资结算 | 所有财务功能 |
| `apps/api/src/audit` | 审计写入与查询 | 可追溯性 |
| `apps/api/src/realtime` | outbox 到 SSE | 多设备刷新 |
| `apps/api/src/ai` | 模型、语音、预览、确认 | AI 增强 |
| `apps/api/src/common` | 错误、幂等、JSON BigInt、限流、Zod 请求解析 | 横切能力 |

Controller 只负责 HTTP 适配；业务判断应放 Service 或 `packages/domain`。跨表写入使用 Prisma transaction，并在同一事务写审计和 outbox。

### 3.2 前端文件定位

| 文件 | 职责 |
| --- | --- |
| `apps/web/app/massage-note-app.tsx` | 登录态、资料、店铺选择和应用总壳 |
| `apps/web/app/today-board.tsx` | 今日/历史表格、班次、员工行和快速记工 |
| `apps/web/app/record-editor.tsx` | 记工详情、草稿计算、付款确认和恢复 |
| `apps/web/app/finance/finance-page-client.tsx` | 汇总、明细、日结、现金、工资 |
| `apps/web/app/floating-ai-assistant.tsx` | 今日/财务页面内的悬浮 AI 对话、快捷问题和记工预览确认 |
| `apps/web/app/app-nav.tsx` | 四项底部主导航及当前店铺查询参数 |
| `apps/web/app/manage/manage-page-client.tsx` | 店铺、成员、目录、提成、回收站、审计 |
| `apps/web/app/assistant/assistant-page-client.tsx` | AI 对话、语音和确认预览 |
| `apps/web/app/profile/profile-page-client.tsx` | 姓名、密码、店铺切换和退出 |
| `apps/web/app/login/login-form.tsx` | 手机验证码与开发登录 |
| `apps/web/lib/api.ts` | Cookie API 客户端和统一中文错误 |
| `apps/web/lib/realtime.ts` | SSE 重连与变化通知 |
| `apps/web/lib/types.ts` | Web 使用的响应类型镜像 |

`apps/web/lib/types.ts` 目前包含部分手写响应类型，而输入契约主要来自 `packages/contracts`。修改响应结构时必须同步这里；不要假设它会自动跟随 Zod。

### 3.3 不应手工编辑的生成物

- `apps/api/dist`
- `apps/web/.next`
- `apps/web/out`
- `packages/*/dist`
- `packages/database/src/generated`
- `apps/web/tsconfig.tsbuildinfo`

修改 `src`、Prisma schema、迁移或源码配置，然后用构建/生成命令刷新生成物。

## 4. 核心金额和总额定义

所有持久金额单位是 `cents`，类型在领域层使用 `bigint`。提成比例使用 basis points：`10000 = 100%`，`6000 = 60%`。

设：

- `主要项目金额 = mainServiceAmountCents`
- `额外项目总额 = Σ 每个 addon.amountCents`
- `折扣总额 = Σ 每个 discount.amountCents`
- `现金大费/刷卡大费`是服务费付款拆分。
- `现金小费/刷卡小费`是小费付款拆分。

公式如下：

```text
大费基数（折扣前） = 主要项目金额 + 额外项目总额
折后大费业绩       = 大费基数 - 折扣总额
实收服务费         = 现金大费 + 刷卡大费
付款差额           = 实收服务费 - 折后大费业绩
小费总额           = 现金小费 + 刷卡小费
客人总付款         = 实收服务费 + 小费总额

主要项目工资       = roundHalfUp(主要项目金额 × 主要项目提成 / 10000)
额外项目工资       = Σ roundHalfUp(单个额外项目金额 × 该项提成 / 10000)
大费工资           = 主要项目工资 + 额外项目工资
员工总收入         = 大费工资 + 小费总额
```

折扣由店铺承担，不减少员工大费工资。实际服务费与折后大费不一致时允许确认，但必须向用户显示差额警告并保存差额。

付款确认时，大费与小费采用不同的空值规则：

- 现金大费或刷卡大费至少填写一个，另一项可留空并由后端补 0。
- 现金小费和刷卡小费都可以留空；两项空白或省略时均按 0 处理，并允许确认付款。
- 前端会把空白小费明确提交为 0，后端 `confirmPaymentSchema` 也会对省略的小费补 0，避免其他客户端产生不同语义。

现金分配公式：

```text
现金分配的大费工资 =
  实收服务费为 0 ? 0 : roundHalfUp(大费工资 × 现金大费 / 实收服务费)

实际通过现金取得的大费工资 = min(现金大费, 现金分配的大费工资)
现金工资不足             = 现金分配的大费工资 - 实际取得的大费工资
员工收到现金             = 现金大费 + 现金小费
员工应留下现金           = 实际取得的大费工资 + 现金小费
应交回店铺现金           = 现金大费 - 实际取得的大费工资
```

只有状态为“已结清”的现金结算才进入累计余额。工资余额：

```text
原始工资余额 = 累计员工总收入 - 已结清的现金实际取得 - 工资结算账本净支付
老板尚欠     = max(原始工资余额, 0)
超额支付     = max(-原始工资余额, 0)
```

Owner 本人可以参与记工且收入进入经营统计，但不作为工资结算对象，也不产生“老板欠自己”。Manager 若参与记工则与 Employee 一样进入工资结算。

最终公式事实来源：`packages/domain/src/finance.ts`。任何公式变动都必须先改纯函数和测试，再改服务与界面。

## 5. 提成、营业日和历史快照

### 5.1 提成优先级

预设项目按以下顺序取第一个存在的比例：

1. 员工项目专属提成。
2. 项目默认提成。
3. 员工默认提成。
4. 全店默认提成。

自定义项目没有项目级配置，因此使用：员工默认 → 全店默认。

主要项目和每个额外项目分别计算并四舍五入到美分，最后再相加。不能先合并金额后只舍入一次。

### 5.2 营业日

店铺保存 IANA 时区和 `HH:mm` 营业日截止时间。开始时间在当地截止时刻之前属于当日；恰好等于或晚于截止时刻属于下一营业日。实现位于 `packages/domain/src/business-day.ts`。

记工保存 `storeTimezoneSnapshot` 和 `businessCutoffSnapshot`，所以以后修改店铺时区或截止时间不会重算历史营业日。

### 5.3 快照不可省略

记工创建时保存：

- 主要项目名称、简称、金额、时长、提成、提成来源、工资。
- 每个额外项目的对应快照。
- 每个折扣项目的名称和金额快照。
- 店铺时区和营业日截止快照。

目录项目软删除或改价不能改变旧记录。财务查询必须读取记工快照/记工汇总字段，而不是拿当前目录重新计算。

## 6. 权限和状态机

“角色”和“是否参与记工”是两个维度。Owner、Manager、Employee 都可以参与记工。

| 能力 | Owner | Manager | Employee |
| --- | --- | --- | --- |
| 查看当天全员记工 | 是 | 是 | 是 |
| 写当天未日结的全员记工 | 是 | 是 | 是 |
| 写历史未日结记工 | 是 | 是 | 否 |
| 查看本人历史财务 | 是 | 是 | 是 |
| 查看全店历史财务 | 是 | 是 | 否 |
| 管理成员/目录/提成 | 是 | 是 | 否 |
| 日结、现金、工资结算 | 是 | 是 | 员工只读本人相关结果 |
| 查看全店审计 | 是 | 是 | 否 |
| 修改店铺设置 | 是 | 是 | 否 |
| 转移店主、删除店铺 | 是 | 否 | 否 |

权限纯函数在 `packages/domain/src/permission.ts`，对象归属和活跃成员校验在 `apps/api/src/stores/store-access.service.ts`。改权限时至少同步这两层、前端可见性和跨角色集成测试。

关键状态：

- 记工：`PENDING_PAYMENT → CONFIRMED`；付款可在确认前后经有权限的编辑流程重算。
- 日结：`CLOSED` 或 `CANCELLED`。日结后禁止写记工；Owner/Manager 先取消日结才可修改。
- 取消日结会把相关现金结算重新置为未结清，但保留工资账本；余额重算并提示日结后发生过历史修改。
- 现金结算：`UNSETTLED ↔ SETTLED`。批量结清只能更新尚未结清者，不能重写已结清行的时间、操作人、备注或版本。
- 店铺、成员、目录、记工、工资结算使用软删除/恢复；不要用物理删除代替业务删除。

## 7. 数据库与迁移规则

Prisma schema 位于 `packages/database/prisma/schema.prisma`，复杂 CHECK、索引和权限由迁移 SQL 与 `constraints.sql` 补充。

主要数据组：

- 身份与租户：`users`、`stores`、`store_memberships`、`store_join_requests`。
- 营业日页面：`shifts`、`daily_boards`、`daily_employee_rows`。
- 目录与提成：`service_items`、`addon_items`、`discount_items`、两类提成历史表。
- 记工快照：`work_records`、service/addon/discount snapshots、`payment_breakdowns`。
- 结算：`business_day_closings`、`daily_cash_settlements`、`payroll_settlements`。
- 可靠性：`idempotency_requests`、`audit_logs`、`domain_outbox`。
- AI：conversation、query log、change preview。

迁移必须只向前追加，生产使用 `prisma migrate deploy`，不要在生产使用 `migrate dev`。新增迁移后按顺序执行：

```bash
pnpm db:generate
pnpm --filter @massage-note/database validate
pnpm test:integration
```

部署前先在生产数据副本演练。删列、改类型或大规模数据变换采用 expand → backfill → contract 的多次发布。

生产有两个数据库身份：

- 管理/迁移账号：建表、迁移和权限加固。
- 应用账号：只允许业务 DML；不是 superuser、BYPASSRLS、表拥有者，且不能更新/删除审计、AI 查询日志和 outbox。

当前不启用 PostgreSQL RLS。原因是 Prisma 连接池若未把请求固定在同一事务连接，连接级租户变量会产生虚假隔离。现阶段采用服务层 `storeId` 作用域、对象归属验证、非超级用户数据库账号和跨店测试。不要自行加入不完整的“伪 RLS”。

## 8. API 契约、并发和错误

共享输入契约位于 `packages/contracts/src`。常规新增/修改 API 的顺序：

1. 在 contracts 中修改 Zod schema 和导出。
2. 增加或更新契约测试。
3. Controller 使用统一 Zod 解析，不手写一套不一致校验。
4. Service 进行权限、状态和对象归属检查。
5. 需要多表变更时使用事务。
6. 同事务写审计和 outbox。
7. 前端调用与 `apps/web/lib/types.ts` 同步。
8. 更新 `docs/API.md`。
9. 增加正常、越权、跨店、冲突和重复提交测试。

关键写入要求 `Idempotency-Key`。相同键和相同请求返回首次结果；相同键但请求内容不同返回冲突。创建店铺没有 `storeId`，因此还实现了“同一店主 + 同一自选代码 + 完全相同配置”的语义重试；同代码不同配置返回清晰的中文代码冲突。

可修改资源带 `version`。更新、删除和恢复必须用乐观锁；冲突返回 HTTP 409，并尽可能附带最新资源供前端刷新。

统一错误格式：

```json
{
  "code": "STABLE_MACHINE_CODE",
  "messageZh": "给用户看的中文说明",
  "requestId": "用于关联日志的请求编号",
  "latestResource": null
}
```

BigInt 响应由 `JsonSafeInterceptor` 转成 JSON 安全整数；若超出 JavaScript 安全整数范围会拒绝，而不是静默丢精度。

## 9. 认证与安全边界

生产认证有三条入口，最终都收敛到 Firebase ID Token → `POST /auth/session` → Firebase Admin 验证 → 服务端同步用户 → 写入 `Secure`/`HttpOnly`/`SameSite=Lax` 会话 Cookie：

1. 新用户：账号状态查询 → 自动短信验证 → 姓名与密码注册。
2. 老用户：服务端校验 `scrypt` 密码 → Firebase Custom Token → ID Token。
3. 同设备同号码：保留的 Firebase 本机状态直接刷新 ID Token，不再发送短信。

历史验证码用户若仍没有密码，可以继续用验证码/保留的可信登录状态进入系统，然后在“我的”页面首次设置密码。已有密码用户在“我的”修改密码时必须提交正确当前密码。`PATCH /me/password` 只能在有效服务端会话下使用，不能替代手机号所有权验证或登录流程。

- 登录初始化使用双提交 CSRF token。
- 其他 Cookie 写请求要求 `Origin` 精确匹配 `WEB_ORIGIN`。
- 会话 Cookie 不暴露给浏览器 JavaScript。
- `DELETE /auth/session` 只结束当前服务端会话并保留本机 Firebase 状态；`DELETE /auth/sessions` 撤销全部 Firebase 会话。公共设备不能把普通退出当作设备解绑。
- 开发登录只有 `DEV_AUTH_ENABLED=true` 且非生产时可用；Web 还必须在构建时设置 `NEXT_PUBLIC_DEV_AUTH_ENABLED=true`。
- 生产 `docker-compose.prod.yml` 明确把 API 开发登录设为 false，Web 镜像也以 false 构建。
- 登录、加入、写入、导出、AI 和 SSE 有 Redis 分布式限流；Redis 故障时退化到进程内限制。
- 安全响应头在 API `main.ts` 和 Next 配置中维护。

不要把手机号、Cookie、Firebase token、数据库 URL 或 AI 密钥写入测试快照、日志、文档或提交记录。

## 10. AI 与实时同步

### 10.1 AI

AI 记工流程：用户输入/语音 → 模型理解 → 服务端校验并保存 canonical preview → 前端展示 before/after/warnings → 用户明确确认 → 服务端重新鉴权并幂等执行。

“幂等确认”不等于把外部模型调用和所有业务步骤塞入一个数据库事务。当前实现允许可恢复重试，但必须保证最终不重复创建、预览只能消费一次、取消/过期后不可确认。

AI 财务回答必须先使用后端确定性查询得出数字；模型只能解释，不能自行算账。AI 没有任意 SQL、URL、文件或通用写工具。

语音上限为 8 MB/60 秒，原音频不持久化。浏览器不支持录音时回退到文字输入或系统听写。

当前供应商实现与配置约定：

- 文本模型：MiniMax 中国站 OpenAI 兼容接口，默认 `MINIMAX_API_BASE_URL=https://api.minimaxi.com`、`MINIMAX_MODEL=MiniMax-M3`。
- 语音转写：Google Cloud Speech-to-Text，`WEBM_OPUS`，主语言 `zh-CN`、备选 `en-US`，自动标点，模型 `latest_short`。
- `MINIMAX_API_KEY` 和 `GOOGLE_CLOUD_CREDENTIALS_BASE64` 只能从秘密环境变量注入。不要把本机 `.env` 复制进镜像层、文档或前端 bundle。
- MiniMax 模型升级不能只改一个环境变量；还要同步 Provider 默认值、AI 错误日志回退值、两份 env 模板和 Docker Compose 默认值，并用实时模型列表与实际 completion 验证。
- Google Speech 账号应继续保持 `roles/speech.client` 最小权限；不要为了排错改成 Owner/Editor。

### 10.2 实时

业务事务写 `domain_outbox`。SSE 只通知客户端“某类资源发生变化”，客户端收到后重新请求 REST。不要把 SSE payload 变成另一个完整真相来源。

断线重连使用 `Last-Event-ID`；代理必须关闭 SSE 缓冲并允许长连接。即使实时失败，刷新页面也应恢复一致状态。

## 11. 本地开发和质量基线

要求 Node.js 24、pnpm 11、Docker Compose。根目录 `.env` 仅用于本机，不得把真实密钥写入文档或源码。

```bash
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:deploy
pnpm dev
```

本地地址：Web `http://localhost:3000`，API ready `http://localhost:4000/api/v1/health/ready`。

每次实质修改至少运行：

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`test:integration` 使用独立的 `massage_note_test`，脚本会重建测试 schema 并应用全部迁移；不会清空开发主库。不要把集成测试指向生产或包含人工数据的数据库。

当前完整已验收基线为：

- domain：30 项通过。
- contracts：29 项通过。
- API 非集成测试：36 项通过。
- database 集成：3 项通过。
- API 完整集成模式：70 项通过。
- TypeScript、API build、Next production build 通过。
- `pnpm audit --prod`：无已知漏洞。
- 真实浏览器核对今日记工、历史营业日、财务、现金、工资、日结、管理、回收站、角色限制、AI 降级与预览。
- 当时的生产镜像以非 root 用户运行，健康检查、安全响应头、生产禁用开发登录和数据库最小权限通过；该镜像早于 2026-08-05 密码与导航更新。
- 备份、SHA-256 校验及恢复到隔离数据库通过。

2026-08-05 密码、导航、悬浮 AI、店铺切换和零小费结算的测试、构建及浏览器验收结果见第 2.3 至 2.5 节。

## 12. 生产构建、部署与运维

生产参考编排是 `docker-compose.prod.yml`：PostgreSQL → migrate → harden → API → Web，同时启动有密码的 Redis。应用端口只绑定 loopback，由外部 HTTPS 反向代理公开。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

上线前必须提供真实 Firebase 配置、同站点 HTTPS Web/API 域名、独立随机数据库/Redis 密码。MiniMax 与 Google Speech 在产品上仍是可选增强；本机 `.env` 已配置两者，但生产环境不会自动继承本机密钥，必须通过生产秘密管理重新注入。

当前外部部署责任还包括：

- 把最终生产 Web 域名加入 Firebase Authentication Authorized domains，并在临时测试结束后删除 `trycloudflare.com` hostname。
- Firebase 已是 Blaze 且已关联现有 Cloud Billing 账号；上线前补齐预算、费用告警和短信配额/错误率监控，并单独决定是否需要升级 Authentication 为 Identity Platform。
- 将 Firebase Admin、Google Speech 和 MiniMax 密钥写入生产秘密管理，而不是复制进 Compose 文件或镜像。
- 真实美国手机号的“短信已发送”已经验证；仍需完成“正确验证码 → 服务端会话 → 首页”的端到端验收，并使用真实短录音验证中英文转写。
- 观察至少一个完整营业日的 Firebase 短信、MiniMax token、Google Speech 用量和错误率。

备份和恢复分别使用：

- `scripts/backup-database.sh`
- `scripts/restore-database.sh`

恢复脚本具有覆盖性，只能对经过三次确认的独立目标库执行。维护 SQL 只清理过期幂等、AI preview 和 outbox，不删除业务财务或审计。

不要把隔离生产验收栈或其测试卷长期留在机器上；验收完成后使用明确的 Compose project name 执行 `down -v`。不要删除开发 PostgreSQL/Redis 卷，除非用户明确授权并已确认备份。

## 13. 已重点修复过的缺陷与回归点

后续修改最容易让以下问题复发：

1. 店铺列表必须过滤已删除、非活跃店铺；不能让已删除店铺留在切换器。
2. 创建店铺重试不能因为网络超时制造含糊冲突；相同店主、代码和配置应返回原结果，不同配置才报代码占用。
3. 店铺代码由店主选择且全局唯一，不能自动偷偷替换。
4. 加入店铺时先解析代码并显示店名，用户确认后才提交申请。
5. Manager 和 Owner 都可能参与记工；不要把角色直接等同于是否产生工资。
6. Employee 可操作当天全员记工，但不能写历史、看他人历史财务或管理设置。
7. 日结后必须锁定；历史修改只能先取消日结，并使现金结算失效重做。
8. 批量现金结清不能覆盖已经结清记录的版本、时间、操作人或备注。
9. 已结现金取得以实际可取得金额计算，现金不足部分仍是老板欠款。
10. 软删除后的记工、成员、目录和工资账本需要可追溯恢复路径。
11. 财务每个汇总卡片、员工小计和每日小计应能打开同一筛选口径的组成明细。
12. CSV 文本需防止以 `= + - @` 开头时被表格软件当作公式。
13. AI preview 不确认不写入；取消后不写入；重复或并发确认只执行一次。
14. 前端历史营业日使用明确的“选择日期 → 查看”，历史页不显示当天打卡写操作。
15. 前端付款方式要分别显示大费和小费，不要把二者合成一个误导标签。
16. 本地验收数据必须精确删除，不能按宽泛时间范围清除用户真实数据。
17. 现金小费和刷卡小费允许同时留空并按 0 确认付款；只有现金/刷卡大费仍要求至少一项。
18. 无密码历史用户在“我的”中首次设密时不应被要求提供不存在的当前密码；已有密码用户必须验证当前密码。
19. `/me` 只暴露 `hasPassword`，绝不能返回 `passwordHash`。
20. 店铺切换必须只接受当前用户的有效成员关系，并同步 `massage_note_store_id`；不能信任任意前端 `storeId` 绕过服务层权限。
21. 底部主导航保持四项，不要重新加入独立 AI 项；记工和财务助手分别挂在今日与财务页面。
22. AI 悬浮层和 PWA 安装按钮不能占用同一个右下角位置；手机视口也要回归检查。

## 14. 常见修改方案

### 14.1 修改金额公式

1. 先写/改 `packages/domain/test/finance.test.ts`。
2. 修改 `packages/domain/src/finance.ts`。
3. 检查 Prisma 汇总字段和 CHECK constraint 是否仍一致。
4. 修改 `finance-calculator.service.ts` 和所有读取汇总字段的查询。
5. 更新前端草稿预览，但以后端结果为准。
6. 增加 work-record 和 finance 集成测试。
7. 更新 PRD、本指南和软件内帮助。

### 14.2 新增财务字段

按“领域定义 → Prisma 字段/迁移/约束 → 写入快照 → 汇总查询 → details/CSV → contracts/types → 中文 UI → 审计 → 测试 → 文档”的顺序完成。只加一张 UI 卡片不算完成。

### 14.3 新增角色能力

先更新 `permission.ts` 和权限矩阵，再更新 `store-access.service.ts` 的对象级校验、Controller/Service、前端可见性和三个角色的集成测试。尤其要增加跨店和伪造 `membershipId` 测试。

### 14.4 修改数据库结构

不得直接编辑已有迁移来“让本机好看”。新增时间戳迁移；先验证空库，再验证现有数据副本；更新 `harden.sql` 权限和 schema integration test。部署前先备份。

### 14.5 修改登录

同时考虑 Web Firebase 状态、服务端 Cookie、CSRF/Origin、限流、撤销全部会话、用户身份合并和生产关闭开发入口。密码功能若继续，不能复用可预测 Firebase UID，也不能绕过手机号所有权验证。

### 14.6 修改页面

保持全中文、触控友好、大按钮、高对比、金额口径解释和无障碍 label。手机、iPad 和桌面都要检查；不要只看桌面截图。涉及写入时保留 loading、中文失败提示、重复点击保护和冲突刷新。

## 15. 排错顺序

- Firebase 真实短信在 `localhost` 返回 `invalid-app-credential`：不要继续重试；Web Phone Auth 不支持把 `localhost` 当托管域名，应改用 Firebase Authorized domains 中的真实 HTTPS hostname。
- 用户确认验证码正确但页面显示“验证码不正确”：先确认错误是否来自 Firebase `confirm()`，再查后续 CSRF、API base、mixed content、Origin、Cookie 和 session 创建；不要用一个 catch 把整个链路都映射成验证码错误。
- API 无法启动：先查 `/health/ready`、PostgreSQL 容器、迁移是否齐全，再看 API 日志。
- 类型显示异常：确认 contracts 已 build、Prisma Client 已 generate，禁止直接改 `dist`。
- 金额不一致：先用领域纯函数复算，再查记工快照和付款拆分，不要先在 UI 做补丁。
- 409：检查 `version`、幂等键和日结状态；不要无条件覆盖最新数据。
- 403：检查 `Origin`、有效成员、店铺状态、角色能力和对象 `storeId`。
- 实时不刷新：REST 是否正确优先于 SSE；随后查 outbox、SSE 游标和代理缓冲。
- AI 失败：确认核心手动流程仍正常，再查供应商配置；不要为了让 AI 成功降低业务校验。
- Docker 构建出现 Prisma “找不到默认 schema”安装提示：部署阶段会复制已生成客户端，判断成败以最终 build、migrate 和 health 为准。

## 16. 文档维护责任

| 变化 | 必须同步的文档 |
| --- | --- |
| 产品规则/金额定义 | `PRD.md`、软件 `/help`、本文 |
| 架构或数据流 | `ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md`、本文 |
| API 路径/字段/错误 | `docs/API.md`、本文相应章节 |
| 环境变量/部署顺序 | `.env.example`、`.env.production.example`、`docs/DEPLOYMENT.md` |
| 安全控制/边界 | `docs/SECURITY.md`、发布检查清单 |
| 备份/恢复/维护 | `docs/OPERATIONS.md`、发布检查清单 |
| 新测试基线或已知未完成项 | 本文第 2、11 节 |

每次交接应在本文顶部更新日期，并在“当前实现状态”中明确区分：已完成且有证据、进行中、外部部署责任、明确不在范围内。不要用“应该已经可以”替代测试结果。

## 17. 明确不在首版范围

- 工资税、W-2、1099、报税或法律合规计算。
- 退款/负金额；未来应做独立冲正流程，不能让现有非负金额规则失效。
- 离线业务写入和自动冲突合并。
- 店内共用设备 PIN 模式。
- 原生 iOS 应用。
- 在当前 Prisma 连接模型下强行启用依赖连接变量的 RLS。
- 由 AI 直接运行 SQL、调用任意 URL/文件或无预览修改财务。

若需求要进入这些范围，应先做新一轮产品和技术设计，而不是在现有路径上偷偷扩大语义。
