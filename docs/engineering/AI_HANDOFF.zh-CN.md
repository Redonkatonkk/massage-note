# AI 接管指南

**[English](AI_HANDOFF.md)** | **简体中文**

> 最后核对：2026-10-26（America/New_York） · 当前版本：`1.39.2`

## 接手

1. 查看 `git status --short --branch`，遵循根目录 [维护规则](../../AGENTS.zh-CN.md)，保留其他任务的改动。保留原因：工作区可能包含未提交工作，维护要求只在一个入口定义。
2. 从 [文档索引](../README.zh-CN.md) 选择任务文档，再用 `rg` 核对当前源码、契约和测试。保留原因：文档与归档只能引导定位，不能证明实现仍然存在。
3. 业务口径查 [产品规则](../product/PRODUCT.zh-CN.md)，模块/事务查 [架构](ARCHITECTURE.zh-CN.md)，接口查 [API](API.zh-CN.md)，验证查 [开发指南](DEVELOPMENT.zh-CN.md)，视觉维护查 [UI 设计](UI_DESIGN.zh-CN.md)。保留原因：不在接管页复制财务、缓存、排工和样式规则，避免修正一处后其他入口仍过时。
4. 修改前端前，先读 [UI 设计与审美准则](UI_DESIGN.zh-CN.md) 的审美目标、判断方法、已暴露的问题与 AI 工作顺序，再查对应页面布局和源码。保留原因：用户要求延续审美理解；变量一致之外还要检查任务顺序、手机阅读和低频页面。

## 独立交付物

| 范围 | 维护入口 | 保留原因 |
| --- | --- | --- |
| Web/API 与数据库迁移 | [NAS 部署](../operations/NAS_DEPLOYMENT.zh-CN.md)、[发布检查](../operations/RELEASE_CHECKLIST.zh-CN.md) | 本地源码和开发服务不代表 NAS 已升级，已发布迁移仍须向前应用。 |
| LangBot 插件 | [插件开发指南](../../integrations/langbot-plugin/DEVELOPMENT.zh-CN.md)、[机器人手册](../operations/LANGBOT_WORK_BOT.zh-CN.md) | manifest/YAML 动态注册入口，插件版本与应用独立，安装副本不是源码。 |
| Mac“信息”代理 | [代理手册](../operations/MESSAGES_AGENT.zh-CN.md) | 已安装代理和权限 App 独立运行，NAS 发布不会更新其附件模板。 |
| 安全及备份恢复 | [安全说明](../operations/SECURITY.zh-CN.md)、[运维手册](../operations/OPERATIONS.zh-CN.md) | 凭据、数据库和发送状态需要各自的验证与恢复边界。 |
| Oracle 免费实例申请监控 | [NAS 监控手册](../operations/ORACLE_MONITOR.zh-CN.md) | 只允许 2 OCPU / 12GB，不得降配；独立运行器、OCI 签名身份、持久重试令牌和通知状态须单独核对，应用发布不代表监控已启用。 |

## 交接

- 报告实际修改和验证，明确外部依赖、必要迁移及独立产物更新；本地服务收尾按 [开发指南](DEVELOPMENT.zh-CN.md)。保留原因：代码测试不能证明微信/短信送达、NAS 或已安装插件版本。
- 用户明确要求“更新部署”时，直接按 [默认更新部署流程](../operations/NAS_DEPLOYMENT.zh-CN.md#默认更新部署流程) 执行到 NAS 验收和本机收尾完成，报告完整 SHA、正式版本、CI/NAS 结果和实际耗时；不要只完成本地修改或分支测速就结束。保留原因：已有发布授权覆盖完整链路，候选镜像不能证明正式标签或 NAS 已升级。
- 发布时由 CI 并行完成完整验证和镜像构建，本地只做手册规定的发布预检；已通过且未受后续改动影响的验证、匿名 manifest 检查及部署脚本验收不重复。完整验证的开发命令不作为每次发布的串行前置步骤；失败、迁移或打包变化按手册补充对应证据。保留原因：后续 AI 必须沿用已优化的分工，不能因接管而重新堆叠全量测试、本地镜像或重复探测。
- “进行一轮文档整理”和“代码审查（大扫除）”的固定含义见 [维护规则](../../AGENTS.zh-CN.md)。保留原因：全仓清理及逐条解释规则是重复使用的用户要求，不是本次临时记录。
