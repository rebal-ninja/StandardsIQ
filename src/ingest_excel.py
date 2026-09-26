"""
BIS Excel Catalogue Ingestion Script
=====================================
Reads BIS Published Standards List Excel files from src/data/excel/,
adds them to the EXISTING ChromaDB vector store used by BISRAGPipeline.

Files handled
-------------
  WRD  — File_Published_Standards_List_2026-09-02_141553.xlsx  (Water Resources)
  CHD  — File_Published_Standards_List_2026-09-02_141742.xlsx  (Chemical)
  CHD* — File_Published_Standards_List_2026-09-02_141846.xlsx  (duplicate — skipped)
  LITD — File_Published_Standards_List_2026-09-02_141938.xlsx  (Electronics/IT)

Safety rules
------------
- Never deletes existing records.
- Idempotent: running twice does not duplicate records.
- Different editions/parts ARE kept as separate records.
- Deduplication key = normalised (standard_id, title, date, division) tuple.
- Duplicate CHD file is detected by content hash and skipped automatically.
- Does NOT fabricate scope, keywords, status, domain, or technical details.
  Only the catalogue fields present in the Excel are stored.

Usage (from repo root)
----------------------
    python src/ingest_excel.py
    python src/ingest_excel.py --excel-dir src/data/excel --store backend/data/vectorstore
    python src/ingest_excel.py --dry-run   # parse and report without writing
"""

import argparse
import hashlib
import re
import sys
import time
from pathlib import Path

import openpyxl

# ── constants ─────────────────────────────────────────────────────────────────

ROOT             = Path(__file__).resolve().parent.parent
DEFAULT_EXCEL_DIR = ROOT / "src" / "data" / "excel"
DEFAULT_STORE     = ROOT / "backend" / "data" / "vectorstore"
COLLECTION_NAME   = "langchain"
EMBED_MODEL       = "all-MiniLM-L6-v2"
BATCH_SIZE        = 32

# These two CHD files are known duplicates (same generated-on timestamps and
# identical first rows). We detect them by content fingerprint at runtime,
# but also list the expected filenames here for clear log output.
_EXPECTED_CHD_FILES = {
    "File_Published_Standards_List_2026-09-02_141742.xlsx": "CHD",
    "File_Published_Standards_List_2026-09-02_141846.xlsx": "CHD-duplicate",
}
_EXPECTED_WRD_FILES = {
    "File_Published_Standards_List_2026-09-02_141553.xlsx": "WRD",
}
_EXPECTED_LITD_FILES = {
    "File_Published_Standards_List_2026-09-02_141938.xlsx": "LITD",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def clean(s) -> str:
    """Collapse whitespace, strip, return empty string for None/blank."""
    if s is None:
        return ""
    return re.sub(r'\s+', ' ', str(s)).strip()


def normalise_id(raw: str) -> str:
    """
    Normalise a standard number for embedding ID generation.
    'IS 269 : 2015'  ->  'IS 269:2015'
    """
    s = clean(raw)
    s = re.sub(r'\s*:\s*', ':', s)   # collapse spaces around colon
    s = re.sub(r'\s+', ' ', s)
    return s


def make_doc_id(standard_id: str, title: str, division: str) -> str:
    """
    Stable, unique document ID for ChromaDB.

    Format: excel_{division}_{normalised_standard_id}_{hash6}
    The hash is computed from (standard_id, title) so two records with the
    same standard_id but genuinely different titles get different IDs.
    The hash prevents ChromaDB from treating different editions as the same doc.
    """
    sid_safe = re.sub(r'[^a-zA-Z0-9:.\-]', '_', normalise_id(standard_id))
    fingerprint = hashlib.md5(
        f"{normalise_id(standard_id)}|{clean(title)}".encode()
    ).hexdigest()[:8]
    return f"excel_{division}_{sid_safe}_{fingerprint}"


def file_sha256(path: Path) -> str:
    """Compute SHA-256 of a file for duplicate detection."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_division(path: Path) -> str:
    """
    Detect the BIS division from the first rows of the Excel sheet,
    falling back to filename-based detection.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    # Row 0 (index) typically contains the division in column C (index 2)
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i > 2:
            break
        for cell in row:
            val = clean(cell)
            if "Water Resources" in val or "WRD" in val:
                wb.close()
                return "WRD"
            if "Chemical" in val and "CHD" not in val:
                wb.close()
                return "CHD"
            if "CHD" in val:
                wb.close()
                return "CHD"
            if "Electronics" in val or "LITD" in val or "Information Technology" in val:
                wb.close()
                return "LITD"
    wb.close()
    return "UNKNOWN"


def read_excel_file(path: Path, division: str) -> list[dict]:
    """
    Parse one Excel file.  Returns a list of record dicts.
    Only fields actually present in the Excel are stored — no fabrication.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    # Find the actual header row (contains 'Standard Number')
    header_row_idx = None
    for i, row in enumerate(all_rows):
        if row and any(clean(c) == 'Standard Number' for c in row):
            header_row_idx = i
            break

    if header_row_idx is None:
        raise ValueError(f"Cannot find 'Standard Number' column header in {path.name}")

    header = [clean(c) for c in all_rows[header_row_idx]]

    # Map column names to positions
    def col(name):
        try:
            return header.index(name)
        except ValueError:
            return None

    std_num_col = col('Standard Number')
    date_col    = col('Date of Publish')
    title_col   = col('Title')
    type_col    = col('Type of Standard')
    equiv_col   = col('Degree of Equivalence')

    if std_num_col is None or title_col is None:
        raise ValueError(f"Required columns missing in {path.name}")

    records = []
    for row in all_rows[header_row_idx + 1:]:
        std_num = clean(row[std_num_col] if std_num_col < len(row) else None)
        if not std_num:
            continue  # skip completely empty rows

        title   = clean(row[title_col]   if title_col   is not None and title_col   < len(row) else None)
        date    = clean(row[date_col]    if date_col    is not None and date_col    < len(row) else None)
        typ     = clean(row[type_col]    if type_col    is not None and type_col    < len(row) else None)
        equiv   = clean(row[equiv_col]   if equiv_col   is not None and equiv_col   < len(row) else None)

        records.append({
            "standard_id":          normalise_id(std_num),
            "title":                title,
            "date_of_publish":      date,
            "type_of_standard":     typ,
            "degree_of_equivalence": equiv,
            "bis_division":         division,
            "source":               f"BIS Published Standards List — {division} (Excel catalogue)",
        })

    return records


def build_page_content(rec: dict) -> str:
    """
    Build a searchable natural-language text passage for embedding.
    Only uses fields that are actually present in the Excel catalogue.
    Does NOT fabricate scope, keywords, or technical details.
    """
    lines = []
    lines.append(f"Standard Number: {rec['standard_id']}")
    if rec.get("title"):
        lines.append(f"Title: {rec['title']}")
    if rec.get("date_of_publish"):
        lines.append(f"Date of Publish: {rec['date_of_publish']}")
    if rec.get("type_of_standard"):
        lines.append(f"Type of Standard: {rec['type_of_standard']}")
    if rec.get("degree_of_equivalence"):
        lines.append(f"Degree of Equivalence: {rec['degree_of_equivalence']}")
    if rec.get("bis_division"):
        lines.append(f"BIS Division: {rec['bis_division']}")
    if rec.get("source"):
        lines.append(f"Source: {rec['source']}")
    return "\n".join(lines)


def build_metadata(rec: dict) -> dict:
    """
    Flat metadata dict for ChromaDB.
    ChromaDB requires str/int/float/bool values — no None, no nested dicts.
    Only populated from actual Excel data.
    """
    out = {}
    for field in ("standard_id", "title", "date_of_publish",
                  "type_of_standard", "degree_of_equivalence",
                  "bis_division", "source"):
        val = rec.get(field)
        if val:
            out[field] = str(val)
    return out


# ── deduplication ─────────────────────────────────────────────────────────────

def dedup_records(records: list[dict]) -> tuple[list[dict], int]:
    """
    Remove genuinely identical records from the list.
    Key = (normalised standard_id, normalised title, date, division).
    Different editions and parts are preserved as separate records.
    Returns (deduplicated_list, number_removed).
    """
    seen = set()
    unique = []
    removed = 0
    for rec in records:
        key = (
            normalise_id(rec["standard_id"]).upper(),
            rec.get("title", "").upper(),
            rec.get("date_of_publish", "").upper(),
            rec.get("bis_division", "").upper(),
        )
        if key in seen:
            removed += 1
        else:
            seen.add(key)
            unique.append(rec)
    return unique, removed


# ── main ingestion ────────────────────────────────────────────────────────────

def ingest(excel_dir: str, store_path: str, dry_run: bool = False) -> None:
    t_start = time.time()

    excel_path = Path(excel_dir)
    store = Path(store_path)

    print(f"\n{'='*65}")
    print("  BIS Excel Catalogue Ingestion")
    print(f"{'='*65}")
    print(f"  Excel dir  : {excel_path.resolve()}")
    print(f"  Store path : {store.resolve()}")
    print(f"  Dry run    : {dry_run}")

    # ── 1. Discover and classify Excel files ──────────────────────────────────
    xlsx_files = sorted(excel_path.glob("*.xlsx"))
    if not xlsx_files:
        print(f"\nERROR: no .xlsx files found in {excel_path.resolve()}", file=sys.stderr)
        sys.exit(1)

    print(f"\n  Found {len(xlsx_files)} .xlsx file(s):")

    # Detect duplicates by SHA-256 content hash
    file_hashes: dict[str, list[Path]] = {}
    for f in xlsx_files:
        h = file_sha256(f)
        file_hashes.setdefault(h, []).append(f)

    # Build processing list — one per unique content hash
    files_to_process: list[tuple[Path, str]] = []  # (path, division)
    skipped_duplicates: list[Path] = []
    seen_hashes: set[str] = set()

    for f in xlsx_files:
        h = file_sha256(f)
        division = detect_division(f)
        duplicates = file_hashes[h]

        if h in seen_hashes:
            skipped_duplicates.append(f)
            print(f"    SKIP (duplicate content) : {f.name}  [{division}]")
        else:
            seen_hashes.add(h)
            files_to_process.append((f, division))
            note = " (will process)" if len(duplicates) == 1 else f" (1 of {len(duplicates)} copies — others skipped)"
            print(f"    PROCESS                  : {f.name}  [{division}]{note}")

    print(f"\n  Files to process : {len(files_to_process)}")
    print(f"  Duplicate files  : {len(skipped_duplicates)}")

    # ── 2. Read all Excel records ─────────────────────────────────────────────
    all_records: list[dict] = []
    rows_per_file: dict[str, int] = {}

    for f, division in files_to_process:
        recs = read_excel_file(f, division)
        rows_per_file[f.name] = len(recs)
        all_records.extend(recs)
        print(f"  Read {len(recs):>5} rows from {f.name}  [{division}]")

    total_raw = len(all_records)
    print(f"\n  Total rows read  : {total_raw}")

    # ── 3. Deduplicate within the Excel data ──────────────────────────────────
    unique_records, intra_dupes = dedup_records(all_records)
    print(f"  Intra-Excel duplicates removed : {intra_dupes}")
    print(f"  Unique Excel records           : {len(unique_records)}")

    if dry_run:
        print(f"\n  [DRY RUN] Would attempt to insert up to {len(unique_records)} records.")
        print("  No changes written to ChromaDB.\n")
        return

    # ── 4. Load embedding model ───────────────────────────────────────────────
    print(f"\n  Loading embedding model ({EMBED_MODEL})…")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    print("  Embedding model ready")

    # ── 5. Connect to existing ChromaDB ───────────────────────────────────────
    print(f"\n  Connecting to ChromaDB at {store.resolve()}")
    import chromadb
    client = chromadb.PersistentClient(path=str(store))

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    count_before = collection.count()
    print(f"  ChromaDB documents before ingestion : {count_before}")

    # ── 6. Determine which records are already present ────────────────────────
    # We use the deterministic doc ID (same function as insert) to check
    # whether a record was already ingested in a previous run.
    print("\n  Checking for already-ingested records…")

    to_insert: list[dict] = []
    already_present = 0

    for rec in unique_records:
        doc_id = make_doc_id(rec["standard_id"], rec["title"], rec["bis_division"])
        # Fetch by ID — returns empty list if not found
        existing = collection.get(ids=[doc_id], include=[])
        if existing["ids"]:
            already_present += 1
        else:
            to_insert.append(rec)

    print(f"  Already present (skipped) : {already_present}")
    print(f"  New records to insert     : {len(to_insert)}")

    if not to_insert:
        count_after = collection.count()
        print(f"\n  Nothing new to insert. ChromaDB count unchanged: {count_after}")
        _print_summary(
            files_to_process, skipped_duplicates, total_raw, intra_dupes,
            len(unique_records), already_present, 0, count_before, count_after,
            time.time() - t_start
        )
        return

    # ── 7. Embed and insert ───────────────────────────────────────────────────
    print(f"\n  Embedding and inserting {len(to_insert)} records…")

    inserted = 0
    errors = 0

    for batch_start in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[batch_start : batch_start + BATCH_SIZE]

        texts     = [build_page_content(r) for r in batch]
        metadatas = [build_metadata(r)     for r in batch]
        ids       = [make_doc_id(r["standard_id"], r["title"], r["bis_division"]) for r in batch]

        try:
            vectors = embeddings.embed_documents(texts)
            collection.add(
                documents=texts,
                embeddings=vectors,
                metadatas=metadatas,
                ids=ids,
            )
            inserted += len(batch)
            print(f"    inserted {inserted}/{len(to_insert)}…")
        except Exception as e:
            errors += len(batch)
            print(f"    ERROR on batch {batch_start}: {e}", file=sys.stderr)

    # ── 8. Final count ────────────────────────────────────────────────────────
    count_after = collection.count()
    elapsed = time.time() - t_start

    _print_summary(
        files_to_process, skipped_duplicates, total_raw, intra_dupes,
        len(unique_records), already_present, inserted, count_before, count_after,
        elapsed, errors
    )


def _print_summary(
    files_to_process, skipped_duplicates, total_raw, intra_dupes,
    unique_count, already_present, inserted, count_before, count_after,
    elapsed, errors=0
):
    print(f"\n{'='*65}")
    print("  INGESTION SUMMARY")
    print(f"{'='*65}")
    print(f"  Excel files processed        : {len(files_to_process)}")
    print(f"  Duplicate Excel files skipped: {len(skipped_duplicates)}")
    print(f"  Total rows read              : {total_raw}")
    print(f"  Intra-Excel duplicates       : {intra_dupes}")
    print(f"  Unique Excel records         : {unique_count}")
    print(f"  Already present in ChromaDB  : {already_present}")
    print(f"  Newly inserted               : {inserted}")
    if errors:
        print(f"  Insert errors                : {errors}")
    print(f"  ChromaDB count BEFORE        : {count_before}")
    print(f"  ChromaDB count AFTER         : {count_after}")
    print(f"  Time elapsed                 : {elapsed:.1f}s")
    print(f"{'='*65}\n")


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest BIS Excel Published Standards Lists into ChromaDB"
    )
    parser.add_argument(
        "--excel-dir",
        default=str(DEFAULT_EXCEL_DIR),
        help="Directory containing the .xlsx files",
    )
    parser.add_argument(
        "--store",
        default=str(DEFAULT_STORE),
        help="Path to the ChromaDB persistent store directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report without writing to ChromaDB",
    )
    args = parser.parse_args()
    ingest(args.excel_dir, args.store, args.dry_run)
