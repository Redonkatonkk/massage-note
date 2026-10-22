<a id="langbot-插件开发与目录"></a>

# LangBot plug-in development and catalog

**English** | **[简体中文](DEVELOPMENT.zh-CN.md)**

The version is defined by `metadata.version` in [manifest.yaml](manifest.yaml), which is currently **1.4.1** and is independent of the application version. Full capability requires API at least 1.7.0, protocol version 2. Reason: The plug-in installation package version is independent of the application. Protocol 2 and multi-player intent require corresponding back-end support.

<a id="目录职责"></a>

## Directory Responsibilities

| Path | Responsibilities |
| --- | --- |
| `manifest.yaml`, `main.py`, `components/events/work_bot.yaml` | LangBot metadata and dynamic loading entrance |
| `components/events/work_bot.py` | Message processing, parsing, dialogue and learning and memory, restricted API requests |
| `tests/test_parser.py` | Parsing, boundary and message processing regression |
| `assets/icon.svg` | Plugin icon |
| `README.md`, `readme/README_zh_Hans.md` | Package configuration and usage instructions |
| `dist/`, `dist/archive/` | Local new packages and historical packages are ignored by Git |

<a id="保留规则"></a>

## Retention rules

- Only modify the source code of this directory, retain the manifest registration entry and component path, and do not modify the `langbot-local/docker/data/` installation copy. Reason: The entry is dynamically loaded by LangBot, and the running copy will be installed and replaced. It cannot be deleted as dead code based on the static reference number.
- Interface change verification [Shared Contract](../../packages/contracts/src/work-bot.ts) and back-end testing, plug-in modification synchronization manifest, Chinese and English introduction and application CHANGELOG. Reason: Python plug-ins and TypeScript backends are released independently, and the protocols and instructions must be consistent.
- The current business rules are only maintained in [Robot Manual](../../docs/operations/LANGBOT_WORK_BOT.md), and historical changes can be found in [CHANGELOG](../../CHANGELOG.md). Reason: To avoid mixing old version installation steps with new feature requirements in the current guide.
- After building, check the package name and manifest version, exclude tokens, environment files, historical packages and running data, then install it locally through LangBot and check `mounted` and `initialized`. Reason: The source code version does not represent the installed version, and excess data in the package may also reveal credentials or chat content.
- New packages are placed in `dist/`, old packages are placed in `dist/archive/` and the local manifest is updated. Reason: Preserve traceable products and avoid accidentally selecting old packages; archived packages are not guaranteed to be compatible with the current database.

<a id="验证"></a>

## Verify

Execute the following command from the Massage Note root directory. Reason: Cover plug-in behavior, version consistency and difference format respectively; interface semantic changes also need to correspond to back-end testing.

```bash
python3 -B -m unittest discover -s integrations/langbot-plugin/tests -v
pnpm version:check
git diff --check
```

<a id="构建"></a>

## Build

In the environment where LangBot SDK CLI is installed, enter this plug-in directory and execute `lbp build`. You can also use a local LangBot image:

```bash
docker run --rm --entrypoint /bin/sh -v "$PWD:/plugin" -w /plugin rockchin/langbot:latest -c '/app/.venv/bin/lbp build'
```

Record the actual image version or digest for a release. Reason: `latest` changes; the digest identifies the exact build environment.
