# 发布检查清单

每次生产发布逐项确认；任何“必须”项失败都应停止发布。

## 构建与数据

- [ ] 本次 AI/人工修改已经按语义化版本迭代 `VERSION`，并同步全部 `package.json`、`CHANGELOG.md`、镜像标签和文档标记；`pnpm version:check` 已通过。
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build` 全部通过。
- [ ] `docker compose ... config --quiet` 与生产镜像构建通过。
- [ ] 已按本次 commit SHA 等到 GitHub Actions 的 `verify` 与 `publish-nas-image` 成功；没有用另一条 run 或 `latest` 代替。
- [ ] 目标语义版本的 GHCR manifest 存在、平台为 `linux/amd64`，并已用隔离的未登录 Docker 配置验证可匿名读取。
- [ ] 新迁移已在生产数据副本执行，耗时和锁影响可接受。
- [ ] 发布前备份成功，SHA-256 可验证；最近一次独立恢复演练仍在约定周期内。
- [ ] 数据库管理 URL 与应用 URL 使用不同账号，应用账号不是 superuser/BYPASSRLS/表拥有者。

## 配置与安全

- [ ] Web/API 均为 HTTPS 且同站点，`WEB_ORIGIN` 和公网 API 地址精确无误。
- [ ] `DEV_AUTH_ENABLED=false`，生产前端未显示本地测试登录。
- [ ] Firebase Authorized domains、Phone provider、短信配额和预算告警已配置。
- [ ] PostgreSQL、Redis、Firebase、MiniMax 密钥没有提交到仓库，且权限最小。
- [ ] 完整 Git 历史和本次暂存改动已经过秘密扫描；GitHub 只接收四项浏览器公开的 `NEXT_PUBLIC_FIREBASE_*` Repository Variables。
- [ ] PostgreSQL、Redis、3000、4000 未直接暴露公网。
- [ ] CSP、HSTS、`HttpOnly`/`Secure` 会话 Cookie、严格 Origin 和 429 限流已抽查。
- [ ] 反向代理关闭 SSE 缓冲，保留 `Last-Event-ID`，请求体上限支持 8 MB 录音。

## 业务验收

- [ ] Owner、Manager、Employee 三角色各登录一次；经理不能转移 Owner 或删除店铺。
- [ ] 两家店铺之间无法查询或修改对方记录；Employee 历史财务只显示自己。
- [ ] 现金大费/刷卡小费混合付款、0 小费、折扣和额外项目金额正确。
- [ ] 四级提成优先级与历史快照不随设置修改而变化。
- [ ] 周一至周四自动折扣只在折前大费达到门槛时应用，可与手动折扣并存，并且不减少员工大费工资。
- [ ] Employee 今日页不显示全店汇总，历史营业日和个人日结只返回本人数据；个人日结图片可在目标手机生成并保存。
- [ ] Mac“信息”代理可发送中英文个人日结 PNG；背景在深色模式下不透明，工资按现金/刷卡拆分，现金交接位于逐笔之前，逐笔员工大费取折前基数，刷卡线框与礼物卡括号标识清晰。
- [ ] 成员短信接收号码会回填已关联账号的注册手机号；无注册手机号且未填专用号码时，开启接收无法保存并有明确提示。
- [ ] 正常日结、强制日结、取消日结、现金回退与工资部分支付已抽查。
- [ ] CSV 可以由表格软件打开，且以 `= + - @` 开头的文本不会作为公式执行。
- [ ] 删除/恢复、角色、提成、日结、现金、工资和 AI 确认均能在审计中找到。
- [ ] 两台设备实时同步；断开 SSE 后刷新仍得到一致数据库状态。
- [ ] AI 预览不确认不写入；并发/重复确认只执行一次；AI 未配置时核心功能可用。
- [ ] 页面不提供浏览器安装入口、不注册 Service Worker，断网有明确提示；普通退出保留本机可信登录和草稿，同号码可免短信恢复，撤销全部会话后不能恢复。

## 上线后

- [ ] `/health`、`/health/ready` 与 Web 登录页外部监控正常。
- [ ] NAS 项目仍为 `mn`，原 PostgreSQL/Redis 命名卷未变化，三个长期容器健康，`migrate`/`harden` 为 exited (0)。
- [ ] `app`、`migrate`、`harden` 实际镜像均为目标 GHCR 版本。
- [ ] 观察至少一个完整营业日的 5xx、429、数据库连接、磁盘、备份和短信/AI 费用。
- [ ] 店主已阅读软件内 `/help`，并知道强制日结、软删除和工资调整的含义。
- [ ] 发布版本、迁移编号、开始/结束时间、执行人和回滚判断已记录。
