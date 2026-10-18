# 独立恢复包操作说明

本包包含实际生产数据库、角色与权限、离线镜像、完整运行配置、反向代理和公开说明页、备份配置及恢复程序。`manifest.json` 保存成员 SHA-256；`baseline.json` 与数据库使用同一快照，`validation.json` 记录 NAS 隔离恢复结果。配置和凭据属于密文包内部内容，解密目录须保持仅本人可读。

这台 Mac 的 age 私钥独立保存在系统钥匙串：服务 `com.massagenote.recovery.age-identity`，账号 `massage-note-production`。Drive 持续授权另保存在 Mac 的受限配置中；下载不需要原 NAS。age、rclone、Python 和 Docker 是恢复工具，应用、PostgreSQL、Redis、HTTPS 代理镜像均从包内加载，Compose 禁止拉取镜像。

若本机项目工具仍在，可使用项目的 `scripts/recovery/restore.py`，提供本机 `mac-config.json` 直接下载并恢复。若只使用包内代码，先按同名 `.sha256` 核对下载文件，使用独立私钥解密和解包，再从本包的 `tools` 目录运行：

```sh
python3 tools/restore.py restore \
  --bundle /absolute/path/mn-recovery-TIMESTAMP-RANDOM.tar.gz.age \
  --age /absolute/path/age \
  --root /absolute/path/new-recovery-directory --drill
```

默认读取独立钥匙串；`--identity` 可指定另行安全保存的 age 私钥。解密后的成员可先用 `python3 tools/recovery.py check-payload /absolute/path/extracted-payload` 检查。`--drill` 完成数据库、权限、镜像、HTTPS/API、登录会话、账目查询及隔离写入后，删除本次恢复容器、卷及明文，仅保留验收报告。恢复目录必须全新，端口占用时失败，不停止其他项目。

真实恢复时省略 `--drill`，服务仅监听 `127.0.0.1:8443`。将原域名只在本机解析到 `127.0.0.1`，并在 Mac 安装恢复目录的 `root.crt` 为本地信任证书；公网 DNS 保持原样。恢复前暂停 Mac 信息代理，核对本机发送日志与快照中的待发送任务；初始配置禁用外发短信 webhook。其他设备不会自动连接此实例。

正常备份由 NAS 每天纽约时间 00:00 执行；成功上传及完整读回后保留最近三份，三次失败后发 Gmail 通知。`backup-config.json`、`tools/nas-task.sh` 和本包其他工具可重建任务配置；解密私钥无需交给 NAS。Redis 限流状态重新建立。Firebase、MiniMax 与 Google 账号仍须有效；本包不包含整个 DSM、微信设备登录或 Mac Messages 系统数据。
