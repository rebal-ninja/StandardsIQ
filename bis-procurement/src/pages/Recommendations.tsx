import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Search, Scale } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MatchScore from '../components/MatchScore';
import { discoverStandards } from '../api';
import type { BISRecommendation } from '../api';

const EXAMPLE_QUERIES = [
  'Structural steel for bridge construction',
  'Disposable medical gloves for hospital use',
  'Precast concrete pipes for drainage',
  'Electrical cables for industrial installations',
];

const Recommendations = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const prefilled = (location.state as any)?.query ?? '';

  const [query, setQuery] = useState<string>(prefilled);
  const [results, setResults] = useState<BISRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);

  // Auto-run if arriving with a prefilled query
  useEffect(() => {
    if (prefilled.trim()) {
      runSearch(prefilled.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    try {
      const result = await discoverStandards(q.trim());
      setResults(result.recommendations);
      setLatency(result.latency_seconds);
      setMatchedBy(result.matched_by ?? null);
      // Persist to history
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'search',
        query: q.trim(),
        top_result: result.recommendations[0]?.standard_id ?? '—',
        match_score: result.recommendations[0]?.similarity_score
          ? Math.round(result.recommendations[0].similarity_score * 100)
          : 0,
      };
      const existing = JSON.parse(localStorage.getItem('siq_history') ?? '[]');
      localStorage.setItem('siq_history', JSON.stringify([entry, ...existing].slice(0, 50)));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch recommendations. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">AI-Assisted Recommendations</h1>
        <p className="text-text-muted mt-1 text-sm">
          Describe a procurement requirement in plain language to retrieve relevant BIS standards.
        </p>
      </div>

      {/* Search form */}
      <GlassCard>
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="search-focus-glow rounded-lg transition-all">
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Describe your procurement requirement in plain language…&#10;e.g. High tensile structural steel for bridge construction"
              rows={3}
              className="w-full bg-transparent border border-glass-border rounded-lg p-4 text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent-teal transition-colors"
            />
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuery(q); runSearch(q); }}
                  className="text-xs text-text-muted border border-glass-border rounded-md px-3 py-1.5 hover:border-accent-teal hover:text-accent-teal transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="flex items-center gap-2 bg-accent-teal text-bg-base font-semibold px-5 py-2.5 rounded-lg cta-glow hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <motion.div
                    className="w-4 h-4 border-2 border-bg-base border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Retrieving…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Get Recommendations
                </>
              )}
            </button>
          </div>
        </form>
      </GlassCard>

      {/* Error */}
      {error && (
        <GlassCard className="border-accent-red/30">
          <p className="text-accent-red text-sm">{error}</p>
        </GlassCard>
      )}

      {/* Results */}
      {!isLoading && hasSearched && !error && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <GlassCard>
              <div className="text-center py-6">
                <Search className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No standards found for this requirement.</p>
                <p className="text-text-muted text-sm mt-1">Try rephrasing or broadening your description.</p>
              </div>
            </GlassCard>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm text-text-muted px-1 flex-wrap gap-2">
                <span>
                  {results.length} standard{results.length !== 1 ? 's' : ''} found
                </span>
                <div className="flex items-center gap-3">
                  {latency != null && <span className="mono">{latency.toFixed(2)}s</span>}
                  {matchedBy && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      matchedBy.toLowerCase().includes('fallback')
                        ? 'border-accent-amber/40 text-accent-amber'
                        : 'border-accent-teal/40 text-accent-teal'
                    }`}>
                      {matchedBy}
                    </span>
                  )}
                </div>
              </div>
              {results.map((rec, i) => (
                <GlassCard key={i}>
                  <div className="flex items-start gap-4">
                    <MatchScore
                      score={rec.similarity_score != null ? Math.round(rec.similarity_score * 100) : 0}
                      size={44}
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="mono font-semibold text-accent-teal">{rec.standard_id}</span>
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
                          onClick={() => navigate('/compare', { state: { standard: rec } })}
                          className="flex items-center gap-1.5 text-xs text-text-muted border border-glass-border rounded px-3 py-1 hover:border-accent-teal/50 hover:text-accent-teal transition-colors shrink-0"
                        >
                          <Scale size={12} />
                          Compare
                        </button>
                      </div>
                      {rec.title && <p className="font-semibold mt-1">{rec.title}</p>}
                      {rec.scope && <p className="text-text-muted text-sm mt-1 leading-relaxed">{rec.scope}</p>}
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
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Recommendations;
