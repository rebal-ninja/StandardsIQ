import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Search, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { discoverStandards } from '../api';
import type { BISRecommendation } from '../api';

const VerifyStandard = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<BISRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasVerified, setHasVerified] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setHasVerified(true);
    try {
      const res = await discoverStandards(query.trim());
      // Use the top match as the primary verification target
      const top = res.recommendations[0] ?? null;
      setResult(top);
    } catch (err: any) {
      setError(err?.message ?? 'Verification failed. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 text-accent-teal bg-accent-teal/10 border border-accent-teal/30 rounded-full px-3 py-1 text-sm font-medium">
          <CheckCircle size={14} />
          Active
        </span>
      );
    }
    if (status === 'superseded') {
      return (
        <span className="inline-flex items-center gap-1.5 text-accent-amber bg-accent-amber/10 border border-accent-amber/30 rounded-full px-3 py-1 text-sm font-medium">
          <AlertTriangle size={14} />
          Superseded
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-text-muted bg-glass-surface border border-glass-border rounded-full px-3 py-1 text-sm font-medium">
        <Info size={14} />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Verify Standard</h1>
        <p className="text-text-muted mt-1 text-sm">
          Check a standard number or description against the knowledge base to confirm its status and details.
        </p>
      </div>

      {/* Search */}
      <GlassCard>
        <form onSubmit={handleVerify} className="flex gap-3">
          <div className="relative flex-1">
            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter a standard number or description, e.g. IS 2062 or structural steel"
              className="w-full bg-transparent border border-glass-border rounded-lg pl-10 pr-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-teal transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="flex items-center gap-2 bg-accent-teal text-bg-base font-semibold px-5 py-2.5 rounded-lg cta-glow hover:bg-opacity-90 disabled:opacity-50 transition-all"
          >
            {isLoading ? (
              <>
                <motion.div
                  className="w-4 h-4 border-2 border-bg-base border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
                Verifying…
              </>
            ) : (
              <>
                <Search size={16} />
                Verify
              </>
            )}
          </button>
        </form>
      </GlassCard>

      {/* Error */}
      {error && (
        <GlassCard className="border-accent-red/30">
          <div className="flex items-start gap-3 text-accent-red">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        </GlassCard>
      )}

      {/* Result */}
      {!isLoading && hasVerified && !error && (
        result ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <GlassCard>
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="mono text-accent-teal text-xl font-semibold">{result.standard_id}</div>
                    {result.title && <h2 className="text-lg font-bold mt-1">{result.title}</h2>}
                  </div>
                  {result.status && <StatusBadge status={result.status} />}
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Domain', value: result.domain },
                    { label: 'Year', value: result.year },
                    { label: 'Revision', value: result.revision },
                    { label: 'Source', value: result.source },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="bg-glass-surface rounded-lg p-3 border border-glass-border">
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">{label}</div>
                      <div className="font-medium text-sm">{value}</div>
                    </div>
                  ) : null)}
                </div>

                {/* Scope */}
                {result.scope && (
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Scope</div>
                    <p className="text-text-muted text-sm leading-relaxed">{result.scope}</p>
                  </div>
                )}

                {/* Relevance */}
                {result.similarity_score != null && (
                  <div className="flex items-center gap-3 pt-2 border-t border-glass-border">
                    <span className="text-xs text-text-muted">Knowledge base match:</span>
                    <span className={`mono font-semibold text-sm ${
                      result.similarity_score >= 0.7 ? 'text-accent-teal' :
                      result.similarity_score >= 0.4 ? 'text-accent-amber' : 'text-accent-red'
                    }`}>
                      {Math.round(result.similarity_score * 100)}%
                    </span>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="flex items-start gap-2 text-xs text-text-muted bg-glass-surface rounded-lg p-3 border border-glass-border">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Results are based on the indexed BIS knowledge base. For authoritative status, consult the official BIS catalogue.
                  </span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <GlassCard>
            <div className="text-center py-8">
              <ShieldCheck className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No matching standard found in the knowledge base.</p>
            </div>
          </GlassCard>
        )
      )}
    </div>
  );
};

export default VerifyStandard;
