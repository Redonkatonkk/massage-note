# Massage Note Work Bot

LangBot WeChat plugin for work records and scoped queries. Plugin **1.2.0** requires Massage Note API **1.3.7 or later**, protocol version 2. Each AI request includes up to 5 recent turns from the same bot, group and sender (user text and actual bot replies). Memory expires after 30 minutes of inactivity and is cleared on restart.

Each mentioned group message loads the live store catalog and instructions, asks the configured model for a constrained intent, and submits it to the API. Money, authorization, idempotency and database access remain server controlled.

Supports start/finish, discounts and add-ons, highlighting, record edits, mixed cash/card/gift-card payments, historical entry, soft delete/restore, and paginated queries. Payment collection does not overwrite the original service price. Store instructions can define shorthand and default durations; explicit wording takes precedence. Invalid model output or HELP with store instructions receives at most one review call.

Configure `api_base_url`, `integration_token`, the dedicated `bot`, and parser `model` in LangBot. Keep the work pipeline restricted to group messages mentioning the bot. A manager must verify the WeChat identity in Massage Note before historical data access is enabled; replies are posted to the requesting group.

See [中文配置说明](readme/README_zh_Hans.md) and the repository [development guide](DEVELOPMENT.md). Deploy the required API and migrations before installing the plugin. Never include credentials in a package or rely on custom container environment variables reaching isolated plugin workers.

History is held only in worker memory, scoped by current store context and plugin configuration, capped at 256 sessions. Turns with either text longer than 4,000 characters are omitted. History does not replace current-message evidence, live database queries or API authorization.
