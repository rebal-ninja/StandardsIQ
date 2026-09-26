"""
RAG Pipeline Test — StandardIQ Phase 1
========================================
Tests retrieval quality and pipeline correctness across multiple domains.
Runs against ChromaDB directly (no HTTP server, no LLM needed).

Usage (from repo root):
    python -m src.test_rag
    python -m src.test_rag --store backend/data/vectorstore --k 10
"""

import argparse
import sys
import time
from pathlib import Path

# ── test cases ────────────────────────────────────────────────────────────────
# Each entry: (query, expected_domain, [acceptable_standard_id_prefixes])
# The standard_id prefix list is checked with a substring match (case-insensitive).
# An empty list means we just check domain presence, not specific IDs.

TEST_CASES = [
    # Construction — cement
    (
        "Ordinary Portland Cement 43 grade for structural concrete in high-rise buildings",
        "Construction",
        ["IS 269", "IS 8112"],
    ),
    (
        "Portland slag cement for marine structures and sulphate-resistant foundations",
        "Construction",
        ["IS 455"],
    ),
    (
        "Fly ash based portland pozzolana cement for mass concrete dam construction",
        "Construction",
        ["IS 1489"],
    ),
    (
        "Hot rolled structural steel plates for bridge fabrication grade E350",
        "Construction",
        ["IS 2062"],
    ),
    (
        "TMT reinforcement bars Fe500 grade for reinforced concrete columns",
        "Construction",
        ["IS 1786"],
    ),
    (
        "Precast concrete pipes for stormwater drainage and sewerage systems",
        "Construction",
        ["IS 458"],
    ),
    # Electrical
    (
        "LED street lights for national highway and municipal road illumination",
        "Electrical",
        ["IS 10322", "IS 16107"],
    ),
    (
        "PVC insulated electrical cables for fixed wiring in public buildings 1100V",
        "Electrical",
        ["IS 694", "IS 1554"],
    ),
    (
        "Distribution transformer oil immersed 11kV for industrial substation",
        "Electrical",
        ["IS 2026"],
    ),
    # Mechanical
    (
        "Submersible pumpset for lifting water from deep bore well drinking water supply",
        "Mechanical",
        ["IS 8034"],
    ),
    (
        "Shell and tube heat exchanger for chemical plant process cooling",
        "Mechanical",
        ["IS 4503"],
    ),
    # Healthcare
    (
        "Folding wheelchair for adult rehabilitation and mobility assistance",
        "Healthcare",
        ["IS 7454"],
    ),
    (
        "Sterile surgical sutures for wound closure in hospital operating rooms",
        "Healthcare",
        ["IS 13940"],
    ),
    (
        "Prosthetic foot for below-knee amputee rehabilitation",
        "Healthcare",
        ["IS 17034"],
    ),
    # Safety (PPE)
    (
        "Industrial safety helmet hard hat for construction workers at site",
        "Safety",
        ["IS 2925"],
    ),
    (
        "Rubber insulating gloves for electrical linemen working on live HV lines",
        "Safety",
        ["IS 4770"],
    ),
    # Quality Management
    (
        "Quality management system certification requirements for manufacturing organization",
        "Quality Management",
        ["IS/ISO 9001"],
    ),
    (
        "Customer complaints handling guidelines for service organization quality",
        "Quality Management",
        ["IS/ISO 10002"],
    ),
    # Automotive
    (
        "Hydraulic brake hose assembly for passenger car braking system",
        "Automotive",
        ["IS 9400"],
    ),
    (
        "Pneumatic tyres for passenger cars load rating speed index certification",
        "Automotive",
        ["IS 15464"],
    ),
    # Chemicals
    (
        "Sulphuric acid industrial grade for battery manufacturing and chemical processing",
        "Chemicals",
        ["IS 266"],
    ),
    # Food
    (
        "Jaggery gur specification for food grade quality procurement",
        "Food",
        ["IS 1397"],
    ),
    # Textile
    (
        "Cotton terry towels for hospital procurement GSM absorbency requirements",
        "Textile",
        ["IS 7702"],
    ),
    # Negative / no confident match expected
    (
        "Quantum computing hardware specifications for defence research laboratory",
        None,  # no expected domain — should return empty or low-confidence
        [],
    ),
]


def normalize(s: str) -> str:
    return s.replace(" ", "").replace(":", "").replace("(", "").replace(")", "").lower()


def any_prefix_hit(retrieved_ids: list, expected_prefixes: list) -> bool:
    if not expected_prefixes:
        return True  # no specific ID required
    norm_retrieved = [normalize(r) for r in retrieved_ids]
    for prefix in expected_prefixes:
        pn = normalize(prefix)
        if any(pn in r for r in norm_retrieved):
            return True
    return False


def run_retrieval_test(store_path: str, k: int) -> dict:
    """
    Direct ChromaDB retrieval test — no LLM.
    Tests whether the vector search returns the right domain/standard.
    """
    from langchain_community.embeddings import HuggingFaceEmbeddings
    import chromadb

    print("\nLoading embedding model (all-MiniLM-L6-v2)...")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    client = chromadb.PersistentClient(path=store_path)
    try:
        collection = client.get_collection("langchain")
    except Exception:
        print(f"ERROR: collection 'langchain' not found in {store_path}", file=sys.stderr)
        sys.exit(1)

    total = collection.count()
    print(f"ChromaDB 'langchain': {total} records\n")
    print("=" * 78)
    print("RETRIEVAL TEST (no LLM)")
    print("=" * 78)

    hits = 0
    misses = 0
    results_log = []

    for query, expected_domain, expected_prefixes in TEST_CASES:
        qvec = embeddings.embed_query(query)
        results = collection.query(
            query_embeddings=[qvec],
            n_results=min(k, total),
            include=["documents", "metadatas", "distances"],
        )

        docs      = results["documents"][0]
        metas     = results["metadatas"][0]
        distances = results["distances"][0]

        # Build scored candidates
        candidates = []
        seen_ids = set()
        for doc, meta, dist in zip(docs, metas, distances):
            score = round(1.0 - dist, 4)
            sid   = meta.get("standard_id", "?")
            dom   = meta.get("domain") or meta.get("bis_division", "?")
            title = meta.get("title", "")[:60]
            if sid not in seen_ids:
                seen_ids.add(sid)
                candidates.append((sid, dom, title, score))

        retrieved_ids    = [c[0] for c in candidates]
        retrieved_domains = [c[1] for c in candidates]

        # Evaluate
        domain_hit = (expected_domain is None) or (expected_domain in retrieved_domains[:5])
        id_hit     = any_prefix_hit(retrieved_ids[:5], expected_prefixes)
        full_hit   = domain_hit and id_hit

        if full_hit:
            hits += 1
            mark = "HIT "
        else:
            misses += 1
            mark = "MISS"

        print(f"\n[{mark}] {query[:70]}")
        if expected_domain:
            print(f"       Expected domain : {expected_domain}")
            print(f"       Expected IDs    : {expected_prefixes}")
        else:
            print(f"       Expected        : no match (negative test)")

        for i, (sid, dom, title, score) in enumerate(candidates[:5], 1):
            marker = "*" if (dom == expected_domain or expected_domain is None) else " "
            print(f"       [{i}]{marker} {score:.4f}  {sid:<35} [{dom}]  {title}")

        results_log.append({
            "query":            query,
            "expected_domain":  expected_domain,
            "expected_prefixes": expected_prefixes,
            "retrieved_ids":    retrieved_ids[:5],
            "retrieved_domains": retrieved_domains[:5],
            "top_score":        candidates[0][3] if candidates else 0,
            "domain_hit":       domain_hit,
            "id_hit":           id_hit,
            "full_hit":         full_hit,
        })

    print("\n" + "=" * 78)
    print("RETRIEVAL SUMMARY")
    print("=" * 78)
    print(f"  Total queries : {len(TEST_CASES)}")
    print(f"  Full hits     : {hits}/{len(TEST_CASES)}")
    print(f"  Misses        : {misses}/{len(TEST_CASES)}")
    print()

    # Per-domain summary
    domain_results: dict = {}
    for r in results_log:
        dom = r["expected_domain"] or "NEGATIVE"
        if dom not in domain_results:
            domain_results[dom] = {"hits": 0, "total": 0}
        domain_results[dom]["total"] += 1
        if r["full_hit"]:
            domain_results[dom]["hits"] += 1

    for dom, counts in sorted(domain_results.items()):
        mark = "OK" if counts["hits"] == counts["total"] else "PARTIAL" if counts["hits"] > 0 else "FAIL"
        print(f"  {mark:<8} {dom:<25} {counts['hits']}/{counts['total']}")

    print("=" * 78)
    return {"hits": hits, "total": len(TEST_CASES), "results": results_log}


def run_pipeline_test(store_path: str) -> dict:
    """
    End-to-end pipeline test (retrieval only — no LLM call).
    Uses the actual BISRAGPipeline._retrieve_with_scores() method.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from src.rag_pipeline import BISRAGPipeline

    print("\n" + "=" * 78)
    print("PIPELINE TEST (retriever path only — LLM skipped)")
    print("=" * 78)

    pipeline = BISRAGPipeline(vectorstore_path=store_path)
    pipeline.warm_up_retriever()
    print()

    hits = 0
    results_log = []

    # Run a subset of queries — skipping the negative test for pipeline path
    pipeline_cases = [c for c in TEST_CASES if c[1] is not None]

    for query, expected_domain, expected_prefixes in pipeline_cases:
        t0 = time.time()
        scored_docs = pipeline._retrieve_with_scores(query, k=12)
        elapsed = time.time() - t0

        retrieved = []
        seen = set()
        for doc, score in scored_docs:
            sid = pipeline._extract_standard_id_from_doc(doc)
            meta = getattr(doc, "metadata", {}) or {}
            dom  = meta.get("domain") or meta.get("bis_division", "?")
            if sid and sid not in seen:
                seen.add(sid)
                retrieved.append((sid, dom, round(score, 4) if score else 0))

        retrieved_ids     = [r[0] for r in retrieved]
        retrieved_domains = [r[1] for r in retrieved]

        domain_hit = expected_domain in retrieved_domains[:8]
        id_hit     = any_prefix_hit(retrieved_ids[:8], expected_prefixes)
        full_hit   = domain_hit and id_hit

        if full_hit:
            hits += 1
            mark = "HIT "
        else:
            mark = "MISS"

        print(f"[{mark}]  {query[:68]}")
        print(f"         domain={expected_domain}  ids={expected_prefixes}")
        if retrieved:
            top3 = retrieved[:3]
            for sid, dom, sc in top3:
                print(f"         {sc:.4f}  {sid:<40} [{dom}]")
        else:
            print("         (no results above threshold)")
        print()

        results_log.append({
            "query":           query,
            "expected_domain": expected_domain,
            "expected_prefixes": expected_prefixes,
            "retrieved":       retrieved[:5],
            "domain_hit":      domain_hit,
            "id_hit":          id_hit,
            "full_hit":        full_hit,
            "latency_ms":      round((time.time() - t0) * 1000, 1),
        })

    print("=" * 78)
    print(f"Pipeline retrieval hits: {hits}/{len(pipeline_cases)}")
    print("=" * 78)
    return {"hits": hits, "total": len(pipeline_cases), "results": results_log}


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test StandardIQ RAG pipeline")
    parser.add_argument("--store", default="backend/data/vectorstore")
    parser.add_argument("--k",     type=int, default=10)
    parser.add_argument("--retrieval-only", action="store_true",
                        help="Run raw Chroma retrieval test only (faster)")
    args = parser.parse_args()

    if args.retrieval_only:
        run_retrieval_test(args.store, args.k)
    else:
        run_retrieval_test(args.store, args.k)
        run_pipeline_test(args.store)
