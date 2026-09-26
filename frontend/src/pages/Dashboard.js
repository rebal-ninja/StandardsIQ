import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import { getHistory } from '../services/history';
import SearchBar from '../components/SearchBar';
import './Dashboard.css';

const QUICK_EXAMPLES = [
  'Cement for structural construction',
  'LED street lights for municipal roads',
  'Hospital examination gloves',
  'Steel structural members for bridge construction',
  'Agricultural water pumps',
  'Electrical cables for public buildings',
];

const DOMAINS = [
  { name: 'Construction',      icon: '🏗', count: 4800 },
  { name: 'Electrical',        icon: '⚡', count: 2100 },
  { name: 'Mechanical',        icon: '⚙', count: 1900 },
  { name: 'Healthcare',        icon: '🏥', count: 1500 },
  { name: 'Agriculture',       icon: '🌾', count: 1200 },
  { name: 'Automotive',        icon: '🚗', count: 1100 },
  { name: 'Electronics',       icon: '💡', count: 980 },
  { name: 'Safety',            icon: '🦺', count: 870 },
  { name: 'Chemicals',         icon: '🧪', count: 760 },
  { name: 'Textile',           icon: '🧵', count: 720 },
  { name: 'Food',              icon: '🌾', count: 640 },
  { name: 'General Engg.',     icon: '🔧', count: 2430 },
];

function StatCard({ value, label, sub }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__value">{value}</div>
      <div className="dash-stat__label">{label}</div>
      {sub && <div className="dash-stat__sub">{sub}</div>}
    </div>
  );
}

function HistoryRow({ entry, onClick }) {
  const typeIcon = entry.type === 'tender' ? '📄' : entry.type === 'recommendation' ? '★' : '🔍';
  const typeLabel = entry.type === 'tender' ? 'Tender Scan' : entry.type === 'recommendation' ? 'Recommend' : 'Search';
  const date = new Date(entry.timestamp);
  const timeStr = date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="dash-history-row" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Reopen ${typeLabel}: ${entry.query}`}>
      <span className="dash-history-row__icon" aria-hidden="true">{typeIcon}</span>
      <div className="dash-history-row__body">
        <span className="dash-history-row__query">{entry.query}</span>
        <span className="dash-history-row__meta">
          {typeLabel} · {timeStr}
          {entry.topResult && <> · <span className="dash-history-row__std">{entry.topResult}</span></>}
        </span>
      </div>
      {entry.matchScore != null && (
        <span className="dash-history-row__score">{entry.matchScore}%</span>
      )}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setStats(getDashboardStats());
    setHistory(getHistory().slice(0, 6));
  }, []);

  const handleSearch = (q) => {
    const term = q || query;
    if (term.trim()) navigate(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  const handleExample = (example) => {
    navigate(`/search?q=${encodeURIComponent(example)}`);
  };

  const handleHistoryClick = (entry) => {
    if (entry.type === 'tender') {
      navigate('/scan');
    } else if (entry.type === 'recommendation') {
      navigate(`/recommend?q=${encodeURIComponent(entry.query)}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(entry.query)}`);
    }
  };

  return (
    <div className="dashboard">
      {/* Hero */}
      <section className="dash-hero">
        <div className="dash-hero__badge">StandardsIQ · Team NEXUS</div>
        <h1 className="dash-hero__title">
          Find the right BIS standard<br />
          <span className="dash-hero__accent">for any procurement requirement</span>
        </h1>
        <p className="dash-hero__sub">
          Enter any product, material, or specification. The system will identify applicable
          Indian Standards, rank them by relevance, and explain why each one matches.
        </p>

        <div className="dash-hero__search">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={handleSearch}
            placeholder="e.g. LED street lights for municipal roads…"
            autoFocus
          />
        </div>

        <div className="dash-hero__examples">
          <span className="dash-hero__examples-label">Try:</span>
          {QUICK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="dash-hero__chip"
              onClick={() => handleExample(ex)}
              aria-label={`Search for ${ex}`}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="dash-stats" aria-label="System statistics">
          <StatCard
            value={stats.standards_indexed.toLocaleString('en-IN')}
            label="Standards Indexed"
            sub="BIS SP 21 catalogue"
          />
          <StatCard
            value={stats.searches_performed || 0}
            label="Searches This Session"
          />
          <StatCard
            value={stats.tenders_scanned || 0}
            label="Tenders Scanned"
          />
          <StatCard
            value={`${stats.avg_match_score}%`}
            label="Avg Match Score"
          />
          <StatCard
            value={stats.domains_covered}
            label="Domains Covered"
          />
        </section>
      )}

      {/* Workflow */}
      <section className="dash-workflow" aria-label="How it works">
        <h2 className="dash-section-title">How It Works</h2>
        <div className="dash-workflow__steps">
          {[
            { n: '01', title: 'Enter Requirement',  desc: 'Describe your procurement need in plain language' },
            { n: '02', title: 'Semantic Search',    desc: 'RAG pipeline retrieves relevant BIS standards using vector search' },
            { n: '03', title: 'Ranked Results',     desc: 'Standards are ranked by relevance with match scores' },
            { n: '04', title: 'Verify & Compare',   desc: 'Check status, amendments, and compare candidates side by side' },
          ].map((step) => (
            <div key={step.n} className="dash-workflow__step">
              <span className="dash-workflow__step-n">{step.n}</span>
              <h3 className="dash-workflow__step-title">{step.title}</h3>
              <p className="dash-workflow__step-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Domains */}
      <section className="dash-domains" aria-label="Supported domains">
        <h2 className="dash-section-title">Supported Domains</h2>
        <div className="dash-domains__grid">
          {DOMAINS.map((d) => (
            <button
              key={d.name}
              className="dash-domain-card"
              onClick={() => navigate(`/search?q=${encodeURIComponent(d.name + ' standards')}`)}
              aria-label={`Browse ${d.name} standards`}
            >
              <span className="dash-domain-card__icon" aria-hidden="true">{d.icon}</span>
              <span className="dash-domain-card__name">{d.name}</span>
              <span className="dash-domain-card__count">{d.count.toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section className="dash-actions" aria-label="Quick actions">
        <h2 className="dash-section-title">Quick Actions</h2>
        <div className="dash-actions__grid">
          <button className="dash-action-btn dash-action-btn--primary" onClick={() => navigate('/search')}>
            <span aria-hidden="true">🔍</span> Search Standards
          </button>
          <button className="dash-action-btn" onClick={() => navigate('/scan')}>
            <span aria-hidden="true">📄</span> Scan a Tender PDF
          </button>
          <button className="dash-action-btn" onClick={() => navigate('/recommend')}>
            <span aria-hidden="true">★</span> Get Recommendations
          </button>
          <button className="dash-action-btn" onClick={() => navigate('/verify')}>
            <span aria-hidden="true">✓</span> Verify a Standard
          </button>
        </div>
      </section>

      {/* Recent history */}
      {history.length > 0 && (
        <section className="dash-recent" aria-label="Recent activity">
          <div className="dash-recent__header">
            <h2 className="dash-section-title" style={{ margin: 0 }}>Recent Activity</h2>
            <button className="dash-recent__view-all" onClick={() => navigate('/history')}>
              View all →
            </button>
          </div>
          <div className="dash-recent__list">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onClick={() => handleHistoryClick(entry)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Dashboard;
