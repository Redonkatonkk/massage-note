# 运维、备份与恢复

## 日常检查

每天至少检查容器健康、磁盘容量、最近备份和 API 就绪状态：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since=24h api web migrate harden
curl --fail https://api.massage-note.example.com/api/v1/health/ready
```

为 `/api/v1/health/ready` 配置外部可用性监控。告警应覆盖：连续 3 次失败、磁盘剩余低于 20%、数据库连接失败、备份超过 26 小时未成功。错误排查以响应 `X-Request-Id` 为线索；不要把 Cookie、Firebase token、完整手机号或供应商密钥贴到工单。

## 逻辑备份

`scripts/backup-database.sh` 需要 PostgreSQL 客户端。建议由只读备份账号或受控管理账号每日执行，并将目录同步到与应用主机不同的加密存储。

```bash
DATABASE_URL='postgresql://...' \
BACKUP_DIR='/srv/massage-note-backups' \
BACKUP_RETENTION_DAYS=30 \
BACKUP_ENCRYPTION_KEY='单独保存的高强度密钥' \
./scripts/backup-database.sh
```

脚本使用 custom-format `pg_dump`、AES-256-CBC/PBKDF2（配置密钥时）、权限收紧和 SHA-256 校验。加密密钥不得与备份文件放在同一位置。单机 Compose 的逻辑备份不是时间点恢复；需要更小 RPO 时使用启用 PITR/WAL 归档的托管 PostgreSQL。

## 恢复演练

恢复会覆盖目标数据库，绝不能先对仍在营业的生产库试跑。创建独立空库，确认 URL 三次后执行：

```bash
DATABASE_URL='postgresql://.../massage_note_restore_test' \
BACKUP_FILE='/srv/massage-note-backups/massage-note-YYYYMMDDTHHMMSSZ.dump.enc' \
BACKUP_ENCRYPTION_KEY='...' \
CONFIRM_RESTORE=YES \
./scripts/restore-database.sh
```

随后对恢复库执行当前版本迁移并启动一套临时 API：

```bash
DATABASE_URL='postgresql://.../massage_note_restore_test' pnpm db:deploy
```

验收以下内容后才算演练成功：店铺/成员数、最近营业日、最近一条记工付款拆分、日结快照、现金与工资账本、审计记录；用财务页面抽查一日总额。记录恢复耗时和备份时间，以得出实际 RPO/RTO。

## 数据维护

以数据库管理账号定期执行：

```bash
psql "$ADMIN_DATABASE_URL" --set=ON_ERROR_STOP=1 --file=scripts/maintenance.sql
```

维护只删除过期幂等缓存、过期/已消费很久的 AI 预览和超过事件重连窗口的 outbox；不会删除记工、付款、日结、工资或审计。执行前仍应有可用备份。

## 故障处理

- **API ready 失败**：先查 PostgreSQL 健康和迁移容器日志。不要反复重建数据库卷。
- **Redis 失败**：接口限流会退化为单实例内存计数；业务数据仍可写入。尽快恢复 Redis，期间避免横向扩容造成限流不一致。
- **AI/MiniMax/语音失败**：核心记工和财务不依赖外部 AI；界面应提示改用手动或文字输入。
- **实时连接失败**：业务提交仍以数据库响应为准；刷新页面会重新读取真相。检查反向代理是否缓冲或过早关闭 SSE。
- **疑似重复记工**：不要直接删数据库行。先查审计与幂等记录，再从界面软删除并写清原因。
- **密钥泄露**：立即轮换相应供应商密钥/数据库密码，重启服务，检查时间范围内的审计和访问日志；Firebase 私钥泄露还需撤销服务账号密钥。

### 新 Mac 安装员工日结短信代理

1. 安装 Node.js 24 LTS 和项目声明的 pnpm 版本，确保新的登录 shell 中 `node --version`、`pnpm --version` 均可用；LaunchAgent 不应依赖 Codex、IDE 或临时缓存目录里的 Node。
2. 在生产“店铺设置 → Mac 信息代理”生成店铺级令牌。令牌只显示一次，只写入当前 macOS 用户的 `~/Library/Application Support/Massage Note Messages Agent/agent.env`，文件权限必须为 `0600`，不得写入仓库或日志。
3. 在已登录“信息”的目标 macOS 桌面用户会话中运行：

```bash
MASSAGE_NOTE_API_URL='https://<production-domain>/api/v1' \
MASSAGE_NOTE_AGENT_TOKEN='<设置页生成的令牌>' \
./scripts/install-messages-agent.sh
```

4. 首次运行会安装无界面的 `~/Applications/Massage Note Attachment Stager.app`。代理必须通过 macOS LaunchServices 以这个 App 的身份后台启动它，不能把 `Contents/MacOS` 二进制直接作为 LaunchAgent 子进程执行；macOS 26 会把后一种访问归因给后台 Node，使 App 的完全磁盘访问权限失效。诊断会在 Messages 受保护附件目录实际创建并删除“分片/任务”两层目录和探针。若脚本以状态 2 停止，在“系统设置 → 隐私与安全性 → 完全磁盘访问权限”中添加并开启这个 App。它只接受代理 outbox 中与任务 UUID 精确匹配的 PNG，只写 `~/Library/Messages/Attachments/MassageNote`，不读取聊天数据库或控制界面；不要给 Node、终端或 Messages 整体授予更宽权限。
5. 完成一次性权限设置后，原命令再运行一次。安装脚本用源码 SHA-256 识别暂存程序：代码未变时保留现有二进制和签名，避免 macOS 撤销权限；仅首次安装或源码变化时重建签名。随后脚本验证目录探针，触发 macOS 自动化授权，确认至少存在 iMessage、RCS 或 SMS 服务，再创建 `~/Library/LaunchAgents/com.massagenote.messages-agent.plist`。若源码升级后权限失效，重新关闭再开启该 App 的完全磁盘访问后再运行。诊断失败时不要跳过；先登录“信息”、允许 Node 控制“信息”，非 Apple 号码还要检查 iPhone 短信转发和 MMS/RCS。
6. 安装后验证：

```bash
launchctl print "gui/$(id -u)/com.massagenote.messages-agent"
stat -f '%Lp %Su' "$HOME/Library/Application Support/Massage Note Messages Agent/agent.env"
tail -n 50 "$HOME/Library/Application Support/Massage Note Messages Agent/agent-error.log"
```

正常结果是 LaunchAgent `state = running`、配置权限 `600`，店铺设置显示最近在线。重复安装时必须等 `bootout` 的旧服务注册完全消失再调用 `bootstrap`，安装脚本已包含这段等待；不要把偶发的 `Bootstrap failed: 5` 当作 Messages 权限问题。队列“排队、尝试 0”表示没有代理成功领取，优先查 LaunchAgent、API URL/令牌和网络；尝试数增加但失败则展开队列详情并查本地错误日志。AppleScript 必须以 `on run argv` 接收 `osascript -e ... -- <参数>` 的参数，否则会在调用“信息”前报“argv 未定义”。macOS 26 可能暴露 AppleScript 字典无法转换的额外账户类型，枚举时必须把 `service type` 读取包在逐账户 `try` 内，不能让一个未知账户终止整个发送。

代理先把任务附件以 `0600` 权限保存在 `~/Library/Application Support/Massage Note Messages Agent/outbox`。个人日结仍只有一张 PNG；员工区间结算则依次生成摘要 PNG 与逐笔多页 PDF。暂存程序同时验证源路径、任务 UUID、固定文件名和 PNG/PDF 文件头，再写入 `~/Library/Messages/Attachments/MassageNote/<前两位>/<任务 UUID>/`；同一任务若已有不同内容会拒绝覆盖。App 完成后只在 `stager-results/<任务 UUID>.json` 写入成功或失败，代理读取后立即删除结果文件，并再次核对返回路径必须精确等于该任务目标。没有明确成功结果时绝不调用 Messages。区间结算的两个附件分别回写检查点，重试只发送尚未完成的附件。代理串行处理队列，发送脚本额外保留 15 秒让 Messages 接管附件；源 outbox 保留 30 分钟后清理，Messages 内的正式附件交由 Messages 自身管理。AppleScript 返回只表示 Messages 接受了发送指令，运营商最终结果仍可能异步失败，结果不明确时不得自动重发。

发送路由不能只根据 Mac 是否登录 iMessage 判断，因为“本机有 iMessage 账号”不代表收件号码注册了 iMessage。数据库、权限和审计继续使用 E.164；对 `+1` 号码，Messages 调用使用十位本地号码并先交给已连接 SMS 账户，由配对 iPhone 升级为 RCS 或发送 SMS/MMS，无 SMS 时才回退到 RCS/iMessage。真实设备日志出现 `RCS Relay received message delivered` 才是 RCS 送达回执。

若新 PNG 显示 `0 KB / 原大小`、日志为 `fileTransfer rejected error 30` 或 `IMFileTransfer error 15`，而已经位于 Messages 附件目录的旧图能发，根因是 Messages 无法读取外部源文件。不要改用模拟键盘、剪贴板粘贴、相册最近项、复制私有 `com.apple.macl` 属性或操作 Messages/Photos 数据库；检查任务实际交给 AppleScript 的路径是否位于 `~/Library/Messages/Attachments/MassageNote`，再运行暂存程序 `--diagnose`。正式代理不需要“辅助功能”权限，也不会激活或切换前台 App。

正式代理完全不使用系统“照片”。若诊断时临时使用相册作为对照，必须保存 `Photos import` 返回的唯一 `media item id`，后续定位、复制和删除都按该 ID 且要求恰好匹配一项；不得按导入时间、排序位置或“最近项目”猜测目标。
