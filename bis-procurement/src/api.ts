/**
 * StandardIQ real API client
 *
 * All functions call the FastAPI backend (backend/main.py).
 * The backend URL is resolved from VITE_API_BASE_URL (set in .env.local)
 * or falls back to http://localhost:8000 for local development.
 *
 * None of these functions fabricate data — all results come from the
 * actual BIS knowledge base via the Phase 1 RAG pipeline.
 */

// Backend base URL.
// Priority order:
//   1. VITE_API_BASE_URL environment variable (set in .env.local for custom deployments)
//   2. http://127.0.0.1:8000 — the default local FastAPI server
//
// The Vite dev server also proxies /api/* to 127.0.0.1:8000 (vite.config.ts),
// but the explicit fallback here means the app works even if the proxy
// layer is bypassed or the frontend is served statically.
const BASE_URL: string =
  (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000';

// ─── Response types ───────────────────────────────────────────────────────────

export type BISRecommendation = {
  standard_id: string;
  title: string;
  domain: string;
  scope: string;
  status: string;
  year: string;
  revision: string;
  source: string;
  similarity_score: number | null;
  rationale: string;
};

export type TenderProduct = {
  product_name: string;
  specification: string;
  source_pages: number[];
  raw_context: string;
  recommendations: BISRecommendation[];
  rag_latency_ms: number;
};

export type TenderScanResult = {
  filename: string;
  page_count: number;
  text_pages: number;
  scanned_pages: number;
  total_chars: number;
  extraction_method: string;
  truncated: boolean;
  warnings: string[];
  processing_time_ms: number;
  products: TenderProduct[];
};

export type DiscoverResult = {
  recommendations: BISRecommendation[];
  latency_seconds: number;
  matched_by: string;
};

// ─── API error ────────────────────────────────────────────────────────────────

export class APIError extends Error {
  status: number;
  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

async function checkResponse(res: Response): Promise<Response> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      /* ignore parse error */
    }
    throw new APIError(res.status, detail);
  }
  return res;
}

// ─── Tender scan ──────────────────────────────────────────────────────────────

/**
 * Upload a PDF tender document and receive extracted procurement items
 * with BIS standard recommendations.
 *
 * Sends a multipart/form-data POST to POST /api/scan-tender.
 * The PDF is analysed for actual content — the filename is never used
 * for inference.
 *
 * Throws APIError on 4xx/5xx responses.
 */
export async function scanTender(file: File): Promise<TenderScanResult> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch(`${BASE_URL}/api/scan-tender`, {
    method: 'POST',
    body: form,
  });

  await checkResponse(res);
  return res.json() as Promise<TenderScanResult>;
}

// ─── Standards discovery ──────────────────────────────────────────────────────

/**
 * Discover applicable BIS standards for a free-text procurement description.
 * Calls POST /api/discover.
 */
export async function discoverStandards(description: string): Promise<DiscoverResult> {
  const res = await fetch(`${BASE_URL}/api/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  await checkResponse(res);
  return res.json() as Promise<DiscoverResult>;
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

export type InsightsStandard = {
  standard_id: string;
  title?: string;
  domain?: string;
  scope?: string;
  rationale?: string;
};

export type InsightsRequest = {
  question: string;
  product_description?: string;
  recommendations?: InsightsStandard[];
};

export type InsightsResult = {
  answer: string;
};

/**
 * Ask an AI question grounded in the retrieved recommendation context.
 * Calls POST /api/insights.
 *
 * The backend uses the existing OmniRoute LLM client with a strict system
 * prompt — it will not fabricate standard numbers or technical requirements.
 *
 * Throws APIError on 4xx/5xx responses.
 */
export async function getInsights(request: InsightsRequest): Promise<InsightsResult> {
  const res = await fetch(`${BASE_URL}/api/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await checkResponse(res);
  return res.json() as Promise<InsightsResult>;
}
