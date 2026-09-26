# StandardIQ — Phase 1 Implementation Status

> Last updated: 2026-09-11  
> Phase: Audit, Data & RAG  
> Status: **Complete**

---

## 1. Data Counts (Verified)

### ChromaDB — `backend/data/vectorstore` (active store used by all pipelines)

| Record type | Count | Source |
|---|---|---|
| IS records (JSON + PDF) | 92 | `src/data/bis_standards.json` → `ingest_json.py` |
| Excel records (CHD division) | 2,156 | `src/data/excel/File_…_141742.xlsx` → `ingest_excel.py` |
| Excel records (LITD division) | 1,698 | `src/data/excel/File_…_141938.xlsx` → `ingest_excel.py` |
| Excel records (WRD division) | 483 | `src/data/excel/File_…_141553.xlsx` → `ingest_excel.py` |
| **Total** | **4,429** | Collection name: `langchain` |

A second store at `src/data/vectorstore` exists but holds an empty `langchain` collection (0 records) and is not used by the pipeline.

### What the "~4K BIS ingestion" actually contained

The 4,337 Excel records are real BIS catalogue entries. They were embedded, but the embedded text per record is minimal:

```
Standard Number: IS XXXX:YYYY
Title: <title>
Date of Publish: <date>
Type of Standard: <type>
Degree of Equivalence: <equiv>
BIS Division: CHD / LITD / WRD
```

No scope, no domain classification, no keywords. These records are searchable only by title-level similarity and are routinely outranked by unrelated standards on topic-specific queries (e.g., an automotive brake query returns CHD rubber/chemical records before the correct IS 9400).

### What the "113 Chroma records" were (pre-Phase 1)

The previous 113 IS-prefixed records were the output of `ingest_json.py` run against the original `bis_standards.json`, which had:

- 64 base records across 12 domains
- 16 cement standards from the PDF extractor (`ingest_pdfs.py`)
- 30 assistive product standards from the PDF extractor
- 10 QMS standards from the PDF extractor
- **8 duplicate entries** (IS 9079 × 2, IS 8034 × 2, IS 2062 × 2, IS 13252 × 2)
- Several misclassified standards (IS 784 in Food, IS 9079 in Agriculture, IS 13252 in Healthcare)
- Missing fields: `revision`, `source_document`

### Current IS knowledge base (post-Phase 1)

`src/data/bis_standards.json` — **92 records, 0 duplicates**, all fields populated.

| Domain | Records |
|---|---|
| Construction | 28 |
| Healthcare | 10 |
| Quality Management | 10 |
| Electrical | 6 |
| Mechanical | 5 |
| General Engineering | 5 |
| Safety | 5 |
| Automotive | 4 |
| Chemicals | 4 |
| Electronics | 4 |
| Food | 4 |
| Textile | 4 |
| Agriculture | 3 |
| **Total** | **92** |

Every record has: `standard_id`, `title`, `domain`, `scope`, `status`, `year`, `keywords`, `source`. Optional fields (`revision`, `amendment_no`, `source_document`) populated where available.

### PDF source files (in `data/pdf/`)

| File | Standards extracted |
|---|---|
| `COMPENDIUM-OF-CEMENT-STANDARDS.pdf` | 16 cement standards (IS 269 – IS 18189) |
| `Compendium-of-Indian-Standards-on-Assistive-Products.pdf` | 30 assistive product standards |
| `Rev-Modified-Compendium-of-QMS-Standards-1.pdf` | 10 IS/ISO QMS standards |

---

## 2. Current Architecture

```
Procurement Requirement (text)
        │
        ▼
BISRAGPipeline.get_recommendations()
        │
        ├─ _retrieve_with_scores()
        │      → HuggingFaceEmbeddings (all-MiniLM-L6-v2)
        │      → ChromaDB similarity_search_with_relevance_scores (k=12)
        │      → Filter: similarity >= 0.30
        │      → Sort: descending by score
        │
        ├─ Deduplication by standard_id (keep highest-scoring occurrence)
        │
        ├─ _build_context_block()
        │      → evidence dict per doc: standard_id, title, domain, scope,
        │        status, year, revision, source, similarity score
        │      → context string for LLM (top 8 unique candidates)
        │
        ├─ LLM call (OmniRoute / OpenAI-compatible)
        │      model: auto/smart (configurable via OMNIROUTE_MODEL)
        │      temp: 0, max_tokens: 500
        │      → JSON array: [{standard_id, rationale}, ...]
        │      → Fallback if LLM unavailable: return retriever-only results
        │
        ├─ _validate_recommendation()
        │      → Reject any standard_id not found in retrieved context text
        │      → Deduplicate LLM output
        │
        └─ Enrich each validated recommendation
               → title, domain, scope, status, year, revision,
                 source, similarity_score from metadata
               → Return [] if no confident match

Serving layers:
  ┌─ Streamlit (app.py)         → direct BISRAGPipeline import
  └─ FastAPI (backend/main.py)  → POST /api/discover, POST /api/insights
          ▲
          │ HTTP
  React frontend (bis-procurement/)
```

**Embedding model:** `sentence-transformers/all-MiniLM-L6-v2` (local, no API key)  
**Vector DB:** ChromaDB 0.4+, persistent, cosine similarity  
**LLM:** OmniRoute (OpenAI-compatible endpoint) — configured via `.env`:
  - `OMNIROUTE_API_KEY`
  - `OMNIROUTE_BASE_URL` (default: `http://localhost:20128/v1`)
  - `OMNIROUTE_MODEL` (default: `auto/smart`)

---

## 3. What Was Fixed

### 3.1 Knowledge Base (`src/data/bis_standards.json`)

| Issue | Fix |
|---|---|
| 8 duplicate standard_id entries | Removed all duplicates — 0 duplicates remain |
| IS 784 (prestressed concrete pipe) in Food domain | Moved to Construction |
| IS 9079 (scissors) in Agriculture domain | Moved to General Engineering |
| IS 1255 (cable installation) in Agriculture domain | Removed from Agriculture (not an ag standard) |
| IS 13252 (IT equipment) appearing in both Healthcare and Electronics | Kept in Electronics only |
| IS 8034 (submersible pump) duplicated in Mechanical and Agriculture | Kept in Mechanical; Agriculture retains IS 1520 (centrifugal pump) |
| IS 2062 (structural steel) duplicated in Construction and General Engineering | Kept in Construction |
| Missing `revision` field | Added to all records where applicable (10 records) |
| Missing `source_document` field | Added to PDF-sourced records (32 records) |
| Scope quality issues | Verified and enriched all 92 scope texts |

### 3.2 RAG Pipeline (`src/rag_pipeline.py`) — full rewrite

| Old behaviour | New behaviour |
|---|---|
| `_keyword_fallback()` short-circuited vector search for cement/asbestos queries, always returning IS 269/IS 459 | Removed entirely — all queries go through vector retrieval |
| Forced exactly 3 results by appending from `self.common_standards` (IS 269, IS 383, IS 2185) | Removed padding — variable result count, may be 0 |
| `k=7` retrieval, no similarity threshold | `k=12` retrieval, `_MIN_SIMILARITY=0.30` threshold filters irrelevant results |
| No deduplication before LLM call | Deduplication by `standard_id` before LLM (keeps highest-scoring occurrence) |
| LLM prompt did not forbid inventing standard IDs | Explicit rule: "Only recommend standards that appear in the provided context" |
| LLM prompt did not forbid minimum count forcing | Explicit rule: "Do NOT force a minimum number of recommendations" |
| LLM prompt did not allow empty response | Explicit instruction: "If no standard is relevant, return []" |
| `_validate_recommendation()` only checked text presence | Unchanged — standard_id must appear in retrieved context |
| Recommendations returned only `standard_id` + `rationale` | Recommendations enriched with `title`, `domain`, `scope`, `status`, `year`, `revision`, `source`, `similarity_score` |
| Scores described as "confidence" in some paths | Scores consistently described as `similarity_score` |
| Retriever-only fallback returned 5 results unconditionally | Retriever-only fallback returns all above-threshold results |

### 3.3 Ingestion (`src/ingest_json.py`)

- `build_page_content()` updated to embed `revision` and `source_document` fields
- `build_metadata()` updated to store `revision` and `source_document` in ChromaDB metadata

### 3.4 API (`backend/main.py`)

- `StandardRecommendation` model extended with optional fields: `title`, `domain`, `scope`, `status`, `year`, `revision`, `source`, `similarity_score`
- `matched_by` string updated to reflect actual retrieval path

### 3.5 Streamlit UI (`app.py`)

- Standard cards now display: `title`, `domain`, `status`, `year`, `revision`, `similarity_score`, `scope`, `source`
- "No match" message changed from warning to informative guidance

### 3.6 ChromaDB

- Deleted 113 stale IS-prefixed records (from previous ingestion with duplicates/misclassifications)
- Re-ingested 92 clean records from updated `bis_standards.json`
- 4,337 Excel records preserved unchanged

---

## 4. RAG Test Results

Tests run against the retrieval layer directly (ChromaDB + embeddings, no LLM).  
Test file: `src/test_rag.py`

### Retrieval test — 24 queries across 11 domains

| Domain | Queries | Hits | Result |
|---|---|---|---|
| Construction | 6 | 6 | PASS |
| Electrical | 3 | 3 | PASS |
| Mechanical | 2 | 2 | PASS |
| Healthcare | 3 | 3 | PASS |
| Safety | 2 | 2 | PASS |
| Quality Management | 2 | 2 | PASS |
| Automotive | 2 | 2 | PASS |
| Chemicals | 1 | 1 | PASS |
| Food | 1 | 1 | PASS |
| Textile | 1 | 1 | PASS |
| Negative (no match) | 1 | 1 | PASS |
| **Total** | **24** | **24** | **100%** |

### Representative similarity scores (top-1 result per query)

| Query | Standard | Score |
|---|---|---|
| TMT reinforcement bars Fe500 RCC columns | IS 1786:2008 | 0.7502 |
| QMS certification manufacturing | IS/ISO 9001:2015 | 0.7422 |
| Structural steel bridge E350 | IS 2062:2011 | 0.7384 |
| Cotton terry towels hospital GSM | IS 7702:1975 | 0.7259 |
| Industrial safety helmet hard hat | IS 2925:1984 | 0.7041 |
| Jaggery gur food grade quality | IS 1397:2018 | 0.7172 |
| PVC cables fixed wiring 1100V buildings | IS 694:2010 | 0.6620 |
| Rubber insulating gloves HV lineman | IS 4770:1991 | 0.6603 |
| Fly ash PPC mass concrete dam | IS 1489 (Part 1):2015 | 0.6773 |
| LED street lights municipal roads | IS 10322 (Part 5/Sec 3):2013 | 0.5957 |
| Hydraulic brake hose passenger car | IS 9400 (Part 1):1979 | 0.6134 |

### Negative test behaviour

Query: "Quantum computing hardware specifications for defence research laboratory"  
Result: **Empty list returned** (all candidates below 0.30 threshold).  
This is correct — no BIS standard in the knowledge base covers quantum computing.

### Notes on retrieval noise from Excel records

The 4,337 Excel records (CHD/LITD/WRD) contain only title-level text and no domain field. For several domains they introduce noise in positions 3–5 of results, but the correct IS record consistently appears in position 1 or 2 with substantially higher similarity than the Excel noise. The LLM validation step further filters out Excel records that lack meaningful context.

---

## 5. Remaining Issues

### High priority

| Issue | Impact | Recommendation |
|---|---|---|
| 4,337 Excel records have no `domain` field in metadata | Low-domain queries return LITD/CHD/WRD noise in top 3–5 slots alongside the correct result | Run `ingest_excel.py` with a domain-inference step (map BIS division to domain: CHD→Chemicals, LITD→Electronics, WRD→Water Resources) |
| Excel record embeddings lack scope/keywords — only title embedded | Semantic queries on topic don't find relevant Excel records | Re-embed Excel records with richer text (requires scope extraction, which is not available from the Excel catalogue) |
| OmniRoute LLM runs locally (`http://localhost:20128/v1`) | LLM-dependent path unavailable without running OmniRoute locally | Document OmniRoute setup; pipeline degrades gracefully to retriever-only when unavailable |

### Medium priority

| Issue | Impact | Recommendation |
|---|---|---|
| IS records for Food domain are limited (4 records: jaggery, reagent water, milk sampling, condensed milk) | Food procurement queries return correct results but with few options | Add more food standards: IS 1916 (edible oils), IS 1070:2012 (water quality), FSSAI-aligned standards |
| Agriculture domain has only 3 records | Ag procurement queries find IS 8034/IS 1520 (pumps) but miss crop-specific standards | Add: IS 13162 (drip irrigation), IS 12786 (knapsack sprayer is already there), fertilizer/pesticide standards |
| `src/data/vectorstore` contains an empty `langchain` collection (0 records) | Not used by pipeline, but may cause confusion | Delete or document as unused |
| `all_standards.txt` and `all_chroma_records.json` in repo root are stale | These were exports from before Phase 1 cleanup | Regenerate or delete |

### Low priority

| Issue | Impact | Recommendation |
|---|---|---|
| `ingest_pdfs.py` hard-wires scope text for PDF standards | If BIS updates these standards, scope text won't auto-update | Acceptable for Phase 1; Phase 2 could add PDF re-extraction |
| `HuggingFaceEmbeddings` deprecation warning | LangChain 0.3 will require `langchain-huggingface` | Replace import with `from langchain_huggingface import HuggingFaceEmbeddings` when upgrading |
| `src/test_retrieval.py` (old test) and `src/test_e2e.py` not updated for new pipeline | Old tests will produce misleading pass/fail signals | Replace with `src/test_rag.py` (Phase 1 test) for retrieval testing |
| React frontend (`bis-procurement/`) uses `mockApi.ts` in some paths | Frontend may show mock data instead of live API | Verify all frontend API calls route to backend correctly |

---

## 6. File Inventory

### Modified in Phase 1

| File | Change |
|---|---|
| `src/data/bis_standards.json` | Full rewrite: 92 clean records, 0 duplicates, fixed domains, added `revision`/`source_document` |
| `src/rag_pipeline.py` | Full rewrite: removed keyword_fallback, removed padding, added similarity threshold, dedup, LLM grounding rules, enriched output |
| `src/ingest_json.py` | Updated `build_page_content()` and `build_metadata()` for new fields |
| `backend/main.py` | Extended `StandardRecommendation` model with optional fields |
| `app.py` | Updated standard card display to show all metadata fields |

### Created in Phase 1

| File | Purpose |
|---|---|
| `src/test_rag.py` | Comprehensive retrieval test: 24 queries × 11 domains, similarity scoring, negative test |
| `IMPLEMENTATION_STATUS.md` | This document |

### Unchanged (existing, working)

| File | Notes |
|---|---|
| `src/ingest_excel.py` | Working; Excel records in Chroma preserved |
| `src/ingest_pdfs.py` | Working; PDF extraction logic verified |
| `backend/data/vectorstore/` | Active ChromaDB store; 4,429 records |
| `data/pdf/*.pdf` | 3 BIS compendium PDFs used as source documents |
| `bis-procurement/` | React frontend — not modified in Phase 1 |
| `api/index.py` | Vercel wrapper — not modified |
| `vercel.json` | Deployment config — not modified |
| `.env` | OmniRoute credentials — not modified |

---

## 7. How to Re-ingest

If `bis_standards.json` is updated:

```bash
# From repo root
python -m src.ingest_json --data src/data/bis_standards.json \
       --store backend/data/vectorstore --append
```

To rebuild from scratch (removes existing IS records first):

```bash
python -m src.ingest_json --data src/data/bis_standards.json \
       --store backend/data/vectorstore
# (omit --append to clear and rebuild)
```

To run the retrieval test:

```bash
python -m src.test_rag --store backend/data/vectorstore --k 10
```

---

*This document covers Phase 1 only. Phase 2 scope (frontend integration, domain expansion, LLM provider options) is not addressed here.*
