# LangBot 插件开发与目录

插件版本由 [manifest.yaml](manifest.yaml) 的 `metadata.version` 定义，当前为 1.1.5，与应用版本独立。1.1.5 仅整理文档，执行代码与 1.1.4 相同，要求 API 至少 1.3.7、协议版本 2。

## 目录职责

```text
langbot-plugin/
  manifest.yaml                 插件元数据、配置字段与组件注册
  main.py                       插件入口
  components/events/
    work_bot.py                 消息过滤、模型理解、受限 API 请求
    work_bot.yaml               事件组件元数据
  assets/icon.svg               插件图标
  README.md                     英文插件简介
  readme/README_zh_Hans.md       随包中文配置与使用简介
  DEVELOPMENT.md                开发、验证与文件管理
  tests/test_parser.py          解析与边界回归
  dist/                         新构建安装包（Git 忽略）
    archive/                    本地历史安装包与 SHA-256 清单
```

LangBot 要求的入口和组件路径保持原样。只修改此处源码；不要编辑兄弟仓库 `langbot-local/docker/data/` 中的安装副本。后端契约位于 [work-bot.ts](../../packages/contracts/src/work-bot.ts)，完整业务与部署说明见 [机器人手册](../../docs/operations/LANGBOT_WORK_BOT.md)。

## 验证

从 Massage Note 仓库根目录运行：

```bash
python3 -B -m unittest discover -s integrations/langbot-plugin/tests -v
pnpm version:check
git diff --check
```

插件修改须核对 manifest、中英文说明及应用 CHANGELOG。修改接口语义时还要运行对应后端测试。

## 构建与安装

在装有 LangBot SDK CLI 的环境中，进入本插件目录执行 `lbp build`。

也可使用原有 LangBot Docker 镜像构建。从本插件目录执行：

```bash
docker run --rm --entrypoint /bin/sh -v "$PWD:/plugin" -w /plugin rockchin/langbot:latest -c 'lbp build'
```

镜像标签沿用本地方案；正式发布应记录实际镜像版本或摘要。构建后检查 `dist/` 中的文件名与包内 manifest 版本，并确认包内不含令牌、环境文件、历史包或运行数据，再通过 LangBot 管理页“插件 → 本地安装”安装。不得用复制运行目录替代可信安装。

本次整理没有构建 1.1.5 安装包，也没有验证本机 `lbp` 或镜像构建环境；源码版本不代表已安装版本。安装后的状态以管理页和 `mounted`、`initialized` 日志为准。

## 旧包归档

2026-09-11 将原 `dist/` 下的 9 个包（1.0.0–1.0.7、1.1.0）移入 `dist/archive/`，保留原文件名；`inventory.json` 保存文件大小及 SHA-256。该目录被 Git 忽略，只是本地回溯材料，不表示这些版本与当前数据库兼容。

后续新包留在 `dist/` 顶层供选择，旧包移入 `dist/archive/` 并更新清单。不要向源码目录放入 `.env`、数据库、聊天记录或安装后的插件副本。
