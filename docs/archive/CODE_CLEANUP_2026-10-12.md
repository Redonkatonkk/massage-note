# 2026-10-12 全仓代码审查与大扫除

> 一次性检查记录：工作区从 `1.25.0` 整理至 `1.25.1`。保留原因：保存扫描、清理和验证证据供追溯；本页不定义现行规则。

## 范围与方法

接手时 Git 工作区干净。清单及文件读取覆盖全部 515 个受版本控制文件、73,002 行，包含 Web、API、Mac 代理、共享包、数据库 schema/42 个迁移、Python/Swift 集成、Docker、Shell/Node 脚本、CI、配置、SVG 和 28 份 Markdown。

TypeScript AST 扫描导入图、导出引用、方法入口和重复函数体；CSS 扫描无字面量引用的选择器，再核对动态 className。候选逐项对照当前调用、共享契约、事务服务、测试与文档，不将静态扫描等同于每个业务分支的人工审计。依赖、生成代码、环境秘密和运行数据不作为源码删除，没有调用浏览器或子代理。

## 已清理

| 项目 | 依据与处理 |
| --- | --- |
| 八个旧 Web helper | 工资 `payrollEntryFromPreview` / `hasMatchingPayrollEntry`、导航 `financeCashHref` / `workRecordHref`、标签 `employmentTypeLabel`、时间 `adjustedSameDayEnd` / `adjustedEndLocalDateTime` / `endLocalDateTimeForDuration` 均无生产调用。删除这些实现及十二项过时测试；现有金额输入、revision 确认、URL 解析和总时长联动继续保留。 |
| 八个契约类型别名 | 删除全仓无引用的 `InitializeCatalogInput`、`CreateStoreInput`、`ApproveJoinRequestInput`、`UpdateProfileInput`、`ConfirmPaymentInput`、`ClosingDeliveryCompleteInput`、`ClosingDeliveryAuthorizeInput`、`EmployeeSettlementAttachmentInput`；仍使用的输入/输出类型与 schema 保留。 |
| 重复租约契约 | authorize 与 complete 原来各定义相同的租约对象，改为复用同一 schema，保留两种接口名称及原校验语义。 |
| Web PNG 转换 | 两个导出入口重复 SVG 加载、画布限制、PNG 编码和临时 URL 回收。集中在 `apps/web/lib/svg-png.ts`，各入口保留原缩放策略、文件名及返回字段。既有图片测试覆盖语言、金额、完整内容、尺寸及三类失败回收。 |
| 短信接收号码 | 首次日结、个人日结发送和区间结算发送的相同号码判断共用 `finance/delivery-recipient.ts`；不改变号码来源与接收资格。 |
| 发送失败重试 | 两个发送服务共用 `delivery-lease.ts` 的失败状态计算，保持三次追加重试、60 秒间隔、含糊结果不自动重试，以及更新前的身份/租约复核。 |
| 旧静态导出分支 | `WEB_STATIC_EXPORT` 只在 Next 配置出现；当前 build 后处理、start 和 Docker 都要求 standalone server。移除没有对应交付链路的分支，沿用 standalone 与安全响应头。 |
| 过时文档 | API 的首次日结说明改为仅当天有记工者参与；安全文档明确 CSP 在 Web，其他公共安全响应头由 Web/API 各自设置。架构与开发说明同步共享实现；维护入口明确“代码审查（大扫除）”采用全仓清理约定。 |

## 保留项及原因

| 项目 | 保留原因 |
| --- | --- |
| Next/Nest/LangBot/Swift 入口 | 路由、装饰器、生命周期、manifest/YAML 和本机 App 由框架动态调用，普通静态导入不能证明无用。 |
| 旧深链接与服务端时间兼容 | 移除未使用的 Web 生成函数不取消外部 URL 解析；API 省略结束时间时仍有保留实际时长的调用与测试。 |
| 共享类型和组合 schema | 本文件内部使用或参与响应声明的类型仍有用途；不因无跨文件导入而删除。 |
| 动态 CSS 选择器 | 付款方式、发送状态及目录种类的类由模板生成，逐项核对后均有当前页面用途。 |
| 短小的 React 状态包装与轮询 | 外形重复但依赖不同页面状态和请求生命周期；抽象它们不能消除具体业务分歧，保留局部实现。 |
| 大事务服务与测试夹具 | 权限、营业日锁、版本、幂等、审计/outbox 和回滚边界不同，不按行数合并或拆散业务事务。 |
| 迁移与历史快照 | 42 个迁移是已发布升级历史；旧发送快照、历史 checkpoint 和兼容字段仍有读取路径。本轮没有数据库变化。 |
| 归档、版权与独立运行产物 | 归档及许可证需可追溯，已安装插件和 Mac 代理独立运行；本轮源码清理不授权替换它们或发布 NAS。 |

## 验证

| 范围 | 结果 |
| --- | --- |
| 全 workspace 类型 / Prisma schema | 通过 |
| domain / contracts | 140 / 92 项通过 |
| Web（辅助函数及 React/jsdom） | 270 项通过 |
| API（含全部数据库套件） | 407 项通过 |
| 数据库约束 | 8 项通过 |
| Mac 代理 | 36 项通过，包含本地图片转换与脚本编译；未发送消息 |
| LangBot Python | 34 项通过 |
| 仓库工具 | 10 项通过 |
| 源码格式与语法 | 8 个 Shell、9 个 Node 脚本、3 个 Python、17 个 JSON、2 个 SVG 通过 |
| 样式来源与手机层叠 | 通过；8 个路由、31 组页面/分区，320–760px，未启动浏览器 |
| 生产构建 / 版本 / 差异格式 | `pnpm build`（包含 `pnpm version:check`）与 `git diff --check` 通过 |
| 本地文档链接 | 29 份 Markdown、199 个文件/目录目标通过 |

共 1,097 项测试通过。Web 与 API 分组运行，后续批次排除已经通过且未受后续改动影响的套件，不重复计数。集成测试只使用独立 `massage_note_test`，42 个迁移无待应用项，不操作开发或生产业务库。

收尾扫描包含本轮两个 helper 和审查记录，共 518 个文件；382 个 TypeScript 文件语法通过，排除已核对的框架页面入口后，没有发现无生产引用的导出函数候选。

按维护约定只停止归属本项目的开发进程树，重新运行 `pnpm dev`。Web 固定 3000，`/login` 返回 HTTP 200；API 4000 的 `/api/v1/health/ready` 返回 `status: ready`、`database: ok`，服务保持运行。

本轮只清理和验证，无新功能或数据库迁移，未部署、未提交。NAS 生效需升级 Web/API；独立 Mac 代理与 LangBot 源码没有行为变化，不替换已安装产物。
