# 项目文档

这里是 Massage note 的统一文档入口。先按问题类型选择文档，不需要从根目录逐份通读。

## 从哪里开始

| 你要做什么 | 先读 | 再读 |
| --- | --- | --- |
| 了解项目 | 根目录 [`README.md`](../README.md) | [`PRODUCT.md`](PRODUCT.md)、[`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 修改业务规则或金额公式 | [`PRODUCT.md`](PRODUCT.md) | [`ARCHITECTURE.md`](ARCHITECTURE.md)、对应领域测试 |
| 修改代码 | [`DEVELOPMENT.md`](DEVELOPMENT.md) | [`ARCHITECTURE.md`](ARCHITECTURE.md)、[`API.md`](API.md) |
| 修改 HTTP 接口 | [`API.md`](API.md) | 共享契约、Controller 和集成测试 |
| 本地或服务器部署 | [`DEPLOYMENT.md`](DEPLOYMENT.md) | 群晖使用 [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md) |
| 备份、恢复或排障 | [`OPERATIONS.md`](OPERATIONS.md) | [`SECURITY.md`](SECURITY.md) |
| 准备正式发布 | [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) | [`CHANGELOG.md`](../CHANGELOG.md) |
| 让 AI 接管维护 | [`AI_HANDOFF.md`](AI_HANDOFF.md) | 按任务继续阅读上面的当前文档 |

## 当前文档

- [`PRODUCT.md`](PRODUCT.md)：产品范围、角色权限、记工流程和财务口径。
- [`ARCHITECTURE.md`](ARCHITECTURE.md)：当前代码结构、依赖方向、请求链路、数据一致性和扩展位置。
- [`DEVELOPMENT.md`](DEVELOPMENT.md)：本地环境、常用命令、修改顺序、测试与版本规则。
- [`API.md`](API.md)：HTTP 约定、端点、请求示例、财务筛选和错误语义。
- [`DEPLOYMENT.md`](DEPLOYMENT.md)：部署方式总览和普通 Docker Compose 生产部署。
- [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md)：GitHub Actions、GHCR 与群晖 Container Manager 流程。
- [`OPERATIONS.md`](OPERATIONS.md)：日常检查、备份、恢复演练和故障处理。
- [`SECURITY.md`](SECURITY.md)：已实施控制、租户隔离、部署责任和已知边界。
- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)：发布前、业务验收和上线后检查。
- [`AI_HANDOFF.md`](AI_HANDOFF.md)：给维护型 AI 的最短上下文与不可破坏规则。
- 根目录 [`CHANGELOG.md`](../CHANGELOG.md)：按版本记录已经交付的变化。

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

[`archive/`](archive/) 只保存项目启动阶段的历史材料：

- [`INITIAL_ARCHITECTURE_PLAN.md`](archive/INITIAL_ARCHITECTURE_PLAN.md)：编码前的架构、ER 图、路由设想和阶段计划。
- [`INITIAL_AI_DEVELOPMENT_PROMPT.md`](archive/INITIAL_AI_DEVELOPMENT_PROMPT.md)：最初用于启动项目的一次性 AI 提示。

归档文档中的路由、目录和“待实现”内容可能已经过时，不参与当前事实优先级。

## 维护约定

- 一个概念只指定一份主要文档；其他文档用链接引用，避免复制整段规则。
- `PRODUCT.md` 写“应该做什么”，`ARCHITECTURE.md` 写“现在如何组成”，`API.md` 写“如何调用”。
- 部署手册不累积每个历史版本的发布说明；版本变化统一写入 `CHANGELOG.md`。
- 命令、路径、环境变量或接口变化必须在同一次修改中更新对应当前文档。
- 新文档加入本索引；过时材料移入 `archive/` 并加醒目的归档说明。
