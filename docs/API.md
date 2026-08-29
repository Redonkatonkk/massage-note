# API 使用说明

> 适用版本：`0.12.31`
> 精确输入字段以 `packages/contracts/src` 的 Zod schema 为准；本页负责 HTTP 路径、通用语义和跨端约定。

本系统的 HTTP API 供当前中英文 Web 应用与未来原生客户端共用。默认前缀为 `/api/v1`，所有业务金额均使用整数美分，日期使用 `YYYY-MM-DD`，时间点使用带时区的 ISO 8601 字符串。

## 认证与通用规则

- 首次注册由 Firebase Phone Auth 验证手机号，并在 `POST /auth/session` 中同时提交姓名和 8 至 72 字符的密码；密码仅以随机盐 `scrypt` 摘要保存。
- 老用户可以用密码换取 Firebase Custom Token，也可以继续使用验证码。客户端最终都把 Firebase ID Token 提交到 `POST /auth/session`，服务端返回 `HttpOnly` 会话 Cookie。
- 浏览器后续请求必须携带 Cookie。除健康检查、CSRF 初始化和登录外，接口都需要有效会话。
- 已有店铺内的关键写入必须发送 `Idempotency-Key` 请求头；建议使用 UUID。相同键和相同请求会返回首次结果，相同键配不同内容会返回冲突。创建店铺尚无 `storeId`，因此以“店主＋自选店铺代码＋相同配置”做语义去重；加入申请以“用户＋店铺＋待审状态”去重。
- 修改、删除和恢复请求中的 `version` 是乐观锁版本。若资源已被其他设备修改，接口返回 `409` 和最新资源，客户端应刷新后让用户重新核对。
- 所有店铺业务路径都包含 `storeId`。服务端会再次校验成员关系、角色能力和对象归属，不能依赖前端隐藏按钮实现权限。
- 请求和响应均为 JSON；CSV 导出例外。错误格式为 `{ code, messageZh, requestId, latestResource? }`。版本冲突的 `latestResource` 也必须经过 JSON 安全转换，数据库 `BigInt` 金额不能让应有的 409 响应退化为 500。

## 主要端点

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health`、`/health/ready` | 存活与依赖就绪检查 |
| GET | `/auth/csrf` | 初始化短信登录前的 CSRF Cookie 与令牌 |
| POST | `/auth/account-status` | 按手机号码判断新账号、密码账号或待补设密码的老账号 |
| POST | `/auth/password` | 校验手机号码和密码并签发 Firebase Custom Token |
| POST | `/auth/session` | 使用 Firebase ID Token 建立会话；首次注册或老账号升级时同时保存姓名/密码 |
| POST | `/auth/dev-session` | 仅非生产且双侧显式开启时使用的本地开发登录 |
| DELETE | `/auth/session`、`/auth/sessions` | 退出当前设备、撤销全部设备会话 |
| GET | `/me` | 当前账号、资料状态和有效店铺成员关系 |
| PATCH | `/me/profile`、`/me/password` | 更新姓名资料、设置或修改密码 |
| GET | `/stores` | 列出当前用户的有效店铺 |
| POST | `/stores` | 创建店铺；店主填写全局唯一 6 位代码 |
| GET | `/stores/resolve-code/:code` | 加入前解析店铺代码并显示店名供确认 |
| GET/PATCH/DELETE | `/stores/:storeId` | 店铺详情、设置与软删除；设置包含记工和礼物卡自动折扣 |
| POST | `/stores/:storeId/owner-transfer` | 原子转移店主身份 |
| POST | `/stores/:storeId/join-requests` | 提交加入申请；注册 First Name 匹配待认领员工时自动绑定账号 |
| GET | `/stores/:storeId/join-requests` | 店主或经理查看加入申请 |
| POST | `/stores/:storeId/join-requests/:joinRequestId/approve`、`reject` | 审批加入申请 |
| GET | `/stores/:storeId/members` | 成员列表；已关联账号同时返回注册手机号，供短信接收号码回填 |
| POST | `/stores/:storeId/members` | 店主或经理以 `{ "name": "小林" }` 创建待认领员工，不需要姓氏或手机号 |
| PATCH/DELETE | `/stores/:storeId/members/:membershipId` | 更新成员资料/角色或软删除成员关系；开启个人日结短信时，专用号码与关联账号注册手机号至少存在一个，否则拒绝更新 |
| POST | `/stores/:storeId/members/:membershipId/restore` | 恢复成员关系 |
| GET | `/stores/:storeId/catalog` | 项目目录 |
| POST | `/stores/:storeId/catalog/setup` | 首次批量设置项目目录 |
| POST | `/stores/:storeId/catalog/items` | 新增主要、额外或折扣项目 |
| PATCH/DELETE | `/stores/:storeId/catalog/items/:itemId` | 修改或软删除项目 |
| POST | `/stores/:storeId/catalog/reorder` | 原子调整一类项目的完整顺序 |
| POST | `/stores/:storeId/catalog/items/:itemId/restore` | 恢复软删除项目 |
| GET | `/stores/:storeId/members/:membershipId/commissions` | 读取员工默认与项目专属提成 |
| PUT | `/stores/:storeId/members/:membershipId/commissions/default`、`item` | 保存员工默认或项目专属提成；按规则重算未日结当前营业日 |
| GET | `/stores/:storeId/business-days/current` | 当前营业日、时区和截止时间 |
| GET | `/stores/:storeId/business-days/open-work-dates` | 查询日期范围内有有效记工但尚未日结的营业日，供今日记工和财务日结日历标记；`dateFrom`、`dateTo` 必填，均包含端点，范围最多 63 天；Owner/Manager 返回全店日期，员工仅返回自己的记工日期 |
| GET | `/stores/:storeId/boards/:businessDate` | 今日或历史记工表；包含该日有效礼物卡销售和店铺销售汇总；普通员工查看历史时仅返回本人行、班次、记工和本人统计，不返回全店卖卡记录 |
| POST | `/stores/:storeId/shifts/clock-in`、`shifts/:shiftId/clock-out` | 上下班；当前 Web 只向符合条件的普通员工显示“上班” |
| POST | `/stores/:storeId/boards/:businessDate/rows` | 新增每日员工行 |
| PATCH | `/stores/:storeId/boards/:businessDate/rows/:rowId` | 更新每日员工行；店主和经理可在日结后调整显示状态 |
| POST | `/stores/:storeId/boards/:businessDate/reorder` | 原子调整每日员工行顺序 |
| POST | `/stores/:storeId/work-records` | 快速创建预设或自定义记工；可提交 `isHighlighted`；同一员工允许同时存在多笔待结账记录 |
| GET/PATCH/DELETE | `/stores/:storeId/work-records/:recordId` | 记工详情、修改高亮及其他字段与软删除 |
| POST | `/stores/:storeId/work-records/:recordId/confirm-payment` | 确认现金/刷卡/礼物卡大费和小费拆分；使用礼物卡时同时提交序列号 |
| GET | `/stores/:storeId/work-records/deleted` | 记工回收站 |
| POST | `/stores/:storeId/work-records/:recordId/restore` | 恢复软删除记工 |
| GET | `/stores/:storeId/gift-card-sales` | 店长或经理读取按序列号自然排序的礼物卡台账、下一序列号及同卡多条使用记录 |
| POST | `/stores/:storeId/gift-card-sales` | 记录卖出的礼物卡；提交营业日、面值、现金、刷卡和操作人，序列号由服务端每店从 1001 原子分配 |
| PATCH/DELETE | `/stores/:storeId/gift-card-sales/:saleId` | 修改或软删除卖卡记录；使用 `version`、`Idempotency-Key`、营业日锁和审计 |
| GET | `/stores/:storeId/gift-card-sales/deleted` | 店长查看已删除卖卡记录 |
| POST | `/stores/:storeId/gift-card-sales/:saleId/restore` | 恢复已删除卖卡记录 |
| GET | `/stores/:storeId/closings/:businessDate/preview` | 全店日结预览 |
| GET | `/stores/:storeId/closings/:businessDate/members/:membershipId/preview` | 个人日结预览；员工仅可读取本人；返回目标员工按开始时间排序的逐笔记工、项目/加项名称、逐笔 `grossFeeBaseCents` 折前大费、现金/刷卡/礼物卡实收拆分、单笔工资收入，以及现金/刷卡大费分红、现金/刷卡小费分红和对应合计；仅计已确认付款；应提交现金按含现金大费的已确认项目折前基数合计 × 40% 计算；不含全店或他人数据 |
| POST | `/stores/:storeId/closings/:businessDate`、`.../cancel` | 正常/强制日结与取消日结 |
| GET | `/stores/:storeId/closings/:businessDate/deliveries` | 店主或经理查看个人日结短信发送历史、错误和 Mac 代理状态 |
| POST | `/stores/:storeId/closings/:businessDate/deliveries/batch` | 日结后把所有已开启、号码有效且当天有记工的成员幂等加入发送队列 |
| DELETE | `/stores/:storeId/closings/:businessDate/deliveries/:deliveryId` | 店主或经理取消仍处于排队状态的单条员工日结短信任务 |
| POST | `/stores/:storeId/closings/:businessDate/deliveries/members/:membershipId` | 单独发送或补发一位员工的个人日结 |
| GET/POST/DELETE | `/stores/:storeId/closing-delivery-agent/status`、`credential` | 查看代理状态、生成一次性代理令牌或撤销令牌 |
| POST | `/closing-delivery-agent/jobs/claim`、`jobs/:id/authorize`、`complete`、`fail`、`heartbeat` | Mac 代理使用 Bearer 令牌领取租约任务、发送前复核并回写结果 |
| GET | `/stores/:storeId/cash-settlements/:businessDate` | 当日现金结算列表，只含当日有记工的员工 |
| POST | `/stores/:storeId/cash-settlements/:businessDate/settle-all` | 批量结清未结清员工 |
| POST | `/stores/:storeId/cash-settlements/:businessDate/:membershipId/settle`、`reopen` | 单人结清或回退 |
| GET/POST | `/stores/:storeId/payroll-settlements` | 查询或新增工资结算账本 |
| GET/PATCH/DELETE | `/stores/:storeId/payroll-settlements/:settlementId` | 工资结算详情、修改和软删除 |
| POST | `/stores/:storeId/payroll-settlements/:settlementId/restore` | 恢复工资结算 |
| GET | `/stores/:storeId/employee-settlements/preview` | Owner/Manager 按 `membershipId`、`dateFrom`、`dateTo` 和 `paymentScope=CASH|NON_CASH|ALL` 预览员工区间结算；只含已确认且未删除记工，最多 999 笔 |
| GET/POST | `/stores/:storeId/employee-settlements/deliveries` | 查看区间结算短信队列，或把服务端重算后的不可变快照加入摘要 PNG＋逐笔 PDF 发送队列 |
| DELETE | `/stores/:storeId/employee-settlements/deliveries/:deliveryId` | 取消仍在排队的区间结算发送任务 |
| POST | `/stores/:storeId/employee-settlements/deliveries/:deliveryId/retry` | 重试失败任务；保留摘要/PDF 已完成检查点，只补发未完成附件 |
| POST | `/employee-settlement-delivery-agent/jobs/claim`、`jobs/:id/authorize`、`checkpoint`、`complete`、`fail` | Mac 代理领取区间结算任务，并分别回写摘要图和 PDF 附件进度 |
| GET | `/stores/:storeId/finance/summary` | 财务汇总、每日/员工小计和累计余额；总计包含总流水与店铺总结算，每日行包含 `dailyTurnoverCents`；`highlightFilter` 支持 `ALL`、`ONLY_HIGHLIGHTED`、`EXCLUDE_HIGHLIGHTED` |
| GET | `/stores/:storeId/finance/details` | 与汇总筛选一致的组成明细，包括高亮状态 |
| GET | `/stores/:storeId/finance/my-balance` | 当前成员的累计应得、已取得、已支付和尚欠/超付 |
| GET | `/stores/:storeId/finance/export.csv` | 与汇总筛选一致且防公式注入的 UTF-8 CSV 导出，包括高亮标记列 |
| GET | `/stores/:storeId/audit-logs` | 按时间、对象、动作和操作人查询审计 |
| GET | `/stores/:storeId/events` | 支持 `Last-Event-ID` 的 SSE 实时事件流 |
| POST | `/stores/:storeId/ai/work/messages` | 生成记工操作预览，不直接写入 |
| POST | `/stores/:storeId/ai/finance/messages` | 使用后端确定性统计回答财务问题 |
| POST | `/stores/:storeId/ai/work/transcribe` | 语音转文字 |
| GET/DELETE | `/stores/:storeId/ai/previews/:previewId` | 查看或取消一次性 AI 预览 |
| POST | `/stores/:storeId/ai/previews/:previewId/confirm` | 重新鉴权并一次性确认 AI 预览 |

Web 页面支持 `/finance?store=<storeId>&tab=closing&date=<businessDate>` 直接打开指定营业日的全店日结；在日结异常列表点击单据时，财务页原地读取 `GET /work-records/:recordId` 并打开单笔记工弹窗，不离开当前页面。`/?store=<storeId>&date=<businessDate>&record=<recordId>` 深链接仍可用于从外部直接打开今日页的指定记工。读取不会自动执行日结或修改记录。

两个 AI 消息端点的请求体均接受 `locale: "zh-CN" | "en-US"`，省略时默认 `zh-CN`。该字段决定模型提示、确定性财务回答和安全降级说明的语言。语音转写端点接收浏览器生成的 MP4/AAC 原始请求体，限制为 6–60 秒且不超过 8 MB，通过与文本模型相同的 `MINIMAX_API_KEY` 调用 `MINIMAX_TRANSCRIPTION_MODEL`（默认 `music-cover`）内置 ASR；`Accept-Language` 决定主要识别语言，另一种语言仍作为候选。其他业务错误继续返回稳定 `code` 与 `messageZh`；Web 英文界面按稳定错误码显示英语说明，未知错误码使用不泄露内部信息的通用英语提示。

店主或经理创建的待认领员工拥有正常的成员 ID，可立即进入今日表格、记工和配置提成，只是 `userId` 暂时为空。员工注册后用店铺代码加入时，服务端仅以账号注册资料中的 First Name 对本店待认领员工名字做规范化精确匹配；匹配成功返回 `{ "autoMatched": true, "membership": ... }` 并在原成员关系上绑定账号，因此既有记录不会搬迁或丢失。未匹配时仍返回带 `autoMatched: false` 的待审批申请。加入表单中临时填写的显示名不能用于冒领其他员工账号。

主要项目使用 `priceOptions` 表示一个或多个时长价格档位，例如：

```json
{
  "fullName": "Body Massage",
  "shortName": "Body",
  "priceOptions": [
    { "durationMinutes": 30, "priceCents": 6000 },
    { "durationMinutes": 60, "priceCents": 10000 }
  ]
}
```

快速创建或把记工切换到预设项目时提交 `serviceItemId` 和 `serviceDurationMinutes`。若项目只有一个档位，服务端为旧客户端兼容可补选该档位；项目有多个档位时缺少时长会返回 `SERVICE_PRICE_OPTION_REQUIRED`。更新记工且没有明确提交 `endAt` 时，服务端会在修改 `startAt` 后保留当前实际工作时长，并按主要项目及额外项目新旧配置分钟数的总差值调整结束时间；明确提交的 `endAt` 仍优先。记工保存的仍是名称、时长、价格和提成快照，后续修改或删除价格档位不会改变历史记录。

店铺设置可通过同一次 `PATCH /stores/:storeId` 写入周一至周四自动折扣；三个字段必须一起提交：

```json
{
  "version": 3,
  "mondayThursdayAutoDiscountEnabled": true,
  "mondayThursdayAutoDiscountThresholdCents": 10000,
  "mondayThursdayAutoDiscountAmountCents": 1000
}
```

启用时门槛和额度必须为正数，且折扣额度不能高于门槛。系统按记工的营业日判断周一至周四，在“主要项目 + 额外项目”的折前大费达到门槛时生成自动折扣快照；该快照与普通折扣共同计算折后业绩，不进入员工工资公式。修改设置不会批量改写历史记工，新建或再次编辑记工时才按当前规则判断。

同一个店铺设置接口也可保存礼物卡满额百分比自动折扣；三个字段必须一起提交，关闭时门槛和比例均为 0：

```json
{
  "version": 4,
  "giftCardAutoDiscountEnabled": true,
  "giftCardAutoDiscountThresholdCents": 10000,
  "giftCardAutoDiscountBps": 500
}
```

上例表示礼物卡面值满 `$100.00` 时折扣 `5%`。卖卡时会把当时的门槛和比例写入销售快照，之后修改店铺设置不会改变既有卖卡记录。

记工详情可通过 `PATCH /stores/:storeId/work-records/:recordId` 为单笔记录停用或恢复自动折扣：

```json
{
  "version": 4,
  "automaticDiscountSuppressed": true
}
```

设为 `true` 后，服务端删除该笔自动折扣快照并持久保留停用状态，之后再次编辑也不会自动加回；设为 `false` 时按当前营业日、折前大费和店铺设置重新判断。该字段走既有记工权限、营业日锁、版本冲突、幂等、审计与现金结算回退规则。

快速记工和详情修改都可提交布尔字段 `isHighlighted`。它只控制首页黄色卡片提示和财务查询筛选，不进入任何金额公式。财务汇总、明细和 CSV 必须使用相同的 `highlightFilter` 值。

确认付款可在原有现金与刷卡字段之外提交礼物卡拆分：

```json
{
  "version": 4,
  "cashServiceCents": 2000,
  "cardServiceCents": 0,
  "giftCardSerialNumber": "GC-2026-0001",
  "giftCardServiceCents": 8000,
  "cashTipCents": 0,
  "cardTipCents": 0,
  "giftCardTipCents": 2000
}
```

礼物卡大费与小费之和大于 0 时序列号必填；未使用礼物卡时序列号可以省略或为 `null`，两项礼物卡金额均为 0。礼物卡大费进入本单实收服务费与付款比例，礼物卡小费进入员工收入；两者都是非现金付款，不增加员工现金结算金额。

卖卡请求示例：

```json
{
  "businessDate": "2026-08-20",
  "faceValueCents": 15000,
  "cashCents": 5000,
  "cardCents": 9250,
  "operatorMembershipId": "00000000-0000-4000-8000-000000000000"
}
```

若店铺规则是“满 `$100.00` 折扣 `5%`”，上述请求的折扣为 `$7.50`，折后应付和实际收款均为 `$142.50`。响应包含自动分配的 `serialNumber`、`faceValueCents`、`discountThresholdCents`、`discountRateBps`、`discountCents` 与 `amountCents`，并满足 `faceValueCents - discountCents = amountCents = cashCents + cardCents`。同一店铺序列号唯一，自动号在事务内递增且软删除后不复用；界面默认显示系统建议号码，也允许改成自定义号码，服务端按规范化结果检查当前和软删除历史记录防重。实际收款全部加入店铺收入，不进入员工提成、工资或现金结算；客人后续使用礼物卡支付的大费和小费全部计入礼物卡核销支出。

项目排序提交完整的未删除项目列表及当前版本，例如 `{ "type": "SERVICE", "items": [{ "id": "...", "version": 2 }] }`。服务端在同一事务中校验列表、项目归属和全部版本，再统一写入顺序；列表不完整或任一版本过期时返回 `CATALOG_ORDER_CONFLICT`，不会留下半套排序。

今日记工页面只调用 `POST /stores/:storeId/shifts/clock-in` 支持普通员工把本人加入当前营业日表格，不调用下班接口。新营业日上班若发现本人仍有旧营业日未结束班次，会先原子结束旧班次并记录 `shift.stale_auto_closed` 审计，再创建当前班次和本人表格行；同一营业日重复上班返回 `SHIFT_ALREADY_OPEN`。`clock-out` 继续保留给旧客户端和历史审计兼容，员工页面不提供对应按钮；员工工作状态仍完全由记工时间段计算。

## 财务查询参数

`finance/summary`、`finance/details` 和 `finance/export.csv` 使用同一组查询参数：

- `dateFrom`、`dateTo`：营业日范围，均包含端点。
- `membershipIds`：逗号分隔的成员 ID；普通员工即使传入其他人也只会得到本人数据。
- `paymentMethod`：`CASH`、`CARD`、`GIFT_CARD` 或 `ALL`，省略时默认 `ALL`。
- `amountType`：`SERVICE`、`TIP` 或 `ALL`。
- `highlightFilter`：`ALL`、`ONLY_HIGHLIGHTED` 或 `EXCLUDE_HIGHLIGHTED`。

店主或经理未限定员工且选择全部金额时，汇总、明细和 CSV 会纳入店铺级礼物卡销售：`itemCount = recordCount + giftCardSaleCount`，`customerTotalPaidCents = actualServiceCollectedCents + totalTipCents + giftCardSalesAmountCents`。员工小计、明确员工筛选、仅大费、仅小费或仅高亮记工不分摊卖卡记录。`giftCardRedemptionCents = giftCardServiceCents + giftCardTipCents`，`storeIncomeCents = discountedFeePerformanceCents + totalTipCents - employeeIncomeCents + giftCardSalesAmountCents - giftCardRedemptionCents`。

`finance/summary` 的每个 `days[]` 行额外返回 `dailyTurnoverCents = discountedFeePerformanceCents + giftCardSalesAmountCents - giftCardRedemptionCents`。该字段由服务端使用整数美分计算；Web 每日小计依次显示日期、星期和今日流水，并隐藏全部项目数、记工数、实收服务费、小费和客人总付款列。

`finance/summary.totals` 还返回：

- `totalTurnoverCents = discountedFeePerformanceCents + giftCardSalesAmountCents - giftCardRedemptionCents`；
- `ownerWorkerIncomeCents`：`OWNER` 角色作为工人的大费工资与小费；
- `managerWorkerIncomeCents`：所有 `MANAGER` 角色作为工人的大费工资与小费合计；
- `giftCardNetIncomeCents = giftCardSalesAmountCents - giftCardRedemptionCents`；
- `totalIncomeCents = storeIncomeCents + ownerWorkerIncomeCents + managerWorkerIncomeCents + giftCardNetIncomeCents`。

这些字段采用当前日期、员工、付款方式、金额类型和高亮筛选口径。Web 的每日小计位于员工小计之前，日期后显示按当前界面语言本地化的星期；员工范围使用复选框多选，空选择表示全部员工。

工资结算列表支持日期、成员和 `includeDeleted=true`。审计列表支持 `dateFrom`、`dateTo`、`entityType`、`action`、`actorUserId` 与游标分页。

## 错误与排查

- `400`：字段格式或业务规则不满足，例如付款拆分全部留空。
- `401`：会话无效或已撤销。
- `403`：角色权限不足或试图跨店访问。
- `404`：对象不存在、已停用或不属于当前店铺。
- `409`：版本冲突、重复店铺代码、已日结日期写入或幂等键冲突。
- `429`：登录、加入、AI、导出或写入频率过高。

响应头 `X-Request-Id` 与错误体 `requestId` 可用于关联服务日志和审计。接口字段的唯一事实来源是 `packages/contracts/src` 中的 Zod 契约；修改接口时应同步更新契约测试和本文。
