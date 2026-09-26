import { useState } from 'react';
import { Plus, Trash2, Scale } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { discoverStandards } from '../api';
import type { BISRecommendation } from '../api';

type PinnedStandard = BISRecommendation & { pinned_at: string };

const CompareStandards = () => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BISRecommendation[]>([]);
  const [pinned, setPinned] = useState<PinnedStandard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const result = await discoverStandards(query.trim());
      setSearchResults(result.recommendations);
    } catch (err: any) {
      setError(err?.message ?? 'Search failed. Is the backend running?');
    } finally {
      setIsSearching(false);
    }
  };

  const pin = (rec: BISRecommendation) => {
    if (pinned.length >= 4) return;
    if (pinned.some(p => p.standard_id === rec.standard_id)) return;
    setPinned(prev => [...prev, { ...rec, pinned_at: new Date().toISOString() }]);
  };

  const unpin = (id: string) => setPinned(prev => prev.filter(p => p.standard_id !== id));

  const fields: { key: keyof BISRecommendation; label: string }[] = [
    { key: 'standard_id', label: 'Standard ID' },
    { key: 'title', label: 'Title' },
    { key: 'domain', label: 'Domain' },
    { key: 'status', label: 'Status' },
    { key: 'year', label: 'Year' },
    { key: 'revision', label: 'Revision' },
    { key: 'scope', label: 'Scope' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Compare Standards</h1>
        <p className="text-text-muted mt-1 text-sm">
          Search for standards and pin up to 4 for side-by-side comparison.
        </p>
      </div>

      {/* Search */}
      <GlassCard>
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search standards to compare…"
            className="flex-1 bg-transparent border border-glass-border rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-teal transition-colors"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="flex items-center gap-2 bg-accent-teal text-bg-base font-semibold px-5 py-2.5 rounded-lg cta-glow hover:bg-opacity-90 disabled:opacity-50 transition-all"
          >
            <Scale size={16} />
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </GlassCard>

      {error && (
        <GlassCard className="border-accent-red/30">
          <p className="text-accent-red text-sm">{error}</p>
        </GlassCard>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <GlassCard>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Results — click to add to comparison
          </h2>
          <div className="space-y-2">
            {searchResults.map((rec, i) => {
              const alreadyPinned = pinned.some(p => p.standard_id === rec.standard_id);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-glass-border hover:border-accent-teal/40 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="mono text-accent-teal font-semibold">{rec.standard_id}</span>
                    {rec.title && <span className="text-sm ml-3">{rec.title}</span>}
                    {rec.domain && <span className="text-xs text-text-muted ml-3">{rec.domain}</span>}
                  </div>
                  <button
                    onClick={() => pin(rec)}
                    disabled={alreadyPinned || pinned.length >= 4}
                    className="flex items-center gap-1 text-xs border border-glass-border rounded px-3 py-1.5 hover:border-accent-teal hover:text-accent-teal disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Plus size={12} />
                    {alreadyPinned ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Comparison table */}
      {pinned.length === 0 ? (
        <GlassCard>
          <div className="text-center py-10">
            <Scale className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No standards selected for comparison yet.</p>
            <p className="text-text-muted text-sm mt-1">Search above and add up to 4 standards.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="overflow-x-auto">
          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left p-4 text-text-muted font-medium w-32">Field</th>
                  {pinned.map(p => (
                    <th key={p.standard_id} className="text-left p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-accent-teal font-semibold">{p.standard_id}</span>
                        <button
                          onClick={() => unpin(p.standard_id)}
                          className="text-text-muted hover:text-accent-red transition-colors"
                          aria-label={`Remove ${p.standard_id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map(({ key, label }) => (
                  <tr key={key} className="border-b border-glass-border/50 hover:bg-glass-surface transition-colors">
                    <td className="p-4 text-text-muted font-medium whitespace-nowrap">{label}</td>
                    {pinned.map(p => (
                      <td key={p.standard_id} className="p-4 align-top">
                        {key === 'status' ? (
                          <span className={`text-xs px-2 py-0.5 rounded border ${
                            p[key] === 'active'
                              ? 'border-accent-teal/40 text-accent-teal'
                              : 'border-accent-amber/40 text-accent-amber'
                          }`}>
                            {p[key] ?? '—'}
                          </span>
                        ) : (
                          <span className={key === 'standard_id' ? 'mono font-semibold' : ''}>
                            {(p[key] as string) || '—'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Match score row */}
                <tr className="hover:bg-glass-surface transition-colors">
                  <td className="p-4 text-text-muted font-medium">Relevance</td>
                  {pinned.map(p => (
                    <td key={p.standard_id} className="p-4">
                      {p.similarity_score != null ? (
                        <span className="mono text-accent-teal font-semibold">
                          {Math.round(p.similarity_score * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default CompareStandards;
