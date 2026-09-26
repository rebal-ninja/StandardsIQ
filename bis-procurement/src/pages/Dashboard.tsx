import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Sparkles, FileUp, ShieldCheck, ArrowRight,
  Clock, ChevronRight, AlertCircle, Zap,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MatchScore from '../components/MatchScore';
import { discoverStandards } from '../api';
import type { BISRecommendation } from '../api';

// ── Types ──────────────────────────────────────────────────────────────────
type HistoryEntry = {
  id: string;
  timestamp: string;
  type: 'search' | 'tender';
  query: string;
  top_result: string;
  match_score: number;
};

// ── Demo example queries ───────────────────────────────────────────────────
const EXAMPLE_QUERIES = [
  'Structural steel for bridge construction',
  'Disposable medical gloves for hospital use',
  'Precast concrete pipes for drainage',
];

// ── Quick actions (secondary nav) ─────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: 'Recommendations',
    description: 'AI-assisted retrieval',
    icon: Sparkles,
    path: '/recommend',
    color: 'text-accent-teal',
    border: 'border-accent-teal/20 hover:border-accent-teal/50',
    bg: 'bg-accent-teal/5 hover:bg-accent-teal/10',
  },
  {
    label: 'Scan Tender',
    description: 'Upload PDF, extract standards',
    icon: FileUp,
    path: '/scan',
    color: 'text-accent-amber',
    border: 'border-accent-amber/20 hover:border-accent-amber/50',
    bg: 'bg-accent-amber/5 hover:bg-accent-amber/10',
  },
  {
    label: 'Compare',
    description: 'Side-by-side comparison',
    icon: Search,
    path: '/compare',
    color: 'text-accent-teal',
    border: 'border-accent-teal/20 hover:border-accent-teal/50',
    bg: 'bg-accent-teal/5 hover:bg-accent-teal/10',
  },
  {
    label: 'Verify Standard',
    description: 'Check knowledge base status',
    icon: ShieldCheck,
    path: '/verify',
    color: 'text-accent-amber',
    border: 'border-accent-amber/20 hover:border-accent-amber/50',
    bg: 'bg-accent-amber/5 hover:bg-accent-amber/10',
  },
];

// ── Component ──────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<BISRecommendation[]>([]);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load history from localStorage
  useEffect(() => {
    const raw = localStorage.getItem('siq_history');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(
            parsed
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 4),
          );
        }
      } catch { /* ignore */ }
    }
  }, [hasSearched]); // refresh after each search

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setMatchedBy(null);
    setHasSearched(true);
    setCurrentQuery(trimmed);

    try {
      const result = await discoverStandards(trimmed);
      setResults(result.recommendations);
      setMatchedBy(result.matched_by ?? null);
      setLatency(result.latency_seconds);

      // Persist to history
      const entry: HistoryEntry = {
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
      setSearchError(
        err?.message ?? 'Could not reach the backend. Is the API server running?',
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleExampleClick = (q: string) => {
    setQuery(q);
    runSearch(q);
    inputRef.current?.focus();
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const isFallback =
    matchedBy != null &&
    matchedBy.toLowerCase().includes('fallback');

  return (
    <div className="space-y-8 pb-12">

      {/* ── Primary hero ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-5"
      >
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-text-primary leading-tight">
            What are you procuring?
          </h1>
          <p className="text-text-muted mt-2 max-w-xl leading-relaxed">
            Describe the product, material or technical requirement in plain language.
          </p>
        </div>

        {/* Search input */}
        <form
          onSubmit={handleSubmit}
          className="search-focus-glow rounded-xl border border-glass-border bg-glass-surface backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 px-4 py-1">
            <Search className="text-text-muted shrink-0" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Example: High tensile structural steel for bridge construction"
              className="flex-1 bg-transparent py-3.5 text-text-primary placeholder-text-muted focus:outline-none text-base"
              aria-label="Procurement requirement"
            />
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="flex items-center gap-2 bg-accent-teal text-bg-base font-bold px-5 py-2.5 rounded-lg cta-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shrink-0"
            >
              {isSearching ? (
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
                  Discover Standards
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>

          {/* Example chips */}
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            <span className="text-xs text-text-muted self-center">Try:</span>
            {EXAMPLE_QUERIES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => handleExampleClick(q)}
                disabled={isSearching}
                className="text-xs border border-glass-border rounded-full px-3 py-1 text-text-muted hover:border-accent-teal/60 hover:text-accent-teal disabled:opacity-40 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </form>
      </motion.div>

      {/* ── Search results ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {isSearching && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 text-text-muted py-4"
          >
            <motion.div
              className="w-5 h-5 border-2 border-accent-teal border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
            />
            <span className="text-sm">Retrieving from BIS knowledge base…</span>
          </motion.div>
        )}

        {!isSearching && searchError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard className="border-accent-red/30">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-accent-red shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-accent-red text-sm">Search failed</p>
                  <p className="text-text-muted text-sm mt-1">{searchError}</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {!isSearching && hasSearched && !searchError && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Results header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-text-muted">
                  {results.length > 0
                    ? `${results.length} standard${results.length !== 1 ? 's' : ''} for `
                    : 'No results for '}
                  <span className="text-text-primary font-medium">"{currentQuery}"</span>
                </span>
                {latency != null && (
                  <span className="mono text-xs text-text-muted">{latency.toFixed(2)}s</span>
                )}
              </div>

              {/* matched_by badge — surfaces LLM vs fallback clearly */}
              {matchedBy && (
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                  isFallback
                    ? 'border-accent-amber/40 text-accent-amber bg-accent-amber/5'
                    : 'border-accent-teal/40 text-accent-teal bg-accent-teal/5'
                }`}>
                  <Zap size={11} />
                  {matchedBy}
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <GlassCard>
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
                  <p className="text-text-muted">No standards found for this requirement.</p>
                  <p className="text-text-muted text-sm mt-1">
                    Try rephrasing or using different keywords.
                  </p>
                </div>
              </GlassCard>
            ) : (
              <>
                {results.map((rec, i) => (
                  <ResultCard
                    key={rec.standard_id || i}
                    rec={rec}
                    index={i}
                    onCompare={() =>
                      navigate('/compare', { state: { standard: rec } })
                    }
                  />
                ))}

                {/* CTA to full search/insights page */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() =>
                      navigate('/search', { state: { query: currentQuery } })
                    }
                    className="flex items-center gap-2 text-sm text-accent-teal border border-accent-teal/30 rounded-lg px-4 py-2.5 hover:bg-accent-teal/10 transition-colors"
                  >
                    <Sparkles size={14} />
                    Open with AI Insights
                  </button>
                  <button
                    onClick={() =>
                      navigate('/recommend', { state: { query: currentQuery } })
                    }
                    className="flex items-center gap-2 text-sm text-text-muted border border-glass-border rounded-lg px-4 py-2.5 hover:border-accent-teal/30 hover:text-text-primary transition-colors"
                  >
                    Full recommendations
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Secondary: recent history + quick actions ──────────────────── */}
      {!hasSearched && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="space-y-8"
        >
          {/* Quick actions */}
          <div>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
              Other tools
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className={`flex flex-col items-start gap-3 p-4 rounded-xl border transition-all text-left ${action.border} ${action.bg}`}
                >
                  <action.icon size={18} className={action.color} />
                  <div>
                    <div className="font-semibold text-sm text-text-primary">
                      {action.label}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {action.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent history */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <Clock size={13} />
                  Recent searches
                </h2>
                <button
                  onClick={() => navigate('/history')}
                  className="text-xs text-accent-teal hover:underline flex items-center gap-1"
                >
                  View all <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-2">
                {history.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setQuery(entry.query);
                      runSearch(entry.query);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-glass-border bg-glass-surface hover:border-accent-teal/30 text-left transition-colors"
                  >
                    <Search size={13} className="text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{entry.query}</p>
                      <p className="text-xs text-text-muted mt-0.5 mono">{entry.top_result}</p>
                    </div>
                    <span className="text-xs text-text-muted shrink-0 hidden sm:block">
                      {formatDate(entry.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

// ── Result card ────────────────────────────────────────────────────────────
type ResultCardProps = {
  rec: BISRecommendation;
  index: number;
  onCompare: () => void;
};

const ResultCard = ({ rec, index, onCompare }: ResultCardProps) => {
  const score =
    rec.similarity_score != null ? Math.round(rec.similarity_score * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      <GlassCard>
        <div className="flex items-start gap-4">
          <MatchScore score={score} size={44} />

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono font-bold text-accent-teal">{rec.standard_id}</span>
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
              <button
                onClick={onCompare}
                className="text-xs text-text-muted border border-glass-border rounded px-3 py-1 hover:border-accent-teal/50 hover:text-accent-teal transition-colors shrink-0"
                title="Add to comparison"
              >
                Compare
              </button>
            </div>

            {rec.title && (
              <p className="font-semibold text-text-primary">{rec.title}</p>
            )}

            {rec.scope && (
              <p className="text-text-muted text-sm leading-relaxed line-clamp-2">
                {rec.scope}
              </p>
            )}

            {/* Rationale — the "why" that judges need to see */}
            {rec.rationale && (
              <div className="mt-2 flex items-start gap-2 bg-accent-teal/5 border border-accent-teal/20 rounded-lg px-3 py-2">
                <Sparkles size={13} className="text-accent-teal shrink-0 mt-0.5" />
                <p className="text-xs text-text-muted leading-relaxed italic">
                  {rec.rationale}
                </p>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
};

export default Dashboard;
