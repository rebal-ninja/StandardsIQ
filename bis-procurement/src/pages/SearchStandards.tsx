import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Sparkles, MessageSquare, ChevronDown, ChevronUp,
  Zap, AlertCircle, Loader2, ArrowRight, Scale,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MatchScore from '../components/MatchScore';
import { discoverStandards, getInsights } from '../api';
import type { BISRecommendation } from '../api';

// ── Demo example queries ──────────────────────────────────────────────────
const EXAMPLE_QUERIES = [
  'Structural steel for bridge construction',
  'Disposable medical gloves for hospital use',
  'Precast concrete pipes for drainage',
];

// ── Preset insight questions ──────────────────────────────────────────────
const INSIGHT_QUESTIONS = [
  'Why was this standard recommended?',
  'What does this standard cover?',
  'Compare these standards.',
];

// ── Component ─────────────────────────────────────────────────────────────
const SearchStandards = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const prefilled = (location.state as any)?.query ?? '';

  const [query, setQuery] = useState<string>(prefilled);
  const [currentQuery, setCurrentQuery] = useState('');
  const [results, setResults] = useState<BISRecommendation[]>([]);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // AI Insights state
  const [insightQuestion, setInsightQuestion] = useState('');
  const [insightAnswer, setInsightAnswer] = useState<string | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-search when arriving from dashboard/landing
  useEffect(() => {
    if (prefilled.trim()) {
      runSearch(prefilled.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setResults([]);
    setMatchedBy(null);
    setHasSearched(true);
    setCurrentQuery(trimmed);
    // Reset insights when query changes
    setInsightAnswer(null);
    setInsightError(null);
    setInsightsOpen(false);

    try {
      const result = await discoverStandards(trimmed);
      setResults(result.recommendations);
      setMatchedBy(result.matched_by ?? null);
      setLatency(result.latency_seconds);

      // Persist to history
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'search',
        query: trimmed,
        top_result: result.recommendations[0]?.standard_id ?? '—',
        match_score:
          result.recommendations[0]?.similarity_score != null
            ? Math.round(result.recommendations[0].similarity_score * 100)
            : 0,
      };
      const existing = JSON.parse(localStorage.getItem('siq_history') ?? '[]');
      localStorage.setItem(
        'siq_history',
        JSON.stringify([entry, ...existing].slice(0, 50)),
      );
    } catch (err: any) {
      setError(err?.message ?? 'Search failed. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleExampleClick = (q: string) => {
    setQuery(q);
    runSearch(q);
  };

  // ── AI Insights ──────────────────────────────────────────────────────────
  const handleInsightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = insightQuestion.trim();
    if (!q || results.length === 0) return;
    setInsightLoading(true);
    setInsightAnswer(null);
    setInsightError(null);
    try {
      const resp = await getInsights({
        question: q,
        product_description: currentQuery,
        recommendations: results.map(r => ({
          standard_id: r.standard_id,
          title: r.title,
          domain: r.domain,
          scope: r.scope,
          rationale: r.rationale,
        })),
      });
      setInsightAnswer(resp.answer);
    } catch (err: any) {
      setInsightError(
        err?.message ?? 'AI Insights is unavailable. The LLM endpoint may be offline.',
      );
    } finally {
      setInsightLoading(false);
    }
  };

  const isFallback =
    matchedBy != null && matchedBy.toLowerCase().includes('fallback');

  return (
    <div className="space-y-6 pb-10">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Search Standards</h1>
        <p className="text-text-muted mt-1 text-sm">
          Enter a keyword or describe a requirement in plain language.
        </p>
      </div>

      {/* ── Search form ───────────────────────────────────────────────────── */}
      <GlassCard className="p-0 overflow-hidden">
        <form onSubmit={handleSearch}>
          <div className="flex items-center gap-3 px-4 py-1">
            <Search className="text-text-muted shrink-0" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search BIS standards by keyword or natural language…"
              className="flex-1 bg-transparent py-3.5 text-text-primary placeholder-text-muted focus:outline-none text-base"
              aria-label="Search query"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="flex items-center gap-2 bg-accent-teal text-bg-base font-bold px-5 py-2.5 rounded-lg cta-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shrink-0"
              aria-label="Search"
            >
              {isLoading ? (
                <>
                  <motion.div
                    className="w-4 h-4 border-2 border-bg-base border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                  />
                  Searching…
                </>
              ) : (
                <>
                  <Search size={15} />
                  Search
                </>
              )}
            </button>
          </div>
          {/* Example chips */}
          <div className="px-4 pb-3 border-t border-glass-border/50 pt-2.5 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-text-muted">Examples:</span>
            {EXAMPLE_QUERIES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => handleExampleClick(q)}
                disabled={isLoading}
                className="text-xs border border-glass-border rounded-full px-3 py-1 text-text-muted hover:border-accent-teal/60 hover:text-accent-teal disabled:opacity-40 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </form>
      </GlassCard>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-3 text-text-muted py-2">
          <motion.div
            className="w-5 h-5 border-2 border-accent-teal border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
          />
          <span className="text-sm">Retrieving from BIS knowledge base…</span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && !isLoading && (
        <GlassCard className="border-accent-red/30">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-accent-red shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-accent-red text-sm">Search failed</p>
              <p className="text-text-muted text-sm mt-1">{error}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {!isLoading && hasSearched && !error && (
        <div className="space-y-4">
          {/* Result count + matched_by + latency */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap text-sm text-text-muted">
              <span>
                {results.length > 0
                  ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                  : 'No results'}{' '}
                for{' '}
                <span className="text-text-primary font-medium">
                  "{currentQuery}"
                </span>
              </span>
              {latency != null && (
                <span className="mono text-xs">{latency.toFixed(2)}s</span>
              )}
            </div>

            {/* Retrieval mode badge — explicitly shows LLM vs fallback */}
            {matchedBy && (
              <div
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                  isFallback
                    ? 'border-accent-amber/40 text-accent-amber bg-accent-amber/5'
                    : 'border-accent-teal/40 text-accent-teal bg-accent-teal/5'
                }`}
                title={
                  isFallback
                    ? 'LLM unavailable — results are from vector retrieval only'
                    : 'Results include LLM-generated rationale'
                }
              >
                <Zap size={11} />
                {matchedBy}
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <GlassCard>
              <div className="text-center py-8">
                <Search className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
                <p className="text-text-muted">No standards found.</p>
                <p className="text-text-muted text-sm mt-1">
                  Try rephrasing or broadening your description.
                </p>
              </div>
            </GlassCard>
          ) : (
            <>
              {/* Standard result cards */}
              {results.map((rec, index) => (
                <motion.div
                  key={rec.standard_id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.3 }}
                >
                  <GlassCard>
                    <div className="flex items-start gap-4">
                      <MatchScore
                        score={
                          rec.similarity_score != null
                            ? Math.round(rec.similarity_score * 100)
                            : 0
                        }
                        size={44}
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="mono font-bold text-accent-teal">
                              {rec.standard_id}
                            </span>
                            {rec.status && rec.status !== 'active' && (
                              <span className="text-xs text-accent-amber border border-accent-amber/30 rounded px-2 py-0.5">
                                {rec.status}
                              </span>
                            )}
                            {rec.domain && (
                              <span className="text-xs text-text-muted border border-glass-border rounded px-2 py-0.5">
                                {rec.domain}
                              </span>
                            )}
                          </div>
                          {/* Compare action */}
                          <button
                            onClick={() =>
                              navigate('/compare', { state: { standard: rec } })
                            }
                            className="flex items-center gap-1.5 text-xs text-text-muted border border-glass-border rounded px-3 py-1 hover:border-accent-teal/50 hover:text-accent-teal transition-colors shrink-0"
                          >
                            <Scale size={12} />
                            Compare
                          </button>
                        </div>

                        {rec.title && (
                          <p className="font-semibold text-text-primary">
                            {rec.title}
                          </p>
                        )}
                        {rec.scope && (
                          <p className="text-text-muted text-sm leading-relaxed">
                            {rec.scope}
                          </p>
                        )}

                        {/* Rationale highlight */}
                        {rec.rationale && (
                          <div className="mt-2 flex items-start gap-2 bg-accent-teal/5 border border-accent-teal/20 rounded-lg px-3 py-2">
                            <Sparkles
                              size={13}
                              className="text-accent-teal shrink-0 mt-0.5"
                            />
                            <p className="text-xs text-text-muted leading-relaxed italic">
                              {rec.rationale}
                            </p>
                          </div>
                        )}

                        {/* Year / source metadata */}
                        {(rec.year || rec.source) && (
                          <p className="text-xs text-text-muted mono mt-1">
                            {[rec.year, rec.source].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}

              {/* ── AI Insights panel ─────────────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <GlassCard className="border-accent-teal/20">
                  {/* Insights header toggle */}
                  <button
                    className="w-full flex items-center justify-between gap-3 text-left"
                    onClick={() => setInsightsOpen(o => !o)}
                    aria-expanded={insightsOpen}
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-accent-teal/10 border border-accent-teal/20">
                        <MessageSquare size={15} className="text-accent-teal" />
                      </div>
                      <div>
                        <span className="font-semibold text-sm">AI Insights</span>
                        <span className="text-text-muted text-xs ml-2">
                          Ask questions about these results
                        </span>
                      </div>
                    </div>
                    {insightsOpen ? (
                      <ChevronUp size={16} className="text-text-muted shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-text-muted shrink-0" />
                    )}
                  </button>

                  <AnimatePresence>
                    {insightsOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-4 border-t border-glass-border mt-4">
                          {/* Preset question chips */}
                          <div className="flex flex-wrap gap-2">
                            {INSIGHT_QUESTIONS.map(q => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => {
                                  setInsightQuestion(q);
                                }}
                                className="text-xs border border-glass-border rounded-full px-3 py-1 text-text-muted hover:border-accent-teal/60 hover:text-accent-teal transition-colors"
                              >
                                {q}
                              </button>
                            ))}
                          </div>

                          {/* Input */}
                          <form
                            onSubmit={handleInsightSubmit}
                            className="flex gap-2"
                          >
                            <input
                              type="text"
                              value={insightQuestion}
                              onChange={e => setInsightQuestion(e.target.value)}
                              placeholder="Ask a question about these standards…"
                              className="flex-1 bg-transparent border border-glass-border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent-teal transition-colors"
                            />
                            <button
                              type="submit"
                              disabled={
                                insightLoading ||
                                !insightQuestion.trim() ||
                                results.length === 0
                              }
                              className="flex items-center gap-2 bg-accent-teal text-bg-base font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shrink-0"
                            >
                              {insightLoading ? (
                                <Loader2
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <ArrowRight size={15} />
                              )}
                              Ask
                            </button>
                          </form>

                          {/* Answer */}
                          <AnimatePresence mode="wait">
                            {insightLoading && (
                              <motion.div
                                key="ai-loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2 text-text-muted text-sm"
                              >
                                <Loader2 size={14} className="animate-spin text-accent-teal" />
                                Querying AI…
                              </motion.div>
                            )}

                            {!insightLoading && insightError && (
                              <motion.div
                                key="ai-error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-start gap-2 text-sm"
                              >
                                <AlertCircle
                                  size={15}
                                  className="text-accent-amber shrink-0 mt-0.5"
                                />
                                <div>
                                  <p className="text-accent-amber font-medium">
                                    AI Insights unavailable
                                  </p>
                                  <p className="text-text-muted mt-0.5 text-xs">
                                    {insightError}
                                  </p>
                                </div>
                              </motion.div>
                            )}

                            {!insightLoading && insightAnswer && (
                              <motion.div
                                key="ai-answer"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="bg-accent-teal/5 border border-accent-teal/20 rounded-lg p-4"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles
                                    size={13}
                                    className="text-accent-teal"
                                  />
                                  <span className="text-xs font-semibold text-accent-teal uppercase tracking-wide">
                                    AI Answer
                                  </span>
                                </div>
                                <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
                                  {insightAnswer}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </motion.div>
            </>
          )}
        </div>
      )}

      {/* Empty state before first search */}
      {!isLoading && !hasSearched && (
        <GlassCard>
          <div className="text-center py-10">
            <Search className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
            <p className="text-text-muted">
              Enter a requirement above to search the BIS knowledge base.
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default SearchStandards;
