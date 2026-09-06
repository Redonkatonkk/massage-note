# Massage Note 记工助手

这是一个权限受限的 LangBot 群聊记工插件。群员艾特机器人后，插件只识别店铺绑定、员工绑定、上工和下工；Massage Note 服务端会再次验证员工、黑话、金额及付款方式，并在一个事务中完成记账。

生产环境请配置：

- `MASSAGE_NOTE_WORK_TOKEN`：与 Massage Note API 的 `LANGBOT_WORK_TOKEN` 完全一致。
- `MASSAGE_NOTE_API_URL`：默认 `https://massagenote.waltonjin.com/api/v1`。
- `MASSAGE_NOTE_WORK_BOT_UUID`：可选，只接管指定机器人。
- `MASSAGE_NOTE_WORK_MODEL_UUID`：可选，固定规则无法解析时使用的 DeepSeek 模型。

插件不会处理私聊，也不能调用 Massage Note 的其他业务接口。
