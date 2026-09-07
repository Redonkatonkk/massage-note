# Massage Note 记工助手

这是一个权限受限的 LangBot 群聊记工插件。群员艾特机器人后，插件只识别店铺绑定、员工绑定、上工和下工；Massage Note 服务端会再次验证员工、黑话、金额及付款方式，并在一个事务中完成记账。

请在 LangBot 已安装插件的配置页面中设置：

- `integration_token`：与 Massage Note API 的 `LANGBOT_WORK_TOKEN` 完全一致。
- `api_base_url`：默认 `https://massagenote.waltonjin.com/api/v1`。
- `bot`：专用的微信记工机器人。
- `model`：可选，固定规则无法解析时使用的 DeepSeek 模型。

不要只给 Plugin Runtime 容器设置环境变量。当前隔离插件进程使用最小环境，不会继承自定义的 `MASSAGE_NOTE_*` 变量。LangBot 管理接口返回插件配置时会遮蔽 `integration_token`。

插件不会处理私聊，也不能调用 Massage Note 的其他业务接口。

紧凑上工指令由固定规则解析：`大力 90` 给发送者自己开始“大力”所映射项目的 90 分钟价格档；`Jessie 脚 30` 给同一店铺中唯一匹配的在职 Jessie 开始“脚”所映射项目的 30 分钟价格档，Jessie 无需预先绑定微信。没有写时长时使用黑话配置的默认时长。可选模型只做后备解析，不能补造员工、黑话、时长或价格。
