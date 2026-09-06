# Massage Note Work Bot

Restricted LangBot event-listener plugin for WeChat group work records. It intercepts group messages that already passed LangBot's mention trigger, optionally uses a configured LLM only for structured intent extraction, and sends the raw message plus the extracted intent to Massage Note for authoritative validation and atomic accounting.

Required runtime configuration:

- `MASSAGE_NOTE_WORK_TOKEN`: the same `mnw_...` secret configured as `LANGBOT_WORK_TOKEN` on the Massage Note API.
- `MASSAGE_NOTE_API_URL`: defaults to `https://massagenote.waltonjin.com/api/v1`.
- `MASSAGE_NOTE_WORK_BOT_UUID`: optional; restricts the listener to one LangBot bot.
- `MASSAGE_NOTE_WORK_MODEL_UUID`: optional; DeepSeek or another model used only for fallback parsing.

The bot never calls general Massage Note APIs and does not handle private messages.
