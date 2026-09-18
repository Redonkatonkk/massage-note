# LangBot 插件开发与目录

版本由 [manifest.yaml](manifest.yaml) 的 `metadata.version` 定义，当前为 **1.4.1**，与应用版本独立。完整能力要求 API 至少 1.7.0、协议版本 2。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `manifest.yaml`、`main.py`、`components/events/work_bot.yaml` | LangBot 元数据及动态加载入口 |
| `components/events/work_bot.py` | 消息处理、解析、对话与学习记忆、受限 API 请求 |
| `tests/test_parser.py` | 解析、边界及消息处理回归 |
| `assets/icon.svg` | 插件图标 |
| `README.md`、`readme/README_zh_Hans.md` | 随包配置与使用说明 |
| `dist/`、`dist/archive/` | 本地新包及历史包，均由 Git 忽略 |

## 保留规则

- 只修改此目录源码，保留 manifest 注册的入口和组件路径，不修改 `langbot-local/docker/data/` 安装副本。保留原因：入口由 LangBot 动态加载，运行副本会被安装替换，不能按静态引用数当死代码删除。
- 接口变化核对 [共享契约](../../packages/contracts/src/work-bot.ts) 和后端测试，插件修改同步 manifest、中英文简介与应用 CHANGELOG。保留原因：Python 插件与 TypeScript 后端独立发布，协议和说明必须一致。
- 当前业务规则只在 [机器人手册](../../docs/operations/LANGBOT_WORK_BOT.md) 维护，历史变化查 [CHANGELOG](../../CHANGELOG.md)。保留原因：避免旧版本安装步骤与新功能要求混在当前指南。
- 构建后核对包名与 manifest 版本，排除令牌、环境文件、历史包和运行数据，再通过 LangBot 本地安装并查看 `mounted`、`initialized`。保留原因：源码版本不代表已安装版本，包内多余数据也可能泄露凭据或聊天内容。
- 新包放 `dist/`，旧包放 `dist/archive/` 并更新本地清单。保留原因：保留可追溯产物并避免误选旧包；归档包不保证兼容当前数据库。

## 验证

从 Massage Note 根目录执行以下命令。保留原因：分别覆盖插件行为、版本一致性和差异格式；接口语义变化还需对应后端测试。

```bash
python3 -B -m unittest discover -s integrations/langbot-plugin/tests -v
pnpm version:check
git diff --check
```

## 构建

在装有 LangBot SDK CLI 的环境进入本插件目录执行 `lbp build`。也可使用本地 LangBot 镜像：

```bash
docker run --rm --entrypoint /bin/sh -v "$PWD:/plugin" -w /plugin rockchin/langbot:latest -c '/app/.venv/bin/lbp build'
```

正式发布记录实际镜像版本或摘要。保留原因：`latest` 会变化，摘要才能追溯具体构建环境。
