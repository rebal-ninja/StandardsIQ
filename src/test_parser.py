"""
Unit tests for LLM JSON Response Parser and Grounding Validator
===============================================================

Tests:
1. Plain valid JSON
2. JSON inside markdown code fence (```json ... ``` and ``` ... ```)
3. JSON with surrounding whitespace / newlines
4. Malformed JSON
5. Empty response (empty string, None, whitespace)
6. Missing expected fields
7. Multiple JSON objects / extra data / citations like [1]
8. Fabricated Standard ID (anti-hallucination / grounding check)
9. Valid Standard ID present in retrieved context (grounding check)
"""

import sys
import unittest
from pathlib import Path

# Ensure repo root is on sys.path
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from src.rag_pipeline import (
    _parse_llm_json_response,
    BISRAGPipeline,
)


class TestLLMJSONParser(unittest.TestCase):
    """Unit tests for _parse_llm_json_response."""

    def test_01_plain_valid_json(self):
        raw = '[{"standard_id": "IS 269:2015", "rationale": "Applies directly to 33, 43, 53 grade OPC."}]'
        result = _parse_llm_json_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["standard_id"], "IS 269:2015")
        self.assertIn("33, 43, 53 grade", result[0]["rationale"])

    def test_02_json_inside_markdown_fence(self):
        # Case A: ```json ... ```
        raw_json_tag = (
            "```json\n"
            "[\n"
            '  {"standard_id": "IS 10322 (Part 5/Sec 3):2013", "rationale": "LED street lighting standard."}\n'
            "]\n"
            "```"
        )
        result_a = _parse_llm_json_response(raw_json_tag)
        self.assertIsNotNone(result_a)
        self.assertEqual(len(result_a), 1)
        self.assertEqual(result_a[0]["standard_id"], "IS 10322 (Part 5/Sec 3):2013")

        # Case B: ``` ... ``` (no tag)
        raw_no_tag = (
            "```\n"
            '[\n  {"standard_id": "IS 694:2010", "rationale": "PVC cables."}\n]\n'
            "```"
        )
        result_b = _parse_llm_json_response(raw_no_tag)
        self.assertIsNotNone(result_b)
        self.assertEqual(len(result_b), 1)
        self.assertEqual(result_b[0]["standard_id"], "IS 694:2010")

    def test_03_json_with_surrounding_whitespace(self):
        raw = "  \n\n\t  [{\"standard_id\": \"IS 2062:2011\", \"rationale\": \"Steel plates.\"}]  \n\n\t "
        result = _parse_llm_json_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["standard_id"], "IS 2062:2011")

    def test_04_malformed_json(self):
        raw_broken = '[{"standard_id": "IS 269:2015", "rationale": ]'
        result = _parse_llm_json_response(raw_broken)
        self.assertIsNone(result)

        raw_unclosed = '[{"standard_id": "IS 269:2015", "rationale": "incomplete"'
        result_unclosed = _parse_llm_json_response(raw_unclosed)
        self.assertIsNone(result_unclosed)

    def test_05_empty_response(self):
        self.assertIsNone(_parse_llm_json_response(""))
        self.assertIsNone(_parse_llm_json_response("   \n\t  "))
        self.assertIsNone(_parse_llm_json_response(None))

        # Explicit empty JSON array should return empty list
        empty_array = _parse_llm_json_response("[]")
        self.assertEqual(empty_array, [])

        empty_fence = _parse_llm_json_response("```json\n[]\n```")
        self.assertEqual(empty_fence, [])

    def test_06_missing_expected_fields(self):
        # The parser extracts valid JSON dicts without inventing fields.
        raw = '[{"other_key": "some_value"}]'
        result = _parse_llm_json_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertNotIn("standard_id", result[0])
        self.assertNotIn("rationale", result[0])

    def test_07_multiple_json_objects_and_extra_data(self):
        # Case A: Preamble with citation bracket [1] then JSON array
        raw_preamble = (
            "Based on retrieved document [1] and standard [2], here is the result:\n"
            '[\n  {"standard_id": "IS 269:2015", "rationale": "OPC general spec."}\n]\n'
            "Note: Document [1] was verified."
        )
        result_a = _parse_llm_json_response(raw_preamble)
        self.assertIsNotNone(result_a)
        self.assertEqual(len(result_a), 1)
        self.assertEqual(result_a[0]["standard_id"], "IS 269:2015")

        # Case B: Multiple JSON objects on separate lines
        raw_multi = (
            '{"standard_id": "IS 269:2015", "rationale": "OPC cement."}\n'
            '{"standard_id": "IS 8112:1989", "rationale": "43 Grade OPC."}'
        )
        result_b = _parse_llm_json_response(raw_multi)
        self.assertIsNotNone(result_b)
        self.assertEqual(len(result_b), 2)
        self.assertEqual(result_b[0]["standard_id"], "IS 269:2015")
        self.assertEqual(result_b[1]["standard_id"], "IS 8112:1989")

        # Case C: Container dict with 'recommendations' key
        raw_dict = (
            '{\n'
            '  "recommendations": [\n'
            '    {"standard_id": "IS 456:2000", "rationale": "Plain and reinforced concrete code."}\n'
            '  ]\n'
            '}'
        )
        result_c = _parse_llm_json_response(raw_dict)
        self.assertIsNotNone(result_c)
        self.assertEqual(len(result_c), 1)
        self.assertEqual(result_c[0]["standard_id"], "IS 456:2000")

        # Case D: Trailing comma inside JSON array / object
        raw_trailing = (
            '[\n'
            '  {"standard_id": "IS 269:2015", "rationale": "OPC",},\n'
            ']'
        )
        result_d = _parse_llm_json_response(raw_trailing)
        self.assertIsNotNone(result_d)
        self.assertEqual(len(result_d), 1)
        self.assertEqual(result_d[0]["standard_id"], "IS 269:2015")


class TestGroundingValidator(unittest.TestCase):
    """Unit tests for anti-hallucination / grounding validation."""

    def setUp(self):
        self.context_texts = [
            "standard is 269:2015 specification for 33, 43, 53 grade ordinary portland cement",
            "is 8112:1989 specification for 43 grade ordinary portland cement",
            "is 10322 (part 5/sec 3):2013 luminaires for road and street lighting",
        ]

    def test_08_fabricated_standard_id(self):
        pipeline = BISRAGPipeline.__new__(BISRAGPipeline)

        # Completely fabricated standard IDs must be rejected
        self.assertFalse(pipeline._validate_recommendation("IS 99999:2099", self.context_texts))
        self.assertFalse(pipeline._validate_recommendation("IS FAKE:2024", self.context_texts))
        self.assertFalse(pipeline._validate_recommendation("IS 123456", self.context_texts))
        self.assertFalse(pipeline._validate_recommendation("", self.context_texts))

    def test_09_valid_standard_id_present_in_context(self):
        pipeline = BISRAGPipeline.__new__(BISRAGPipeline)

        # Standard IDs present in context must pass validation
        self.assertTrue(pipeline._validate_recommendation("IS 269:2015", self.context_texts))
        self.assertTrue(pipeline._validate_recommendation("IS 8112:1989", self.context_texts))
        self.assertTrue(pipeline._validate_recommendation("IS 10322", self.context_texts))
        self.assertTrue(pipeline._validate_recommendation("IS 10322 (Part 5/Sec 3):2013", self.context_texts))


if __name__ == "__main__":
    unittest.main()
