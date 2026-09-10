"""Exercise the pure parser without requiring a running LangBot SDK."""
import ast
import json
import math
from datetime import datetime, timezone
from urllib.parse import urlsplit
import re
import unittest
from pathlib import Path
from typing import Any

source = Path(__file__).parents[1] / "components/events/work_bot.py"
tree = ast.parse(source.read_text())
pure = ast.Module(body=[node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.Assign)) or (isinstance(node, ast.ImportFrom) and node.module == "__future__")], type_ignores=[])
namespace = {"re": re, "json": json, "Any": Any, "math": math, "datetime": datetime, "timezone": timezone, "urlsplit": urlsplit}
exec(compile(pure, str(source), "exec"), namespace)
parse = namespace["parse_llm_json"]


class ParserTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
