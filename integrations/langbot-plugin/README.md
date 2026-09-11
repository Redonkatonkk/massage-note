# Massage Note Work Bot

LangBot WeChat plugin for work records and scoped queries. Plugin **1.1.5** requires Massage Note API **1.3.7 or later**, protocol version 2. This release organizes documentation; runtime code is unchanged from 1.1.4.

Each mentioned group message loads the live store catalog and instructions, asks the configured model for a constrained intent, and submits it to the API. Money, authorization, idempotency and database access remain server controlled.

Supports start/finish, discounts and add-ons, highlighting, record edits, mixed cash/card/gift-card payments, historical entry, soft delete/restore, and paginated queries. Payment collection does not overwrite the original service price. Store instructions can define shorthand and default durations; explicit wording takes precedence. Invalid model output or HELP with store instructions receives at most one review call.

Configure `api_base_url`, `integration_token`, the dedicated `bot`, and parser `model` in LangBot. Keep the work pipeline restricted to group messages mentioning the bot. A manager must verify the WeChat identity in Massage Note before historical data access is enabled; replies are posted to the requesting group.

See [中文配置说明](readme/README_zh_Hans.md) and the repository [development guide](DEVELOPMENT.md). Deploy the required API and migrations before installing the plugin. Never include credentials in a package or rely on custom container environment variables reaching isolated plugin workers.
