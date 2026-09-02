# 生产部署总览

本文说明普通 Linux 主机上的 Docker Compose 部署。群晖使用 GHCR 单镜像与固定项目 `mn`，请直接阅读 [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md)。

| 场景 | 使用文件 | 应用形态 |
| --- | --- | --- |
| 本地开发 | `docker-compose.yml` | 只启动 PostgreSQL/Redis，Web/API 由 pnpm 启动 |
| 普通 Linux 生产 | `docker-compose.prod.yml` | 独立 Web/API 容器，主机本地构建 |
| 群晖生产 | `docker-compose.nas.yml` | GHCR 单应用镜像，Container Manager 管理 |

以下内容只适用于普通 Linux 生产。正式营业建议使用启用自动备份和时间点恢复的托管 PostgreSQL 与托管 Redis；应用容器配置保持不变。

## 1. 前置条件

- 一台支持 Docker Engine 与 Compose v2 的 Linux 主机。
- 两个同一主域下的 HTTPS 地址，例如 `https://massage-note.example.com` 与 `https://api.massage-note.example.com`。同一站点是安全会话 Cookie 正常工作的必要条件。
- 反向代理或负载均衡器负责 TLS、证书续期，并把 Web/API 分别代理到本机 `127.0.0.1:3000` 和 `127.0.0.1:4000`。
- Firebase 项目已启用 Phone 登录，并把 Web 域名加入 Authorized domains。
- 每个数据库、Redis 密码都使用不同的随机值；URL 中的密码若含保留字符必须百分号编码。

## 2. 生产变量

复制模板并只保存在服务器：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

必须填写：

- `WEB_ORIGIN`：浏览器实际访问的 Web Origin，不能带路径或尾部斜杠。
- `PUBLIC_API_BASE_URL`：公网 API 地址，必须以 `/api/v1` 结尾；它会在 Web 构建时写入前端包。
- PostgreSQL 管理与应用密码、两个连接 URL、Redis 密码。
- Firebase Web 四项公开配置和 Admin 三项私密配置。`FIREBASE_PRIVATE_KEY` 中的换行写为 `\n`。

可选填写：

- `MINIMAX_API_KEY`、`MINIMAX_MODEL` 与 `MINIMAX_TRANSCRIPTION_MODEL`：复杂自然语言记工、AI 财务解释和短录音转写；文字与语音共用同一个 API key，文本模型默认 `MiniMax-M3`，转写模型默认 `music-cover`。

任何生产环境都不得设置 `DEV_AUTH_ENABLED=true` 或把开发登录编译进 Web。

## 3. 构建和启动

先验证变量展开，再启动：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

启动顺序是 PostgreSQL → 数据库迁移 → 权限加固 → API → Web。应用容器使用非 root 用户；数据库应用账号只能读写业务表，不能更新或删除审计、AI 查询日志和实时 outbox。

检查：

```bash
curl --fail https://api.massage-note.example.com/api/v1/health
curl --fail https://api.massage-note.example.com/api/v1/health/ready
curl --fail https://massage-note.example.com/login
```

## 4. 反向代理要求

- 只公开 443；不要将 PostgreSQL、Redis、3000 或 4000 直接暴露到公网。
- API 代理必须保留 `Host`、`Origin`、`X-Forwarded-For`、`X-Forwarded-Proto` 和 `Last-Event-ID`。
- SSE 路径 `/api/v1/stores/*/events` 关闭代理缓冲、允许长连接，并将读取超时设为至少 75 秒。
- 请求体限制至少 9 MB，以容纳上限 8 MB 的短录音；其他接口可使用更低限制。
- Web 和 API 均不得被第三方页面嵌入；应用本身已经返回 CSP 与 `X-Frame-Options: DENY`。

## 5. 首次上线验收

1. 用真实测试手机号完成短信登录、创建测试店和第二设备登录。
2. 配置项目和提成，完成一条现金大费 + 刷卡小费记工。
3. 在第二设备确认实时刷新；断网后确认写按钮不会静默成功。
4. 核对财务明细、CSV、现金结算、工资结算、正常与取消日结；工资结算网页金额须保留美分，发送记录从短信按钮旁打开弹窗，网页和短信长图均按营业日分组。长图“当日总结”固定在最右列，双数笔记工时左侧留空。
5. 查看审计记录，确认操作人、前后值和请求编号存在。
6. 若启用 AI，确认预览在明确点击前不写入、重复确认被拒绝；若未启用，确认安全降级文案。
7. 完成一次独立数据库恢复演练，步骤见 [OPERATIONS.md](OPERATIONS.md)。

## 6. 升级

```bash
# 先备份并验证校验和
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

迁移服务会在新 API 启动前执行 `prisma migrate deploy`。涉及删除列或不可逆数据变换时，必须拆成“先扩展、再迁移数据、最后收缩”的多次发布，不要在同一次升级中让旧、新容器读到不兼容 schema。

群晖生产环境不使用本节的本机构建命令，而使用 GitHub Actions 发布到 GHCR 的单镜像；见 [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md)。GHCR 只保存应用镜像和浏览器公开配置，所有 Admin 私钥、AI/语音密钥与数据库密码均在 NAS 运行时注入。
