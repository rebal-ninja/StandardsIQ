"""
BIS Multi-Domain Knowledge Base Ingestion Script
=================================================
Reads src/data/bis_standards.json, builds rich searchable text passages,
and loads them into the existing ChromaDB vectorstore used by BISRAGPipeline.

Usage (from repo root):
    python -m src.ingest_json                    # default paths
    python -m src.ingest_json --data src/data/bis_standards.json --store backend/data/vectorstore

Rules:
- Only populates fields that are actually present in the JSON.
- Clears the existing 'langchain' collection before rebuilding (safe because
  it is currently empty; a --append flag is provided for future use).
- Uses the identical embedding model (all-MiniLM-L6-v2) and collection name
  ('langchain') that BISRAGPipeline expects — no changes to the pipeline code.
- Prints full ingestion statistics at the end.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path


# ── helpers ──────────────────────────────────────────────────────────────────

REQUIRED_FIELDS = {"standard_id", "title", "domain"}


def validate_record(record: dict) -> tuple[bool, str]:
    """Return (is_valid, reason). Only checks fields that must be present."""
    for field in REQUIRED_FIELDS:
        val = record.get(field)
        if not val or not str(val).strip():
            return False, f"missing required field '{field}'"
    return True, ""


def build_page_content(record: dict) -> str:
    """
    Build a rich natural-language passage that the embedding model will see.

    The passage embeds every available metadata field so semantic queries like
    "LED street lights for municipal roads" can match the keyword-rich text
    rather than relying on the LLM to do keyword look-up after retrieval.

    Format is kept consistent so the LLM can extract standard_id reliably.
    """
    sid      = record["standard_id"].strip()
    title    = record["title"].strip()
    domain   = record["domain"].strip()
    scope    = (record.get("scope") or "").strip()
    status   = (record.get("status") or "").strip()
    year     = str(record.get("year") or "").strip()
    revision = (record.get("revision") or "").strip()
    amd      = (record.get("amendment_no") or "").strip()
    source   = (record.get("source") or "").strip()
    src_doc  = (record.get("source_document") or "").strip()
    kw       = (record.get("keywords") or "").strip()

    lines = []
    lines.append(f"BIS Standard {sid} — {title}.")
    lines.append(f"Domain: {domain}.")
    if scope:
        lines.append(f"Scope: {scope}")
    if status:
        lines.append(f"Status: {status.capitalize()}.")
    if year:
        lines.append(f"Year: {year}.")
    if revision:
        lines.append(f"Revision: {revision}.")
    if amd:
        lines.append(f"Amendment: {amd}.")
    if source:
        lines.append(f"Source: {source}.")
    if src_doc:
        lines.append(f"Source document: {src_doc}.")
    if kw:
        lines.append(f"Keywords: {kw}.")

    return "\n".join(lines)


def build_metadata(record: dict) -> dict:
    """
    Return a flat metadata dict for ChromaDB.
    Only includes fields that have a non-null, non-empty value.
    ChromaDB metadata values must be str, int, float, or bool.
    """
    meta = {}
    str_fields = [
        "standard_id", "title", "domain", "scope",
        "status", "year", "revision", "amendment_no",
        "source", "source_document", "keywords",
    ]
    for f in str_fields:
        val = record.get(f)
        if val is not None and str(val).strip():
            meta[f] = str(val).strip()
    return meta


# ── main ─────────────────────────────────────────────────────────────────────

def ingest(data_path: str, store_path: str, append: bool = False) -> None:
    t_start = time.time()

    # ── 1. load JSON ──────────────────────────────────────────────────────────
    data_file = Path(data_path)
    if not data_file.exists():
        print(f"ERROR: data file not found: {data_file.resolve()}", file=sys.stderr)
        sys.exit(1)

    with open(data_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Strip comment-only records (keys starting with '_comment')
    all_records = [r for r in raw if "standard_id" in r]
    print(f"\n{'='*60}")
    print(f"  BIS Multi-Domain Knowledge Base Ingestion")
    print(f"{'='*60}")
    print(f"  Data file  : {data_file.resolve()}")
    print(f"  Store path : {Path(store_path).resolve()}")
    print(f"  Records in JSON: {len(all_records)}")
    print()

    # ── 2. validate ───────────────────────────────────────────────────────────
    valid_records = []
    skipped = []
    for rec in all_records:
        ok, reason = validate_record(rec)
        if ok:
            valid_records.append(rec)
        else:
            skipped.append((rec.get("standard_id", "<no id>"), reason))

    if skipped:
        print(f"  Skipped {len(skipped)} invalid record(s):")
        for sid, reason in skipped:
            print(f"    ✗ {sid}: {reason}")

    print(f"  Valid records to embed: {len(valid_records)}")

    if not valid_records:
        print("ERROR: no valid records to ingest.", file=sys.stderr)
        sys.exit(1)

    # ── 3. load embeddings ────────────────────────────────────────────────────
    print("\n  Loading embedding model (all-MiniLM-L6-v2)…")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    print("  ✓ Embedding model loaded")

    # ── 4. connect to ChromaDB ────────────────────────────────────────────────
    print(f"\n  Connecting to ChromaDB at: {Path(store_path).resolve()}")
    import chromadb
    client = chromadb.PersistentClient(path=store_path)

    existing_cols = [c.name for c in client.list_collections()]
    print(f"  Existing collections: {existing_cols}")

    if not append and "langchain" in existing_cols:
        print("  Clearing existing 'langchain' collection…")
        client.delete_collection("langchain")
        print("  ✓ Old collection deleted")

    collection = client.get_or_create_collection(
        name="langchain",
        metadata={"hnsw:space": "cosine"},
    )
    print(f"  ✓ Collection 'langchain' ready (documents before: {collection.count()})")

    # ── 5. build passages and embed ───────────────────────────────────────────
    print(f"\n  Building passages and embedding {len(valid_records)} records…")

    texts     = []
    metadatas = []
    ids       = []

    for i, rec in enumerate(valid_records):
        passage = build_page_content(rec)
        meta    = build_metadata(rec)
        # Use standard_id + index as a stable doc ID (handle duplicates across domains)
        doc_id  = f"{rec['standard_id'].replace(' ', '_').replace('/', '_')}_{i}"
        texts.append(passage)
        metadatas.append(meta)
        ids.append(doc_id)

    # Embed in batches of 32 to avoid memory pressure
    BATCH = 32
    embedded = 0
    for start in range(0, len(texts), BATCH):
        batch_texts = texts[start:start + BATCH]
        batch_meta  = metadatas[start:start + BATCH]
        batch_ids   = ids[start:start + BATCH]

        batch_vecs = embeddings.embed_documents(batch_texts)

        collection.add(
            documents=batch_texts,
            embeddings=batch_vecs,
            metadatas=batch_meta,
            ids=batch_ids,
        )
        embedded += len(batch_texts)
        print(f"    embedded {embedded}/{len(texts)}…")

    # ── 6. statistics ─────────────────────────────────────────────────────────
    final_count = collection.count()
    elapsed     = time.time() - t_start

    # Domain breakdown
    domain_counts: dict[str, int] = {}
    for rec in valid_records:
        d = rec.get("domain", "Unknown")
        domain_counts[d] = domain_counts.get(d, 0) + 1

    print(f"\n{'='*60}")
    print(f"  INGESTION COMPLETE")
    print(f"{'='*60}")
    print(f"  Records in JSON     : {len(all_records)}")
    print(f"  Valid / embedded    : {len(valid_records)}")
    print(f"  Skipped             : {len(skipped)}")
    print(f"  ChromaDB doc count  : {final_count}")
    print(f"  Time elapsed        : {elapsed:.1f}s")
    print(f"\n  Domain breakdown:")
    for domain, count in sorted(domain_counts.items()):
        print(f"    {domain:<22} {count:>3} standard(s)")
    print(f"{'='*60}\n")

    if final_count != len(valid_records):
        print(f"WARNING: ChromaDB count ({final_count}) != embedded ({len(valid_records)}). "
              "Some documents may have been deduplicated by ID.", file=sys.stderr)


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest BIS standards JSON into ChromaDB"
    )
    parser.add_argument(
        "--data",
        default="src/data/bis_standards.json",
        help="Path to the BIS standards JSON file",
    )
    parser.add_argument(
        "--store",
        default="backend/data/vectorstore",
        help="Path to the ChromaDB persistent store directory",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to existing collection instead of clearing it",
    )
    args = parser.parse_args()
    ingest(args.data, args.store, args.append)
