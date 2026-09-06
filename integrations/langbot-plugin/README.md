# Massage Note Work Bot

Restricted LangBot event-listener plugin for WeChat group work records. It intercepts group messages that already passed LangBot's mention trigger, optionally uses a configured LLM only for structured intent extraction, and sends the raw message plus the extracted intent to Massage Note for authoritative validation and atomic accounting.

Configure these fields on the installed plugin in LangBot:

- `integration_token`: the same `mnw_...` secret configured as `LANGBOT_WORK_TOKEN` on the Massage Note API.
- `api_base_url`: defaults to `https://massagenote.waltonjin.com/api/v1`.
- `bot`: the dedicated WeChat work bot.
- `model`: optional; DeepSeek or another model used only for fallback parsing.

Do not rely on environment variables set only on the Plugin Runtime container. Current isolated plugin workers receive a minimal environment and do not inherit custom `MASSAGE_NOTE_*` variables. LangBot masks `integration_token` when returning plugin configuration through its management API.

The bot never calls general Massage Note APIs and does not handle private messages.

Compact start commands are deterministic: `大力 90` starts the sender on the service mapped by `大力` using that service's existing 90-minute price option. `Jessie 脚 30` starts the uniquely matched, already-bound Jessie on the service mapped by `脚` using its existing 30-minute option. The configured alias duration remains the default when a duration is omitted. The optional LLM is only a fallback parser and cannot invent employees, aliases, durations, or prices.
