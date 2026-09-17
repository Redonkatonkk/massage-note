"""Exercise the pure parser without requiring a running LangBot SDK."""
import ast
import hashlib
import time
from collections import OrderedDict
import json
import math
from datetime import datetime, timezone
from urllib.parse import urlsplit
import re
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from pathlib import Path
from typing import Any

source = Path(__file__).parents[1] / "components/events/work_bot.py"
tree = ast.parse(source.read_text())
pure = ast.Module(body=[node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.Assign)) or (isinstance(node, ast.ImportFrom) and node.module == "__future__")], type_ignores=[])
namespace = {"re": re, "json": json, "Any": Any, "math": math, "datetime": datetime, "timezone": timezone, "urlsplit": urlsplit}
exec(compile(pure, str(source), "exec"), namespace)
parse = namespace["parse_llm_json"]


class ParserTest(unittest.TestCase):
    def test_multiple_employee_batch(self):
        context = {"members": ["Ling", "Jessie"], "aliases": [{"alias": "deep"}]}
        actions = [{"kind": "START", "memberName": name, "memberMention": name, "serviceAlias": "deep", "serviceMention": "大力"} for name in context["members"]]
        batch = {"kind": "BATCH", "actions": actions}
        self.assertEqual(parse(json.dumps(batch), context), batch)
        for bad in [[actions[0]], [actions[0], actions[0]], [actions[0], {**actions[1], "memberName": "Unknown"}], [actions[0], batch]]:
            self.assertIsNone(parse(json.dumps({"kind": "BATCH", "actions": bad}), context))

    def test_explicit_shared_start_names(self):
        resolve = namespace["explicit_start_targets"]
        for raw in ["Ling Jessie 上工 大力", "@Bot Ling、Jessie 上工 大力", "Ling 和 Jessie 上工 大力", "Ling and Jessie 上工 大力"]:
            self.assertEqual([t["memberName"] for t in resolve(raw, ["Ling", "Jessie"])], ["Ling", "Jessie"])
        for raw in ["Ling 或 Jessie 上工 大力", "Ling 不上工 Jessie 上工 大力", "Ling 上工 大力，Jessie 不上工"]:
            self.assertEqual(resolve(raw, ["Ling", "Jessie"]), [])
        self.assertEqual(resolve("Mary Jane 上工 大力", ["Mary Jane"]), [{"memberName": "Mary Jane", "memberMention": "Mary Jane"}])

    def test_query_and_management_keep_parameters(self):
        query = {"kind": "QUERY", "days": 15, "groupBy": "DAY", "page": 2}
        self.assertEqual(parse(json.dumps(query), {}), query)
        self.assertIsNone(parse('{"kind":"QUERY","sql":"SELECT * FROM users"}', {}))
        manage = {"kind": "MANAGE", "operation": "UPDATE", "recordId": "11111111-1111-4111-8111-111111111111", "details": {"isHighlighted": False}, "evidence": "取消高亮"}
        self.assertEqual(parse(json.dumps(manage), {}), manage)

    def test_highlight_states_preserve_target_and_checkout(self):
        for state, mention in [(True, "高亮"), (False, "取消高亮"), (False, "去掉高亮")]:
            for kind in ["ADJUST", "FINISH"]:
                intent = {"kind": kind, "memberName": "Lily", "memberMention": "Lily", "isHighlighted": state, "highlightMention": mention}
                if kind == "FINISH":
                    intent.update(serviceAmount="75", tipAmount="5", paymentMethod="CARD", paymentMention="卡")
                with self.subTest(state=state, kind=kind):
                    self.assertEqual(parse(json.dumps(intent), self.context), intent)

    def test_highlight_and_removing_retired_addon(self):
        highlight = {"kind": "ADJUST", "isHighlighted": False, "highlightMention": "取消高亮"}
        self.assertEqual(parse(json.dumps(highlight), {}), highlight)
        remove = {"kind": "ADJUST", "addons": [{"name": "已停用的热石", "mention": "移除已停用的热石", "action": "REMOVE"}]}
        self.assertEqual(parse(json.dumps(remove), {}), remove)

    def test_message_time_rejects_invalid_values(self):
        for value in [float("nan"), float("inf"), 10**100, "not-a-date", "NaN", True]:
            with self.subTest(value=value), self.assertRaises((ValueError, OverflowError)):
                namespace["message_datetime"](value)
        self.assertEqual(namespace["message_datetime"](1700000000000), namespace["message_datetime"](1700000000))

    def test_insecure_local_host_exception_is_exact(self):
        validate = namespace["validated_api_base_url"]
        self.assertEqual(validate("http://host.docker.internal:4000/api/v1/"), "http://host.docker.internal:4000/api/v1")
        for url in ["http://host.docker.internal.evil.test/api", "http://host.docker.internal@evil.test", "https:///api", "https://example.test/api?redirect=1"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate(url)

    def setUp(self):
        self.context = {"members": ["Lily"], "discounts": [{"name": "评论折扣"}], "addons": [{"name": "热石"}]}

    def test_finish_preserves_target_and_adjustments(self):
        intent = {"kind": "FINISH", "memberName": "Lily", "memberMention": "lily", "serviceAmount": "75", "tipAmount": "15", "paymentMethod": "CARD", "paymentMention": "卡", "discounts": [{"name": "评论折扣", "mention": "评论"}], "addons": [{"name": "热石", "mention": "热石"}]}
        self.assertEqual(parse(json.dumps(intent), self.context), intent)

    def test_shorthand_payment_evidence_preserves_employee_and_amounts(self):
        context = {"members": ["Jessica", "Lily"], "instructions": "Jessica 75 5 表示下工，大费75小费5，默认信用卡，以此类推。"}
        for name, amount, tip in [("Jessica", "75", "5"), ("Jessica", "90", "0"), ("Lily", "80.50", "12.25")]:
            with self.subTest(name=name, amount=amount, tip=tip):
                intent = {"kind": "FINISH", "memberName": name, "memberMention": name, "serviceAmount": amount, "tipAmount": tip, "paymentMethod": "CARD", "paymentMention": f"{name} {amount} {tip}"}
                self.assertEqual(parse(json.dumps(intent), context), intent)

    def test_explicit_cash_and_checkout_keep_named_employee(self):
        intent = {"kind": "FINISH", "memberName": "Lily", "memberMention": "Lily", "serviceAmount": "75", "tipAmount": "5", "paymentMethod": "CASH", "paymentMention": "现金"}
        self.assertEqual(parse(json.dumps(intent), self.context), intent)

    def test_adjust_requires_configured_item_and_evidence(self):
        intent = {"kind": "ADJUST", "memberName": "Lily", "memberMention": "Lily", "addons": [{"name": "热石", "mention": "热石"}]}
        self.assertEqual(parse(json.dumps(intent), self.context), intent)
        intent["addons"][0]["name"] = "不存在"
        self.assertIsNone(parse(json.dumps(intent), self.context))
        self.assertIsNone(parse('{"kind":"ADJUST"}', self.context))

    def test_natural_language_default_duration(self):
        self.context.update({"instructions": "deep 默认 90 分钟", "aliases": [{"alias": "11111111-1111-4111-8111-111111111111"}]})
        intent = {"kind": "START", "serviceAlias": self.context["aliases"][0]["alias"], "serviceMention": "deep", "durationMinutes": 90, "durationSource": "SKILL"}
        self.assertEqual(parse(json.dumps(intent), self.context), intent)
        self.context["instructions"] = ""
        self.assertIsNone(parse(json.dumps(intent), self.context))

    def test_unknown_target_is_not_silently_dropped(self):
        intent = {"kind": "FINISH", "memberName": "Unknown", "memberMention": "Unknown", "serviceAmount": "75", "tipAmount": "15", "paymentMethod": "CARD", "paymentMention": "卡"}
        self.assertIsNone(parse(json.dumps(intent), self.context))


class LlmIntentTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        listener_node = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        method = next(node for node in listener_node.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "_llm_intent")
        test_namespace = {**namespace, "os": SimpleNamespace(environ={}), "Message": SimpleNamespace}
        future = [node for node in tree.body if isinstance(node, ast.ImportFrom) and node.module == "__future__"]
        exec(compile(ast.Module(body=future + [method], type_ignores=[]), str(source), "exec"), test_namespace)
        self.method = test_namespace["_llm_intent"]
        self.context = {"status": "BOUND", "members": ["Jessica"], "instructions": "只说项目没提时间，默认60分钟。大力指 Deep Tissue Massage。", "aliases": [{"alias": "11111111-1111-4111-8111-111111111111", "serviceName": "Deep Tissue Massage"}]}
        self.intent = {"kind": "START", "memberName": "Jessica", "memberMention": "jessica", "serviceAlias": self.context["aliases"][0]["alias"], "serviceMention": "大力", "durationMinutes": 60, "durationSource": "SKILL"}

    async def run_responses(self, responses):
        invoke = AsyncMock(side_effect=[SimpleNamespace(content=json.dumps(value)) for value in responses])
        self.listener = SimpleNamespace(plugin=SimpleNamespace(invoke_llm=invoke))
        result = await self.method(self.listener, "@Jeunesse jessica 上工 大力", {"model": "test-model"}, self.context)
        return result, invoke

    async def test_screenshot_intent_preserves_employee_and_skill_default(self):
        result, invoke = await self.run_responses([self.intent])
        self.assertEqual(result, self.intent)
        self.assertEqual(invoke.await_count, 1)
        messages = invoke.call_args.kwargs["messages"]
        self.assertIn(self.context["instructions"], messages[0].content)
        self.assertEqual(messages[1].content, "@Jeunesse jessica 上工 大力")

    async def test_shared_start_recovers_name_omitted_by_model(self):
        self.context["members"] = ["Ling", "Jessie"]
        intent = {**self.intent, "memberName": "Jessie", "memberMention": "Jessie"}
        invoke = AsyncMock(return_value=SimpleNamespace(content=json.dumps(intent)))
        listener = SimpleNamespace(plugin=SimpleNamespace(invoke_llm=invoke))
        result = await self.method(listener, "Ling Jessie 上工 大力", {"model": "test-model"}, self.context)
        self.assertEqual(result["kind"], "BATCH")
        self.assertEqual([a["memberName"] for a in result["actions"]], ["Ling", "Jessie"])
        self.assertTrue(all(a["durationMinutes"] == 60 for a in result["actions"]))

    async def test_help_is_reviewed_against_store_instructions(self):
        result, invoke = await self.run_responses([{"kind": "HELP"}, self.intent])
        self.assertEqual(result, self.intent)
        self.assertEqual(invoke.await_count, 2)

    async def test_invalid_duration_evidence_can_be_repaired(self):
        invalid = {**self.intent, "durationSource": None}
        result, invoke = await self.run_responses([invalid, self.intent])
        self.assertEqual(result, self.intent)
        self.assertEqual(invoke.await_count, 2)

    async def test_genuine_help_remains_help_after_one_review(self):
        result, invoke = await self.run_responses([{"kind": "HELP"}, {"kind": "HELP"}])
        self.assertEqual(result, {"kind": "HELP"})
        self.assertEqual(invoke.await_count, 2)

    async def test_repeated_invalid_output_does_not_become_help(self):
        with self.assertRaisesRegex(RuntimeError, "协议校验"):
            await self.run_responses([{"kind": "START"}, {"kind": "START"}])
        self.assertEqual(self.listener.plugin.invoke_llm.await_count, 2)

    async def test_unbound_help_is_not_retried(self):
        self.context = {"status": "UNBOUND"}
        result, invoke = await self.run_responses([{"kind": "HELP"}])
        self.assertEqual(result, {"kind": "HELP"})
        self.assertEqual(invoke.await_count, 1)


class HistoryTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        listener_node = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        ns = {**namespace, "EventListener": object, "time": time, "hashlib": hashlib,
              "os": SimpleNamespace(environ={}), "Message": SimpleNamespace}
        future = [node for node in tree.body if isinstance(node, ast.ImportFrom) and node.module == "__future__"]
        exec(compile(ast.Module(body=future + [listener_node], type_ignores=[]), str(source), "exec"), ns)
        self.listener = ns[listener_node.name]()
        self.listener._history = OrderedDict()
        self.listener._fetch_skill_context = AsyncMock(return_value={"status": "BOUND", "today": "2026-09-12"})
        self.listener._post_event = AsyncMock(return_value={"reply": "已处理"})
        self.listener._reply = AsyncMock()
        self.listener.plugin = SimpleNamespace(invoke_llm=AsyncMock(return_value=SimpleNamespace(content='{"kind":"HELP"}')))

    async def send(self, message_id, text="本条指令", bot="bot", group="group", sender="sender"):
        event = SimpleNamespace(launcher_id=group, sender_id=sender,
                                message_chain=SimpleNamespace(source=SimpleNamespace(id=message_id, time=1700000000)))
        await self.listener._handle_message(SimpleNamespace(event=event), {"model": "model"}, bot, text)
        return self.listener.plugin.invoke_llm.call_args.kwargs["messages"]

    async def test_next_request_includes_actual_reply_and_current_text_once(self):
        await self.send("1", "上一条指令")
        messages = await self.send("2")
        self.assertEqual([(m.role, m.content) for m in messages[1:]],
                         [("user", "上一条指令"), ("assistant", "已处理"), ("user", "本条指令")])
        self.assertEqual(self.listener._post_event.call_args.args[1]["rawText"], "本条指令")

    async def test_bot_group_sender_and_context_isolation(self):
        await self.send("1")
        for kwargs in [{"bot": "other"}, {"group": "other"}, {"sender": "other"}]:
            self.assertEqual(len(await self.send("2", **kwargs)), 2)
        self.listener._fetch_skill_context.return_value = {"status": "UNBOUND"}
        self.assertEqual(len(await self.send("3")), 2)

    async def test_duplicate_does_not_include_itself_or_accumulate(self):
        await self.send("1")
        self.assertEqual(len(await self.send("1")), 2)
        self.assertEqual(len(await self.send("2")), 4)

    async def test_failed_write_remembers_uncertain_reply(self):
        self.listener._post_event.side_effect = TimeoutError()
        await self.send("1")
        self.listener._post_event.side_effect = None
        messages = await self.send("2")
        self.assertIn("结果未确认", messages[2].content)
        self.assertNotIn("已处理", messages[2].content)

    def test_limit_expiry_and_oversized_turn(self):
        with patch.object(time, "monotonic", return_value=10):
            for index in range(7):
                self.listener._remember("scope", str(index), f"user{index}", f"reply{index}")
            history = self.listener._recent_history("scope", "new")
            self.assertEqual(len(history), 10)
            self.assertEqual(history[0]["content"], "user2")
            self.listener._remember("scope", "large", "x" * 4001, "reply")
            self.assertEqual(self.listener._recent_history("scope", "new"), history)
        with patch.object(time, "monotonic", return_value=1810):
            self.assertEqual(self.listener._recent_history("scope", "new"), [])
        for index in range(257):
            self.listener._remember(str(index), "1", "user", "reply")
        self.assertEqual(len(self.listener._history), 256)
        self.assertNotIn("0", self.listener._history)


class LearningTest(unittest.IsolatedAsyncioTestCase):
    send = HistoryTest.send
    def setUp(self):
        HistoryTest.setUp(self)
        self.storage = {}
        async def get(key):
            if key not in self.storage:
                raise RuntimeError(f"Storage with key {key} not found")
            return self.storage[key]
        async def put(key, value):
            self.storage[key] = value
        self.listener.plugin.get_plugin_storage = AsyncMock(side_effect=get)
        self.listener.plugin.set_plugin_storage = AsyncMock(side_effect=put)
        self.listener._fetch_skill_context.return_value = {"status": "BOUND", "storeId": "store-1"}
        self.listener.plugin.invoke_llm.return_value.content = json.dumps({
            "kind": "CLARIFY", "phrase": "走一个", "guess": "开始一次按摩服务，仍需注明项目和时长",
        })

    def memory(self):
        return json.loads(next(iter(self.storage.values())))

    async def test_confirmation_persists_without_financial_write_and_is_reused(self):
        await self.send("a", "走一个")
        self.assertEqual(len(self.memory()["incidents"]), 1)
        self.assertFalse(self.memory()["lessons"])
        await self.send("b", "对")
        self.assertEqual(self.memory()["lessons"][0]["phrase"], "走一个")
        self.listener._post_event.assert_not_awaited()
        # New listener state simulates a worker restart; storage is owned by the host.
        plugin = self.listener.plugin
        saved = dict(self.storage)
        self.setUp()
        self.storage.update(saved)
        self.listener.plugin = plugin
        self.listener.plugin.invoke_llm.return_value.content = '{"kind":"QUERY","days":1}'
        messages = await self.send("c", "今天的记工")
        self.assertIn("开始一次按摩服务", messages[0].content)
        self.listener._post_event.assert_awaited_once()
        self.assertNotIn("learningMemory", self.listener._post_event.call_args.args[1])

    async def test_correction_suspends_old_lesson_until_confirmed(self):
        await self.send("a", "走一个")
        await self.send("b", "对")
        self.listener.plugin.invoke_llm.return_value.content = json.dumps({
            "kind": "CLARIFY", "phrase": "走一个", "guess": "结束服务，需要补充金额和付款方式",
        })
        await self.send("c", "不对，走一个是结束服务")
        self.assertEqual(self.memory()["lessons"], [])
        await self.send("d", "确认")
        self.assertEqual(len(self.memory()["lessons"]), 1)
        self.assertIn("结束服务", self.memory()["lessons"][0]["meaning"])

    async def test_memory_is_isolated_and_survives_date_changes(self):
        await self.send("a", "走一个")
        await self.send("b", "对")
        self.listener.plugin.invoke_llm.return_value.content = '{"kind":"QUERY","days":1}'
        for kwargs in [{"bot": "other"}, {"group": "other"}, {"sender": "other"}]:
            messages = await self.send("c", "今天的记工", **kwargs)
            self.assertNotIn("开始一次按摩服务", messages[0].content)
        self.listener._fetch_skill_context.return_value["today"] = "2030-01-01"
        self.assertIn("开始一次按摩服务", (await self.send("d", "今天的记工"))[0].content)
        self.listener._fetch_skill_context.return_value["storeId"] = "other-store"
        self.assertNotIn("开始一次按摩服务", (await self.send("e", "今天的记工"))[0].content)

    async def test_replay_and_expiry(self):
        await self.send("a", "走一个")
        await self.send("a", "走一个")
        self.assertEqual(len(self.memory()["incidents"]), 1)
        self.assertEqual(self.listener.plugin.invoke_llm.await_count, 1)
        self.listener.plugin.invoke_llm.return_value.content = '{"kind":"HELP"}'
        with patch.object(time, "time", return_value=time.time() + 1801):
            await self.send("b", "对")
        self.assertFalse(self.memory()["lessons"])

    async def test_storage_failure_does_not_claim_success_or_write(self):
        await self.send("a", "走一个")
        self.listener.plugin.set_plugin_storage.side_effect = RuntimeError("offline")
        await self.send("b", "对")
        self.assertIn("保存失败", self.listener._reply.call_args.args[1])
        self.assertFalse(self.memory()["lessons"])
        self.listener._post_event.assert_not_awaited()

    async def test_fabricated_phrase_is_rejected(self):
        await self.send("a", "无关文字")
        self.assertIn("原文校验", self.listener._reply.call_args.args[1])
        self.assertFalse(self.storage)
        self.listener._post_event.assert_not_awaited()

    async def test_mentioned_confirmation_and_explicit_help(self):
        await self.send("a", "走一个")
        await self.send("b", "@Jeunesse 对！")
        self.assertEqual(len(self.memory()["lessons"]), 1)
        self.listener.plugin.invoke_llm.return_value.content = '{"kind":"HELP"}'
        await self.send("c", "帮助")
        self.listener._post_event.assert_awaited_once()

    async def test_backend_rejected_interpretation_is_remembered(self):
        self.listener.plugin.invoke_llm.return_value.content = '{"kind":"QUERY","days":1}'
        self.listener._post_event.return_value = {"outcome": "INTENT_EVIDENCE_REJECTED", "reply": "原文校验未通过"}
        await self.send("a", "查一查")
        self.assertIn("我猜你是想查询记工", self.listener._reply.call_args.args[1])
        self.assertEqual(self.memory()["incidents"][0]["text"], "查一查")
        self.assertFalse(self.memory()["lessons"])

    async def test_unavailable_storage_does_not_overwrite_existing_memory(self):
        await self.send("a", "走一个")
        self.listener.plugin.set_plugin_storage.reset_mock()
        self.listener.plugin.get_plugin_storage.side_effect = RuntimeError("offline")
        await self.send("b", "对")
        self.assertIn("无法读取", self.listener._reply.call_args.args[1])
        self.listener.plugin.set_plugin_storage.assert_not_awaited()
        self.listener._post_event.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
