# Massage Note Work Bot

Restricted LangBot event-listener plugin for WeChat group work records. It intercepts group messages that already passed LangBot's mention trigger, loads the bound store's live alias-and-employee skill from Massage Note, and requires the configured LLM to interpret every message before authoritative validation and atomic accounting.

Configure these fields on the installed plugin in LangBot:

- `integration_token`: the same `mnw_...` secret configured as `LANGBOT_WORK_TOKEN` on the Massage Note API.
- `api_base_url`: defaults to `https://massagenote.waltonjin.com/api/v1`.
- `bot`: the dedicated WeChat work bot.
- `model`: required; DeepSeek or another model used to interpret every message with the live store skill.

Do not rely on environment variables set only on the Plugin Runtime container. Current isolated plugin workers receive a minimal environment and do not inherit custom `MASSAGE_NOTE_*` variables. LangBot masks `integration_token` when returning plugin configuration through its management API.

The bot never calls general Massage Note APIs and does not handle private messages.

Before every model call the plugin loads enabled aliases, their mapped service names, default and available durations, and active employee names. The model may use general language knowledge to map an unlisted colloquial expression such as `deep tissue` to the uniquely appropriate configured canonical alias, but it must quote the original evidence span. Canonical employees and aliases must still come from the live skill, while prices and accounting remain server-controlled.
