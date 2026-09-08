# LangBot 记工机器人

本文说明微信“记工助手”的部署、配置和验收。机器人只接收群聊中的 `@` 消息，并且只处理绑定、上工、下工和待付款记工的折扣/加项；项目、价格、提成、营业日和最终账目都由 Massage Note 校验和计算。

## 组件与安全边界

- LangBot 插件位于 `integrations/langbot-plugin`，可构建为 `.lbpkg` 后通过 LangBot 的本地插件安装功能导入。
- 插件使用一个指定 WeChatPad 机器人和一个必选解析模型。每条消息都会先读取当前群的实时黑话技能，再由模型理解，没有固定规则绕过 AI。
- 黑话技能包含店主的自然语言说明、启用项目目录、默认/可用时长、在职员工及启用的折扣/加项名称。模型只能输出 `BIND_STORE`、`BIND_MEMBER`、`START`、`FINISH`、`ADJUST` 或 `HELP` 的限定 JSON，并为语义映射返回原文证据。
- 插件只能调用只读的 `POST /api/v1/integrations/langbot/work-context` 和写入事件入口 `POST /api/v1/integrations/langbot/work-events`；独立令牌不能访问普通店铺、财务、员工或删除接口。
- 微信消息编号同时作为幂等依据。超时不代表失败或成功，重试同一条消息不会重复记账。

## 实现位置

| 范围 | 位置 | 说明 |
| --- | --- | --- |
| HTTP 与管理接口 | `apps/api/src/work-bot/work-bot.controller.ts` | 专用事件入口和 Owner/Manager 管理端点 |
| 业务事务 | `apps/api/src/work-bot/work-bot.service.ts` | 绑定、别名校验、上下工、财务重算、幂等与审计 |
| 模型证据核验 | `apps/api/src/work-bot/work-bot.parser.ts` | 核对模型引用的项目、员工、时长和付款方式证据能否在原消息中找到 |
| 共享请求契约 | `packages/contracts/src/work-bot.ts` | Zod 请求和管理表单 schema |
| 数据模型 | `packages/database/prisma/schema.prisma` | 群、员工、别名和操作记录关系 |
| 数据库迁移 | `packages/database/prisma/migrations/20260905190000_work_bot_integration` | 新建机器人表、索引和外键 |
| 跨群进行中约束 | `packages/database/prisma/migrations/20260906154000_work_bot_one_active_per_employee` | 每名员工最多一条机器人进行中记录的部分唯一索引 |
| 管理页面 | `apps/web/app/manage/work-bot-panel.tsx` | 群/员工解绑、别名管理和最近操作 |
| LangBot 插件 | `integrations/langbot-plugin` | 群消息拦截、实时技能注入、全程 AI 理解和受限 API 提交 |

## 专用接口契约

插件先读取当前群可见的实时技能：

```http
POST /api/v1/integrations/langbot/work-context
Authorization: Bearer <integration-token>
Content-Type: application/json
```

该接口只返回当前群绑定店铺的自然语言说明、项目 ID、项目名称、可用时长、在职员工和当前发送者绑定姓名，不返回价格、提成或财务数据。

```http
POST /api/v1/integrations/langbot/work-events
Authorization: Bearer <integration-token>
Idempotency-Key: wechatpad:<bot-id>:<message-id>
Content-Type: application/json
```

```json
{
  "platform": "WECHATPAD",
  "botId": "...",
  "groupId": "...",
  "senderId": "...",
  "messageId": "...",
  "occurredAt": "2026-09-06T15:30:00-04:00",
  "rawText": "下工 80 10 卡",
  "parsedIntent": {
    "kind": "FINISH",
    "serviceAmount": "80",
    "tipAmount": "10",
    "paymentMethod": "CARD"
  }
}
```

后端不会直接信任 `parsedIntent`：模型输出的项目 ID 和标准员工必须来自实时技能，项目、员工和价格必须属于已绑定店铺；模型还必须提交原文中的项目、员工、显式时长与付款方式证据；说明中约定的默认时长使用 SKILL 来源并仍检查项目价格档。成功响应只包含记工结果、群回复、可选记工 ID 和营业日。

## Massage Note 配置

在 API 运行环境设置一个至少 32 字符、以 `mnw_` 开头的随机令牌：

```dotenv
LANGBOT_WORK_TOKEN=mnw_<随机高强度字符串>
```

生产 Compose 已把该变量传入 API。发布时必须先执行 Prisma 迁移，再启动新 API；不要把真实令牌写入 Git、镜像、日志或插件包。

登录 Massage Note 后，Owner 或 Manager 在“管理 → 记工机器人”中：

1. 在“记工黑话”中用自然语言描述简称、项目含义和默认时长。
2. 例如写：“大家说大力时指 Deep Tissue，默认 60 分钟；脚指 Foot Massage，默认 30 分钟。”保存后下一条群消息会读取最新说明；“大力 90”会选择项目已有的 90 分钟价格档。
3. 查看或解除群绑定和员工微信绑定，并查看最近 100 条机器人处理结果。

项目目录限定可选项目；自然语言说明帮助模型理解“脚”“feet”“足部”等说法，不再维护逐条对应关系。存在多个合理项目时需要补充信息；显式时长和说明中的默认时长都必须是项目已有的价格档。

## LangBot 配置

1. 构建或使用 `integrations/langbot-plugin/dist/` 下的 `.lbpkg`，通过“插件 → 本地安装”导入。
2. 打开已安装插件的配置页面，填写 `API 地址`、`集成令牌`、`记工机器人`和必填的`黑话解析模型`。集成令牌必须与 Massage Note API 的 `LANGBOT_WORK_TOKEN` 完全一致。

   不要只把 `MASSAGE_NOTE_*` 变量放进 `langbot_plugin_runtime` 容器。当前隔离插件进程使用最小环境，不会继承 Runtime 容器的自定义变量；这会使插件已初始化却在收到消息后报告“插件尚未配置集成令牌”。插件配置接口会遮蔽令牌，真实值不要写入 Git、镜像、日志或 `.lbpkg`。

3. “记工助手”流水线的群响应规则只开启“被艾特”，清空前缀、正则和随机触发。
4. 流水线只启用 `walton/massage-note-work-bot` 插件，关闭其他插件、MCP 服务和知识库；记工技能由插件从 Massage Note 动态加载，无需在 LangBot 中另建一份容易过期的静态技能。
5. 将 WeChatPad 机器人固定路由到“记工助手”流水线；如使用会话白名单，把实际微信群加入白名单。

## 群内使用

首次配置：

```text
@记工助手 绑定店铺 123456
@记工助手 绑定 张三
```

记工：

```text
@记工助手 上工，大力
@记工助手 大力 90
@记工助手 Jessie 脚 30
@记工助手 我下了，80 20 现金
@记工助手 下工 80 10 卡
```

“大力 90”给发送者自己上工；“Jessie 脚 30”由已绑定发送者为同店唯一匹配的在职 Jessie 上工，Jessie 无需预先绑定微信。系统会为尚未绑定的目标员工建立内部占位绑定；她以后发送“绑定 Jessie”时会接管进行中记录，并可从自己的微信下工。第一个下工金额是大费/业绩和服务实收，第二个金额是小费。首版只接受全部现金或全部信用卡；金额、付款方式、发送者绑定、员工姓名或项目别名任何一项不明确时都不会写账。错账和历史修改统一在 Massage Note 网页完成。

## 上线验收

先验证后端链路，再把插件绑定到流水线。可用空 JSON 做无写入探针：

```bash
# 不带凭据：预期 403
curl -o /dev/null -w '%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' \
  'https://<production-domain>/api/v1/integrations/langbot/work-events' \
  -d '{}'

# 带正确集成令牌：预期 400 VALIDATION_FAILED
curl -o /dev/null -w '%{http_code}\n' \
  -X POST -H "Authorization: Bearer $MASSAGE_NOTE_WORK_TOKEN" \
  -H 'Content-Type: application/json' \
  'https://<production-domain>/api/v1/integrations/langbot/work-events' \
  -d '{}'
```

第二个响应为 400 表示请求已经通过反向代理、CSRF 集成例外和 Bearer 鉴权，并到达事件契约校验。空对象不是合法事件，不会写入绑定或记工。若返回 404，先核对生产容器实际镜像；若正确令牌仍返回 `CSRF_ORIGIN_REJECTED`，不要通过伪造 `Origin` 绕过，先确认实际运行版本包含记工接口例外。

只有上述探针通过，才在“记工助手”流水线中启用插件。绑定后再次检查：插件状态为 `initialized`、流水线只绑定 `walton/massage-note-work-bot`、WeChatPad 机器人固定使用该流水线，且插件运行时没有初始化错误。

先在测试店铺完成一次“绑定店铺 → 绑定员工 → 上工 → 下工 → 网页核账”，并确认：

- 群回复的员工、项目、开始/结束时间和付款金额与网页一致。
- 重发同一条微信消息不产生第二笔记录。
- 未知黑话、缺金额、缺付款方式、普通聊天和提示词注入没有写入。
- 现金与刷卡字段、小费、工资、实际分钟数、营业日和审计日志正确。
- 跨午夜、已日结营业日、重复上工和重复下工均返回明确结果且没有半完成账目。

## 人工记工、折扣与加项

已绑定的群员可以操作同店员工的待付款记工，包括网页人工创建的记录，无需该记录由机器人上工。指定员工必须唯一匹配在职员工完整姓名；不指定时使用发送者绑定员工。按员工查找开始时间不晚于消息时间的待付款记录，仅有一条时执行，多条时要求网页核对。已确认、已删除记录不在此入口修改，日结锁继续生效。

- `Lily 下了，收 75/15卡，评论`：Lily 下工，大费及服务实收 $75、小费 $15，均刷卡，并使用店铺配置的评论折扣。
- `Lily 加评论折扣`：为待付款记录加入评论折扣，保持待付款状态。
- `Lily 加热石`：使用店铺热石加项配置，记录价格与提成快照并重算账目。
- 下工可同时携带 `discounts` 和 `addons`，每项为 `{ "name": "配置名称", "mention": "原文证据" }`。`ADJUST` 使用同样字段但不需要付款金额。

付款金额不会再因评论折扣被扣一次；折扣作为独立明细参与系统原有业绩计算。加项保留自己的金额与提成。已有同一预设折扣/加项不会再次叠加，未配置、停用或同名歧义时整条指令不改账。模型获取折扣/加项名称及简称，不能自行指定价格或折扣金额。

发布时需同时更新 Massage Note API 和 LangBot 插件，先 API 后插件。本次不需要数据库迁移。

## 自然语言记工说明（2026-09-08）

店铺设置 → 记工机器人 → 记工黑话，直接写自然语言说明并保存，不再逐条选择黑话、项目和时长。机器人每条消息读取说明和实时项目目录。可写店内简称、口语含义、默认时长及折扣/加项习惯；项目和价格仍由项目目录控制。

部署时先执行数据库迁移 `20260908010000_work_bot_instructions`，再更新 API、网页和 LangBot 插件。迁移会将启用的旧黑话转换为自然语言段落，原始记录保留以兼容旧消息。新增配置不需要创建 aliases 对应关系。

## 输入与升级校验

金额必须逐字对应原文中的两个独立数字且顺序一致；拒绝负号、超过两位小数、混合付款和礼物卡。数字时长必须完整匹配，不能把 160 分钟识别成 60 分钟。停用成员无法借指定其他员工继续写账，已停用店铺也不接受群绑定和记工操作。

插件拒绝无效消息时间；API URL 必须是最终 HTTPS 地址，本地 HTTP 例外仅允许精确主机 `host.docker.internal`，不会携带令牌跟随重定向。

迁移 `20260908020000_repair_work_record_board_links` 为历史有效记工补齐缺失的看板行，并清理已确认、删除或改派记录的机器人进行中指针。不会重算历史财务，也不会取消已有隐藏行；发布前应在副本验证数据量和执行耗时。
