# 独立云端恢复包

此目录提供 NAS 每日备份与 Mac 按需恢复工具。首次安装、真实验收结果见 [灾难恢复手册](../../docs/operations/DISASTER_RECOVERY.md)。现有 `backup-database.sh` / `restore-database.sh` 的手动接口保持不变。

## 首次 Google 设置（由账号所有者完成）

首次在这台 Mac 准备工具与钥匙串时运行：

```sh
python3 scripts/recovery/install_tools.py
python3 scripts/recovery/setup.py init
```

工具下载固定于 `toolchain.json` 中的官方版本与 SHA-256；已有钥匙串私钥会保留。保留原因：运行恢复包不能依赖 NAS 上的解密密钥，工具也不能使用未经校验的下载。

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，创建免费项目 `Massage Note Backup`；此项目不需要启用付费计算资源。启用 [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)。保留原因：NAS 不能复用聊天连接器的令牌，rclone 的共享 OAuth 客户端也不作为长期依赖。
2. 在 Google Auth Platform 配置 Branding（应用名称 `Massage Note Backups`、支持邮箱 `jr24839652@gmail.com`）、Audience（External），Data Access 只添加 `openid`、邮箱和 `https://www.googleapis.com/auth/drive.file`。将 Audience 的发布状态设为 **In production**，不要停留在 Testing。保留原因：Testing 的离线授权会在七天后失效；`drive.file` 只访问本应用创建的文件。
3. 在 Clients 创建 **Desktop app**，下载 JSON 到本机，例如项目根目录 `.local-ai/recovery/oauth-client.json`。不要把 JSON、应用密码或令牌发到聊天中，也不要提交 Git。保留原因：客户端配置和离线刷新令牌属于独立凭据。
4. 在本机终端进入项目根目录并执行以下命令，再亲自打开终端显示的 Google 链接，用 `jr24839652@gmail.com` 授权：

   ```sh
   python3 scripts/recovery/setup.py oauth --client-json .local-ai/recovery/oauth-client.json
   ```

   授权程序只监听 `127.0.0.1:53682`，十分钟超时，不会自动打开浏览器或打印令牌。由这个专用身份创建 `Massage Note Backups/production`，校验所有者和私有权限后绑定文件夹 ID。保留原因：聊天连接器创建的目录对 `drive.file` 身份不可见，不能先用另一个客户端创建同名目录。
5. 在 [Google 应用密码](https://myaccount.google.com/apppasswords) 为 NAS 新建一个专用密码（须先启用两步验证），在本机终端执行并隐藏输入：

   ```sh
   python3 scripts/recovery/setup.py mail
   ```

   保留原因：发信和 Drive 上传使用不同凭据，Gmail 普通登录密码不能用于 SMTP。

   完成后可发送一封明确标为配置测试的邮件：

   ```sh
   python3 scripts/recovery/setup.py test-mail
   ```

## 密钥及恢复

独立恢复包中的操作说明见 [BUNDLE_README.md](BUNDLE_README.md)，不依赖仓库外的相对文档链接。云端专用目录另有 `README.txt`，可直接找到这台 Mac 的恢复命令和私钥位置说明；不包含私钥或供应商凭据。

`setup.py init` 在 Mac 系统钥匙串保存 age 私钥，只在磁盘保存公钥；应在 NAS 丢失之前完成。NAS 只有公钥，不能解密历史恢复包。恢复程序默认从系统钥匙串读取私钥；`--identity` 仅供从另一份安全保存的 age 私钥恢复或隔离测试使用。

恢复依赖 Mac 上的 Docker、Python 3.9+、age，以及 Google/Firebase/MiniMax 账号仍有效；每个恢复包包含应用、PostgreSQL、Redis 和本地 HTTPS 代理镜像，不需要从镜像仓库重新下载。

```sh
python3 scripts/recovery/restore.py restore \
  --config .local-ai/recovery/mac-config.json \
  --age .local-ai/recovery/tools/mac/age \
  --root .local-ai/recovery-drill --drill
```

省略 `--drill` 才会保持恢复服务运行。每次使用新目录、独立 Docker 项目和数据卷，仅发布 `127.0.0.1:8443`，不开放数据库、Redis 或公网入口。端口被占用时停止，不终止其他进程或自动换端口。演练结束只保留非敏感报告，删除恢复容器、卷、明文生产配置和本地 TLS 私钥。

真实恢复后，要使用原域名的本机 HTTPS 入口，须在 Mac 手动安装本次恢复的 `root.crt` 并把原域名仅在本机解析到 `127.0.0.1`；恢复脚本不自动改系统信任、hosts 或公网 DNS。保留原因：演练不能改变正在使用的生产入口，也不能使现有 Mac 发送代理意外连到旧快照。

恢复前暂停 Mac 信息代理，核对其本机发送日志及云端快照中的待发送任务，再决定是否重新接入。当前只恢复网站及其运行依赖，不迁移整个 DSM 系统、用户个人文件、微信登录设备状态或 Mac 的 Messages 系统数据库。保留原因：这些属于外部设备状态，备份网站数据库不能复刻硬件或第三方登录会话。

## 命令行接口

- `recovery.py backup --config /protected/config.json`：独占锁、最多三次尝试；失败保留旧备份并通过 Gmail 发信。凭据错误响应与命令 stderr 不写入公开日志。
- `recovery.py check-payload DIRECTORY`：检查格式、必需文件、文件清单、大小、SHA-256 和成功恢复报告。
- `restore.py restore --bundle FILE.age --root NEW_DIRECTORY [--identity FILE] [--drill]`：仅从指定恢复包加载镜像和数据；不访问原 NAS，不拉取镜像。
- `restore.py stop --root DIRECTORY`：只清理状态文件明确标识的恢复项目与其卷。

每份成功备份为一个 `mn-recovery-时间戳-随机值.tar.gz.age` 加同名 `.sha256` 完成标记。先上传、完整读回并计算 SHA-256，再上传和读回完成标记，最后按成功时间保留三份；不按天数清理，不使用跨目录同步或整个回收站清空。保留原因：中断上传不能挤掉旧备份，其他 Drive 文件不属于本工具管理范围。

NAS 入口默认要求受限目录存在 `enabled` 激活文件；完整云端验收前不创建。首次仅以 `nas-task.sh --verify-install` 手动执行备份，验收和邮件测试完成后才激活定时执行。保留原因：DSM 中任务被提前勾选，也不能跳过验收直接开始自动备份。
