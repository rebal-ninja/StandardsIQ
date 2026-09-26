import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Search, FileText, Trash2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';

type HistoryEntry = {
  id: string;
  timestamp: string;
  type: 'search' | 'tender';
  query: string;
  top_result: string;
  match_score: number;
};

const STORAGE_KEY = 'siq_history';

const History = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setEntries(parsed.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ));
        }
      } catch { /* ignore */ }
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-accent-teal';
    if (score >= 40) return 'text-accent-amber';
    return 'text-accent-red';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Search History</h1>
          <p className="text-text-muted mt-1 text-sm">
            Your recent searches and tender scans, stored locally in this browser.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-2 text-sm text-text-muted border border-glass-border rounded-lg px-4 py-2 hover:border-accent-red/50 hover:text-accent-red transition-colors"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <GlassCard>
          <div className="text-center py-12">
            <Clock className="w-10 h-10 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted font-medium">No recent activity yet.</p>
            <p className="text-text-muted text-sm mt-1 mb-6">
              Your searches and tender scans will appear here.
            </p>
            <button
              onClick={() => navigate('/search')}
              className="inline-flex items-center gap-2 text-accent-teal border border-accent-teal/40 rounded-lg px-5 py-2.5 hover:bg-accent-teal/10 transition-colors text-sm font-medium"
            >
              Try your first standards search
              <ArrowRight size={14} />
            </button>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <GlassCard className="hover:border-accent-teal/30 cursor-default transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 p-2 rounded-lg ${
                    entry.type === 'search' ? 'bg-accent-teal/10' : 'bg-accent-amber/10'
                  }`}>
                    {entry.type === 'search'
                      ? <Search size={16} className="text-accent-teal" />
                      : <FileText size={16} className="text-accent-amber" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium truncate">{entry.query}</p>
                      <span className="text-xs text-text-muted whitespace-nowrap shrink-0">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm">
                      <span className="text-text-muted">
                        Top result: <span className="mono text-text-primary">{entry.top_result}</span>
                      </span>
                      {entry.match_score > 0 && (
                        <span className={`mono font-semibold ${getScoreColor(entry.match_score)}`}>
                          {entry.match_score}%
                        </span>
                      )}
                      <span className="text-xs text-text-muted capitalize border border-glass-border rounded px-2 py-0.5">
                        {entry.type === 'search' ? 'Search' : 'Tender scan'}
                      </span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
