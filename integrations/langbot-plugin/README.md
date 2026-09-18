# Massage Note Work Bot

Current plugin: **1.4.1**; complete features require Massage Note API **1.7.0 or later**, protocol version 2. Version source: [manifest.yaml](manifest.yaml).

Each routed group message loads the live store catalog and instructions, asks the model for a constrained intent, and submits it to the API. Supports binding, START/FINISH/ADJUST, batches of 2–10 employees, queries and record management. Ambiguities use local clarification and learning.

## Configuration and retained rules

- Configure `api_base_url`, `integration_token`, `bot`, and `model` in LangBot; use the final HTTPS address (`host.docker.internal` is the local HTTP exception). Reason: isolated workers need plugin configuration, and token-bearing requests reject redirects.
- Restrict the pipeline to group messages mentioning the dedicated bot. Reason: the listener takes over every message routed to it.
- Verify the WeChat identity in Massage Note before historical access. Reason: claiming a name does not prove identity; replies are visible to the requesting group.
- Keep money, permissions, idempotency and database access on the server. Reason: untrusted model output must pass live catalog and current-message evidence validation.
- Use store instructions for defaults; explicit wording wins. Reason: learned examples cannot authorize default durations or payment methods.
- Keep recent conversation as context only: up to 5 turns, 30 minutes idle expiry, 256 sessions, no turns over 4,000 characters. Reason: bounded process memory helps interpretation without becoming a second financial record; restart clears it.
- Confirm clarification within 30 minutes to save learning, then send a complete command for an operation. Reason: confirmation saves an interpretation and must not write a work record.
- Protect persistent learning backups as runtime data. Reason: LangBot storage retains message excerpts across restarts, scoped by configuration, store, bot, group, sender and binding name; each scope holds 50 lessons, 30 incidents and 30 receipts.
- Deploy the required API/migrations, build and install the plugin, and check `mounted`/`initialized`; never package credentials or copy a runtime directory as a release. Reason: source edits do not upgrade installed workers, and packages must contain source assets only.

See [中文配置说明](readme/README_zh_Hans.md) and the repository [development guide](DEVELOPMENT.md).
