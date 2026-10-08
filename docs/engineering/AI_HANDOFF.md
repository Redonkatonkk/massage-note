# AI 接管指南

> 最后核对：2026-10-07（America/New_York） · 当前版本：`1.21.0`

## 接手

1. 查看 `git status --short --branch`，遵循根目录 [维护规则](../../AGENTS.md)，保留其他任务的改动。保留原因：工作区可能包含未提交工作，维护要求只在一个入口定义。
2. 从 [文档索引](../README.md) 选择任务文档，再用 `rg` 核对当前源码、契约和测试。保留原因：文档与归档只能引导定位，不能证明实现仍然存在。
3. 业务口径查 [产品规则](../product/PRODUCT.md)，模块/事务查 [架构](ARCHITECTURE.md)，接口查 [API](API.md)，验证查 [开发指南](DEVELOPMENT.md)，视觉维护查 [UI 设计](UI_DESIGN.md)。保留原因：不在接管页复制财务、缓存、排工和样式规则，避免修正一处后其他入口仍过时。
4. 修改前端前，先读 [UI 设计与审美准则](UI_DESIGN.md) 的审美目标、判断方法、已暴露的问题与 AI 工作顺序，再查对应页面布局和源码。保留原因：用户要求延续审美理解；变量一致之外还要检查任务顺序、手机阅读和低频页面。

## 独立交付物

| 范围 | 维护入口 | 保留原因 |
| --- | --- | --- |
| Web/API 与数据库迁移 | [NAS 部署](../operations/NAS_DEPLOYMENT.md)、[发布检查](../operations/RELEASE_CHECKLIST.md) | 本地源码和开发服务不代表 NAS 已升级，已发布迁移仍须向前应用。 |
| LangBot 插件 | [插件开发指南](../../integrations/langbot-plugin/DEVELOPMENT.md)、[机器人手册](../operations/LANGBOT_WORK_BOT.md) | manifest/YAML 动态注册入口，插件版本与应用独立，安装副本不是源码。 |
| Mac“信息”代理 | [代理手册](../operations/MESSAGES_AGENT.md) | 已安装代理和权限 App 独立运行，NAS 发布不会更新其附件模板。 |
| 安全及备份恢复 | [安全说明](../operations/SECURITY.md)、[运维手册](../operations/OPERATIONS.md) | 凭据、数据库和发送状态需要各自的验证与恢复边界。 |

## 交接

- 报告实际修改和验证，明确外部依赖、必要迁移及独立产物更新；本地服务收尾按 [开发指南](DEVELOPMENT.md)。保留原因：代码测试不能证明微信/短信送达、NAS 或已安装插件版本。
- 用户明确要求“更新部署”时，完成 [NAS 手册](../operations/NAS_DEPLOYMENT.md) 中对应 commit 的 CI/GHCR、备份、迁移和健康检查。保留原因：已有发布授权应落实完整链路，不能只修改本地文件。
- “进行一轮文档整理”的固定含义见 [维护规则](../../AGENTS.md)。保留原因：全仓清理及逐条解释规则是重复使用的用户要求，不是本次临时记录。
