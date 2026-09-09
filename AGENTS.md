# 项目维护规则

- 每次代码、配置、文档或其他项目调整，都必须同步更新相关项目文档、`CHANGELOG.md` 和版本号；不能等用户提醒，也不能只在提交或部署时处理。
- 根目录 `VERSION` 是版本号唯一来源。按语义版本递增，同步所有 workspace package、镜像标签和当前文档版本标记；完整范围见 [开发指南](docs/engineering/DEVELOPMENT.md)。
- 完成前运行 `pnpm version:check`、`git diff --check` 和与修改相称的验证。文档改动检查 Markdown 本地链接。
- 接手时阅读 [AI 接管指南](docs/engineering/AI_HANDOFF.md)，保留已有改动，不覆盖其他任务的工作。
