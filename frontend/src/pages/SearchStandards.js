import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchStandards } from '../services/api';
import { DOMAINS } from '../data/mockStandards';
import SearchBar from '../components/SearchBar';
import StandardCard from '../components/StandardCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import './SearchStandards.css';

function SearchStandards() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [domain, setDomain] = useState('All Domains');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(
    async (q) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      setResults(null);
      setSearched(true);

      try {
        const data = await searchStandards(q);
        let recs = data.recommendations || [];
        if (domain !== 'All Domains') {
          recs = recs.filter(
            (r) => r.domain && r.domain.toLowerCase() === domain.toLowerCase()
          );
        }
        setResults(recs);
        setMeta({ latency: data.latency, matchedBy: data.matchedBy, source: data.source });
      } catch (err) {
        setError(err.message || 'Unable to reach the BIS search service.');
      } finally {
        setLoading(false);
      }
    },
    [domain]
  );

  // Auto-run when arriving from the dashboard with a pre-filled query
  useEffect(() => {
    if (initialQuery) {
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (q) => {
    const term = q || query;
    if (!term.trim()) return;
    setQuery(term);
    setSearchParams({ q: term });
    runSearch(term);
  };

  const handleDomainChange = (d) => {
    setDomain(d);
    // Re-filter without a new network call if we already have results
    if (results !== null && query.trim()) {
      handleSubmit(query);
    }
  };

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 4
        ? [...prev, id]
        : prev
    );
  };

  const goCompare = () => {
    navigate(`/compare?ids=${compareIds.map(encodeURIComponent).join(',')}`);
  };

  return (
    <div className="search-page">
      <div className="search-page__header">
        <h1 className="page-title">Search Standards</h1>
        <p className="page-sub">
          Enter any procurement requirement, product, or material specification.
        </p>
      </div>

      {/* Search bar */}
      <div className="search-page__bar-wrap">
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          loading={loading}
          autoFocus={!initialQuery}
        />
      </div>

      {/* Domain filter */}
      <div className="search-page__filters" role="group" aria-label="Domain filters">
        <span className="search-page__filter-label">Domain:</span>
        <div className="search-page__filter-pills">
          {DOMAINS.map((d) => (
            <button
              key={d}
              className={`filter-pill ${domain === d ? 'filter-pill--active' : ''}`}
              onClick={() => handleDomainChange(d)}
              aria-pressed={domain === d}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Compare bar */}
      {compareIds.length >= 2 && (
        <div className="search-page__compare-bar">
          <span>
            <strong>{compareIds.length}</strong> standards selected for comparison
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="compare-bar__clear" onClick={() => setCompareIds([])}>
              Clear
            </button>
            <button className="compare-bar__go" onClick={goCompare}>
              Compare →
            </button>
          </div>
        </div>
      )}

      {/* Meta info */}
      {meta && !loading && (
        <div className="search-page__meta" aria-live="polite">
          {meta.source === 'mock' && (
            <span className="search-page__meta-warn">
              ⚠ Backend unreachable — showing offline results
            </span>
          )}
          {meta.latency && (
            <span className="search-page__meta-item">
              ⚡ {meta.latency.toFixed(3)}s
            </span>
          )}
          {meta.matchedBy && (
            <span className="search-page__meta-item">
              🎯 {meta.matchedBy}
            </span>
          )}
        </div>
      )}

      {/* States */}
      {loading && (
        <LoadingState message={`Searching for "${query}"…`} />
      )}

      {error && !loading && (
        <ErrorBanner
          message={error}
          onRetry={() => handleSubmit(query)}
        />
      )}

      {!loading && !error && results !== null && results.length === 0 && (
        <EmptyState
          icon="🔍"
          title="No standards found"
          message="No applicable standards found. Try a more specific description or select 'All Domains'."
          action="Clear filters"
          onAction={() => { setDomain('All Domains'); handleSubmit(query); }}
        />
      )}

      {!loading && !error && results && results.length > 0 && (
        <div className="search-page__results">
          <div className="search-page__results-header">
            <span className="search-page__results-count">
              {results.length} standard{results.length !== 1 ? 's' : ''} found
            </span>
            {compareIds.length > 0 && compareIds.length < 2 && (
              <span className="search-page__results-hint">
                Select one more standard to compare
              </span>
            )}
          </div>
          <div className="search-page__results-list">
            {results.map((rec, i) => (
              <StandardCard
                key={rec.standard_id + i}
                standard={rec}
                rank={i + 1}
                onAddCompare={toggleCompare}
                compareIds={compareIds}
              />
            ))}
          </div>
        </div>
      )}

      {!searched && !loading && (
        <div className="search-page__prompt">
          <div className="search-page__prompt-box">
            <p className="search-page__prompt-text">
              Search any product, material, or procurement requirement above.
            </p>
            <div className="search-page__examples">
              {[
                'Cement for structural construction',
                'LED street lights for municipal roads',
                'Hospital examination gloves',
                'Steel structural members for bridge construction',
                'Agricultural water pumps',
                'Electrical cables for public buildings',
              ].map((ex) => (
                <button
                  key={ex}
                  className="dash-hero__chip"
                  onClick={() => { setQuery(ex); handleSubmit(ex); }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchStandards;
