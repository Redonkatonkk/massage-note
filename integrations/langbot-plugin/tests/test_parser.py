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
