# 项目文档

**[English](README.md)** | **简体中文**

[作品图集与免登录 Demo](portfolio/README.zh-CN.md) — 简历展示入口、17 个页面图片、演示路线与边界。

项目概览：**[English README](../README.md)** · **[中文 README](../README.zh-CN.md)**。仓库首页和手册默认使用英文，每份手册顶部均提供对应中文版本链接；两种语言同步维护。

这里是 Massage note 的统一文档入口。先按问题类型选择文档，不需要从根目录逐份通读。保留原因：文档按职责组织，具体任务只需读取相关现行依据；全仓整理另按维护规则执行。

```text
docs/
  product/       当前产品与业务规则
  engineering/   架构、开发、API 与 AI 接管
  operations/    部署、运维、安全、发布和 Mac 代理手册
  archive/       历史设计和一次性检查记录
```

## 按任务查找

| 任务 | 主要文档 | 需要时再读 |
| --- | --- | --- |
| 快速了解项目 | [English README](../README.md)、[中文 README](../README.zh-CN.md) | [`PRODUCT.md`](product/PRODUCT.zh-CN.md)、[`ARCHITECTURE.md`](engineering/ARCHITECTURE.zh-CN.md) |
| 确认角色、流程或金额口径 | [`PRODUCT.md`](product/PRODUCT.zh-CN.md) | 对应领域测试 |
| 定位模块、路由或写入链路 | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.zh-CN.md) | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.zh-CN.md) |
| 修改代码或数据库 | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.zh-CN.md) | [`ARCHITECTURE.md`](engineering/ARCHITECTURE.zh-CN.md)、对应测试 |
| 学习审美、维护 UI 与导航 | [UI 设计与审美准则](engineering/UI_DESIGN.zh-CN.md) | [`DEVELOPMENT.md`](engineering/DEVELOPMENT.zh-CN.md) |
| 查看手机阅读复核范围 | [手机复核记录](engineering/MOBILE_REVIEW_2026-10-04.zh-CN.md) | [真实组件回归](../apps/web/app/ui/mobile-reading.test.tsx) |
| 调用或修改 HTTP 接口 | [`API.md`](engineering/API.zh-CN.md) | 共享契约、Controller 和集成测试 |
| 普通 Linux 生产部署 | [`DEPLOYMENT.md`](operations/DEPLOYMENT.zh-CN.md) | [`SECURITY.md`](operations/SECURITY.zh-CN.md) |
| 群晖发布或升级 | [默认更新部署流程](operations/NAS_DEPLOYMENT.zh-CN.md#默认更新部署流程) | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.zh-CN.md) |
| 监控、数据库备份或恢复 | [`OPERATIONS.md`](operations/OPERATIONS.zh-CN.md) | [`SECURITY.md`](operations/SECURITY.zh-CN.md) |
| NAS 上申请 Oracle 免费实例与邮件通知 | [`ORACLE_MONITOR.md`](operations/ORACLE_MONITOR.zh-CN.md) | [`OPERATIONS.md`](operations/OPERATIONS.zh-CN.md) |
| Google Drive 完整恢复包、午夜备份、Mac 按需恢复 | [`DISASTER_RECOVERY.md`](operations/DISASTER_RECOVERY.zh-CN.md) | [Google 首次设置](../scripts/recovery/README.zh-CN.md) |
| 安装或排查 Mac“信息”代理 | [`MESSAGES_AGENT.md`](operations/MESSAGES_AGENT.zh-CN.md) | [`SECURITY.md`](operations/SECURITY.zh-CN.md) |
| 安装或排查微信记工机器人 | [`LANGBOT_WORK_BOT.md`](operations/LANGBOT_WORK_BOT.zh-CN.md) | [`SECURITY.md`](operations/SECURITY.zh-CN.md)、[`API.md`](engineering/API.zh-CN.md)、[插件开发指南](../integrations/langbot-plugin/DEVELOPMENT.zh-CN.md) |
| 修改或打包 LangBot 插件 | [插件开发指南](../integrations/langbot-plugin/DEVELOPMENT.zh-CN.md) | [随包说明](../integrations/langbot-plugin/readme/README_zh_Hans.md)、[中文说明](../integrations/langbot-plugin/readme/README_zh_Hans.md) |
| 准备正式发布 | [`RELEASE_CHECKLIST.md`](operations/RELEASE_CHECKLIST.zh-CN.md) | 根目录 [`CHANGELOG.md`](../CHANGELOG.zh-CN.md) |
| 让 AI 接管维护 | [`AI_HANDOFF.md`](engineering/AI_HANDOFF.zh-CN.md) | 按具体任务选择上面的文档 |

## 事实来源优先级

文档与实现不一致时，先停止传播旧说法，并按下面顺序核对：

1. 数据库约束与 Prisma schema：`packages/database/prisma`。保留原因：这是持久字段和数据库可接受状态的实际边界。
2. 共享输入契约：`packages/contracts/src`。保留原因：HTTP 输入以实际校验器定义为准。
3. 纯领域规则及测试：`packages/domain/src`、`packages/domain/test`。保留原因：金额和排序的确定性算法在这里实现。
4. API 服务与集成测试：`apps/api/src`、`apps/api/test`。保留原因：权限、事务和兼容行为需要实际调用链证据。
5. 当前产品和 API 文档。保留原因：文档负责说明实现，不独立创造字段和接口。
6. 归档设计，仅用于理解历史决策。保留原因：旧路由、阶段计划和规矩已经不适用于当前代码。

文档描述与当前实现不符时，清理先纠正文档；需要改变现有行为时按用户授权另行实施，并同步代码和测试。保留原因：本轮清理不加功能，已授权工作也不应因旧文档要求而重复确认。

## 归档

[`archive/`](archive/) 保存历史设计、早期实施和一次性检查记录：

- [`INITIAL_ARCHITECTURE_PLAN.md`](archive/INITIAL_ARCHITECTURE_PLAN.zh-CN.md)：编码前的架构、ER 图、路由设想和阶段计划。
- [`INITIAL_AI_DEVELOPMENT_PROMPT.md`](archive/INITIAL_AI_DEVELOPMENT_PROMPT.zh-CN.md)：最初用于启动项目的一次性 AI 提示。
- [`CODE_REVIEW_2026-09-08.md`](archive/CODE_REVIEW_2026-09-08.zh-CN.md)：1.0.7 审查与修复记录。
- [`CODE_CLEANUP_2026-09-29.md`](archive/CODE_CLEANUP_2026-09-29.zh-CN.md)：1.13.7 全仓整理清单、实施范围与保留项。
- [`CODE_CLEANUP_2026-10-04.md`](archive/CODE_CLEANUP_2026-10-04.zh-CN.md)：1.18.4 全仓清理证据、过时规则及保留原因。
- [`CODE_CLEANUP_2026-10-12.md`](archive/CODE_CLEANUP_2026-10-12.zh-CN.md)：1.25.1 全仓代码审查、死代码与重复实现清理及验证证据。
- [`LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.md`](archive/LANGBOT_MASSAGE_NOTE_WORK_BOT_IMPLEMENTATION.zh-CN.md)：早期 1.0.2 跨项目对接记录。

归档中的全部规矩、路由、目录和“待实现”仅属历史引用，不是现行要求。保留原因：保留这些文件用于决策及版本追溯，不能让一次性提示重新控制当前维护。

文档职责见上方任务索引；版本、验证与本地开发服务规则以根目录 [`AGENTS.md`](../AGENTS.zh-CN.md) 和 [`DEVELOPMENT.md`](engineering/DEVELOPMENT.zh-CN.md) 为准。
