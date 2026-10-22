<a id="massage-note-记工助手"></a>

# Massage Note Work Bot

**English** | **[简体中文](readme/README_zh_Hans.md)**

Current plugin: **1.4.1**; complete features require API **1.7.0 or later**, protocol version 2. Version source: `manifest.yaml`. Reason: plugin releases are independent of the application, and protocol 2 and batch intents need compatible server support.

When mentioned in a group, the plugin loads the live store catalog and instructions, asks the model to interpret the message, then submits a scoped intent to the API. It supports binding, starting/finishing work, discounts/add-ons/highlights, historical queries, record edits, soft deletion/restoration, and atomic batches of 2–10 employees. Ambiguities are clarified within the plugin.

<a id="配置与保留规则"></a>

## Configuration and retained rules

- Configure `api_base_url`, `integration_token`, `bot`, and `model` in LangBot. Use the final HTTPS address; the local HTTP exception is only `host.docker.internal`. Reason: isolated workers depend on plugin configuration, and token-bearing requests must not follow redirects.
- Route only group messages mentioning the dedicated bot into the pipeline. Reason: the listener takes over every routed message.
- Have an Owner/Manager verify WeChat identity before enabling historical access. Reason: binding a name does not prove identity, and query replies are visible to the requesting group.
- Keep money, authorization, idempotency, and database queries on the server. Current-message evidence, the live catalog, and explicit store instructions take precedence. Reason: model output and learned examples cannot grant access, invent amounts, or authorize default payments/durations.
- Recent conversation is interpretation context only: at most 5 turns per scope, 30-minute idle expiry, cleared on restart, at most 256 sessions, and whole turns over 4,000 characters skipped. Reason: bounded memory limits historical interference and prevents old records from becoming new instructions.
- Confirm clarification within 30 minutes; confirmation only saves learning. Send a complete command separately for a business operation. Reason: learning confirmation is not accounting authorization; lessons under correction are disabled first.
- Protect persistent learning and backups as runtime data. Reason: message excerpts are isolated by configuration, store, bot, group, sender, and bound name; each scope retains 50 lessons, 30 misunderstood-message incidents, and 30 reply receipts across restarts. Storage failure must not be reported as successful learning.
- Upgrade the required API/migrations, build and install the plugin, then verify `mounted` and `initialized`. Exclude tokens from packages and do not release copied runtime directories. Reason: local source does not prove the running version; packages must be traceable and credential-free.

<a id="使用举例"></a>

## Usage examples

| Message | Behavior |
| --- | --- |
| `绑定店铺 123456`, `绑定 Lily` | Bind the group and WeChat identity. |
| `Lily 大力 60` | Start work using the store catalog. |
| `Jessica 75 5` | Use only when the store has defined this finish-work format and payment method. |
| `Lily 加热石`, `Lily 取消高亮` | Modify the unique unpaid record. |
| `查询 Lily 最近 15 天折后大费, 第 2 页` | Paginate within a scope; totals cover the full scope. |
| `Ling Jessie 上工 大力` | Start work for two employees; commit together only if all validation passes. |
| `删除 <完整记录编号>`, `恢复 <完整记录编号>` | Soft-delete/restore subject to authorization. |

The complete business/operations manual is `docs/operations/LANGBOT_WORK_BOT.md` in the repository. Development, validation, and packaging are documented in the source directory's `DEVELOPMENT.md`. This packaged README retains installation rules and usage examples only.
