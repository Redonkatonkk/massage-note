# 项目文档

这里是 Massage note 的统一文档入口。先按问题类型选择文档，不需要从根目录逐份通读。

```text
docs/
  product/       当前产品与业务规则
  engineering/   架构、开发、API 与 AI 接管
  operations/    部署、运维、安全、发布和 Mac 代理手册
  archive/       已过时但需要保留的历史设计
```

## 按任务查找

| 任务 | 主要文档 | 需要时再读 |
| --- | --- | --- |
| 快速了解项目 | 根目录 [`README.md`](../README.md) | [`PRODUCT.md`](product/PRODUCT.md)、[`ARCHITECTURE.md`](engineering/ARCHITECTURE.md) |
| 确认角色、流程或金额口径 | [`PRODUCT.md`](product/PRODUCT.md) | 对应领域测试 |
| 定位模块、路由或写入链路 | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.md) | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) |
| 修改代码或数据库 | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.md)、对应测试 |
| 调用或修改 HTTP 接口 | [`API.md`](engineering/API.md) | 共享契约、Controller 和集成测试 |
| 普通 Linux 生产部署 | [`DEPLOYMENT.md`](operations/DEPLOYMENT.md) | [`SECURITY.md`](operations/SECURITY.md) |
| 群晖发布或升级 | [`NAS_DEPLOYMENT.md`](operations/NAS_DEPLOYMENT.md) | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.md) |
| 监控、数据库备份或恢复 | [`OPERATIONS.md`](operations/OPERATIONS.md) | [`SECURITY.md`](operations/SECURITY.md) |
| 安装或排查 Mac“信息”代理 | [`MESSAGES_AGENT.md`](operations/MESSAGES_AGENT.md) | [`SECURITY.md`](operations/SECURITY.md) |
| 安装或排查微信记工机器人 | [`LANGBOT_WORK_BOT.md`](operations/LANGBOT_WORK_BOT.md) | [`SECURITY.md`](operations/SECURITY.md)、[`API.md`](engineering/API.md)、[插件开发指南](../integrations/langbot-plugin/DEVELOPMENT.md) |
| 准备正式发布 | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.md) | 根目录 [`CHANGELOG.md`](../CHANGELOG.md) |
| 让 AI 接管维护 | [`AI_HANDOFF.md`](engineering/AI_HANDOFF.md) | 按具体任务选择上面的文档 |

## 事实来源优先级

文档与实现不一致时，先停止传播旧说法，并按下面顺序核对：

1. 数据库约束与 Prisma schema：`packages/database/prisma`。
2. 共享输入契约：`packages/contracts/src`。
3. 纯领域规则及测试：`packages/domain/src`、`packages/domain/test`。
4. API 服务与集成测试：`apps/api/src`、`apps/api/test`。
5. 当前产品和 API 文档。
6. 归档设计，仅用于理解历史决策。

若产品意图与已经运行的实现冲突，不应静默选一边：先确认期望，再同步修改代码、测试和当前文档。

## 归档

[`archive/`](archive/) 保存历史设计与早期实施记录：

- [`INITIAL_ARCHITECTURE_PLAN.md`](archive/INITIAL_ARCHITECTURE_PLAN.md)：编码前的架构、ER 图、路由设想和阶段计划。
- [`INITIAL_AI_DEVELOPMENT_PROMPT.md`](archive/INITIAL_AI_DEVELOPMENT_PROMPT.md)：最初用于启动项目的一次性 AI 提示。
- [`CODE_REVIEW_2026-09-08.md`](archive/CODE_REVIEW_2026-09-08.md)：1.0.7 审查与修复记录。
- [`LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.md`](archive/LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.md)：早期 1.0.2 跨项目对接记录。

归档文档中的路由、目录和“待实现”内容可能已经过时，不参与当前事实优先级。

文档职责见上方任务索引；版本、验证与本地开发服务规则以根目录 [`AGENTS.md`](../AGENTS.md) 和 [`DEVELOPMENT.md`](engineering/DEVELOPMENT.md) 为准。
