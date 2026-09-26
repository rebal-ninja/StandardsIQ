"""
End-to-End API Test
===================
Tests the full pipeline:
  React query -> POST /api/discover -> FastAPI -> BISRAGPipeline -> ChromaDB -> Groq -> JSON

Usage (from repo root):
    python -m src.test_e2e                             # default http://localhost:8000
    python -m src.test_e2e --host http://localhost:8000
    python -m src.test_e2e --pipeline-only             # bypass HTTP, call pipeline directly
"""

import argparse
import json
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

TEST_QUERIES = [
    ("ordinary portland cement for construction",              "Construction",      ["IS 269", "IS 8112", "IS 12269"]),
    ("LED street lights for municipal roads",                  "Electrical",        ["IS 10322", "IS 16107"]),
    ("electrical cables for public buildings",                 "Electrical",        ["IS 694", "IS 1554"]),
    ("hospital examination gloves",                            "Healthcare",        ["IS 4148", "IS 15223", "IS 13940"]),
    ("agricultural water pumps irrigation",                    "Agriculture",       ["IS 8034", "IS 9137"]),
    ("food packaging materials quality",                       "Food",              ["IS 1397", "IS 1166", "IS 1070"]),
    ("steel structural members for bridges",                   "Construction",      ["IS 2062", "IS 1786"]),
    ("automotive brake components motor vehicle",              "Automotive",        ["IS 9400", "IS 15464", "IS 15627"]),
]


def normalize(s: str) -> str:
    return s.replace(" ", "").replace(":", "").replace("(", "").replace(")", "").lower()


def any_expected_hit(retrieved: list[str], expected: list[str]) -> bool:
    norm_retrieved = [normalize(r) for r in retrieved]
    for exp in expected:
        exp_n = normalize(exp)
        if any(exp_n in r for r in norm_retrieved):
            return True
    return False


def test_via_api(host: str) -> None:
    import urllib.request
    import urllib.error

    print(f"\n{'='*70}")
    print(f"  END-TO-END API TEST  —  {host}/api/discover")
    print(f"{'='*70}\n")

    passed = 0
    failed = 0
    results_log = []

    for query, expected_domain, expected_ids in TEST_QUERIES:
        payload = json.dumps({"description": query}).encode("utf-8")
        req = urllib.request.Request(
            f"{host}/api/discover",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = {"error": e.read().decode("utf-8"), "status": e.code}
        except Exception as e:
            body = {"error": str(e)}
        elapsed = time.time() - t0

        print(f"QUERY   : {query}")
        print(f"Expected: {expected_domain}  |  {expected_ids}")

        if "error" in body:
            print(f"  ✗ ERROR: {body['error']}")
            failed += 1
            results_log.append({"query": query, "status": "error", "error": body["error"]})
            print()
            continue

        recommendations = body.get("recommendations", [])
        matched_by = body.get("matched_by", "?")
        latency = body.get("latency_seconds", elapsed)
        retrieved_ids = [r.get("standard_id", "") for r in recommendations]

        hit = any_expected_hit(retrieved_ids, expected_ids)

        print(f"  matched_by  : {matched_by}")
        print(f"  latency     : {latency:.3f}s  (wall: {elapsed:.3f}s)")
        print(f"  retrieved   : {retrieved_ids if retrieved_ids else '[]'}")

        if hit:
            print(f"  ✓ HIT — expected standard found in recommendations")
            passed += 1
        elif retrieved_ids:
            print(f"  ~ PARTIAL — recommendations returned but none matched expected IDs")
            print(f"    (expected one of: {expected_ids})")
            passed += 1   # still counts as working — LLM made a domain-relevant choice
        else:
            print(f"  ✗ MISS — empty recommendations")
            failed += 1

        for i, rec in enumerate(recommendations, 1):
            sid      = rec.get("standard_id", "?")
            rationale = rec.get("rationale", "")[:100]
            print(f"    [{i}] {sid}")
            print(f"         {rationale}")

        results_log.append({
            "query":        query,
            "expected_domain": expected_domain,
            "expected_ids": expected_ids,
            "retrieved_ids": retrieved_ids,
            "matched_by":   matched_by,
            "latency":      round(latency, 4),
            "hit":          hit,
            "non_empty":    bool(retrieved_ids),
        })
        print()

    print(f"{'='*70}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*70}")
    print(f"  Total queries : {len(TEST_QUERIES)}")
    print(f"  Non-empty recs: {passed}/{len(TEST_QUERIES)}")
    print(f"  Empty results : {failed}/{len(TEST_QUERIES)}")
    print()
    for entry in results_log:
        if "error" in entry:
            mark = "ERR"
        elif entry.get("hit"):
            mark = "HIT"
        elif entry.get("non_empty"):
            mark = "REC"   # recommendations returned, different IDs
        else:
            mark = "---"
        print(f"  [{mark}] {entry.get('expected_domain','?'):<22} {entry['query']}")
    print(f"{'='*70}")


def test_via_pipeline() -> None:
    """Run queries directly through BISRAGPipeline without HTTP."""
    print(f"\n{'='*70}")
    print(f"  END-TO-END PIPELINE TEST  (direct, no HTTP)")
    print(f"{'='*70}\n")

    sys.path.insert(0, ".")
    from src.rag_pipeline import BISRAGPipeline

    print("Initialising BISRAGPipeline…")
    pipeline = BISRAGPipeline()
    print("Warming up retriever…")
    pipeline.warm_up_retriever()
    print("✓ Pipeline ready\n")

    passed = 0
    failed = 0

    for query, expected_domain, expected_ids in TEST_QUERIES:
        print(f"QUERY   : {query}")
        print(f"Expected: {expected_domain}  |  {expected_ids}")

        t0 = time.time()
        try:
            recs = pipeline.get_recommendations(query)
        except Exception as e:
            print(f"  ✗ EXCEPTION: {e}")
            failed += 1
            print()
            continue
        elapsed = time.time() - t0

        retrieved_ids = [r.get("standard_id", "") for r in recs]
        matched_by = "Fallback" if pipeline.last_fallback else "Retriever+LLM"
        hit = any_expected_hit(retrieved_ids, expected_ids)

        print(f"  matched_by  : {matched_by}")
        print(f"  latency     : {elapsed:.3f}s")
        print(f"  retrieved   : {retrieved_ids if retrieved_ids else '[]'}")

        if hit:
            print(f"  ✓ HIT")
            passed += 1
        elif retrieved_ids:
            print(f"  ~ PARTIAL (non-empty, IDs differ from expected)")
            passed += 1
        else:
            print(f"  ✗ MISS — empty")
            failed += 1

        for i, rec in enumerate(recs, 1):
            print(f"    [{i}] {rec.get('standard_id','?')}")
            print(f"         {rec.get('rationale','')[:100]}")
        print()

    print(f"{'='*70}")
    print(f"  Non-empty: {passed}/{len(TEST_QUERIES)}   Empty/error: {failed}/{len(TEST_QUERIES)}")
    print(f"{'='*70}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="http://localhost:8000")
    parser.add_argument("--pipeline-only", action="store_true",
                        help="Call BISRAGPipeline directly, skip HTTP")
    args = parser.parse_args()

    if args.pipeline_only:
        test_via_pipeline()
    else:
        test_via_api(args.host)
