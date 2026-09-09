# Massage Note Work Bot

LangBot WeChat plugin for complete work records and scoped database queries. Requires Massage Note API 1.1.0 (protocol version 2).

Configure `api_base_url`, `integration_token`, the dedicated `bot`, and parser `model` in LangBot. Each mentioned group message loads the live store catalog and instructions, invokes the model, and submits a constrained intent to the API. Money, authorization, idempotency and database access are server controlled.

Supports start/finish, discounts and add-ons, highlighting, record edits, mixed cash/card/gift-card payments, custom items, historical entry, soft delete/restore, and paginated record/day/employee queries. Payment collection does not overwrite the original service price.

For data access, a store manager must verify the WeChat identity in the Massage Note work-bot settings. Employees can query their own history; verified managers/owners can query the store. Replies are posted to the group that requested them.

See [中文操作说明](readme/README_zh_Hans.md). Deploy API and database migrations before installing the plugin. Never include credentials in the package or rely on custom Runtime environment variables being inherited by isolated plugin workers.
