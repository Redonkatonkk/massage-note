from __future__ import annotations

from langbot_plugin.api.definition.plugin import BasePlugin


class MassageNoteWorkBotPlugin(BasePlugin):
    async def initialize(self) -> None:
        self.ready = True
