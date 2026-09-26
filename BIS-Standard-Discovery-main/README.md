# StandardsIQ

**AI-Assisted BIS Standards Discovery for Procurement**

Team NEXUS · Smart India Hackathon 2026 · Problem Statement 26108

---

## What It Does

Procurement officers, manufacturers, and MSEs need to identify which Bureau of Indian Standards (BIS) apply to a product or specification. This currently requires manual catalogue searches, domain expertise, or expensive consulting.

StandardsIQ is a Retrieval-Augmented Generation (RAG) system that accepts a procurement specification in plain language and returns the most relevant BIS standards, with an AI-generated explanation of why each one may apply.

The system is a **discovery and shortlisting tool**. All results should be verified against official BIS documentation before procurement decisions are made.

---

## Architecture

```
User Specification
        ↓
Semantic Embedding  (all-MiniLM-L6-v2)
        ↓
ChromaDB Vector Retrieval  (top-10 candidates)
        ↓
Similarity filtering  (threshold: 0.30)
        ↓
LLM Reasoning  (OmniRoute / OpenAI-compatible)
        ↓
Validated Recommendation + Rationale
```

**Four-layer pipeline:**
1. Deterministic keyword fallback (30+ rules for common product types)
2. ChromaDB vector search over **4,429 indexed BIS records**
3. LLM reranking and explanation (grounded in retrieved context only)
4. Validation — LLM output is checked against retrieved documents; invented standards are rejected

**LLM-unavailable fallback:** If the LLM endpoint is offline, the system returns the top retrieved records directly with a `Fallback (retriever-only)` label. Recommendations are still returned.

---

## Technology Stack

| Component    | Technology                                        |
|-------------|---------------------------------------------------|
| Frontend     | React 19, React Router v6, Vite, Tailwind v4, TypeScript |
| Backend      | Python 3.12, FastAPI, Uvicorn                     |
| Vector DB    | ChromaDB (persistent, local)                      |
| Embeddings   | HuggingFace all-MiniLM-L6-v2                      |
| LLM          | OmniRoute (OpenAI-compatible proxy)               |

---

## BIS Knowledge Base

The knowledge base contains **4,429 records** from two source types:

### Source 1 — Rich domain records (113 standards)
Sourced from BIS compendium documents. Each record includes: standard ID, title, domain, scope, year, keywords.

Domains: Construction, Electrical, Mechanical, Healthcare, Agriculture, Food, Textile, Automotive, Electronics, Safety, Chemicals, General Engineering.

### Source 2 — BIS Published Standards List Excel catalogues (4,337 records)
Official BIS division catalogue exports (metadata only — no full standard text).

| Division | Records |
|----------|---------|
| WRD (Water Resources) | 483 |
| CHD (Chemical) | 2,156 |
| LITD (Electronics/IT) | 1,698 |

---

## Project Structure

```
BIS-Standard-Discovery-main/          ← repo root — run ALL commands from here
│
├── backend/                          ← FastAPI application
│   ├── main.py                       ← API entrypoint (/api/discover, /api/insights, /api/scan-tender)
│   ├── requirements.txt              ← all Python dependencies
│   ├── .env.example                  ← copy to .env at REPO ROOT and fill in keys
│   └── data/
│       └── vectorstore/              ← ChromaDB persistent store (4,429 embeddings)
│
├── src/                              ← Python shared modules (imported by backend)
│   ├── rag_pipeline.py               ← Core RAG pipeline
│   ├── tender_pipeline.py            ← PDF tender scanner
│   └── data/                         ← Source BIS datasets (JSON, Excel)
│
├── bis-procurement/                  ← Frontend (Vite + React + TypeScript)
│   ├── package.json
│   ├── vite.config.ts                ← Proxies /api/* to backend in dev
│   └── src/
│       ├── api.ts                    ← All backend API calls
│       ├── App.tsx                   ← Router with all routes
│       └── pages/                   ← Dashboard, Search, Recommendations, ScanTender, ...
│
├── frontend/                         ← OLD Create React App frontend (not active)
│                                     ← Do not use — superseded by bis-procurement/
│
├── .env                              ← Local secrets (not committed to git)
└── requirements.txt                  ← Full Python dependency list (alternative to backend/requirements.txt)
```

---

## How to Run Locally

### Prerequisites

- Python 3.12
- Node.js 18+
- OmniRoute running locally at `http://localhost:20128/v1`  
  *(without OmniRoute the system still works in retriever-only fallback mode)*

---

### Step 1 — Create the `.env` file

At the **repo root** (`BIS-Standard-Discovery-main/`), create a `.env` file:

```
OMNIROUTE_API_KEY=your_omniroute_api_key_here
OMNIROUTE_BASE_URL=http://localhost:20128/v1
```

See `backend/.env.example` for all available options.

---

### Step 2 — Install Python dependencies

Open a terminal at the **repo root**:

```powershell
pip install -r backend/requirements.txt
```

---

### Step 3 — Start the backend

From the **repo root** (`BIS-Standard-Discovery-main/`):

```powershell
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The backend starts at: **http://127.0.0.1:8000**

Interactive API docs: **http://127.0.0.1:8000/docs**

Health check: **http://127.0.0.1:8000/health**

> **Important:** Run from the repo root, not from inside `backend/`. The backend imports
> from `src/` (e.g. `from src.rag_pipeline import BISRAGPipeline`) which requires
> the repo root to be on the Python path.

---

### Step 4 — Start the frontend

Open a **second terminal** in the `bis-procurement/` directory:

```powershell
cd bis-procurement
npm install
npm run dev
```

The frontend starts at: **http://localhost:5173**

> The Vite dev server automatically proxies `/api/*` requests to `http://127.0.0.1:8000`,
> so no CORS configuration is needed during development.

---

### Quick-start (both steps together)

Terminal 1 — backend:
```powershell
cd BIS-Standard-Discovery-main
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:
```powershell
cd BIS-Standard-Discovery-main\bis-procurement
npm run dev
```

---

## SIH Demo Flow

1. Open **http://localhost:5173/landing** — public landing page
2. Click **Start Discovering** — opens the home dashboard
3. Type a procurement requirement, e.g.:  
   `High tensile structural steel for bridge construction`
4. Click **Discover Standards** — calls `POST /api/discover`
5. BIS standards appear with standard ID, title, domain, scope, and rationale
6. Click **Open with AI Insights** — opens the AI Insights panel
7. Ask a question, e.g. `Why was this standard recommended?`
8. Click **Compare** on any result — navigate to the comparison page

Other demo queries:
- `Disposable latex examination gloves for hospital use`
- `Precast concrete pipes for drainage`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/discover` | Discover BIS standards for a procurement description |
| POST | `/api/insights` | AI question-answering grounded in retrieved context |
| POST | `/api/scan-tender` | Scan a tender PDF and extract procurement items |
| GET | `/api/metadata` | System metadata and configuration info |

### Example: POST /api/discover

```json
POST http://127.0.0.1:8000/api/discover
Content-Type: application/json

{
  "description": "High tensile structural steel for bridge construction"
}
```

---

## Production Build

```powershell
cd bis-procurement
npm run build
```

Output is written to `bis-procurement/dist/`. The `dist/` folder can be served by any
static host. Ensure `VITE_API_BASE_URL` is set to the production backend URL before building.

---

## Known Limitations

- **LLM dependency:** Full explanations require the OmniRoute endpoint to be reachable. When offline, retriever-only results are returned with a clear `Fallback (retriever-only)` label.
- **Match scores are heuristic:** Similarity scores are computed by the vector search and are not official BIS confidence values.
- **Source 2 retrieval quality:** The 4,337 Excel catalogue records contain metadata only (no scope text). Retrieval quality for these is lower than for Source 1 records.
- **Not a compliance authority:** The system does not determine whether a standard is legally mandatory. All results require verification against official BIS documents.
- **Coverage:** The knowledge base covers a subset of the full BIS catalogue.

---

## Disclaimer

This is a prototype developed for Smart India Hackathon 2026.
It is not affiliated with, endorsed by, or a product of the Bureau of Indian Standards.
All standard identifications should be verified against official BIS publications before use in procurement or compliance decisions.
