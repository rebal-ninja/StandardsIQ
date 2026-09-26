from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import sys
import os
import time
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.rag_pipeline import BISRAGPipeline
from src.tender_pipeline import process_tender, tender_result_to_dict, TenderError
from typing import Optional

app = FastAPI(
    title="StandardsIQ API",
    description="AI-assisted BIS standards discovery for procurement specifications. Team NEXUS · SIH 2026 · Problem Statement 26108.",
    version="1.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy pipeline: avoid heavy imports/initialization at module import time
pipeline: Optional[BISRAGPipeline] = None


@app.on_event("startup")
async def create_and_warm_pipeline():
    """Create the pipeline on startup and warm it up to avoid cold-start latency."""
    global pipeline
    print("FastAPI startup: initializing pipeline...")
    try:
        pipeline = BISRAGPipeline()
        # run warm-up in a thread to avoid blocking the event loop
        await asyncio.to_thread(pipeline.warm_up_retriever)
        print("Pipeline initialized and warmed up")
    except Exception as e:
        # log the error; pipeline will remain None and endpoints should return 503
        pipeline = None
        print(f"Pipeline initialization failed on startup: {e}")

# Request/Response models
class DiscoverRequest(BaseModel):
    description: str

class StandardRecommendation(BaseModel):
    standard_id: str
    rationale: str
    title: Optional[str] = None
    domain: Optional[str] = None
    scope: Optional[str] = None
    status: Optional[str] = None
    year: Optional[str] = None
    revision: Optional[str] = None
    source: Optional[str] = None
    similarity_score: Optional[float] = None

class DiscoverResponse(BaseModel):
    recommendations: list[StandardRecommendation]
    latency_seconds: float
    matched_by: str

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "BIS Discovery API"}

# Main discovery endpoint
@app.post("/api/discover", response_model=DiscoverResponse)
async def discover_standards(request: DiscoverRequest):
    """
    Discover applicable BIS standards for a product description.
    
    Args:
        request: DiscoverRequest with product description
        
    Returns:
        DiscoverResponse with 3 recommended standards and latency info
    """
    if not request.description or len(request.description.strip()) == 0:
        raise HTTPException(status_code=400, detail="Description cannot be empty")
    
    try:
        # Ensure pipeline was initialized successfully
        if pipeline is None:
            raise HTTPException(status_code=503, detail="Service unavailable: pipeline not initialized")

        start_time = time.time()
        recommendations = pipeline.get_recommendations(request.description)
        latency = time.time() - start_time

        # Determine if matched by fallback
        matched_by = "Fallback (retriever-only)" if pipeline.last_fallback else "Retriever + LLM"

        return DiscoverResponse(
            recommendations=[
                StandardRecommendation(**{
                    k: v for k, v in rec.items()
                    if k in StandardRecommendation.model_fields
                })
                for rec in recommendations
            ],
            latency_seconds=round(latency, 4),
            matched_by=matched_by
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── AI Insights ─────────────────────────────────────────────────────────────

_INSIGHTS_SYSTEM_PROMPT = """You are the AI Insights assistant inside StandardsIQ.

Your job is to explain the Indian Standards returned by the StandardsIQ recommendation system.

Use ONLY the information provided in the context below. Do not invent:
- standard numbers or titles
- technical requirements or scope details
- certification or compliance requirements
- revision or amendment information
- BIS facts that are not present in the context

If the requested information is not present in the context, say exactly:
"That information is not available in the current knowledge base."

When explaining relevance, describe why a retrieved standard may relate to the user's requirement based on what is in the context — do not claim legal or mandatory applicability unless that is explicitly stated in the context.

When comparing standards, compare only the information provided.

Keep answers concise (3–6 sentences) and easy to understand for a procurement professional.

End answers about compliance or certification with this disclaimer:
"This is an AI-assisted discovery result and should be verified against the applicable BIS standard and official procurement requirements."
"""


class InsightsStandard(BaseModel):
    standard_id: str
    title: str = ""
    domain: str = ""
    scope: str = ""
    rationale: str = ""


class InsightsRequest(BaseModel):
    question: str
    product_description: str = ""
    recommendations: list[InsightsStandard] = []


class InsightsResponse(BaseModel):
    answer: str


@app.post("/api/insights", response_model=InsightsResponse)
async def insights(request: InsightsRequest):
    """
    Answer a user question grounded in the recommendation context.
    Uses the existing OmniRoute LLM client — no new retrieval system.
    """
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if pipeline is None:
        raise HTTPException(status_code=503, detail="Service unavailable: pipeline not initialized")

    # Build context string from the recommendations the frontend already has
    context_parts = []
    if request.product_description:
        context_parts.append(
            f"User's procurement requirement:\n{request.product_description.strip()}"
        )

    if request.recommendations:
        context_parts.append("Recommended standards:")
        for i, std in enumerate(request.recommendations, 1):
            parts = [f"{i}. {std.standard_id}"]
            if std.title:
                parts.append(f"   Title: {std.title}")
            if std.domain:
                parts.append(f"   Domain: {std.domain}")
            if std.scope:
                parts.append(f"   Scope: {std.scope}")
            if std.rationale:
                parts.append(f"   Why it was recommended: {std.rationale}")
            context_parts.append("\n".join(parts))
    else:
        context_parts.append("No recommendation context is available.")

    context_block = "\n\n".join(context_parts)
    user_message = (
        f"Context:\n{context_block}\n\n"
        f"Question: {request.question.strip()}"
    )

    try:
        response = await asyncio.to_thread(
            pipeline.client.chat.completions.create,
            model=pipeline.llm_model,
            messages=[
                {"role": "system", "content": _INSIGHTS_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        answer = response.choices[0].message.content.strip()
        return InsightsResponse(answer=answer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")


# Batch discovery endpoint
@app.post("/api/batch-discover")
async def batch_discover(requests: list[DiscoverRequest]):
    """
    Batch discovery for multiple queries.
    """
    results = []
    for req in requests:
        try:
            result = await discover_standards(req)
            results.append({"query": req.description, "result": result})
        except Exception as e:
            results.append({"query": req.description, "error": str(e)})
    
    return {"results": results}

# ─── Tender PDF Scanner ──────────────────────────────────────────────────────

MAX_TENDER_UPLOAD_MB = 50

@app.post("/api/scan-tender")
async def scan_tender(file: UploadFile = File(...)):
    """
    Scan a tender PDF and return procurement items with BIS standard recommendations.

    Accepts: multipart/form-data with a single PDF file field named 'file'.

    Returns a JSON object with:
      - products: list of extracted items, each with:
          - product_name, specification, source_pages, raw_context
          - recommendations: list of BIS standards with evidence
      - page_count, text_pages, scanned_pages, total_chars
      - extraction_method, truncated, warnings, processing_time_ms

    Error responses:
      400 — not a PDF, or PDF validation failed (empty/corrupt/scanned/oversized)
      503 — pipeline not initialized
      500 — unexpected processing error
    """
    if pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="Service unavailable: pipeline not initialized."
        )

    # Validate content-type (basic check — real validation happens in pipeline)
    content_type = (file.content_type or "").lower()
    filename = file.filename or "upload.pdf"

    if not filename.lower().endswith(".pdf") and "pdf" not in content_type:
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf document."
        )

    # Read file bytes
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {e}")

    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Run the full tender pipeline in a thread (CPU-bound PDF + embedding work)
    try:
        result_dict = await asyncio.to_thread(
            _run_tender_pipeline_sync,
            pdf_bytes,
            filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Tender processing failed: {str(e)}"
        )

    # If the pipeline itself reported a fatal extraction failure, return 400
    if (
        result_dict.get("extraction_method") == "failed"
        and not result_dict.get("products")
        and result_dict.get("warnings")
    ):
        raise HTTPException(
            status_code=400,
            detail=result_dict["warnings"][0]
        )

    return result_dict


def _run_tender_pipeline_sync(pdf_bytes: bytes, filename: str) -> dict:
    """
    Synchronous wrapper called from asyncio.to_thread.
    Uses the module-level pipeline (already initialized at startup).
    """
    result = process_tender(
        pdf_bytes=pdf_bytes,
        filename=filename,
        rag_pipeline=pipeline,
        llm_client=pipeline.client,
        llm_model=pipeline.llm_model,
    )
    return tender_result_to_dict(result)


# Metadata endpoint
@app.get("/api/metadata")
async def metadata():
    """
    Return system metadata and available standards info.
    """
    return {
        "system": "StandardsIQ",
        "team": "Team NEXUS",
        "event": "SIH 2026",
        "problem_statement": "26108",
        "version": "1.0.0",
        "common_standards": pipeline.common_standards if pipeline else [],
        "fallback_enabled": True,
        "lru_cache_enabled": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
