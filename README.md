# StandardsIQ

**AI-Assisted BIS Standards Discovery for Procurement**

Team NEXUS · Smart India Hackathon 2026 · Problem Statement 26108

---

## Problem

Procurement officers, manufacturers, and MSEs need to identify which Bureau of Indian Standards (BIS) apply to a product or specification. This currently requires manual catalogue searches, domain expertise, or expensive consulting. There is no semantic search tool that lets a user describe a requirement in plain language and get relevant BIS standards back.

## Solution

StandardsIQ is a Retrieval-Augmented Generation (RAG) system that takes a procurement specification in plain language and returns the most relevant BIS standards, with an explanation of why each one may apply.

The system does **not** claim to be a compliance authority. It is a discovery and shortlisting tool. All results should be verified against official BIS documentation before procurement.

---

## Architecture

```
User Specification
        ↓
Semantic Embedding (all-MiniLM-L6-v2)
        ↓
ChromaDB Vector Retrieval (top-7 docs)
        ↓
LLM Reasoning (OmniRoute / OpenAI-compatible)
        ↓
Validated Recommendation + Rationale
```

**Four-layer pipeline:**
1. Deterministic keyword fallback (30+ rules for common product types)
2. ChromaDB vector search over 4,450 indexed BIS records
3. LLM reranking and explanation (grounded in retrieved context only)
4. Validation — LLM output is checked against retrieved documents; invented standards are rejected

**LLM-unavailable fallback:** If the LLM endpoint is offline, the system returns the top retrieved records directly with a clear label — recommendations do not disappear entirely.

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, React Router v6, Axios |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Vector DB | ChromaDB (persistent, local) |
| Embeddings | HuggingFace all-MiniLM-L6-v2 |
| LLM | OmniRoute (OpenAI-compatible proxy) |

---

## BIS Data Sources

The knowledge base currently contains **4,450 records** from two types of source:

### Source 1 — Rich domain records (113 standards)
Sourced from BIS compendium documents and publicly known catalogue entries.
Each record includes: standard ID, title, domain, scope description, year, keywords.

Domains covered: Construction, Electrical, Mechanical, Healthcare, Agriculture, Food, Textile, Automotive, Electronics, Safety, Chemicals, General Engineering.

### Source 2 — BIS Published Standards List Excel catalogues (4,337 records)
Official BIS division catalogue exports. These contain catalogue metadata only — no full standard text.

| Division | Records |
|----------|---------|
| WRD (Water Resources) | 483 |
| CHD (Chemical) | 2,156 |
| LITD (Electronics/IT) | 1,698 |

**Important:** Source 2 records retrieve by title similarity. They do not contain scope descriptions, technical requirements, or compliance details. No missing metadata has been fabricated.

---

## How to Run Locally

### Prerequisites
- Python 3.12
- Node.js 18+
- OmniRoute running at `http://localhost:20128/v1` (or set `OMNIROUTE_BASE_URL` in `.env`)

### Backend

```bash
# From repo root — install dependencies
pip install -r backend/requirements.txt

# Start the API server
uvicorn backend.main:app --reload
# Runs at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install      # only needed once
npm start
# Runs at http://localhost:3000
```

The frontend proxies `/api/*` to `http://localhost:8000` via the CRA proxy setting in `package.json`.

### Environment

A `.env` file is required at the repo root. Minimum required key:

```
OMNIROUTE_API_KEY=<your key>
OMNIROUTE_BASE_URL=http://localhost:20128/v1
```

Without a working LLM endpoint the system falls back to retriever-only mode — recommendations are still returned, but without LLM-generated explanations.

---

## Recommendation Workflow

1. Navigate to **Recommendations** tab
2. Enter a product or procurement specification in plain language
3. The system runs the RAG pipeline and returns up to 5 ranked standards
4. Each result shows: standard ID, title, domain, match score (heuristic), and a rationale
5. Use **Compare** to view two or more standards side by side
6. Use **AI Insights** panel to ask follow-up questions about the retrieved standards
7. Use **Verify** to look up a specific standard ID

---

## Known Limitations

- **LLM dependency:** Full explanations require the OmniRoute LLM endpoint to be reachable. When offline, retriever-only results are returned with a clear label.
- **Match scores are heuristic:** The percentage scores shown in the UI are computed client-side from keyword overlap and are not true confidence values.
- **Source 2 retrieval quality:** The 4,337 Excel catalogue records retrieve by title only and lack scope context. Retrieval quality for these is lower than for Source 1 records.
- **Not a compliance authority:** The system does not determine whether a standard is legally mandatory for a product. All results require verification against official BIS documents and applicable regulations.
- **Hallucination guard is conservative:** The LLM validation step may reject valid recommendations if the exact standard ID string does not appear in the retrieved document text.
- **Coverage:** The knowledge base covers a subset of the full BIS catalogue. Many standards are not yet indexed.

---

## Project Structure

```
├── backend/            FastAPI application
│   ├── main.py         API routes (/api/discover, /api/insights, /health)
│   └── data/
│       └── vectorstore/ ChromaDB persistent store (4,450 records)
├── frontend/           React application (Create React App)
│   └── src/
│       ├── pages/      Dashboard, Search, Recommendations, Compare, ...
│       ├── components/ StandardCard, AIInsights, Layout, ...
│       └── services/   api.js (all backend calls)
├── src/                Python shared modules
│   ├── rag_pipeline.py Core RAG pipeline
│   ├── ingest_excel.py Excel catalogue ingestion
│   ├── ingest_json.py  JSON dataset ingestion
│   ├── ingest_pdfs.py  PDF compendium ingestion
│   └── data/
│       ├── bis_standards.json  Rich domain records
│       └── excel/              BIS division Excel catalogues
└── .env                Local secrets (not committed)
```

---

## Disclaimer

This is a prototype developed for Smart India Hackathon 2026.
It is not affiliated with, endorsed by, or a product of the Bureau of Indian Standards.
All standard identifications should be verified against official BIS publications before use in procurement or compliance decisions.
