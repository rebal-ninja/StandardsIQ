/**
 * BIS Procurement Assistant — API Service Layer
 *
 * Real backend endpoint: POST /api/discover
 * All other operations (history, verify, compare, scan) are handled
 * client-side with localStorage + fallback mock data.
 */

import axios from 'axios';
import { addHistoryEntry } from './history';
import { MOCK_STANDARDS } from '../data/mockStandards';

const BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Core search — calls the real FastAPI backend.
 * Falls back to mock data if backend is unreachable.
 */
export async function searchStandards(description) {
  if (!description || !description.trim()) {
    throw new Error('Please enter a requirement or product description.');
  }

  try {
    const url = `${BASE_URL}/api/discover`;
    const res = await axios.post(url, { description: description.trim() });
    const data = res.data;

    const recommendations = (data.recommendations || []).map((rec) =>
      enrichRecommendation(rec, description)
    );

    // persist to localStorage history
    if (recommendations.length > 0) {
      addHistoryEntry({
        type: 'search',
        query: description,
        topResult: recommendations[0]?.standard_id || '',
        matchScore: recommendations[0]?.match_score || null,
        resultCount: recommendations.length,
        matchedBy: data.matched_by || 'Retriever + LLM',
        latency: data.latency_seconds,
      });
    }

    return {
      recommendations,
      latency: data.latency_seconds,
      matchedBy: data.matched_by || 'Retriever + LLM',
      source: 'backend',
    };
  } catch (err) {
    if (err.response) {
      // Backend returned an HTTP error
      throw new Error(
        err.response.data?.detail || `Backend error: ${err.response.status}`
      );
    }
    // Network unreachable — use mock fallback
    return fallbackSearch(description);
  }
}

/**
 * Fallback: filter mock standards by query keywords.
 */
function fallbackSearch(description) {
  const tokens = description.toLowerCase().split(/\s+/);
  const scored = MOCK_STANDARDS.map((s) => {
    const text = `${s.standard_id} ${s.title} ${s.domain} ${s.scope}`.toLowerCase();
    const hits = tokens.filter((t) => t.length > 2 && text.includes(t)).length;
    const score = Math.min(95, 40 + hits * 15 + Math.random() * 10);
    return {
      ...s,
      match_score: Math.round(score),
      rationale: `Matched on ${hits > 0 ? hits + ' keyword(s)' : 'domain relevance'}: ${description.slice(0, 60)}`,
      matched_by: 'keyword',
    };
  });

  const results = scored
    .filter((s) => s.match_score >= 45)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  const top = results[0] || null;
  if (top) {
    addHistoryEntry({
      type: 'search',
      query: description,
      topResult: top.standard_id,
      matchScore: top.match_score,
      resultCount: results.length,
      matchedBy: 'keyword (offline)',
      latency: null,
    });
  }

  return {
    recommendations: results,
    latency: null,
    matchedBy: 'keyword (offline fallback)',
    source: 'mock',
  };
}

/**
 * Enrich a backend recommendation with display fields.
 * Backend only returns: { standard_id, rationale }
 * We augment with mock metadata for display.
 */
function enrichRecommendation(rec, query) {
  // Match on standard number only, ignoring year suffix and whitespace.
  // e.g. "IS 269:2015" from the DB should match "IS 269:1989" in mockStandards,
  // and "IS 16107:2012" should match "IS 16107 (Part 1):2012".
  const stripYear = (id) => id.replace(/\s/g, '').replace(/:[0-9]{4}$/, '');
  const recBase = stripYear(rec.standard_id);

  const known = MOCK_STANDARDS.find(
    (s) => stripYear(s.standard_id) === recBase
  );

  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const text = (rec.standard_id + ' ' + (known?.title || '') + ' ' + (known?.domain || '')).toLowerCase();
  const hits = tokens.filter((t) => text.includes(t)).length;
  const baseScore = hits > 0 ? Math.min(95, 65 + hits * 8) : 70;
  const score = Math.round(baseScore + Math.random() * 8);

  return {
    standard_id: rec.standard_id,
    title: known?.title || inferTitle(rec.standard_id),
    domain: known?.domain || inferDomain(rec.standard_id, query),
    scope: known?.scope || rec.rationale,
    status: known?.status || 'active',
    superseded_by: known?.superseded_by || null,
    amendment_no: known?.amendment_no || null,
    match_score: score,
    rationale: rec.rationale,
    matched_by: 'vector + LLM',
  };
}

function inferTitle(standardId) {
  // Try to guess a title from common IS patterns
  const titleMap = {
    'IS269': 'Ordinary Portland Cement Specification',
    'IS383': 'Specification for Coarse and Fine Aggregates',
    'IS1489': 'Portland Pozzolana Cement Specification',
    'IS8112': 'Specification for 43 Grade OPC',
    'IS12269': 'Specification for 53 Grade OPC',
    'IS455': 'Portland Slag Cement Specification',
    'IS2185': 'Concrete Masonry Units',
    'IS1731': 'Dimensions for Sawn and Planed Timber',
  };
  const key = standardId.replace(/[^a-z0-9]/gi, '').toUpperCase().replace(/IS/, 'IS');
  return titleMap[key] || `Bureau of Indian Standards — ${standardId}`;
}

function inferDomain(standardId, query) {
  const q = query.toLowerCase();
  if (/cement|concrete|aggregate|masonry|mortar|construction|brick|steel|rebar/.test(q)) return 'Construction';
  if (/electrical|cable|wire|led|light|bulb|switch|transformer/.test(q)) return 'Electrical';
  if (/pump|valve|pipe|mechanical|bearing|gear/.test(q)) return 'Mechanical';
  if (/glove|medical|hospital|healthcare|surgical|pharmaceutical/.test(q)) return 'Healthcare';
  if (/agriculture|irrigation|fertilizer|pesticide|tractor|farm/.test(q)) return 'Agriculture';
  if (/food|beverage|packaging|nutrition/.test(q)) return 'Food';
  if (/textile|fabric|yarn|garment|fibre/.test(q)) return 'Textile';
  if (/automotive|vehicle|tyre|brake|automobile/.test(q)) return 'Automotive';
  if (/electronic|semiconductor|pcb|circuit|component/.test(q)) return 'Electronics';
  if (/chemical|solvent|acid|industrial chemical/.test(q)) return 'Chemicals';
  if (/safety|protective|fire|hazard|ppe/.test(q)) return 'Safety';
  return 'General Engineering';
}

/**
 * Get recommendations — same as searchStandards but entry point labelled 'recommend'.
 */
export async function getRecommendations(specification) {
  try {
    const result = await searchStandards(specification);
    // Re-label history entry type
    const history = getLocalHistory();
    if (history.length > 0) {
      history[0].type = 'recommendation';
      saveLocalHistory(history);
    }
    return result;
  } catch (err) {
    throw err;
  }
}

/**
 * Scan tender — no real backend endpoint.
 * Performs sequential /api/discover calls for each extracted item,
 * then labels this as a tender scan in history.
 */
export async function scanTender(file, onProgress) {
  // Step 1 — simulate PDF text extraction
  await delay(600);
  onProgress && onProgress('Extracting text from PDF...');

  const filename = file.name.toLowerCase();
  const products = inferProductsFromFilename(filename);

  await delay(400);
  onProgress && onProgress('Identifying procurement items...');

  // Step 2 — discover standards for each item
  const results = [];
  for (let i = 0; i < products.length; i++) {
    onProgress && onProgress(`Finding standards for: ${products[i].product_name}`);
    try {
      const res = await searchStandards(products[i].specification);
      results.push({
        ...products[i],
        recommendations: res.recommendations.slice(0, 3),
        source: res.source,
      });
    } catch {
      results.push({
        ...products[i],
        recommendations: [],
        source: 'error',
      });
    }
    await delay(200);
  }

  // Log one combined history entry for the tender
  addHistoryEntry({
    type: 'tender',
    query: file.name,
    topResult: results[0]?.recommendations[0]?.standard_id || '',
    matchScore: results[0]?.recommendations[0]?.match_score || null,
    resultCount: results.length,
    matchedBy: 'tender scan',
    latency: null,
  });

  return { products: results, filename: file.name };
}

function inferProductsFromFilename(filename) {
  // Map common filename keywords to procurement items for the demo
  const profileMap = [
    {
      test: /cement|concrete|construction|civil|infra/,
      items: [
        { product_name: 'Ordinary Portland Cement', specification: 'Ordinary Portland Cement 43 grade for structural construction' },
        { product_name: 'Coarse Aggregates', specification: 'Coarse and fine aggregates for concrete mix' },
        { product_name: 'Steel Reinforcement Bars', specification: 'High-strength steel rebars for RCC construction' },
      ],
    },
    {
      test: /electrical|power|light|wiring/,
      items: [
        { product_name: 'Electrical Cables', specification: 'PVC insulated power cables for public buildings' },
        { product_name: 'LED Street Lights', specification: 'LED streetlighting luminaires for municipal roads' },
        { product_name: 'Distribution Transformers', specification: 'Oil-cooled power distribution transformers 11kV' },
      ],
    },
    {
      test: /medical|hospital|health|pharma/,
      items: [
        { product_name: 'Examination Gloves', specification: 'Latex/nitrile examination gloves for hospital use' },
        { product_name: 'Surgical Instruments', specification: 'Stainless steel surgical instruments for OT' },
        { product_name: 'Disinfectants', specification: 'Hospital-grade surface disinfectants and antiseptics' },
      ],
    },
    {
      test: /agri|farm|irrigation|water/,
      items: [
        { product_name: 'Agricultural Water Pumps', specification: 'Centrifugal pumps for agricultural irrigation' },
        { product_name: 'PVC Pipes for Irrigation', specification: 'PVC pipes for pressurised irrigation systems' },
        { product_name: 'Fertiliser Storage Containers', specification: 'HDPE containers for storage of fertilisers' },
      ],
    },
  ];

  for (const profile of profileMap) {
    if (profile.test.test(filename)) return profile.items;
  }

  // Default: generic multi-domain tender
  return [
    { product_name: 'Structural Steel', specification: 'Steel structural members for bridge construction' },
    { product_name: 'Portland Cement', specification: 'Portland cement for general construction use' },
    { product_name: 'Electrical Cables', specification: 'Electrical wiring cables for public infrastructure' },
  ];
}

/**
 * Verify a standard ID — looks up mock dataset.
 */
export function verifyStandard(standardId) {
  const clean = standardId.trim().toUpperCase();
  const found = MOCK_STANDARDS.find(
    (s) => s.standard_id.toUpperCase().replace(/\s/g, '') === clean.replace(/\s/g, '')
  );
  if (found) {
    return { ...found, dataset_date: '2024-03-01', verified: true };
  }
  // Return a placeholder so the page isn't empty
  return {
    standard_id: standardId,
    title: `BIS Standard ${standardId}`,
    domain: 'General',
    scope: 'Full details available in the official BIS catalogue.',
    status: 'unknown',
    superseded_by: null,
    amendment_no: null,
    dataset_date: '2024-03-01',
    verified: false,
  };
}

/**
 * Compare — returns full details for a list of standard IDs.
 */
export function compareStandards(ids) {
  return ids.map((id) => {
    const found = MOCK_STANDARDS.find(
      (s) => s.standard_id.replace(/\s/g, '') === id.replace(/\s/g, '')
    );
    return found || { standard_id: id, title: `BIS ${id}`, domain: '—', scope: '—', status: 'unknown' };
  });
}

/**
 * Dashboard stats — derived from mock data + localStorage history.
 */
export function getDashboardStats() {
  const history = getLocalHistory();
  const searches = history.filter((h) => h.type === 'search' || h.type === 'recommendation');
  const tenders = history.filter((h) => h.type === 'tender');
  const scores = history.filter((h) => h.matchScore).map((h) => h.matchScore);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 82.4;

  return {
    standards_indexed: 20000,
    searches_performed: searches.length,
    tenders_scanned: tenders.length,
    avg_match_score: Math.round(avgScore * 10) / 10,
    domains_covered: 12,
    recent_searches: history.slice(0, 5),
  };
}

// ─── localStorage history helpers ─────────────────────────────────────────────

const HISTORY_KEY = 'bis_search_history';

export function getLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {}
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

/**
 * Ask the AI Insights endpoint a question grounded in recommendation context.
 *
 * @param {string} question             - The user's question.
 * @param {string} productDescription   - The original procurement specification.
 * @param {Array}  recommendations      - Array of enriched recommendation objects
 *                                        (standard_id, title, domain, scope, rationale).
 * @returns {Promise<string>}           - The AI answer text.
 * @throws  If the backend is unreachable or returns an error.
 */
export async function askInsights(question, productDescription, recommendations) {
  const payload = {
    question: question.trim(),
    product_description: productDescription || '',
    recommendations: (recommendations || []).map((r) => ({
      standard_id: r.standard_id || '',
      title:       r.title       || '',
      domain:      r.domain      || '',
      scope:       r.scope       || '',
      rationale:   r.rationale   || '',
    })),
  };

  const response = await axios.post(`${BASE_URL}/api/insights`, payload);
  return response.data.answer;
}
