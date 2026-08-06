# 群晖 Container Manager 部署

当前 NAS 交付版本为 `0.1.0`，镜像名为 `massage-note:0.1.0`，目标架构为 DS720+ 使用的 `linux/amd64`。

## 构建镜像归档

如需在镜像中启用真实 Firebase Web 登录，先只把
`NEXT_PUBLIC_FIREBASE_API_KEY`、`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`、
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`、`NEXT_PUBLIC_FIREBASE_APP_ID`
四项公开配置逐项导出到当前 shell。不要直接 `source .env`，因为其中还包含私钥。
然后执行：

```bash
pnpm version:check
./scripts/build-nas-image.sh
```

输出文件为 `artifacts/massage-note-0.1.0-linux-amd64.tar`，旁边的 `.sha256` 文件用于上传前后核验。归档中只有一个应用镜像；同一镜像通过 `app`、`migrate`、`harden` 三种启动模式完成 Web/API、迁移和数据库权限加固。

## 在 Container Manager 中部署

1. 打开“映像（Image）”，选择“新增 → 从文件新增”，导入镜像 tar。
2. 复制 `.env.nas.example` 为只保存在 NAS 项目目录中的 `.env`，填写三个随机密码；Firebase Admin 私钥只在需要真实登录时填写，MiniMax 和 Google Speech 可留空。
3. 打开“项目（Project）→ 新增”，项目名填 `massage-note`，使用 `docker-compose.nas.yml` 与上述 `.env`。
4. 等待 `postgres`、`redis`、`app` 变为 healthy；`migrate` 与 `harden` 正常完成后显示 exited (0)。
5. 为公开访问配置 DSM 反向代理：来源 `https://nas.waltonjin.com:8443`，目标 `http://127.0.0.1:3000`，并让 `WEB_ORIGIN` 与来源完全一致。

应用就绪检查：

```bash
curl --fail https://nas.waltonjin.com:8443/api/v1/health/ready
```

不要把 `.env`、Firebase Admin 私钥或 AI/语音密钥放进镜像、Git 仓库或截图。
