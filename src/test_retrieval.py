"""
Direct ChromaDB Retrieval Test
================================
Tests semantic retrieval from the populated ChromaDB BEFORE the LLM layer.
This isolates whether the vector search itself returns relevant documents.

Usage (from repo root):
    python -m src.test_retrieval
    python -m src.test_retrieval --store backend/data/vectorstore --k 5

Output format per query:
    QUERY: <text>
    ---
    [rank] standard_id | domain | score
           title
           passage snippet (first 120 chars)
"""

import argparse
import sys
from pathlib import Path

TEST_QUERIES = [
    ("ordinary portland cement for construction",        "Construction"),
    ("LED street lights for municipal roads",            "Electrical"),
    ("electrical cables for public buildings",           "Electrical"),
    ("hospital examination gloves",                     "Healthcare"),
    ("agricultural water pumps irrigation",             "Agriculture"),
    ("food packaging materials quality",                "Food"),
    ("steel structural members for bridges",            "Construction"),
    ("automotive brake components motor vehicle",       "Automotive"),
]


def run_tests(store_path: str, k: int = 5) -> None:
    # ── load embeddings ───────────────────────────────────────────────────────
    print("Loading embedding model (all-MiniLM-L6-v2)…")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    print("✓ Embedding model ready\n")

    # ── connect ChromaDB ──────────────────────────────────────────────────────
    import chromadb
    client = chromadb.PersistentClient(path=store_path)
    cols = [c.name for c in client.list_collections()]
    if "langchain" not in cols:
        print(f"ERROR: collection 'langchain' not found in {store_path}", file=sys.stderr)
        sys.exit(1)

    collection = client.get_collection("langchain")
    total_docs = collection.count()
    print(f"ChromaDB collection 'langchain' — {total_docs} document(s)\n")
    print("=" * 70)

    # ── per-query retrieval ───────────────────────────────────────────────────
    domain_hits: dict[str, int] = {}   # expected_domain → hit count
    domain_total: dict[str, int] = {}

    for query, expected_domain in TEST_QUERIES:
        domain_total[expected_domain] = domain_total.get(expected_domain, 0) + 1
        print(f"\nQUERY : {query}")
        print(f"Expected domain: {expected_domain}")
        print("-" * 70)

        # Embed the query
        query_vec = embeddings.embed_query(query)

        # Query ChromaDB directly (bypasses LangChain wrapper — raw distance scores)
        results = collection.query(
            query_embeddings=[query_vec],
            n_results=min(k, total_docs),
            include=["documents", "metadatas", "distances"],
        )

        docs      = results["documents"][0]
        metas     = results["metadatas"][0]
        distances = results["distances"][0]   # cosine distance (lower = more similar)

        if not docs:
            print("  ⚠ No documents retrieved")
            continue

        top_domain_correct = False
        for rank, (doc, meta, dist) in enumerate(zip(docs, metas, distances), 1):
            sid    = meta.get("standard_id", "?")
            title  = meta.get("title", "?")
            domain = meta.get("domain", "?")
            score  = round(1.0 - dist, 4)   # convert cosine distance → similarity

            marker = "✓" if domain == expected_domain else " "
            if domain == expected_domain and not top_domain_correct:
                top_domain_correct = True

            snippet = doc.replace("\n", " ")[:130]
            print(f"  [{rank}] {marker} {sid}")
            print(f"       Domain    : {domain}")
            print(f"       Title     : {title}")
            print(f"       Similarity: {score:.4f}")
            print(f"       Snippet   : {snippet}…")
            print()

        if top_domain_correct:
            domain_hits[expected_domain] = domain_hits.get(expected_domain, 0) + 1

    # ── summary ───────────────────────────────────────────────────────────────
    print("=" * 70)
    print("RETRIEVAL SUMMARY")
    print("=" * 70)
    total_q = len(TEST_QUERIES)
    total_hits = sum(domain_hits.values())
    print(f"Queries tested          : {total_q}")
    print(f"Correct-domain in top-{k}: {total_hits}/{total_q}")
    print()
    for query, expected_domain in TEST_QUERIES:
        hit = expected_domain in domain_hits
        mark = "✓" if hit else "✗"
        print(f"  {mark} {expected_domain:<22}  {query}")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test ChromaDB retrieval")
    parser.add_argument("--store", default="backend/data/vectorstore")
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()
    run_tests(args.store, args.k)
