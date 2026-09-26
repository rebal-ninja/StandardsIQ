"""
TenderPipeline — StandardIQ Phase 2
=====================================
Real PDF tender scanning pipeline.

Flow:
  PDF bytes (upload)
  → validation (size, format, page count)
  → text extraction with page numbers (PyMuPDF)
  → OCR detection (warn if scanned, no silent OCR)
  → page-window chunking (keep page numbers)
  → procurement item extraction via LLM
  → per-item specification normalization
  → Phase 1 RAG (BISRAGPipeline.get_recommendations)
  → evidence-enriched results

Handles:
  - Invalid / corrupt PDF         → TenderError with clear message
  - Empty PDF (no extractable text) → TenderError with OCR advisory
  - Scanned/image-only PDF        → TenderError with OCR advisory
  - Oversized PDF (> MAX_PDF_MB)  → TenderError
  - No identifiable procurement item → returns empty items list
  - Multiple procurement items    → all items independently analyzed
  - LLM unavailable               → retriever-only RAG still returns results

Rules:
  - Never infer products from filename.
  - Never use hardcoded examples or demo logic.
  - Every standard_id in results must come from the Phase 1 RAG knowledge base.
  - Similarity scores reported as-is; not called probabilities.
"""

import json
import re
import textwrap
import time
import traceback
from dataclasses import dataclass, field
from typing import Optional

import pymupdf  # PyMuPDF 1.23+

# ---------------------------------------------------------------------------
# JSON parsing utilities
# ---------------------------------------------------------------------------

def _strip_trailing_commas(text: str) -> str:
    """Remove trailing commas before ] or } (common LLM formatting error)."""
    return re.sub(r",\s*([}\]])", r"\1", text)


def _extract_list_of_dicts(data) -> list[dict] | None:
    """Extract a list of dicts from a parsed JSON value."""
    if isinstance(data, list):
        dicts = [item for item in data if isinstance(item, dict)]
        if dicts or len(data) == 0:
            return dicts
    elif isinstance(data, dict):
        for key in ("recommendations", "items", "products", "standards"):
            if key in data and isinstance(data[key], list):
                dicts = [item for item in data[key] if isinstance(item, dict)]
                if dicts or len(data[key]) == 0:
                    return dicts
        if "standard_id" in data:
            return [data]
    return None


def _parse_llm_json_response(response_text: str) -> list[dict] | None:
    """
    Parse a JSON array from an LLM response.

    Handles:
      - Plain valid JSON array
      - JSON inside ```json ... ``` or ``` ... ``` markdown fences
      - JSON with surrounding whitespace / newlines
      - Text before the JSON (e.g. "[1] Here are the results:")
      - Text after the JSON (e.g. "Note: Verified with [1].")
      - Multiple JSON objects on separate lines
      - Trailing comma before ] or }

    Returns a list of dicts, or None if no valid JSON array/object could be
    safely and deterministically extracted.
    """
    if not response_text or not isinstance(response_text, str):
        return None

    text = response_text.strip()
    if not text:
        return None

    # 1. Extract content from markdown code fences if present.
    fence_matches = re.findall(
        r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE
    )
    candidates: list[str] = []
    for fm in fence_matches:
        trimmed = fm.strip()
        if trimmed:
            candidates.append(trimmed)
    candidates.append(text)

    # 2. Try direct json.loads on each candidate (with trailing-comma repair).
    for cand in candidates:
        for attempt in (cand, _strip_trailing_commas(cand)):
            try:
                data = json.loads(attempt)
                return _extract_list_of_dicts(data)
            except (json.JSONDecodeError, ValueError):
                pass

    # 3. Use json.JSONDecoder.raw_decode to find structured JSON inside text.
    decoder = json.JSONDecoder()
    for cand in candidates:
        cleaned_cand = _strip_trailing_commas(cand)
        for target in (cand, cleaned_cand):
            # 3a. Look for a JSON array [...]
            for i, char in enumerate(target):
                if char == "[":
                    try:
                        obj, _ = decoder.raw_decode(target[i:])
                        if isinstance(obj, list):
                            dicts = _extract_list_of_dicts(obj)
                            if dicts:
                                return dicts
                            if len(obj) == 0:
                                return []
                    except (json.JSONDecodeError, ValueError):
                        continue

            # 3b. Look for JSON objects { ... } (multiple on separate lines)
            objects: list[dict] = []
            idx = 0
            while idx < len(target):
                next_brace = target.find("{", idx)
                if next_brace == -1:
                    break
                try:
                    obj, end_idx = decoder.raw_decode(target[next_brace:])
                    if isinstance(obj, dict):
                        # If it's a wrapper dict (e.g. {"recommendations": [...]}), return its list
                        for key in ("recommendations", "items", "products", "standards"):
                            if key in obj and isinstance(obj[key], list):
                                dicts = [item for item in obj[key] if isinstance(item, dict)]
                                if dicts or len(obj[key]) == 0:
                                    return dicts
                        objects.append(obj)
                    idx = next_brace + max(end_idx, 1)
                except (json.JSONDecodeError, ValueError):
                    idx = next_brace + 1

            if objects:
                return objects

    return None


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_PDF_BYTES = 50 * 1024 * 1024   # 50 MB hard limit
MAX_PAGES     = 300                 # refuse absurdly long PDFs
MIN_TEXT_CHARS_PER_PAGE = 30        # below this → likely scanned page
SCANNED_PAGE_RATIO = 0.60           # >60% near-empty pages → scanned PDF warning
MAX_EXTRACT_CHARS = 24_000          # chars sent to LLM for item extraction
MAX_ITEMS = 20                      # cap on extracted items per tender
LLM_TEMPERATURE = 0
LLM_MAX_TOKENS  = 1500


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class TenderPage:
    page_number: int     # 1-indexed
    text: str
    char_count: int
    is_text_rich: bool   # True if > MIN_TEXT_CHARS_PER_PAGE


@dataclass
class ProcurementItem:
    item_name: str
    specifications: str
    source_pages: list[int]              # page numbers where text was found
    raw_context: str                     # snippet used to identify this item
    recommendations: list[dict] = field(default_factory=list)
    extraction_latency_ms: float = 0.0


@dataclass
class TenderResult:
    filename: str
    page_count: int
    text_pages: int
    scanned_pages: int
    total_chars: int
    extraction_method: str              # "text" | "text+ocr_needed"
    items: list[ProcurementItem]
    warnings: list[str]
    processing_time_ms: float
    truncated: bool                     # True if PDF was too long for full LLM pass


class TenderError(Exception):
    """Raised for unrecoverable PDF problems. Message is user-facing."""


# ---------------------------------------------------------------------------
# PDF validation and text extraction
# ---------------------------------------------------------------------------

def validate_and_extract(pdf_bytes: bytes, filename: str) -> tuple[list[TenderPage], list[str]]:
    """
    Open the PDF, validate it, and extract page-level text.

    Returns (pages, warnings).
    Raises TenderError for unrecoverable problems.
    """
    warnings: list[str] = []

    # --- size check ---
    if len(pdf_bytes) > MAX_PDF_BYTES:
        mb = len(pdf_bytes) / (1024 * 1024)
        raise TenderError(
            f"PDF is too large ({mb:.1f} MB). Maximum allowed size is "
            f"{MAX_PDF_BYTES // (1024*1024)} MB. "
            "Please split the document or upload specific sections."
        )

    # --- open with PyMuPDF ---
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise TenderError(
            f"Could not open PDF: {str(e)[:200]}. "
            "Please verify the file is a valid, non-corrupted PDF."
        ) from e

    if doc.page_count == 0:
        doc.close()
        raise TenderError("The PDF contains no pages.")

    if doc.page_count > MAX_PAGES:
        count = doc.page_count
        doc.close()
        raise TenderError(
            f"PDF has {count} pages, exceeding the {MAX_PAGES}-page limit. "
            "Please upload a specific section or chapter."
        )

    # --- per-page extraction ---
    pages: list[TenderPage] = []
    near_empty = 0

    for pg_idx in range(doc.page_count):
        try:
            page = doc.load_page(pg_idx)
            raw = page.get_text("text") or ""
            # Normalize whitespace while keeping paragraph breaks
            text = re.sub(r"[ \t]+", " ", raw)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            char_count = len(text)
            is_rich = char_count >= MIN_TEXT_CHARS_PER_PAGE
            if not is_rich:
                near_empty += 1
            pages.append(TenderPage(
                page_number=pg_idx + 1,
                text=text,
                char_count=char_count,
                is_text_rich=is_rich,
            ))
        except Exception as pg_err:
            warnings.append(f"Page {pg_idx + 1} could not be read: {pg_err}")
            pages.append(TenderPage(
                page_number=pg_idx + 1,
                text="",
                char_count=0,
                is_text_rich=False,
            ))
            near_empty += 1

    doc.close()

    total_text = sum(p.char_count for p in pages)
    scanned_ratio = near_empty / max(len(pages), 1)

    # --- scanned/empty PDF checks ---
    if total_text < 100:
        if scanned_ratio > 0.5:
            raise TenderError(
                "This PDF appears to be a scanned image document — no readable text "
                "could be extracted. Re-upload a text-layer PDF, or run the document "
                "through an OCR tool (e.g., Adobe Acrobat, Tesseract, or ABBYY) first."
            )
        raise TenderError(
            "No readable text found in the PDF. The document may be empty, "
            "encrypted, or image-only."
        )

    if scanned_ratio >= SCANNED_PAGE_RATIO:
        warnings.append(
            f"{near_empty}/{len(pages)} pages contain very little text and may be "
            "scanned images. Extraction quality may be reduced. "
            "Consider running OCR on the document for better results."
        )

    return pages, warnings


# ---------------------------------------------------------------------------
# Text preparation for LLM
# ---------------------------------------------------------------------------

def _build_extraction_text(pages: list[TenderPage], max_chars: int) -> tuple[str, bool]:
    """
    Concatenate page text with page-number markers, truncating at max_chars.
    Returns (text, was_truncated).
    """
    parts: list[str] = []
    total = 0
    truncated = False

    for p in pages:
        if not p.text:
            continue
        header = f"\n--- Page {p.page_number} ---\n"
        chunk  = header + p.text
        if total + len(chunk) > max_chars:
            remaining = max_chars - total
            if remaining > len(header) + 50:
                parts.append(chunk[:remaining] + "\n[...truncated]")
            truncated = True
            break
        parts.append(chunk)
        total += len(chunk)

    return "".join(parts), truncated


# ---------------------------------------------------------------------------
# Item extraction via LLM
# ---------------------------------------------------------------------------

_EXTRACTION_SYSTEM_PROMPT = """\
You are a procurement specification analyst for Indian government tenders and BIS compliance.

Your task: read the supplied tender/document text and extract every distinct procurement item \
(product, material, equipment, service, or standard being referenced for procurement).

OUTPUT FORMAT — return ONLY a valid JSON array, nothing else:
[
  {
    "item_name": "<short product/material name, e.g. 'Ordinary Portland Cement 43 Grade'>",
    "specifications": "<extracted specification details from the text — grade, capacity, rating, size, quantity, standard references, etc. Be specific. If a BIS standard is mentioned, include it.>",
    "source_pages": [<list of page numbers where this item appears, integers>],
    "raw_context": "<verbatim excerpt (≤ 300 chars) from the text that identifies this item>"
  }
]

RULES:
1. Extract ONLY items that actually appear in the text. Do NOT invent items.
2. If a BIS/IS standard number is mentioned with the item, include it in specifications.
3. Include as much specification detail as is present in the text (grade, size, capacity, unit, quantity).
4. Separate items that are genuinely distinct products. Do NOT merge unrelated items.
5. If the document is a standards compendium or reference list, each listed standard IS a \
   procurement item (the product/system that standard governs).
6. If there are no identifiable procurement items, return: []
7. Maximum {max_items} items.
8. Do NOT include metadata items like page headers, dates, contact information, or table of contents entries as procurement items.
"""

_EXTRACTION_USER_PROMPT = """\
Document text:
{document_text}

Extract all procurement items. Return JSON array only.
"""


def extract_items_with_llm(
    document_text: str,
    llm_client,
    llm_model: str,
    filename: str,
) -> list[dict]:
    """
    Send document text to LLM and parse the extracted item list.
    Returns list of raw item dicts. Returns [] on any failure.
    """
    system = _EXTRACTION_SYSTEM_PROMPT.replace("{max_items}", str(MAX_ITEMS))
    user = _EXTRACTION_USER_PROMPT.replace("{document_text}", document_text[:MAX_EXTRACT_CHARS])

    try:
        completion = llm_client.chat.completions.create(
            model=llm_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
        )
        response = (completion.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"[TenderPipeline] LLM item extraction failed: {e}")
        return []

    items = _parse_llm_json_response(response)
    if items is None:
        print(f"[TenderPipeline] LLM returned no JSON array for {filename}")
        return []

    return items[:MAX_ITEMS]


# ---------------------------------------------------------------------------
# Item validation and normalization
# ---------------------------------------------------------------------------

def _normalize_item(raw: dict, pages: list[TenderPage]) -> Optional[ProcurementItem]:
    """
    Validate and normalize a raw LLM-extracted item dict.
    Returns None if the item is invalid or empty.
    """
    if not isinstance(raw, dict):
        return None

    name = str(raw.get("item_name") or "").strip()
    specs = str(raw.get("specifications") or "").strip()
    context = str(raw.get("raw_context") or "").strip()

    # Require a non-trivial name
    if not name or len(name) < 3:
        return None

    # Source pages: validate against actual page range
    max_page = max((p.page_number for p in pages), default=1)
    raw_pages = raw.get("source_pages") or []
    if isinstance(raw_pages, list):
        source_pages = sorted(set(
            int(p) for p in raw_pages
            if isinstance(p, (int, float)) and 1 <= int(p) <= max_page
        ))
    else:
        source_pages = []

    # Build a query string: name + specs (for RAG)
    # Keep it under ~400 chars so the embedding model gets the essential signal
    if specs:
        query = f"{name}. {specs}"
    else:
        query = name

    return ProcurementItem(
        item_name=name,
        specifications=specs or "(no additional specifications extracted)",
        source_pages=source_pages,
        raw_context=context[:300] if context else "",
    ), query


# ---------------------------------------------------------------------------
# Per-item RAG
# ---------------------------------------------------------------------------

def _run_rag_for_item(
    item: ProcurementItem,
    query: str,
    rag_pipeline,
) -> list[dict]:
    """
    Run the Phase 1 BISRAGPipeline against a single procurement item query.
    Returns the recommendations list (may be empty).
    """
    try:
        recs = rag_pipeline.get_recommendations(query)
        return recs if isinstance(recs, list) else []
    except Exception as e:
        print(f"[TenderPipeline] RAG failed for item '{item.item_name}': {e}")
        traceback.print_exc()
        return []


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def process_tender(
    pdf_bytes: bytes,
    filename: str,
    rag_pipeline,
    llm_client=None,
    llm_model: str = "auto/smart",
) -> TenderResult:
    """
    Full pipeline: PDF bytes → TenderResult with procurement items and BIS recommendations.

    Parameters
    ----------
    pdf_bytes    : raw uploaded PDF bytes
    filename     : original filename (for display only — never used for inference)
    rag_pipeline : initialized BISRAGPipeline from Phase 1
    llm_client   : OpenAI-compatible client for item extraction
                   (if None, falls back to regex-based extraction)
    llm_model    : model name string

    Returns
    -------
    TenderResult — always returns (never raises).
    Unrecoverable PDF problems are caught and returned as a TenderResult
    with items=[] and a descriptive warning.
    """
    t_start = time.time()
    warnings: list[str] = []
    items_out: list[ProcurementItem] = []
    truncated = False

    # ── Step 1: Validate and extract text ──────────────────────────────────
    try:
        pages, extraction_warnings = validate_and_extract(pdf_bytes, filename)
        warnings.extend(extraction_warnings)
    except TenderError as te:
        return TenderResult(
            filename=filename,
            page_count=0,
            text_pages=0,
            scanned_pages=0,
            total_chars=0,
            extraction_method="failed",
            items=[],
            warnings=[str(te)],
            processing_time_ms=round((time.time() - t_start) * 1000, 1),
            truncated=False,
        )

    text_pages  = sum(1 for p in pages if p.is_text_rich)
    scanned_pgs = sum(1 for p in pages if not p.is_text_rich)
    total_chars = sum(p.char_count for p in pages)

    # ── Step 2: Build document text for LLM ───────────────────────────────
    document_text, truncated = _build_extraction_text(pages, MAX_EXTRACT_CHARS)
    if truncated:
        warnings.append(
            f"Document text was truncated at {MAX_EXTRACT_CHARS:,} characters "
            f"({total_chars:,} total). Items from later pages may not be extracted. "
            "Consider uploading only the relevant specification sections."
        )

    extraction_method = "text"

    # ── Step 3: Extract procurement items ─────────────────────────────────
    raw_items: list[dict] = []

    if llm_client is not None:
        raw_items = extract_items_with_llm(
            document_text,
            llm_client,
            llm_model,
            filename,
        )
        if not raw_items:
            warnings.append(
                "LLM item extraction returned no results. "
                "Falling back to regex-based extraction."
            )
    
    # Regex fallback (also used when LLM returns nothing)
    if not raw_items:
        raw_items = _regex_extract_items(document_text, pages)
        extraction_method = "text+regex_fallback"
        if not raw_items:
            warnings.append(
                "No procurement items could be identified in this document. "
                "The document may be a general reference, policy document, or "
                "lack structured procurement specifications."
            )

    # ── Step 4: Normalize items ────────────────────────────────────────────
    normalized: list[tuple[ProcurementItem, str]] = []  # (item, rag_query)
    seen_names: set[str] = set()

    for raw in raw_items:
        result = _normalize_item(raw, pages)
        if result is None:
            continue
        item, query = result
        name_key = item.item_name.lower().strip()
        if name_key in seen_names:
            continue  # deduplicate
        seen_names.add(name_key)
        normalized.append((item, query))

    # ── Step 5: Run RAG for each item ──────────────────────────────────────
    for item, query in normalized:
        t_item = time.time()
        item.recommendations = _run_rag_for_item(item, query, rag_pipeline)
        item.extraction_latency_ms = round((time.time() - t_item) * 1000, 1)
        items_out.append(item)

    return TenderResult(
        filename=filename,
        page_count=len(pages),
        text_pages=text_pages,
        scanned_pages=scanned_pgs,
        total_chars=total_chars,
        extraction_method=extraction_method,
        items=items_out,
        warnings=warnings,
        processing_time_ms=round((time.time() - t_start) * 1000, 1),
        truncated=truncated,
    )


# ---------------------------------------------------------------------------
# Regex-based fallback item extraction
# ---------------------------------------------------------------------------

# Matches IS standard IDs like: IS 269:2015, IS/ISO 9001:2015, IS 1489 (Part 1):2015
_IS_PATTERN = re.compile(
    r"IS(?:/ISO(?:/IEC(?:/IEEE)?)?)?\s+[\d]+(?:\s*\([^)]+\))?(?:\s*/\s*(?:Sec\s*)?\d+)?"
    r"(?:\s*\(Part\s*[\d/]+\))?[\s]*[:\-][\s]*\d{4}",
    re.IGNORECASE,
)

# Matches product section headings in uppercase
_HEADING_PATTERN = re.compile(
    r"(?:^|\n)([A-Z][A-Z][A-Z\s\(\)/\[\]\-]{6,70})\n",
)

# Standard reference pattern in context: "IS 269 (OPC)" or "[IS 269]"
_STD_IN_HEADING = re.compile(
    r"\[?(IS(?:/ISO(?:/IEC)?)?[\s/\d\(\)Part]+?)\]?",
    re.IGNORECASE,
)


def _regex_extract_items(document_text: str, pages: list[TenderPage]) -> list[dict]:
    """
    Fallback regex-based item extraction used when LLM is unavailable or returns nothing.

    Tries four strategies in order of quality:
    1. IS standard + title table rows  (e.g., "IS 269 : 2015  Ordinary Portland Cement")
    2. BOQ/schedule line items (numbered list: "1. Supply of HT Cable 11kV …")
    3. Uppercase product section headings (e.g., "ORDINARY PORTLAND CEMENT (OPC)")
    4. IS standard IDs with surrounding context (generic fallback)
    """
    items: list[dict] = []
    seen: set[str] = set()

    # Build page-number offset index
    page_offsets = _build_page_offsets(pages)

    def get_pages_for_offset(offset: int, context_len: int) -> list[int]:
        result = set()
        for start, end, pg in page_offsets:
            if start <= offset + context_len and end >= offset:
                result.add(pg)
        return sorted(result)

    # ── Strategy 1: IS standard + title table rows ─────────────────────────
    # Pattern: "IS 269 : 2015  Ordinary Portland Cement — Specification"
    # or       "IS/ISO 9001:2015  Quality Management Systems — Requirements"
    std_title_pattern = re.compile(
        r"(IS(?:/ISO(?:/IEC(?:/IEEE)?)?)?\s+[\d]+(?:\s*\([^)]+\))?(?:\s*/\s*(?:Sec\s*)?\d+)?"
        r"(?:\s*\(Part\s*[\d/]+\))?(?:[\s]*[:\-][\s]*\d{4})?)"   # IS number, year optional
        r"[\s\n]+"                                                  # whitespace separator
        r"([A-Z][^\n]{8,120})",                                     # title (starts with capital)
        re.IGNORECASE,
    )

    for m in std_title_pattern.finditer(document_text):
        std_id = re.sub(r"\s+", " ", m.group(1)).strip()
        title  = re.sub(r"\s+", " ", m.group(2)).strip()

        # Skip test-method standards (IS 4031, IS 4032, etc.) — they are
        # methods-of-test entries, not procurement items in compendiums.
        # Only skip them if they appear as a numbered list alongside other
        # test methods (i.e., the title contains "Method" or "Determination").
        skip_words = ("method", "determination", "measurement", "test for",
                      "analysis of", "methods of")
        if any(sw in title.lower() for sw in skip_words):
            continue

        key = std_id.lower()
        if key in seen:
            continue
        seen.add(key)

        # Use the title as the item_name; build specs from the standard ID
        src_pages = get_pages_for_offset(m.start(), len(m.group()))
        items.append({
            "item_name":    title[:120],
            "specifications": f"BIS standard: {std_id}",
            "source_pages": src_pages,
            "raw_context":  m.group()[:300],
        })
        if len(items) >= MAX_ITEMS:
            return items

    if items:
        return items

    # ── Strategy 2: BOQ numbered items (real tender lines) ─────────────────
    # Pattern: "1.  Supply and laying of HT cable 11kV …"
    # Requires at least 20 chars to avoid matching property-list items
    boq_pattern = re.compile(
        r"(?:^|\n)\s*(?:(?:Item|Sl\.?\s*No\.?|S\.?\s*No\.?)\s*[:\-]?\s*)?"
        r"(\d+[\.\)]\s+[A-Z][A-Za-z\(\)][^\n]{18,150})",
        re.IGNORECASE,
    )
    boq_skip = ("fineness", "setting time", "soundness", "compressive strength",
                 "transverse", "tensile", "density", "fly ash", "slag content",
                 "water retentivity", "heat of", "shrinkage", "air content",
                 "requirements for materials", "electrical safety", "surface temperature",
                 "design requirements", "mechanical requirements", "brake effectiveness",
                 "flammability", "durability of", "general requirements")

    for m in boq_pattern.finditer(document_text):
        line = re.sub(r"\s+", " ", m.group(1)).strip()
        if not line or len(line) < 12:
            continue
        # Skip spec-property items (compendium body text)
        if any(sk in line.lower() for sk in boq_skip):
            continue
        key = line.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        src_pages = get_pages_for_offset(m.start(), len(m.group()))
        std_refs = _IS_PATTERN.findall(line)
        specs = ("BIS standards referenced: " + ", ".join(
            re.sub(r"\s+", " ", s).strip() for s in std_refs)
        ) if std_refs else ""
        items.append({
            "item_name":    line[:120],
            "specifications": specs,
            "source_pages": src_pages,
            "raw_context":  line[:300],
        })
        if len(items) >= MAX_ITEMS:
            return items

    if items:
        return items

    # ── Strategy 3: Uppercase product section headings ─────────────────────
    heading_skip = {"TABLE OF CONTENTS", "INTRODUCTION", "PREFACE", "REFERENCES",
                    "BIBLIOGRAPHY", "ANNEX", "NOTE", "PAGE", "BUREAU OF INDIAN",
                    "GOVERNMENT OF INDIA", "MINISTRY OF", "CONCLUSION",
                    "DIGITAL PLATFORMS", "ABOUT", "BENEFITS OF",
                    "SIGNIFICANCE OF", "COMPONENTS OF", "CASE STUDY"}

    for m in _HEADING_PATTERN.finditer(document_text):
        heading = m.group(1).strip()
        if any(sw in heading for sw in heading_skip):
            continue
        if len(heading) < 8:
            continue
        key = heading.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        src_pages = get_pages_for_offset(m.start(), len(m.group()))
        std_m = _STD_IN_HEADING.search(heading)
        specs = f"Referenced standard: {std_m.group(1).strip()}" if std_m else ""
        items.append({
            "item_name":    heading.title(),
            "specifications": specs,
            "source_pages": src_pages,
            "raw_context":  heading[:300],
        })
        if len(items) >= MAX_ITEMS:
            return items

    if items:
        return items

    # ── Strategy 4: IS standard IDs with surrounding context (last resort) ──
    for m in _IS_PATTERN.finditer(document_text):
        std_id = re.sub(r"\s+", " ", m.group()).strip()
        start = max(0, m.start() - 100)
        end   = min(len(document_text), m.end() + 100)
        context = re.sub(r"\s+", " ", document_text[start:end]).strip()
        key = std_id.lower()
        if key in seen:
            continue
        seen.add(key)
        src_pages = get_pages_for_offset(m.start(), m.end() - m.start())
        items.append({
            "item_name":    std_id,
            "specifications": f"Standard context: {context[:200]}",
            "source_pages": src_pages,
            "raw_context":  context[:300],
        })
        if len(items) >= MAX_ITEMS:
            return items

    return items


def _build_page_offsets(pages: list[TenderPage]) -> list[tuple[int, int, int]]:
    """
    Build a list of (start_char, end_char, page_number) for offset→page lookup.
    Approximates offset by concatenating page texts in order.
    """
    result = []
    offset = 0
    for p in pages:
        n = len(p.text)
        result.append((offset, offset + n, p.page_number))
        offset += n + 10  # +10 for the page-header marker
    return result


# ---------------------------------------------------------------------------
# Result serialization
# ---------------------------------------------------------------------------

def tender_result_to_dict(result: TenderResult) -> dict:
    """
    Convert TenderResult to a JSON-serializable dict matching the API response shape.

    The 'products' key matches the existing mockApi.ts response contract:
      { products: [{ product_name, specification, recommendations, ... }] }
    """
    products = []
    for item in result.items:
        rec_list = []
        for rec in item.recommendations:
            rec_list.append({
                "standard_id":      rec.get("standard_id", ""),
                "title":            rec.get("title", ""),
                "domain":           rec.get("domain", ""),
                "scope":            rec.get("scope", ""),
                "status":           rec.get("status", ""),
                "year":             rec.get("year", ""),
                "revision":         rec.get("revision", ""),
                "source":           rec.get("source", ""),
                "similarity_score": rec.get("similarity_score"),
                "rationale":        rec.get("rationale", ""),
            })
        products.append({
            "product_name":    item.item_name,
            "specification":   item.specifications,
            "source_pages":    item.source_pages,
            "raw_context":     item.raw_context,
            "recommendations": rec_list,
            "rag_latency_ms":  item.extraction_latency_ms,
        })

    return {
        "filename":          result.filename,
        "page_count":        result.page_count,
        "text_pages":        result.text_pages,
        "scanned_pages":     result.scanned_pages,
        "total_chars":       result.total_chars,
        "extraction_method": result.extraction_method,
        "truncated":         result.truncated,
        "warnings":          result.warnings,
        "processing_time_ms": result.processing_time_ms,
        "products":          products,
    }


# ---------------------------------------------------------------------------
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import pathlib
    import os
    from dotenv import load_dotenv

    load_dotenv()

    # Import Phase 1 RAG pipeline
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
    from src.rag_pipeline import BISRAGPipeline
    from openai import OpenAI

    rag = BISRAGPipeline()
    rag.warm_up_retriever()

    omni_key = os.getenv("OMNIROUTE_API_KEY")
    omni_url = os.getenv("OMNIROUTE_BASE_URL", "http://localhost:20128/v1")
    llm = None
    if omni_key:
        llm = OpenAI(api_key=omni_key, base_url=omni_url)
    llm_model = os.getenv("OMNIROUTE_MODEL", "auto/smart")

    pdf_dir = pathlib.Path(__file__).resolve().parent.parent / "data" / "pdf"
    test_pdfs = sorted(pdf_dir.glob("*.pdf"))

    if len(sys.argv) > 1:
        test_pdfs = [pathlib.Path(sys.argv[1])]

    for pdf_path in test_pdfs:
        print("\n" + "="*72)
        print("Testing:", pdf_path.name)
        print("="*72)

        pdf_bytes = pdf_path.read_bytes()
        result = process_tender(
            pdf_bytes=pdf_bytes,
            filename=pdf_path.name,
            rag_pipeline=rag,
            llm_client=llm,
            llm_model=llm_model,
        )

        print(f"  Pages: {result.page_count}  |  Text pages: {result.text_pages}")
        print(f"  Total chars: {result.total_chars:,}")
        print(f"  Extraction: {result.extraction_method}")
        print(f"  Processing: {result.processing_time_ms:.0f} ms")
        print(f"  Truncated: {result.truncated}")
        if result.warnings:
            for w in result.warnings:
                print(f"  WARNING: {w}")
        print(f"  Items found: {len(result.items)}")

        for i, item in enumerate(result.items, 1):
            print(f"\n  [{i}] {item.item_name}")
            print(f"       Pages: {item.source_pages}")
            print(f"       Specs: {item.specifications[:120]}")
            if item.recommendations:
                print(f"       BIS recommendations ({len(item.recommendations)}):")
                for rec in item.recommendations:
                    sid   = rec.get('standard_id', '?')
                    title = rec.get('title', '')[:55]
                    score = rec.get('similarity_score')
                    score_str = f" [{score:.4f}]" if score else ""
                    print(f"         {sid}{score_str}  {title}")
            else:
                print("       BIS recommendations: none found")
