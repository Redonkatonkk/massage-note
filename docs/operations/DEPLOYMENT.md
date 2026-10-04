# 生产部署总览

本文说明普通 Linux 主机上的 Docker Compose 部署。群晖使用 GHCR 单镜像与固定项目 `mn`，请直接阅读 [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md)。

| 场景 | 使用文件 | 应用形态 |
| --- | --- | --- |
| 本地开发 | `docker-compose.yml` | 只启动 PostgreSQL/Redis，Web/API 由 pnpm 启动 |
| 普通 Linux 生产 | `docker-compose.prod.yml` | 独立 Web/API 容器，主机本地构建 |
| 群晖生产 | `docker-compose.nas.yml` | GHCR 单应用镜像，Container Manager 管理 |

以下内容只适用于普通 Linux 生产。外部托管数据库、PITR 与 Redis 不在当前 Compose 配置中，需按所选环境调整连接和启动依赖。保留原因：仓库实现是本机服务，不能承诺换供应商无需改配置。

## 1. 前置条件

- 一台支持 Docker Engine 与 Compose v2 的 Linux 主机。保留原因：当前部署入口使用 Docker Compose，需可运行容器与依赖服务。
- 两个同一主域下的 HTTPS 地址，例如 `https://massage-note.example.com` 与 `https://api.massage-note.example.com`。同一站点是安全会话 Cookie 正常工作的必要条件。保留原因：SameSite 会话须在实际同站点访问地址下工作。
- 反向代理或负载均衡器负责 TLS、证书续期，并把 Web/API 分别代理到本机 `127.0.0.1:3000` 和 `127.0.0.1:4000`。保留原因：应用端口只监听本机，HTTPS 与证书由外层提供。
- Firebase 项目已启用 Phone 登录，并把 Web 域名加入 Authorized domains。保留原因：真实手机号验证依赖供应商启用状态及来源域名。
- 每个数据库、Redis 密码都使用不同的随机值；URL 中的密码若含保留字符必须百分号编码。保留原因：凭据应隔离，URL 保留字符需要编码才能正确连接。

## 2. 生产变量

复制模板并只保存在服务器：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

必须填写：

- `WEB_ORIGIN`：浏览器实际访问的 Web Origin，不能带路径或尾部斜杠。保留原因：Cookie 写请求按完整 Origin 精确校验。
- `PUBLIC_API_BASE_URL`：公网 API 地址，必须以 `/api/v1` 结尾；它会在 Web 构建时写入前端包。保留原因：浏览器包内的请求地址由构建期值确定。
- PostgreSQL 管理与应用密码、两个连接 URL、Redis 密码。保留原因：迁移、在线请求及限流使用不同连接身份。
- Firebase Web 四项公开配置和 Admin 三项私密配置。`FIREBASE_PRIVATE_KEY` 中的换行写为 `\n`。保留原因：公开配置与 Admin 私钥使用不同环境边界。

可选填写：

- `MINIMAX_API_KEY`、`MINIMAX_MODEL` 与 `MINIMAX_TRANSCRIPTION_MODEL`：复杂自然语言记工、AI 财务解释和短录音转写；文字与语音共用同一个 API key，文本模型默认 `MiniMax-M3`，转写模型默认 `music-cover`。保留原因：文本和转写共用 Provider 配置，未配置不阻塞核心业务。

任何生产环境都不得设置 `DEV_AUTH_ENABLED=true` 或把开发登录编译进 Web。保留原因：开发入口不提供真实认证，生产构建须关闭它。

## 3. 构建和启动

先验证变量展开，再启动：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

启动顺序是 PostgreSQL → 数据库迁移 → 权限加固 → API → Web。应用容器使用非 root 用户；数据库应用账号只能读写业务表，不能更新或删除审计、AI 查询日志和实时 outbox。保留原因：迁移与加固完成后才能以受限账号访问当前 schema。

检查：

```bash
curl --fail https://api.massage-note.example.com/api/v1/health
curl --fail https://api.massage-note.example.com/api/v1/health/ready
curl --fail https://massage-note.example.com/login
```

## 4. 反向代理要求

- 只公开 443；不要将 PostgreSQL、Redis、3000 或 4000 直接暴露到公网。保留原因：浏览器不应直接连接数据库、缓存或内部服务。
- API 代理必须保留 `Host`、`Origin`、`X-Forwarded-For`、`X-Forwarded-Proto` 和 `Last-Event-ID`。保留原因：来源、限流及事件续传依赖原始请求头。
- SSE 路径 `/api/v1/stores/*/events` 关闭代理缓冲、允许长连接，并将读取超时设为至少 75 秒。保留原因：流式事件不能等待代理缓冲后才到达客户端。
- 请求体限制至少 9 MB，以容纳上限 8 MB 的短录音；其他接口可使用更低限制。保留原因：录音上传有现有大小上限，代理不能提前截断。
- Web 和 API 均不得被第三方页面嵌入；应用本身已经返回 CSP 与 `X-Frame-Options: DENY`。保留原因：当前响应头禁止嵌入，代理不应削弱它。

## 5. 首次上线验收

使用 [发布检查清单](RELEASE_CHECKLIST.md) 核对本次发布证据，由用户完成真实手机号、多设备和业务验收；默认仅命令行/API 验证。保留原因：自动化不能证明外部登录和发送送达，旧的结算布局与财务公式不应在部署页重复维护。

## 6. 升级

```bash
# 先备份并验证校验和
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

迁移服务会在新 API 启动前执行 `prisma migrate deploy`。涉及删除列或不可逆数据变换时，必须拆成“先扩展、再迁移数据、最后收缩”的多次发布，不要在同一次升级中让旧、新容器读到不兼容 schema。保留原因：旧、新容器不能同时访问不兼容 schema，应用回滚也不能逆转数据变换。

群晖生产环境不使用本节的本机构建命令，而使用 GitHub Actions 发布到 GHCR 的单镜像；见 [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md)。GHCR 只保存应用镜像和浏览器公开配置，所有 Admin 私钥、AI/语音密钥与数据库密码均在 NAS 运行时注入。保留原因：NAS 使用 CI 单镜像，与普通 Linux 本机构建是不同链路。
