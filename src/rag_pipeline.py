"""
BISRAGPipeline — StandardIQ
============================
Retrieval-Augmented Generation pipeline for BIS standard discovery.

Architecture:
  requirement
  → keyword extraction + vector retrieval (ChromaDB)
  → candidate merge + deduplication
  → similarity-based ranking
  → evidence extraction (scope, title, domain from metadata)
  → LLM reasoning (grounded in retrieved evidence only)
  → validation (standard_id must appear in retrieved context)
  → recommendations (variable count; "no confident match" is valid)

Rules enforced:
  - Never invent standard IDs.
  - Every recommendation must exist in the knowledge base.
  - No forced minimum result count.
  - No generic/padding standards appended.
  - Allow "No confident match found."
  - Similarity scores are reported as similarity scores, not probabilities.
  - Status and revision preserved from metadata.
  - Source information preserved.
"""

import os
import json
import re
import pathlib
import traceback

from dotenv import load_dotenv
from openai import OpenAI

from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings


load_dotenv()

# Repo root is two levels up from this file (src/rag_pipeline.py -> repo root).
_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
_DEFAULT_VECTORSTORE_PATH = str(_REPO_ROOT / "backend" / "data" / "vectorstore")

# Minimum cosine similarity for a retrieved document to be considered relevant.
# Documents below this threshold are discarded before LLM reasoning.
_MIN_SIMILARITY = 0.30


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
    #    Use findall so multiple fences are each tried.
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


class BISRAGPipeline:
    def __init__(self, vectorstore_path=_DEFAULT_VECTORSTORE_PATH):
        print("Initializing BISRAGPipeline...")

        # ---------------------------------------------------------
        # OmniRoute / OpenAI-compatible LLM client
        # ---------------------------------------------------------
        omni_api_key = os.getenv("OMNIROUTE_API_KEY")
        omni_base_url = os.getenv(
            "OMNIROUTE_BASE_URL",
            "http://localhost:20128/v1"
        )

        if not omni_api_key:
            raise ValueError(
                "OMNIROUTE_API_KEY is not set in the .env file."
            )

        self.client = OpenAI(
            api_key=omni_api_key,
            base_url=omni_base_url,
        )

        # Model can be changed from .env without changing code.
        self.llm_model = os.getenv(
            "OMNIROUTE_MODEL",
            "auto/smart"
        )

        self.vectorstore_path = vectorstore_path

        # --- startup diagnostic ---
        _store = pathlib.Path(vectorstore_path)
        _sqlite = _store / "chroma.sqlite3"
        if _sqlite.exists():
            import sqlite3 as _sqlite3
            _conn = _sqlite3.connect(str(_sqlite))
            _cur = _conn.cursor()
            try:
                _cur.execute("SELECT COUNT(*) FROM embeddings")
                _doc_count = _cur.fetchone()[0]
            except Exception:
                _doc_count = "unknown"
            _conn.close()
        else:
            _doc_count = "N/A (file not found)"
        print(f"  Vectorstore path  : {_store.resolve()}")
        print(f"  Embeddings in store: {_doc_count}")
        # --------------------------

        self.retriever = None
        self.embeddings = None
        self.vectorstore = None

        # Tracks which retrieval path was used (for API response metadata).
        self.last_fallback = None

        # NOTE: self.common_standards is kept for the /api/metadata endpoint
        # but is NO LONGER used for padding recommendations.
        self.common_standards = [
            "IS 269:2015",
            "IS 383:2016",
            "IS 456:2000",
        ]

    # =========================================================
    # VECTOR DATABASE / RETRIEVER
    # =========================================================

    def _get_retriever(self, k: int = 10):
        """
        Lazily initialize the HuggingFace embedding model,
        ChromaDB vector store, and retriever.

        k=10 to get enough candidates before similarity filtering.
        """
        if self.retriever is None:
            print("Loading embedding model and ChromaDB...")

            self.embeddings = HuggingFaceEmbeddings(
                model_name="all-MiniLM-L6-v2"
            )

            self.vectorstore = Chroma(
                persist_directory=self.vectorstore_path,
                embedding_function=self.embeddings,
            )

            self.retriever = self.vectorstore.as_retriever(
                search_kwargs={"k": k}
            )

            print("Vector store ready.")

        return self.retriever

    # =========================================================
    # WARM UP
    # =========================================================

    def warm_up_retriever(self):
        """Pre-initialize the retriever to reduce first-query latency."""
        try:
            retriever = self._get_retriever()
            _ = retriever.invoke("cement concrete standard")
            print("Pipeline warm-up complete: embeddings and retriever ready")
        except Exception as e:
            print(f"Warm-up warning (non-critical): {str(e)}")

    # =========================================================
    # SIMILARITY-AWARE RETRIEVAL
    # =========================================================

    def _retrieve_with_scores(self, description: str, k: int = 10):
        """
        Retrieve top-k documents from ChromaDB with cosine similarity scores.

        Returns list of (document, similarity_score) tuples,
        filtered to only those above _MIN_SIMILARITY.
        Results are sorted by similarity descending.
        """
        if self.vectorstore is None:
            self._get_retriever(k=k)

        try:
            results = self.vectorstore.similarity_search_with_relevance_scores(
                description, k=k
            )
            # Filter below threshold and sort descending
            filtered = [(doc, score) for doc, score in results if score >= _MIN_SIMILARITY]
            filtered.sort(key=lambda x: x[1], reverse=True)
            return filtered
        except Exception as e:
            print(f"similarity_search_with_relevance_scores failed ({e}), "
                  "falling back to plain retriever")
            docs = self._get_retriever(k=k).invoke(description)
            return [(doc, None) for doc in docs]

    # =========================================================
    # EXTRACT STANDARD IDS FROM DOCUMENTS
    # =========================================================

    def _extract_standard_id_from_doc(self, doc):
        """
        Extract IS standard identifier from a retrieved document.
        Metadata is preferred; regex over page_content is the fallback.
        Returns the standard_id string or None.
        """
        metadata = getattr(doc, "metadata", None) or {}
        if isinstance(metadata, dict):
            sid = (
                metadata.get("standard_id")
                or metadata.get("standard")
                or metadata.get("id")
            )
            if sid:
                return str(sid).strip()

        # Regex fallback on document text
        content = getattr(doc, "page_content", "") or ""
        pattern = re.compile(
            r"\b(?:IS(?:/ISO(?:/IEC(?:/IEEE)?)?)?)\s+[\d]+(?:\s*\([^)]+\))?(?:\s*/\s*(?:Sec\s*)?\d+)?(?:\s*\(Part\s*[\d/]+\))?[:\s]+\d{4}\b",
            re.IGNORECASE,
        )
        m = pattern.search(content)
        if m:
            return m.group(0).strip().rstrip(".,;:")

        return None

    def _build_evidence(self, doc):
        """
        Build an evidence dict from a ChromaDB document's metadata.
        Only uses fields that are actually stored — never fabricates.
        """
        meta = getattr(doc, "metadata", None) or {}
        evidence = {}
        for field in ("standard_id", "title", "domain", "scope",
                      "status", "year", "revision", "amendment_no",
                      "source", "source_document", "keywords",
                      "bis_division", "date_of_publish", "type_of_standard"):
            val = meta.get(field)
            if val:
                evidence[field] = str(val).strip()
        # Include text snippet for LLM context
        content = getattr(doc, "page_content", "") or ""
        evidence["_snippet"] = content[:500]
        return evidence

    # =========================================================
    # VALIDATE LLM RECOMMENDATION
    # =========================================================

    def _validate_recommendation(self, standard_id: str, context_texts: list) -> bool:
        """
        Ensure the LLM did not invent a standard.
        The returned IS number must actually occur in the retrieved documents.
        """
        if not standard_id:
            return False

        std_clean = re.sub(r"[^a-z0-9]", "", str(standard_id).lower())

        for ctx in context_texts:
            ctx_clean = re.sub(r"[^a-z0-9]", "", ctx.lower())
            if std_clean in ctx_clean:
                return True

        return False

    # =========================================================
    # BUILD LLM PROMPT CONTEXT
    # =========================================================

    def _build_context_block(self, scored_docs: list) -> tuple[str, list]:
        """
        Build the context string for the LLM from scored docs.

        Returns (context_text_for_llm, context_texts_for_validation).
        """
        context_parts = []
        context_texts_for_val = []

        for i, (doc, score) in enumerate(scored_docs, 1):
            evidence = self._build_evidence(doc)
            sid = evidence.get("standard_id", "?")
            title = evidence.get("title", "")
            domain = evidence.get("domain", "")
            scope = evidence.get("scope", evidence.get("_snippet", ""))[:400]
            status = evidence.get("status", "")
            year = evidence.get("year", "")
            revision = evidence.get("revision", "")
            source = evidence.get("source", "")

            score_str = f"similarity={score:.4f}" if score is not None else "score=N/A"
            parts = [f"[{i}] Standard: {sid}  ({score_str})"]
            if title:
                parts.append(f"    Title: {title}")
            if domain:
                parts.append(f"    Domain: {domain}")
            if scope:
                parts.append(f"    Scope: {scope}")
            if status:
                parts.append(f"    Status: {status}")
            if year:
                parts.append(f"    Year: {year}")
            if revision:
                parts.append(f"    Revision: {revision}")
            if source:
                parts.append(f"    Source: {source}")

            context_parts.append("\n".join(parts))
            context_texts_for_val.append(
                (getattr(doc, "page_content", "") or "").lower()
            )

        return "\n\n".join(context_parts), context_texts_for_val

    # =========================================================
    # MAIN RECOMMENDATION FUNCTION
    # =========================================================

    def get_recommendations(self, description: str) -> list[dict]:
        """
        Full RAG pipeline:
          requirement
          → vector retrieval + similarity filtering
          → deduplication by standard_id
          → context block for LLM
          → LLM reasoning (grounded only in retrieved context)
          → per-recommendation validation
          → return variable-length list (may be empty)

        Never pads with generic standards.
        Returns [] if no confident match exists.
        """
        self.last_fallback = None

        try:
            # -------------------------------------------------
            # STEP 1: Retrieve candidates with similarity scores
            # -------------------------------------------------
            scored_docs = self._retrieve_with_scores(description, k=12)

            if not scored_docs:
                print("No documents retrieved above similarity threshold.")
                return []

            # -------------------------------------------------
            # STEP 2: Deduplicate by standard_id
            # Keep the highest-scoring occurrence of each standard.
            # -------------------------------------------------
            seen_ids = set()
            deduped = []
            for doc, score in scored_docs:
                sid = self._extract_standard_id_from_doc(doc)
                if sid and sid not in seen_ids:
                    seen_ids.add(sid)
                    deduped.append((doc, score))
                elif not sid:
                    # Keep documents without a parseable standard_id too
                    deduped.append((doc, score))

            # Limit context to top 8 unique candidates
            deduped = deduped[:8]

            # -------------------------------------------------
            # STEP 3: Build context block
            # -------------------------------------------------
            context_text, context_texts_for_val = self._build_context_block(deduped)

            # -------------------------------------------------
            # STEP 4: Call LLM
            # -------------------------------------------------
            system_prompt = (
                "You are a BIS (Bureau of Indian Standards) expert for procurement compliance.\n"
                "Your task: given a procurement requirement and a set of retrieved BIS standards, "
                "identify which standards are genuinely applicable.\n\n"
                "RULES:\n"
                "1. Only recommend standards that appear in the provided context below.\n"
                "2. Never invent or guess standard IDs not present in the context.\n"
                "3. Recommend only standards that are actually relevant to the requirement.\n"
                "4. Do NOT force a minimum number of recommendations.\n"
                "5. If no standard in the context is relevant, return an empty array [].\n"
                "6. Do NOT pad with generic or loosely related standards.\n"
                "7. The rationale must explain specifically why the standard applies to THIS requirement.\n"
                "8. Do NOT call similarity scores probabilities.\n"
                "9. Preserve the exact standard_id from the context (including year).\n\n"
                "Return ONLY a valid JSON array. Each element: "
                "{\"standard_id\": \"IS ...\", \"rationale\": \"...\"}.\n"
                "If no standard is relevant, return: []"
            )

            user_prompt = (
                f"Procurement requirement:\n{description}\n\n"
                f"Retrieved BIS standards (context):\n{context_text}\n\n"
                "Which of the above standards are applicable to this requirement? "
                "Return JSON array only."
            )

            try:
                completion = self.client.chat.completions.create(
                    model=self.llm_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0,
                    max_tokens=500,
                )
                response_text = completion.choices[0].message.content or ""

            except Exception as llm_err:
                # LLM unavailable — return retriever-only results.
                # These are grounded in actual retrieved documents.
                print(f"LLM unavailable, using retriever-only: {llm_err}")
                self.last_fallback = "retriever-only (LLM unavailable)"
                retriever_recs = []
                seen = set()
                for doc, score in deduped:
                    sid = self._extract_standard_id_from_doc(doc)
                    if sid and sid not in seen:
                        seen.add(sid)
                        meta = getattr(doc, "metadata", {}) or {}
                        title = meta.get("title", "")
                        score_str = f"{score:.4f}" if score is not None else "N/A"
                        retriever_recs.append({
                            "standard_id": sid,
                            "rationale": (
                                f"Retrieved from BIS knowledge base "
                                f"(similarity: {score_str}). "
                                f"{title}. LLM ranking unavailable."
                            ),
                        })
                return retriever_recs

            # -------------------------------------------------
            # STEP 5: Parse LLM response
            # -------------------------------------------------
            if not response_text:
                return []

            recommendations = _parse_llm_json_response(response_text)
            if recommendations is None:
                return []

            if not isinstance(recommendations, list):
                return []

            # -------------------------------------------------
            # STEP 6: Validate each recommendation
            # Reject any standard_id not found in retrieved context.
            # -------------------------------------------------
            validated = []
            seen_validated = set()

            for rec in recommendations:
                if not isinstance(rec, dict):
                    continue

                sid = str(rec.get("standard_id", "")).strip()
                rationale = str(rec.get("rationale", "")).strip()

                if not sid:
                    continue

                if sid in seen_validated:
                    continue  # deduplicate LLM output

                if not self._validate_recommendation(sid, context_texts_for_val):
                    print(f"Validation failed (not in context): {sid}")
                    continue

                # Enrich with metadata from the retrieved document
                enriched = {
                    "standard_id": sid,
                    "rationale": rationale or "Supported by retrieved BIS documents.",
                }

                # Add metadata fields if available from the matching doc
                for doc, score in deduped:
                    doc_sid = self._extract_standard_id_from_doc(doc)
                    if doc_sid == sid:
                        meta = getattr(doc, "metadata", {}) or {}
                        if meta.get("title"):
                            enriched["title"] = meta["title"]
                        if meta.get("domain"):
                            enriched["domain"] = meta["domain"]
                        if meta.get("scope"):
                            enriched["scope"] = meta["scope"][:300]
                        if meta.get("status"):
                            enriched["status"] = meta["status"]
                        if meta.get("year"):
                            enriched["year"] = meta["year"]
                        if meta.get("revision"):
                            enriched["revision"] = meta["revision"]
                        if meta.get("source"):
                            enriched["source"] = meta["source"]
                        if score is not None:
                            enriched["similarity_score"] = round(score, 4)
                        break

                validated.append(enriched)
                seen_validated.add(sid)

            return validated

        except Exception as e:
            print(f"Error in get_recommendations: {e}")
            traceback.print_exc()
            return []


# =============================================================
# DIRECT TEST
# =============================================================

if __name__ == "__main__":
    pipeline = BISRAGPipeline()
    pipeline.warm_up_retriever()

    test_queries = [
        "43 Grade Ordinary Portland Cement for structural concrete",
        "LED street lights for municipal roads",
        "PVC cables for public building wiring 1100V",
        "rubber gloves for electrical workers high voltage",
        "quality management system certification ISO 9001",
    ]

    for query in test_queries:
        print(f"\nQUERY: {query}")
        recs = pipeline.get_recommendations(query)
        if recs:
            for r in recs:
                print(f"  {r['standard_id']}  —  {r.get('title', '')}")
                print(f"    {r['rationale'][:100]}")
                if r.get('similarity_score'):
                    print(f"    similarity: {r['similarity_score']}")
        else:
            print("  No confident match found.")
        print()
