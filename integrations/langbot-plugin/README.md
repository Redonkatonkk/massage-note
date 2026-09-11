# Massage Note Work Bot

LangBot WeChat plugin for complete work records and scoped database queries. Plugin 1.1.3 targets Massage Note API 1.3.6 (protocol version 2).

Plugin 1.1.1 applies store instructions to checkout shorthand as well as starts. A configured rule such as `Jessica 75 5` preserves the named employee and interprets service/tip amounts with the configured default payment method. Explicit cash/card wording overrides the default. The shorthand itself is original-text evidence for the semantic default; example amounts are never copied. API 1.1.0 finds pending records created either on the web or by the bot.

Configure `api_base_url`, `integration_token`, the dedicated `bot`, and parser `model` in LangBot. Each mentioned group message loads the live store catalog and instructions, invokes the model, and submits a constrained intent to the API. Money, authorization, idempotency and database access are server controlled.

Supports start/finish, discounts and add-ons, highlighting, record edits, mixed cash/card/gift-card payments, custom items, historical entry, soft delete/restore, and paginated record/day/employee queries. Payment collection does not overwrite the original service price.

For data access, a store manager must verify the WeChat identity in the Massage Note work-bot settings. Employees can query their own history; verified managers/owners can query the store. Replies are posted to the group that requested them.

See [中文操作说明](readme/README_zh_Hans.md). Deploy API and database migrations before installing the plugin. Never include credentials in the package or rely on custom Runtime environment variables being inherited by isolated plugin workers.

Plugin 1.1.3 clarifies configured default durations and preserves named employees in start commands. HELP with store instructions, or invalid model output, receives at most one review call before submission. Persistent malformed output raises an explicit error; it does not become generic help. API 1.3.6 preserves @ employee evidence and distinguishes evidence rejection from HELP.
