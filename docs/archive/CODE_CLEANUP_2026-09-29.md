# 2026-09-29 全仓代码与文档整理

> 一次性检查记录，基于 `1.13.6` 整理至 `1.13.7`。当前开发规则仍以 [开发指南](../engineering/DEVELOPMENT.md) 和 [架构](../engineering/ARCHITECTURE.md) 为准。

## 范围与方法

接手时 Git 工作区干净，共有 425 个受版本控制文件。检查覆盖根配置、CI、`apps/web`、`apps/api`、`apps/messages-agent`、三个共享包、数据库 schema/迁移、LangBot 插件、Docker、脚本和全部 Markdown 文档。

采用文件清单、目录体积与忽略规则检查、TypeScript 未使用变量/参数检查、重复片段扫描、契约和关键实现比对、文档目标检查，以及三个 Luna 子代理的分区只读审查。对生成文件和本地数据只核对用途、大小与忽略情况；不逐行审阅依赖或缓存，不输出本地凭据。

## 优化清单与实施

| 优化项 | 检查依据 | 实施 |
| --- | --- | --- |
| 统一 Web API 基址 | 登录页与 `lib/api.ts` 重复读取相同环境变量和回退地址 | 登录复用已有 `apiBase`，保持专用登录错误处理；业务请求和 SSE 的配置来源一致。 |
| 复用已有共享类型 | Web 重复定义角色、排工星期/模板、区间结算付款范围 | 角色从 domain 引入，排工类型从 `WeeklyDispatchInput` 推导，付款范围从 contracts 重导出；保持原 Web 导入入口。 |
| 合并发送代理鉴权 | 日结和区间结算服务的凭证解析、查询、撤销/店铺检查及哈希比较完全相同 | 提取 [`delivery-agent.ts`](../../apps/api/src/finance/delivery-agent.ts)，凭证签发也复用同一哈希函数；各任务仍按代理所属店铺和租约访问。 |
| 去掉重复快照包装 | 跑客 `snapshot()` 完整重复 `serialize()` 的参数类型并直接转发 | 审计直接复用原序列化结果，字段及删除时间附加方式不变。 |
| 整理契约测试与导入 | 经营分析测试位于 `src/`，原构建配置会将其编译到 `dist/`；目录契约重复导入 `common.js` | 测试移至 [`contracts/test`](../../packages/contracts/test/)，领域/契约构建显式排除 `*.test.ts`，合并重复导入。 |
| 固化无用代码检查 | 五个 TypeScript workspace 使用未使用变量/参数选项均通过 | 在共同 `tsconfig.base.json` 启用两项检查，复用原类型检查命令。 |
| 固化文档链接验证 | 维护规则要求检查本地链接，但仓库没有对应命令 | 添加 `pnpm docs:check` 和工具测试；覆盖本地行内链接、图片和引用式目标，接入 CI。外部 URL、标题锚点不在校验范围。 |
| 完善 Docker 上下文排除 | Git 已忽略 Python 缓存与插件包，Docker 缺少同类规则及 TypeScript 增量缓存规则 | `.dockerignore` 增加对应排除；保留根目录和嵌套依赖的既有规则。 |
| 完善导航与说明 | README 目录树遗漏消息代理及集成目录、导航重复；架构模块表遗漏跑客；测试说明遗漏 Mac 代理 | 补齐目录/模块和插件开发入口，更新命令、共享 helper 与已有单日排工覆盖说明，将版本政策移到 Changelog 顶部，同步应用版本。 |

## 保留项及原因

- **大组件和事务服务**：记工编辑器、看板、财务、排工和目录服务较长，但其状态和事务边界有耦合。本轮提取有明确重复证据的逻辑，未按行数整体拆分。
- **其余手写 Web 响应类型**：多数 contracts 定义输入校验，并不存在可直接替换的等价响应类型；不借整理新增响应协议。已经存在的等价类型按上表复用。
- **数据库迁移与约束快照**：已发布迁移保持原样；`constraints.sql` 明确是首版约束快照，后续约束由前向迁移维护，不应按最新 schema 覆写它。
- **测试布局**：Web 辅助函数测试与源码相邻；API 集成测试沿用 `DATABASE_INTEGRATION_TESTS` 门控；代理测试在 `test/`。这些布局与现有工具一致，只迁移会混入共享包构建的契约测试。
- **集成动态入口与随包说明**：LangBot YAML/manifest 动态引用 Python 事件与入口，静态引用少不等于死代码；中英文随包 README 各有用途，插件版本独立于应用版本。
- **历史、依赖与本地文件**：归档设计、插件历史安装包、`node_modules`、`.next`、生成 Prisma Client、`.local-ai` 和本地环境文件均保留。约 1.7 GB 工作目录主要是依赖和 Web 构建缓存，不作为无用源码删除。
- **领域与交付边界**：财务整数运算、权限、营业日锁、版本、幂等、审计/outbox、数据库结构与现有产品功能不变。本轮不发布 NAS、不重装插件或消息代理。

## 验证

命令入口见 [开发指南](../engineering/DEVELOPMENT.md#完成前验证)。本轮通过全仓类型检查、Prisma schema 校验、`pnpm build` 与其调用的 `pnpm version:check`；确认领域/契约的 `dist/` 不包含测试产物。

| 测试范围 | 通过数量 |
| --- | ---: |
| 仓库工具 | 4 |
| domain | 81 |
| contracts | 62 |
| messages-agent | 33 |
| Web | 153 |
| 数据库约束 | 7 |
| API 单元与集成 | 367 |
| 合计（不重复统计定向重跑） | 707 |

数据库测试使用独立 `massage_note_test`，已有 34 个迁移，无待应用迁移。Mac 代理的 AppleScript 编译和 SVG 转换测试在沙箱内失败，允许系统编译器/转换器访问后全部通过；只编译脚本和生成测试附件，没有执行发送。

`pnpm docs:check` 检查 24 份 Markdown 的 130 个本地文件/目录目标；`git diff --check` 检查本次改动的空白错误。按约定重新运行 `pnpm dev`，Web 3000 的 `/login` 返回 HTTP 200，API 4000 的 `/api/v1/health/ready` 返回 `status: ready`、`database: ok`，服务保持运行。

未调用浏览器；本地验证不代替真实微信、短信、NAS 或已安装代理的验收。LangBot 插件源码未修改，未重跑其独立 Python 测试。
