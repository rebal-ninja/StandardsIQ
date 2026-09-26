import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getRecommendations } from '../services/api';
import StandardCard from '../components/StandardCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import AIInsights from '../components/AIInsights';
import './Recommendations.css';

const SPEC_EXAMPLES = [
  {
    label: 'LED Street Lighting',
    spec: 'LED street lighting system for municipal roads with specified illumination levels, electrical safety, and weather resistance requirements.',
  },
  {
    label: 'Structural Cement',
    spec: 'High-strength Portland cement for reinforced concrete structural members in multi-storey buildings.',
  },
  {
    label: 'Hospital Gloves',
    spec: 'Disposable latex examination gloves for hospital use — sterile, powder-free, single-use, medium thickness.',
  },
  {
    label: 'Bridge Steel',
    spec: 'High tensile structural steel members for bridge construction — plates, I-sections, channels, and angles.',
  },
  {
    label: 'Agricultural Pumps',
    spec: 'Centrifugal monoblock pump sets for agricultural irrigation — 3-phase, submersible, 5 HP capacity.',
  },
  {
    label: 'Electrical Cables',
    spec: 'PVC insulated armoured power cables for underground installation in public buildings, 1100V grade.',
  },
];

function Recommendations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialQuery = searchParams.get('q') || '';
  const [spec, setSpec] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (initialQuery) runRecommend(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runRecommend = async (s) => {
    if (!s.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSubmitted(true);

    try {
      const data = await getRecommendations(s);
      setResults(data.recommendations || []);
      setMeta({ latency: data.latency, matchedBy: data.matchedBy, source: data.source });
    } catch (err) {
      setError(err.message || 'Unable to reach the BIS recommendation service.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runRecommend(spec);
  };

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const goCompare = () => {
    navigate(`/compare?ids=${compareIds.map(encodeURIComponent).join(',')}`);
  };

  return (
    <div className="recommend-page">
      <div className="recommend-page__header">
        <h1 className="page-title">Recommendations</h1>
        <p className="page-sub">
          Describe a procurement specification in detail. The system will rank the most relevant BIS standards and explain each match.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="recommend-form">
        <label className="recommend-form__label" htmlFor="spec-input">
          Procurement Specification
        </label>
        <textarea
          id="spec-input"
          className="recommend-form__textarea"
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="Describe the product, material, or requirement in as much detail as possible…"
          rows={5}
          disabled={loading}
          aria-label="Enter specification"
        />
        <div className="recommend-form__footer">
          <button
            type="submit"
            className="recommend-form__submit"
            disabled={loading || !spec.trim()}
          >
            {loading ? (
              <>
                <span className="search-bar__spinner" aria-hidden="true" />
                Analysing…
              </>
            ) : (
              '★ Get Recommendations'
            )}
          </button>
          {results && (
            <button
              type="button"
              className="recommend-form__clear"
              onClick={() => { setSpec(''); setResults(null); setMeta(null); setSubmitted(false); }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Example specs */}
      {!submitted && (
        <div className="recommend-examples">
          <p className="recommend-examples__label">Example specifications:</p>
          <div className="recommend-examples__grid">
            {SPEC_EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                className="recommend-example-card"
                onClick={() => { setSpec(ex.spec); runRecommend(ex.spec); }}
              >
                <span className="recommend-example-card__label">{ex.label}</span>
                <span className="recommend-example-card__spec">{ex.spec.slice(0, 80)}…</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meta / source info */}
      {meta && !loading && (
        <div className="search-page__meta">
          {meta.source === 'mock' && (
            <span className="search-page__meta-warn">⚠ Backend unreachable — showing offline results</span>
          )}
          {meta.latency && (
            <span className="search-page__meta-item">⚡ {meta.latency.toFixed(3)}s</span>
          )}
          {meta.matchedBy && (
            <span className="search-page__meta-item">🎯 {meta.matchedBy}</span>
          )}
        </div>
      )}

      {/* Compare bar */}
      {compareIds.length >= 2 && (
        <div className="search-page__compare-bar">
          <span><strong>{compareIds.length}</strong> standards selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="compare-bar__clear" onClick={() => setCompareIds([])}>Clear</button>
            <button className="compare-bar__go" onClick={goCompare}>Compare →</button>
          </div>
        </div>
      )}

      {/* Results */}
      {loading && (
        <LoadingState
          message="Analysing specification and ranking standards…"
          steps={[
            { label: 'Parsing specification', done: true, active: false },
            { label: 'Running vector retrieval', done: false, active: true },
            { label: 'Ranking by relevance', done: false, active: false },
            { label: 'Generating explanations', done: false, active: false },
          ]}
        />
      )}

      {error && !loading && (
        <ErrorBanner message={error} onRetry={() => runRecommend(spec)} />
      )}

      {!loading && !error && results !== null && results.length === 0 && (
        <EmptyState
          icon="★"
          title="No recommendations found"
          message="No applicable standards found for this specification. Try a more detailed description."
        />
      )}

      {!loading && !error && results && results.length > 0 && (
        <div className="recommend-results">
          <h2 className="recommend-results__title">
            {results.length} Recommended Standard{results.length !== 1 ? 's' : ''}
          </h2>
          <div className="recommend-results__list">
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
          <p className="recommend-results__disclaimer">
            ✓ Recommendations are based on semantic retrieval from BIS SP 21. Verify against official BIS documentation before procurement.
          </p>
        </div>
      )}

      {/* AI Insights — only shown when recommendations are available */}
      {!loading && !error && results && results.length > 0 && (
        <AIInsights
          productDescription={spec}
          recommendations={results}
        />
      )}
    </div>
  );
}

export default Recommendations;
