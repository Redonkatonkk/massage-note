# 运维、备份与恢复

## 日常检查

检查容器健康、磁盘容量、最近备份和 API 就绪状态。保留原因：容器运行不代表依赖就绪或备份可用。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since=24h api web migrate harden
curl --fail https://api.massage-note.example.com/api/v1/health/ready
```

为 `/api/v1/health/ready` 配置外部监控，并跟踪磁盘、数据库及备份失败；告警阈值由实际部署确定。错误排查使用 `X-Request-Id`，不把 Cookie、token、完整手机号或密钥贴到工单。保留原因：仓库没有旧文档宣称的固定监控阈值实现，请求编号已足够关联日志。

## 逻辑备份

`scripts/backup-database.sh` 需要 PostgreSQL 客户端。建议由只读备份账号或受控管理账号每日执行，并将目录同步到与应用主机不同的加密存储。保留原因：脚本依赖 pg_dump，异地副本避免主机故障同时丢失数据与备份。

```bash
DATABASE_URL='postgresql://...' \
BACKUP_DIR='/srv/massage-note-backups' \
BACKUP_RETENTION_DAYS=30 \
BACKUP_ENCRYPTION_KEY='单独保存的高强度密钥' \
./scripts/backup-database.sh
```

脚本使用 custom-format `pg_dump`、AES-256-CBC/PBKDF2（配置密钥时）、权限收紧和 SHA-256 校验。加密密钥不得与备份文件放在同一位置。单机 Compose 的逻辑备份不是时间点恢复；需要更小 RPO 时使用启用 PITR/WAL 归档的托管 PostgreSQL。保留原因：校验验证传输完整性，加密保护备份，独立密钥与 WAL 能力不能靠普通 dump 替代。

## 恢复演练

恢复会覆盖目标数据库，绝不能先对仍在营业的生产库试跑。创建独立空库，核对目标 URL，显式设置 `CONFIRM_RESTORE=YES` 后执行。保留原因：恢复脚本会覆盖目标数据库，没有旧文档所说的三次确认机制。

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

验收以下内容后才算演练成功：店铺/成员数、最近营业日、最近一条记工付款拆分、日结快照、现金与工资账本、审计记录；通过 API 或数据库核对一日总额，用户需要时可自行抽查页面。保留原因：恢复成功须核对业务完整性，默认验证不调用浏览器。记录恢复耗时和备份时间，以得出实际 RPO/RTO。

## 数据维护

以数据库管理账号定期执行：

```bash
psql "$ADMIN_DATABASE_URL" --set=ON_ERROR_STOP=1 --file=scripts/maintenance.sql
```

维护只删除过期幂等缓存、过期/已消费很久的 AI 预览和超过事件重连窗口的 outbox；不会删除记工、付款、日结、工资或审计。执行前仍应有可用备份。保留原因：维护脚本只清理运行缓存，但生产删除仍需可恢复。

## 故障处理

- **API ready 失败**：先查 PostgreSQL 健康和迁移容器日志。不要反复重建数据库卷。保留原因：重新建卷不能修复缺迁移或连接配置，还会损失业务数据。
- **Redis 失败**：接口限流会退化为单实例内存计数；业务数据仍可写入。尽快恢复 Redis，期间避免横向扩容造成限流不一致。保留原因：降级计数按进程分开，多实例会放大可接受请求数。
- **AI/MiniMax/语音失败**：核心记工和财务不依赖外部 AI；界面应提示改用手动或文字输入。保留原因：手工业务路径没有供应商依赖。
- **实时连接失败**：业务提交仍以数据库响应为准；刷新页面会重新读取真相。检查反向代理是否缓冲或过早关闭 SSE。保留原因：REST 与数据库保存结果才是业务真相。
- **疑似重复记工**：不要直接删数据库行。先查审计与幂等记录，再从界面软删除并写清原因。保留原因：直接删行会破坏审计和恢复，业务接口已有软删除。
- **密钥泄露**：立即轮换相应供应商密钥/数据库密码，重启服务，检查时间范围内的审计和访问日志；Firebase 私钥泄露还需撤销服务账号密钥。保留原因：旧秘密必须撤销，删除文件不会使凭据失效。

Mac“信息”发送代理的安装、权限、附件路由和专项排障已集中到 [`MESSAGES_AGENT.md`](MESSAGES_AGENT.md)。
