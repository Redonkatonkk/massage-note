# API 使用说明

本系统的 HTTP API 供当前中文 Web/PWA 与未来原生客户端共用。默认前缀为 `/api/v1`，所有业务金额均使用整数美分，日期使用 `YYYY-MM-DD`，时间点使用带时区的 ISO 8601 字符串。

## 认证与通用规则

- 首次注册由 Firebase Phone Auth 验证手机号，并在 `POST /auth/session` 中同时提交姓名和 8 至 72 字符的密码；密码仅以随机盐 `scrypt` 摘要保存。
- 老用户可以用密码换取 Firebase Custom Token，也可以继续使用验证码。客户端最终都把 Firebase ID Token 提交到 `POST /auth/session`，服务端返回 `HttpOnly` 会话 Cookie。
- 浏览器后续请求必须携带 Cookie。除健康检查、CSRF 初始化和登录外，接口都需要有效会话。
- 已有店铺内的关键写入必须发送 `Idempotency-Key` 请求头；建议使用 UUID。相同键和相同请求会返回首次结果，相同键配不同内容会返回冲突。创建店铺尚无 `storeId`，因此以“店主＋自选店铺代码＋相同配置”做语义去重；加入申请以“用户＋店铺＋待审状态”去重。
- 修改、删除和恢复请求中的 `version` 是乐观锁版本。若资源已被其他设备修改，接口返回 `409` 和最新资源，客户端应刷新后让用户重新核对。
- 所有店铺业务路径都包含 `storeId`。服务端会再次校验成员关系、角色能力和对象归属，不能依赖前端隐藏按钮实现权限。
- 请求和响应均为 JSON；CSV 导出例外。错误格式为 `{ code, messageZh, requestId, latestResource? }`。

## 主要端点

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health`、`/health/ready` | 存活与依赖就绪检查 |
| GET | `/auth/csrf` | 初始化短信登录前的 CSRF Cookie 与令牌 |
| POST | `/auth/account-status` | 按手机号码判断新账号、密码账号或待补设密码的老账号 |
| POST | `/auth/password` | 校验手机号码和密码并签发 Firebase Custom Token |
| POST | `/auth/session` | 使用 Firebase ID Token 建立会话；首次注册或老账号升级时同时保存姓名/密码 |
| DELETE | `/auth/session`、`/auth/sessions` | 退出当前设备、撤销全部设备会话 |
| GET/PATCH | `/me`、`/me/profile` | 当前账号与姓名资料 |
| GET/POST | `/stores` | 列出和创建店铺；创建时由店主填写全局唯一 6 位代码 |
| GET | `/stores/resolve-code/:code` | 加入前解析店铺代码并显示店名供确认 |
| GET/PATCH/DELETE | `/stores/:storeId` | 店铺详情、设置与软删除 |
| POST | `/stores/:storeId/owner-transfer` | 原子转移店主身份 |
| POST/GET | `/stores/:storeId/join-requests` | 提交、查看加入申请 |
| POST | `/stores/:storeId/join-requests/:id/approve`、`reject` | 审批加入申请 |
| GET/PATCH/DELETE | `/stores/:storeId/members/:membershipId?` | 成员列表、资料、角色和停用 |
| POST | `/stores/:storeId/members/:membershipId/restore` | 恢复成员关系 |
| GET/POST | `/stores/:storeId/catalog`、`catalog/setup` | 项目目录与首次设置 |
| POST/PATCH/DELETE | `/stores/:storeId/catalog/items/:itemId?` | 主要、额外和折扣项目管理 |
| POST | `/stores/:storeId/catalog/reorder` | 原子调整一类项目的完整顺序 |
| POST | `/stores/:storeId/catalog/items/:itemId/restore` | 恢复软删除项目 |
| GET/PUT | `/stores/:storeId/members/:membershipId/commissions/...` | 员工默认与员工项目专属提成 |
| GET | `/stores/:storeId/business-days/current` | 当前营业日、时区和截止时间 |
| GET | `/stores/:storeId/boards/:businessDate` | 今日或历史记工表；普通员工查看历史时仅返回本人行、班次、记工和本人统计 |
| POST/PATCH | `/stores/:storeId/shifts/...`、`boards/...` | 上下班、行显示与排序 |
| POST | `/stores/:storeId/work-records` | 快速创建预设或自定义记工；同一员工允许同时存在多笔待结账记录 |
| GET/PATCH/DELETE | `/stores/:storeId/work-records/:recordId` | 记工详情、修改与软删除 |
| POST | `/stores/:storeId/work-records/:recordId/confirm-payment` | 确认现金/刷卡大费和小费拆分 |
| GET/POST | `/stores/:storeId/work-records/deleted`、`.../:id/restore` | 回收站与恢复 |
| GET/POST | `/stores/:storeId/closings/:businessDate/...` | 日结预览、日结与取消日结 |
| GET | `/stores/:storeId/closings/:businessDate/members/:membershipId/preview` | 个人日结预览；员工仅可读取本人；应提交现金按含现金大费的已确认项目折前基数合计 × 40% 计算；另返回已确认记工的刷卡大费分红与刷卡小费分红；不含全店或他人数据 |
| GET/POST | `/stores/:storeId/cash-settlements/:businessDate/...` | 单人/全员现金结清和取消结清；列表仅含当日有记工的员工 |
| GET/POST/PATCH/DELETE | `/stores/:storeId/payroll-settlements/:id?` | 工资结算账本与软删除 |
| POST | `/stores/:storeId/payroll-settlements/:id/restore` | 恢复工资结算 |
| GET | `/stores/:storeId/finance/summary` | 财务汇总、员工/每日小计和累计余额 |
| GET | `/stores/:storeId/finance/details` | 与汇总筛选一致的组成明细 |
| GET | `/stores/:storeId/finance/export.csv` | 防公式注入的 UTF-8 CSV 导出 |
| GET | `/stores/:storeId/audit-logs` | 按时间、对象、动作和操作人查询审计 |
| GET | `/stores/:storeId/events` | 支持 `Last-Event-ID` 的 SSE 实时事件流 |

Web 页面支持用于排查日结异常的深链接：`/finance?store=<storeId>&tab=closing&date=<businessDate>` 直接打开指定营业日的全店日结；`/?store=<storeId>&date=<businessDate>&record=<recordId>` 自动切换到该营业日并打开对应记工详情。两种链接都只导航和读取，不会自动执行日结或修改记录。
| POST | `/stores/:storeId/ai/work/messages` | 生成记工操作预览，不直接写入 |
| POST | `/stores/:storeId/ai/finance/messages` | 使用后端确定性统计回答财务问题 |
| POST | `/stores/:storeId/ai/work/transcribe` | 语音转文字 |
| GET/POST/DELETE | `/stores/:storeId/ai/previews/:previewId/...` | 查看、确认或取消一次性 AI 预览 |

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

快速创建或把记工切换到预设项目时提交 `serviceItemId` 和 `serviceDurationMinutes`。若项目只有一个档位，服务端为旧客户端兼容可补选该档位；项目有多个档位时缺少时长会返回 `SERVICE_PRICE_OPTION_REQUIRED`。记工保存的仍是名称、时长、价格和提成快照，后续修改或删除价格档位不会改变历史记录。

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

记工详情可通过 `PATCH /stores/:storeId/work-records/:recordId` 为单笔记录停用或恢复自动折扣：

```json
{
  "version": 4,
  "automaticDiscountSuppressed": true
}
```

设为 `true` 后，服务端删除该笔自动折扣快照并持久保留停用状态，之后再次编辑也不会自动加回；设为 `false` 时按当前营业日、折前大费和店铺设置重新判断。该字段走既有记工权限、营业日锁、版本冲突、幂等、审计与现金结算回退规则。

项目排序提交完整的未删除项目列表及当前版本，例如 `{ "type": "SERVICE", "items": [{ "id": "...", "version": 2 }] }`。服务端在同一事务中校验列表、项目归属和全部版本，再统一写入顺序；列表不完整或任一版本过期时返回 `CATALOG_ORDER_CONFLICT`，不会留下半套排序。

班次接口继续保留给旧客户端和历史审计兼容：新营业日上班打卡若发现本人仍有旧营业日未结束班次，会先原子结束旧班次并记录 `shift.stale_auto_closed` 审计，再创建当前班次。同一营业日重复上班仍返回 `SHIFT_ALREADY_OPEN`。当前今日记工页面不再调用上下班接口，员工工作状态改由记工时间段计算。

## 财务查询参数

`finance/summary`、`finance/details` 和 `finance/export.csv` 使用同一组查询参数：

- `dateFrom`、`dateTo`：营业日范围，均包含端点。
- `membershipIds`：逗号分隔的成员 ID；普通员工即使传入其他人也只会得到本人数据。
- `paymentMethod`：`CASH`、`CARD` 或 `ALL`。
- `amountType`：`SERVICE`、`TIP` 或 `ALL`。

工资结算列表支持日期、成员和 `includeDeleted=true`。审计列表支持 `dateFrom`、`dateTo`、`entityType`、`action`、`actorUserId` 与游标分页。

## 错误与排查

- `400`：字段格式或业务规则不满足，例如付款拆分全部留空。
- `401`：会话无效或已撤销。
- `403`：角色权限不足或试图跨店访问。
- `404`：对象不存在、已停用或不属于当前店铺。
- `409`：版本冲突、重复店铺代码、已日结日期写入或幂等键冲突。
- `429`：登录、加入、AI、导出或写入频率过高。

响应头 `X-Request-Id` 与错误体 `requestId` 可用于关联服务日志和审计。接口字段的唯一事实来源是 `packages/contracts/src` 中的 Zod 契约；修改接口时应同步更新契约测试和本文。
