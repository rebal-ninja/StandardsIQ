import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory, clearHistory, deleteHistoryEntry } from '../services/history';
import EmptyState from '../components/EmptyState';
import './History.css';

const TYPE_META = {
  search:         { label: 'Search',         icon: '🔍', color: 'var(--accent-teal)' },
  recommendation: { label: 'Recommendation', icon: '★',  color: 'var(--accent-amber)' },
  tender:         { label: 'Tender Scan',    icon: '📄', color: 'var(--text-muted)' },
};

function HistoryEntry({ entry, onDelete, onReopen }) {
  const meta = TYPE_META[entry.type] || TYPE_META.search;
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="history-entry">
      <div className="history-entry__left">
        <div className="history-entry__type-badge" style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span>
          {meta.label}
        </div>
        <div className="history-entry__body">
          <p className="history-entry__query">{entry.query}</p>
          <p className="history-entry__meta">
            {dateStr}
            {entry.topResult && (
              <>
                {' · '}
                <span className="history-entry__top-result">{entry.topResult}</span>
              </>
            )}
            {entry.matchedBy && (
              <>
                {' · '}
                <span className="history-entry__method">{entry.matchedBy}</span>
              </>
            )}
            {entry.resultCount != null && (
              <>
                {' · '}
                {entry.resultCount} result{entry.resultCount !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="history-entry__right">
        {entry.matchScore != null && (
          <div className={`history-entry__score ${
            entry.matchScore >= 70 ? 'score--high' :
            entry.matchScore >= 40 ? 'score--med' : 'score--low'
          }`}>
            {entry.matchScore}%
          </div>
        )}
        {entry.latency != null && (
          <span className="history-entry__latency">⚡ {entry.latency.toFixed(2)}s</span>
        )}
        <button
          className="history-entry__btn history-entry__btn--reopen"
          onClick={() => onReopen(entry)}
          aria-label={`Reopen ${entry.query}`}
        >
          Reopen
        </button>
        <button
          className="history-entry__btn history-entry__btn--delete"
          onClick={() => onDelete(entry.id)}
          aria-label={`Delete history entry for ${entry.query}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function History() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setEntries(getHistory());
  }, []);

  const handleDelete = (id) => {
    deleteHistoryEntry(id);
    setEntries(getHistory());
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all history? This cannot be undone.')) {
      clearHistory();
      setEntries([]);
    }
  };

  const handleReopen = (entry) => {
    if (entry.type === 'tender') {
      navigate('/scan');
    } else if (entry.type === 'recommendation') {
      navigate(`/recommend?q=${encodeURIComponent(entry.query)}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(entry.query)}`);
    }
  };

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => e.type === filter);

  const counts = {
    all: entries.length,
    search: entries.filter((e) => e.type === 'search').length,
    recommendation: entries.filter((e) => e.type === 'recommendation').length,
    tender: entries.filter((e) => e.type === 'tender').length,
  };

  return (
    <div className="history-page">
      <div className="history-page__header">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">
            Your previous searches, recommendations, and tender scans. History is saved locally in your browser.
          </p>
        </div>
        {entries.length > 0 && (
          <button className="history-clear-btn" onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="history-tabs" role="tablist" aria-label="Filter history by type">
        {[
          { key: 'all',            label: 'All' },
          { key: 'search',         label: 'Searches' },
          { key: 'recommendation', label: 'Recommendations' },
          { key: 'tender',         label: 'Tender Scans' },
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            className={`history-tab ${filter === tab.key ? 'history-tab--active' : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="history-tab__count">{counts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🕐"
          title="No history yet"
          message={
            filter === 'all'
              ? 'Your searches and tender scans will appear here. History persists across page refreshes.'
              : `No ${filter} history yet.`
          }
          action="Go to Search"
          onAction={() => navigate('/search')}
        />
      ) : (
        <div className="history-list">
          {filtered.map((entry) => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              onDelete={handleDelete}
              onReopen={handleReopen}
            />
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <p className="history-footer-note">
          History is stored in your browser's localStorage. It is not synced to the server.
        </p>
      )}
    </div>
  );
}

export default History;
