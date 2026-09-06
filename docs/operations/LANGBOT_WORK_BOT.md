# LangBot 记工机器人

本文说明微信“记工助手”的部署、配置和验收。机器人只接收群聊中的 `@` 消息，并且只处理绑定、上工和下工；项目、价格、提成、营业日和最终账目都由 Massage Note 校验和计算。

## 组件与安全边界

- LangBot 插件位于 `integrations/langbot-plugin`，可构建为 `.lbpkg` 后通过 LangBot 的本地插件安装功能导入。
- 插件使用一个指定 WeChatPad 机器人和一个指定解析模型。固定语法先由本地规则解析，只有无法识别的说法才调用模型。
- 模型只能输出 `BIND_STORE`、`BIND_MEMBER`、`START`、`FINISH` 或 `HELP` 的限定 JSON。Massage Note 会再次确认姓名、别名、显式时长、金额和付款方式均来自原消息。
- 插件只能调用 `POST /api/v1/integrations/langbot/work-events`；独立令牌不能访问普通店铺、财务、员工或删除接口。
- 微信消息编号同时作为幂等依据。超时不代表失败或成功，重试同一条消息不会重复记账。

## 实现位置

| 范围 | 位置 | 说明 |
| --- | --- | --- |
| HTTP 与管理接口 | `apps/api/src/work-bot/work-bot.controller.ts` | 专用事件入口和 Owner/Manager 管理端点 |
| 业务事务 | `apps/api/src/work-bot/work-bot.service.ts` | 绑定、别名校验、上下工、财务重算、幂等与审计 |
| 固定语法与模型防补写 | `apps/api/src/work-bot/work-bot.parser.ts` | 解析常见说法，并核对候选字段能否在原消息中找到 |
| 共享请求契约 | `packages/contracts/src/work-bot.ts` | Zod 请求和管理表单 schema |
| 数据模型 | `packages/database/prisma/schema.prisma` | 群、员工、别名和操作记录关系 |
| 数据库迁移 | `packages/database/prisma/migrations/20260905190000_work_bot_integration` | 新建机器人表、索引和外键 |
| 跨群进行中约束 | `packages/database/prisma/migrations/20260906154000_work_bot_one_active_per_employee` | 每名员工最多一条机器人进行中记录的部分唯一索引 |
| 管理页面 | `apps/web/app/manage/work-bot-panel.tsx` | 群/员工解绑、别名管理和最近操作 |
| LangBot 插件 | `integrations/langbot-plugin` | 群消息拦截、DeepSeek 后备解析和受限 API 调用 |

## 专用接口契约

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

后端不会直接信任 `parsedIntent`：姓名、别名、显式时长、金额和付款方式必须能从 `rawText` 验证，员工和项目必须属于已绑定店铺。成功响应只包含记工结果、群回复、可选记工 ID 和营业日。

## Massage Note 配置

在 API 运行环境设置一个至少 32 字符、以 `mnw_` 开头的随机令牌：

```dotenv
LANGBOT_WORK_TOKEN=mnw_<随机高强度字符串>
```

生产 Compose 已把该变量传入 API。发布时必须先执行 Prisma 迁移，再启动新 API；不要把真实令牌写入 Git、镜像、日志或插件包。

登录 Massage Note 后，Owner 或 Manager 在“管理 → 记工机器人”中：

1. 为每个黑话选择一个已启用的主要项目和默认时长档位。
2. 至少创建实际会使用的别名，例如“大力”对应 Deep Tissue、默认 60 分钟，“脚”对应 Foot Massage、默认 30 分钟。群消息“大力 90”会改用 Deep Tissue 已存在的 90 分钟价格档，无需再创建“大力90”。
3. 查看或解除群绑定和员工微信绑定，并查看最近 100 条机器人处理结果。

别名不会自动猜测或从知识库读取。“脚”必须由管理员明确选择店铺中的真实 Foot Massage 项目和默认时长；消息中显式写出的其他分钟数也必须是该项目已有的价格档。

## LangBot 配置

1. 构建或使用 `integrations/langbot-plugin/dist/` 下的 `.lbpkg`，通过“插件 → 本地安装”导入。
2. 打开已安装插件的配置页面，填写 `API 地址`、`集成令牌`、`记工机器人`和可选的`黑话解析模型`。集成令牌必须与 Massage Note API 的 `LANGBOT_WORK_TOKEN` 完全一致。

   不要只把 `MASSAGE_NOTE_*` 变量放进 `langbot_plugin_runtime` 容器。当前隔离插件进程使用最小环境，不会继承 Runtime 容器的自定义变量；这会使插件已初始化却在收到消息后报告“插件尚未配置集成令牌”。插件配置接口会遮蔽令牌，真实值不要写入 Git、镜像、日志或 `.lbpkg`。

3. “记工助手”流水线的群响应规则只开启“被艾特”，清空前缀、正则和随机触发。
4. 流水线只启用 `walton/massage-note-work-bot` 插件，关闭其他插件、MCP 服务、知识库和技能。
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

“大力 90”给发送者自己上工；“Jessie 脚 30”由发送者为 Jessie 上工。发送者和目标员工都必须已在同一个记工群绑定，姓名必须唯一匹配。下工仍由目标员工自己的微信发送；第一个金额是大费/业绩和服务实收，第二个金额是小费。首版只接受全部现金或全部信用卡；金额、付款方式、员工绑定或项目别名任何一项不明确时都不会写账。错账和历史修改统一在 Massage Note 网页完成。

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
