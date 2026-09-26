# StandardIQ Project Status

## Overview
StandardIQ is an AI-powered Bureau of Indian Standards (BIS) retrieval and tender compliance verification platform.

## Current Status
- **Audit Phase Complete:** Comprehensive testing and performance readiness audit generated and saved to `TESTING_PERFORMANCE_CAPABILITY_AUDIT.md`.
- **System Architecture Audited:**
  - Backend: FastAPI service (`backend/main.py`)
  - RAG Core: ChromaDB + `sentence-transformers/all-MiniLM-L6-v2` (`src/rag_pipeline.py`)
  - Tender Engine: PyMuPDF + LLM / 4-tier Regex fallback (`src/tender_pipeline.py`)
  - Frontend: Modern Vite React SPA (`bis-procurement/`) + Legacy CRA (`frontend/`) + Streamlit (`app.py`)
  - Vectorstore: 4,429 ingested records (92 curated JSON with deep scope + 4,337 catalog Excel titles)

## Modified / Created Files
- `TESTING_PERFORMANCE_CAPABILITY_AUDIT.md` (Created comprehensive technical audit across 9 sections)
- `.ai/PROJECT.md`, `.ai/TASKS.md`, `.ai/CHAT.md` (Updated project tracking)

## Next Steps
- Execute Phase 1 & 2 of testing roadmap (Unit validation + IR evaluation metric benchmark)
- Compile 50-query golden test dataset with ground-truth BIS standards
- Transition full frontend workflows exclusively to `bis-procurement` (Vite)
