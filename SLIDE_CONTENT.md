# StandardsIQ — SIH 2026 Presentation
## Team NEXUS | Problem Statement 26108

---

## SLIDE 1: PROBLEM STATEMENT

### Title: "Finding Applicable BIS Standards is Hard"

**Problem Overview:**
- Procurement teams, MSEs, and manufacturers struggle to identify which Indian Standards apply to their products
- Current process: Manual research, consulting, or hiring compliance specialists
- **Time:** Days to weeks to identify applicable standards
- **Cost:** Significant expert consultation fees
- **Risk:** Missing applicable standards or citing incorrect ones

**Key Pain Points:**
1. **Volume** — BIS has published thousands of standards across dozens of technical domains
2. **Accessibility Gap** — Most small enterprises lack dedicated standards/compliance teams
3. **Language Barrier** — Standards documents are highly technical
4. **Discoverability** — No semantic search exists for BIS standards by product description

**Impact:**
- Delays in procurement and product commercialisation
- Compliance risk
- Wasted effort on manual catalogue searches

---

## SLIDE 2: SOLUTION OVERVIEW

### Title: "StandardsIQ — AI-Assisted Standards Discovery"

**Our Solution:**
StandardsIQ is a Retrieval-Augmented Generation (RAG) system that takes a
procurement specification in plain language and returns the most relevant
BIS standards, with an explanation of why each one may apply.

**Key Capabilities:**
- Semantic search over a BIS standards knowledge base
- Retriever + LLM pipeline for context-aware recommendations
- AI Insights Q&A: ask follow-up questions about retrieved standards
- Compare, verify, and history features for procurement workflows
- Graceful offline fallback when LLM is unavailable

**How It Works:**
1. User describes a product or procurement requirement in plain language
2. The system embeds the query and retrieves relevant standards from ChromaDB
3. An LLM reasons over the retrieved context to explain relevance
4. Results are presented with rationale and confidence indicators

**Target Users:**
- Procurement officers in government and PSUs
- Manufacturing MSEs
- Quality and compliance teams
- Product development engineers

---

## SLIDE 3: SYSTEM ARCHITECTURE

### Title: "RAG Pipeline on a Local-First Stack"

```
┌──────────────────────────────────────────────────────────┐
│                   USER INTERFACE LAYER                    │
│  React 18 (Create React App)                             │
│  Pages: Dashboard, Search, Recommendations, Compare,     │
│         Scan Tender, Verify, History, AI Insights        │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP / REST
                      ▼
┌──────────────────────────────────────────────────────────┐
│                   BACKEND API LAYER                       │
│  FastAPI + Uvicorn                                       │
│  POST /api/discover   — main recommendation endpoint     │
│  POST /api/insights   — AI Q&A on retrieved standards    │
│  GET  /health         — health check                     │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│                   RAG PIPELINE LAYER                      │
│  Layer 1: Deterministic keyword fallback (30+ rules)     │
│  Layer 2: ChromaDB vector retrieval (top-7 docs)         │
│  Layer 3: LLM reasoning over retrieved context           │
│  Layer 4: Validation — LLM cannot return a standard      │
│            not present in the retrieved documents        │
│  Fallback: If LLM is unavailable, returns retriever      │
│            results directly with a clear label           │
└──────────┬──────────────────────────┬────────────────────┘
           ▼                          ▼
┌──────────────────┐       ┌──────────────────────┐
│   VECTOR STORE   │       │    LLM SERVICE        │
│   ChromaDB       │       │    OmniRoute proxy    │
│   4,450 records  │       │    (OpenAI-compat.)   │
│   all-MiniLM     │       │                       │
│   L6-v2 embeds   │       │                       │
└──────────────────┘       └──────────────────────┘
```

**Technology Stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Axios |
| Backend | Python, FastAPI, Uvicorn |
| Vector DB | ChromaDB (persistent, local) |
| Embeddings | HuggingFace all-MiniLM-L6-v2 |
| LLM | OmniRoute (OpenAI-compatible proxy) |

---

## SLIDE 4: KNOWLEDGE BASE

### Title: "What's in the Knowledge Base"

**Current indexed records: 4,450**

**Source 1 — Rich JSON/PDF records (113 standards)**
- Sourced from BIS compendium documents and publicly known catalogue entries
- Each record contains: standard ID, title, domain, scope description, year, keywords
- Domains: Construction, Electrical, Mechanical, Healthcare, Agriculture, Food,
  Textile, Automotive, Electronics, Safety, Chemicals, General Engineering

**Source 2 — BIS Published Standards List Excel catalogue (4,337 records)**
- WRD (Water Resources Dept): 483 standards
- CHD (Chemical Dept): 2,156 standards (one duplicate file automatically deduplicated)
- LITD (Electronics/IT Dept): 1,698 standards
- Catalogue fields: Standard Number, Title, Date of Publish,
  Type of Standard, Degree of Equivalence

**Important distinction:**
- Source 1 records have rich scope text → higher retrieval quality for those standards
- Source 2 records have catalogue metadata only → retrieval based on title similarity
- No technical scope, compliance requirements, or revision history has been fabricated

**Retrieval pipeline:**
- Embedding model: all-MiniLM-L6-v2 (384-dim, runs locally)
- Retriever returns top-7 candidates by cosine similarity
- LLM reranks and explains relevance in context

---

## SLIDE 5: DEMO WALKTHROUGH

### Title: "Live Demo — StandardsIQ in Action"

**Demo Query 1: Common Construction Material**
```
Input: "High tensile structural steel for bridge construction"

Retrieved: IS 2062:2011 — Hot Rolled Medium and High Tensile
           Structural Steel
           IS 1786:2008 — High Strength Deformed Steel Bars

Explanation: LLM explains that IS 2062 covers structural steel
grades used in bridges; IS 1786 covers reinforcement steel.
```

**Demo Query 2: Healthcare Procurement**
```
Input: "Disposable latex examination gloves for hospital use"

Retrieved: IS 4148:1980 — Surgical Dressings
           IS 4770:1991 — Rubber Gloves (Electrical Insulating)
           IS 15223:2015 — Medical Device Symbols

Note: Catalogue-only records for latex gloves in CHD are now
also retrievable from the knowledge base.
```

**Demo Query 3: Water Infrastructure**
```
Input: "Precast concrete pipes for drainage"

Retrieved: IS 269:2015 — Ordinary Portland Cement
           IS 458:2003 — Precast Concrete Pipes
           IS 383:2016 — Coarse and Fine Aggregates
```

**AI Insights Panel (live Q&A):**
- "Why was this standard recommended?"
- "What does this standard cover?"
- "Compare these two standards."
- Answers grounded in retrieved context only — will say
  "That information is not available in the current knowledge base"
  if the answer cannot be found in the retrieved documents

---

## SLIDE 6: EVALUATION

### Title: "System Performance"

**Test set:** Internal evaluation on cement and construction domain queries

| Metric | Result | Notes |
|--------|--------|-------|
| Hit Rate @3 | ~80% | On the evaluated query set |
| Avg Latency (warm) | ~1.7s | After retriever warm-up |
| Avg Latency (LLM path) | ~3–5s | Depends on OmniRoute response |
| LLM-unavailable fallback | Works | Returns retriever results directly |
| Hallucination guard | Active | LLM output validated against retrieved docs |

**Known limitations:**
- LLM cannot be called when OmniRoute is offline → fallback to retriever-only mode
- Match scores shown in the UI are heuristic client-side estimates, not true confidence values
- Source 2 (Excel catalogue) records retrieve well by title but lack scope context
- The system does not verify legal/mandatory applicability of any standard

---

## SLIDE 7: IMPACT AND USE CASES

### Title: "Who Benefits and How"

**Government Procurement Officers**
- Quickly identify applicable standards for tender specifications
- Reduce back-and-forth with technical teams

**Manufacturing MSEs**
- Affordable alternative to expensive standards consultants
- Instant first-pass identification before engaging BIS directly

**Quality and Compliance Teams**
- Faster standards research during product development
- Structured comparison of candidate standards

**Procurement Analysts**
- Scan tender documents and map procurement items to standards
- History and compare features for audit trails

---

## SLIDE 8: TEAM AND TECHNOLOGY

### Title: "Team NEXUS — SIH 2026"

**Team:** Team NEXUS
**Problem Statement:** 26108
**Event:** Smart India Hackathon 2026

**Open-source components used:**
- ChromaDB — open-source vector database
- HuggingFace sentence-transformers — all-MiniLM-L6-v2
- LangChain — RAG orchestration utilities
- FastAPI — REST API framework
- React — frontend UI library

**Data source:**
- Bureau of Indian Standards (BIS) published standards catalogues
- BIS compendium documents (publicly available)

---

## KEY TAKEAWAYS

### Title: "What StandardsIQ Delivers Today"

**What we built:**
- RAG-based BIS standards discovery system
- 4,450 indexed standards records (WRD, CHD, LITD + rich domain records)
- Full-stack: React frontend + FastAPI backend + ChromaDB + LLM
- AI Insights Q&A grounded in retrieved context
- Graceful degradation when LLM is unavailable

**Honest scope:**
- This is a working prototype, not a production compliance authority
- Recommendations require verification against official BIS documents
- The system is a discovery and shortlisting tool, not a final compliance decision

**Potential next steps:**
- Ingest additional BIS division catalogues
- Add full standard document text for richer retrieval
- Integrate BIS official document links
- Add batch tender scanning with structured output
