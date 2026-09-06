from __future__ import annotations

import asyncio
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from langbot_plugin.api.definition.components.common.event_listener import EventListener
from langbot_plugin.api.entities import context, events
from langbot_plugin.api.entities.builtin.platform.message import MessageChain, Plain
from langbot_plugin.api.entities.builtin.provider.message import Message


HELP_KIND = {"kind": "HELP"}
ALLOWED_KINDS = {"BIND_STORE", "BIND_MEMBER", "START", "FINISH", "HELP"}


def start_intent(value: str, *, require_duration: bool) -> dict[str, Any] | None:
    operand = value.strip(" \t，,。！？!?：:、;；")
    if not operand:
        return HELP_KIND
    tokens = [item for item in re.split(r"[\s，,。！？!?：:、;；]+", operand) if item]
    duration_match = re.fullmatch(r"(\d{1,3})(?:分钟)?", tokens[-1] if tokens else "")
    if duration_match is None:
        return HELP_KIND if require_duration else {"kind": "START", "serviceAlias": operand}
    duration = int(duration_match.group(1))
    if not 1 <= duration <= 720 or len(tokens) < 2:
        return HELP_KIND
    result: dict[str, Any] = {
        "kind": "START",
        "serviceAlias": tokens[-2],
        "durationMinutes": duration,
    }
    if len(tokens) > 2:
        result["memberName"] = " ".join(tokens[:-2])
    return result


def deterministic_intent(raw_text: str) -> dict[str, Any] | None:
    text = re.sub(r"[@＠][^\s，,。！？!?：:]+", " ", raw_text).strip()
    store = re.search(r"(?:^|[\s，,。！？!?：:、;；])绑定店铺\s*(\d{6})(?:$|[\s，,。！？!?、;；])", text)
    if store:
        return {"kind": "BIND_STORE", "storeCode": store.group(1)}
    member = re.search(r"(?:^|[\s，,。！？!?：:、;；])绑定(?:员工)?\s*([^，,。！？!?：:、;；]{1,80})", text)
    if member:
        return {"kind": "BIND_MEMBER", "memberName": member.group(1).strip()}
    finish = re.search(r"(?:我)?(?:下了|下工(?:了)?|结束(?:了)?)", text)
    if finish:
        tail = text[finish.end() :]
        amounts = re.findall(r"(?<![\d.])(\d+(?:\.\d{1,2})?)(?![\d.])", tail)
        method = "CASH" if re.search(r"现金|cash", tail, re.I) else "CARD" if re.search(r"信用卡|刷卡|银行卡|card|(?:^|[\s，,])卡(?:$|[\s，,。])", tail, re.I) else None
        if len(amounts) == 2 and method:
            return {"kind": "FINISH", "serviceAmount": amounts[0], "tipAmount": amounts[1], "paymentMethod": method}
        return HELP_KIND
    start = re.search(r"(?:我)?(?:上工(?:了)?|开工(?:了)?|开始(?:了)?)", text)
    if start:
        return start_intent(text[start.end() :], require_duration=False)
    compact = start_intent(text, require_duration=True)
    return None if compact == HELP_KIND else compact


def message_content_text(message: Message) -> str:
    if isinstance(message.content, str):
        return message.content
    return "".join(str(getattr(item, "text", "") or "") for item in message.content)


def message_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, (int, float)):
        timestamp = float(value)
        if abs(timestamp) > 100_000_000_000:
            timestamp /= 1000
        result = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    elif isinstance(value, str):
        stripped = value.strip()
        try:
            return message_datetime(float(stripped))
        except ValueError:
            try:
                result = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
            except ValueError:
                result = datetime.now().astimezone()
    else:
        result = datetime.now().astimezone()
    return result if result.tzinfo is not None else result.astimezone()


def parse_llm_json(value: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", value, flags=re.I).strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.I)
    if fenced:
        cleaned = fenced.group(1).strip()
    if not cleaned.startswith("{"):
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return None
        cleaned = match.group(0)
    try:
        result = json.loads(cleaned)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(result, dict) or result.get("kind") not in ALLOWED_KINDS:
        return None
    kind = result["kind"]
    if kind == "HELP":
        return HELP_KIND
    if kind == "BIND_STORE" and isinstance(result.get("storeCode"), str) and re.fullmatch(r"\d{6}", result["storeCode"]):
        return {"kind": kind, "storeCode": result["storeCode"]}
    if kind == "BIND_MEMBER" and isinstance(result.get("memberName"), str) and result["memberName"].strip():
        return {"kind": kind, "memberName": result["memberName"].strip()[:80]}
    if kind == "START" and isinstance(result.get("serviceAlias"), str) and result["serviceAlias"].strip():
        parsed_start: dict[str, Any] = {"kind": kind, "serviceAlias": result["serviceAlias"].strip()[:80]}
        duration = result.get("durationMinutes")
        member_name = result.get("memberName")
        if duration is not None:
            if isinstance(duration, bool) or not isinstance(duration, int) or not 1 <= duration <= 720:
                return None
            parsed_start["durationMinutes"] = duration
        if member_name is not None:
            if not isinstance(member_name, str) or not member_name.strip():
                return None
            parsed_start["memberName"] = member_name.strip()[:80]
        return parsed_start
    if kind == "FINISH":
        service_amount = result.get("serviceAmount")
        tip_amount = result.get("tipAmount")
        payment_method = result.get("paymentMethod")
        if (
            isinstance(service_amount, str)
            and isinstance(tip_amount, str)
            and re.fullmatch(r"\d+(?:\.\d{1,2})?", service_amount)
            and re.fullmatch(r"\d+(?:\.\d{1,2})?", tip_amount)
            and payment_method in {"CASH", "CARD"}
        ):
            return {
                "kind": kind,
                "serviceAmount": service_amount,
                "tipAmount": tip_amount,
                "paymentMethod": payment_method,
            }
    return None


class MassageNoteWorkBotListener(EventListener):
    async def initialize(self) -> None:
        await super().initialize()

        @self.handler(events.GroupNormalMessageReceived)
        async def on_group_message(event_context: context.EventContext) -> None:
            config = self.plugin.get_config()
            selected_bot = str(config.get("bot") or os.environ.get("MASSAGE_NOTE_WORK_BOT_UUID") or "")
            current_bot = await event_context.get_bot_uuid()
            if selected_bot and selected_bot != current_bot:
                return

            event_context.prevent_default()
            event_context.prevent_postorder()
            event = event_context.event
            raw_text = str(event.text_message or event.message_chain or "").strip()
            if not raw_text:
                await self._reply(event_context, "我只处理文字记工指令。")
                return

            intent = deterministic_intent(raw_text)
            if intent is None:
                intent = await self._llm_intent(raw_text, config)

            source = event.message_chain.source
            message_id = str(source.id if source is not None else event_context.query_uuid or event_context.query_id)
            occurred_at = message_datetime(source.time if source is not None else getattr(event.message_event, "time", None))
            payload = {
                "platform": "WECHATPAD",
                "botId": current_bot,
                "groupId": str(event.launcher_id),
                "senderId": str(event.sender_id),
                "messageId": message_id,
                "occurredAt": occurred_at.isoformat(),
                "rawText": raw_text,
                "parsedIntent": intent or HELP_KIND,
            }

            try:
                result = await self._post_event(config, payload)
                reply = result.get("reply") if isinstance(result, dict) else None
                await self._reply(event_context, str(reply or "记工接口没有返回有效结果，请到网页核对。"))
            except TimeoutError:
                await self._reply(event_context, "⚠️ 结果未确认，请稍后重试同一条指令，或到 Massage Note 网页核对。")
            except Exception as error:
                await self._reply(event_context, f"⚠️ 记工失败：{self._safe_error(error)}")

    async def _llm_intent(self, raw_text: str, config: dict[str, Any]) -> dict[str, Any]:
        model_uuid = str(config.get("model") or os.environ.get("MASSAGE_NOTE_WORK_MODEL_UUID") or "")
        if not model_uuid:
            return HELP_KIND
        prompt = (
            "你是记工指令解析器，只输出一个 JSON 对象，不要解释。"
            "kind 只能是 BIND_STORE、BIND_MEMBER、START、FINISH、HELP。"
            "绑定店铺输出 storeCode；绑定员工输出 memberName；上工输出 serviceAlias；"
            "上工原文包含明确分钟数时输出整数 durationMinutes；原文明确指定其他员工时同时输出 memberName；"
            "下工必须从原文逐字提取 serviceAmount、tipAmount，金额字段必须是字符串，并把付款方式输出为 CASH 或 CARD。"
            "不得补充原文没有的姓名、项目、数字或付款方式；缺任何必填字段就输出 {\"kind\":\"HELP\"}。"
        )
        try:
            response = await self.plugin.invoke_llm(
                llm_model_uuid=model_uuid,
                messages=[Message(role="system", content=prompt), Message(role="user", content=raw_text)],
                timeout=20.0,
            )
            return parse_llm_json(message_content_text(response)) or HELP_KIND
        except Exception:
            return HELP_KIND

    async def _post_event(self, config: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        base_url = str(config.get("api_base_url") or os.environ.get("MASSAGE_NOTE_API_URL") or "https://massagenote.waltonjin.com/api/v1").rstrip("/")
        token = str(os.environ.get("MASSAGE_NOTE_WORK_TOKEN") or config.get("integration_token") or "")
        if not base_url.startswith("https://") and not base_url.startswith("http://host.docker.internal"):
            raise RuntimeError("API 地址必须使用 HTTPS")
        if len(token) < 32:
            raise RuntimeError("插件尚未配置集成令牌")
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{base_url}/integrations/langbot/work-events",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Idempotency-Key": f"wechatpad:{payload['botId']}:{payload['messageId']}",
                # Cloudflare rejects Python's default urllib user agent with
                # error 1010 before the request reaches Massage Note.
                "User-Agent": "MassageNote-LangBot/1.0",
            },
        )

        def send() -> dict[str, Any]:
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                try:
                    details = json.loads(error.read().decode("utf-8"))
                    message = details.get("messageZh") or details.get("message")
                except Exception:
                    message = None
                raise RuntimeError(str(message or f"Massage Note 返回 HTTP {error.code}")) from error
            except urllib.error.URLError as error:
                if isinstance(error.reason, TimeoutError):
                    raise TimeoutError from error
                raise RuntimeError("无法连接 Massage Note") from error

        return await asyncio.to_thread(send)

    async def _reply(self, event_context: context.EventContext, text: str) -> None:
        await event_context.reply(MessageChain([Plain(text=text)]))

    def _safe_error(self, error: Exception) -> str:
        text = str(error).strip()
        return text[:160] if text else "请到 Massage Note 网页核对后重试"
