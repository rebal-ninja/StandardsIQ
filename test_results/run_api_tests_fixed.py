import urllib.request
import urllib.error
import json
import time
import sys
import io

# Ensure UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def run_api_tests():
    host = "http://localhost:8000"
    print("=" * 70)
    print(f"  END-TO-END API TEST  -  {host}/api/discover")
    print("=" * 70)
    print()

    test_cases = [
        ("ordinary portland cement for construction", "Construction", ["IS 269", "IS 8112", "IS 12269"]),
        ("LED street lights for municipal roads", "Electrical", ["IS 10322", "IS 16107"]),
        ("electrical cables for public buildings", "Electrical", ["IS 694", "IS 1554"]),
        ("hospital examination gloves", "Healthcare", ["IS 4148", "IS 15223", "IS 13940"]),
        ("agricultural water pumps irrigation", "Agriculture", ["IS 8034", "IS 9137"]),
        ("food packaging materials quality", "Food", ["IS 1397", "IS 1166", "IS 1070"]),
        ("steel structural members for bridges", "Construction", ["IS 2062", "IS 1786"]),
        ("automotive brake components motor vehicle", "Automotive", ["IS 9400", "IS 15464", "IS 15627"]),
    ]

    def normalize(s):
        return s.replace(" ", "").replace(":", "").replace("(", "").replace(")", "").lower()

    def any_expected_hit(retrieved, expected):
        norm_ret = [normalize(r) for r in retrieved]
        for exp in expected:
            exp_n = normalize(exp)
            if any(exp_n in r for r in norm_ret):
                return True
        return False

    passed = 0
    failed = 0
    errors = 0
    results_log = []

    for query, expected_domain, expected_ids in test_cases:
        payload = json.dumps({"description": query}).encode("utf-8")
        req = urllib.request.Request(
            f"{host}/api/discover",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = {"error": e.read().decode("utf-8"), "status": e.code}
        except Exception as e:
            body = {"error": str(e)}
        elapsed = time.time() - t0

        print(f"QUERY   : {query}")
        print(f"Expected: {expected_domain}  |  {expected_ids}")

        if "error" in body:
            print(f"  [ERROR] {body['error']}")
            failed += 1
            errors += 1
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
            print(f"  [HIT] expected standard found in recommendations")
            passed += 1
        elif retrieved_ids:
            print(f"  [PARTIAL] recommendations returned but none matched expected IDs")
            print(f"    (expected one of: {expected_ids})")
            passed += 1
        else:
            print(f"  [MISS] empty recommendations")
            failed += 1

        for i, rec in enumerate(recommendations, 1):
            sid = rec.get("standard_id", "?")
            rationale = rec.get("rationale", "")[:100]
            print(f"    [{i}] {sid}")
            print(f"         {rationale}")

        results_log.append({
            "query": query,
            "expected_domain": expected_domain,
            "expected_ids": expected_ids,
            "retrieved_ids": retrieved_ids,
            "matched_by": matched_by,
            "latency": round(latency, 4),
            "hit": hit,
            "non_empty": bool(retrieved_ids),
        })
        print()

    print("=" * 70)
    print("  RESULTS SUMMARY")
    print("=" * 70)
    print(f"  Total queries : {len(test_cases)}")
    print(f"  HIT           : {sum(1 for e in results_log if e.get('hit'))}")
    print(f"  PARTIAL       : {sum(1 for e in results_log if e.get('non_empty') and not e.get('hit'))}")
    print(f"  MISS (empty)  : {sum(1 for e in results_log if not e.get('non_empty'))}")
    print(f"  ERRORS        : {errors}")
    print()

    for entry in results_log:
        if "error" in entry:
            mark = "ERR"
        elif entry.get("hit"):
            mark = "HIT"
        elif entry.get("non_empty"):
            mark = "REC"
        else:
            mark = "---"
        print(f"  [{mark}] {entry.get('expected_domain','?'):<22} {entry['query']}")

    print("=" * 70)
    print(f"\nRESULT_JSON: {json.dumps(results_log)}")
    return results_log

if __name__ == "__main__":
    print("Starting API tests...", flush=True)
    log = run_api_tests()
    hits = sum(1 for e in log if e.get('hit'))
    print(f"Tests completed. HIT rate: {hits}/{len(log)}")