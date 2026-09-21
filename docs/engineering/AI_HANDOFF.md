# AI 接管指南

> 最后核对：2026-09-19（America/New_York） · 当前版本：`1.8.4`

## 接手

1. 查看 `git status --short --branch`，遵循根目录 [维护规则](../../AGENTS.md)。保留原因：避免覆盖现有改动，版本、验证和本地服务要求只在一处维护。
2. 从 [文档索引](../README.md) 选择当前任务文档，再用 `rg` 核对代码、契约和测试；归档不作为现行规则。保留原因：旧设计和历史发布记录不代表当前实现。
3. 业务口径查 [产品规则](../product/PRODUCT.md)，模块及事务查 [架构](ARCHITECTURE.md)，接口查 [API](API.md)，修改与验证查 [开发指南](DEVELOPMENT.md)。保留原因：避免在接管指南复制财务公式、权限和接口，从而再次产生不同版本的规则。

## 需要重点核对的边界

| 规则 | 实现依据与保留原因 |
| --- | --- |
| 财务计算使用整数美分和领域函数；历史按快照读取 | `packages/domain/src/finance.ts`、`work-records.service.ts`；避免浮点误差和目录调整重写历史。 |
| 营业日按设备时区自然日期、午夜换日，无设备上下文时回退店铺时区 | `common/device-time.ts`、`packages/domain/src/business-day.ts`；旧截止字段仍用于兼容和快照，不能恢复按截止时间倒推日期的旧逻辑。 |
| 写入保留权限、对象归属、营业日锁、版本、幂等、事务内审计与 outbox | `StoreAccessService`、`business-day-lock.ts`、`IdempotencyService` 和数据库触发器；避免越权、重放和半笔账。 |
| AI 预览经确认再执行；机器人按受限意图、原文证据和绑定身份执行 | `ai.service.ts`、`work-bot.service.ts`、`WorkBotAccess`；两个入口的确认流程不同，但均不能由模型授予权限或编造财务事实。 |
| 最近对话与学习经验不能替代实时目录和本次原文证据 | `integrations/langbot-plugin/components/events/work_bot.py`；防止历史金额、姓名或未确认猜测变成新记工。 |
| 生产凭据不进入源码、日志或镜像；开发登录在生产关闭 | [安全说明](../operations/SECURITY.md) 及认证配置；避免泄密及开发入口进入生产。 |
| 已发布迁移只向前追加，生产用 `prisma migrate deploy`；恢复不覆盖未经授权的数据库 | `packages/database/prisma/migrations`、[运维手册](../operations/OPERATIONS.md)；保留迁移可重放性与业务数据。 |
| Mac 信息代理保持后台发送和受限附件暂存 | [代理手册](../operations/MESSAGES_AGENT.md)、`apps/messages-agent`；现有实现依赖指定 App 的权限身份，不能用键盘自动化或读写聊天数据库替代。 |

## 交接

- 按 [开发指南](DEVELOPMENT.md) 报告实际验证及外部依赖边界。保留原因：本地测试不能证明微信、短信或 NAS 已升级。
- 明确要求“更新部署”时，按 [NAS 手册](../operations/NAS_DEPLOYMENT.md) 完成提交、push、对应 commit 的 CI/GHCR、备份、迁移和健康检查，业务验收由用户进行。保留原因：这些是当前发布链路的必要步骤，不能把发布请求缩成仅修改本地文件。
- 当前产品范围以 [产品规则](../product/PRODUCT.md) 为准，不在清理中扩展功能。保留原因：清理应保持现有行为和数据契约，不借重构引入新业务。


## 经营分析维护入口

财务“经营分析”采用独立日期范围，默认全部历史；口径见[产品规则](../product/PRODUCT.md)第15.0节。小时使用记工保存的时区，日/星期使用保存的营业日；营业额图仅统计已日结日期，7日均线必须读取筛选起点前6天。不要复用财务汇总默认最近7天或付款筛选。该功能无需迁移，NAS需更新应用镜像后生效。
