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

4. 安装脚本会先以前台诊断模式触发 macOS 自动化授权，并确认至少存在 iMessage、RCS 或 SMS 服务，再创建 `~/Library/LaunchAgents/com.massagenote.messages-agent.plist`。诊断失败时不要跳过；先登录“信息”、允许 Node 控制“信息”，非 Apple 号码还要检查 iPhone 短信转发和 MMS/RCS。
5. 安装后验证：

```bash
launchctl print "gui/$(id -u)/com.massagenote.messages-agent"
stat -f '%Lp %Su' "$HOME/Library/Application Support/Massage Note Messages Agent/agent.env"
tail -n 50 "$HOME/Library/Application Support/Massage Note Messages Agent/agent-error.log"
```

正常结果是 LaunchAgent `state = running`、配置权限 `600`，店铺设置显示最近在线。重复安装时必须等 `bootout` 的旧服务注册完全消失再调用 `bootstrap`，安装脚本已包含这段等待；不要把偶发的 `Bootstrap failed: 5` 当作 Messages 权限问题。队列“排队、尝试 0”表示没有代理成功领取，优先查 LaunchAgent、API URL/令牌和网络；尝试数增加但失败则展开队列详情并查本地错误日志。AppleScript 必须以 `on run argv` 接收 `osascript -e ... -- <参数>` 的参数，否则会在调用“信息”前报“argv 未定义”。

代理把待发送 PNG 以 `0600` 权限暂存在 `~/Library/Application Support/Massage Note Messages Agent/outbox`。AppleScript 返回只表示 Messages 接受了发送指令，附件复制仍可能异步进行，因此文件保留 30 分钟后才自动清理。若“信息”显示附件 `0 KB / 原大小`，优先检查代理是否运行了旧版“发送后立即删除”逻辑；不要反复点击红色重试，以免更新代理后产生重复消息。代理启动及心跳时都会清理超过保留时间的 PNG。
