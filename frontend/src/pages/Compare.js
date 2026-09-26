import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { compareStandards, searchStandards } from '../services/api';
import { MOCK_STANDARDS } from '../data/mockStandards';
import CompareTable from '../components/CompareTable';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import './Compare.css';

function Compare() {
  const [searchParams] = useSearchParams();

  // Standards to compare (from URL or selected manually)
  const [selectedIds, setSelectedIds] = useState(() => {
    const raw = searchParams.get('ids');
    return raw ? raw.split(',').map(decodeURIComponent) : [];
  });

  const [standards, setStandards] = useState([]);
  const [loading] = useState(false);

  // Add-by-ID input
  const [addQuery, setAddQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (selectedIds.length > 0) {
      const resolved = compareStandards(selectedIds);
      setStandards(resolved);
    } else {
      setStandards([]);
    }
  }, [selectedIds]);

  const handleRemove = (id) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleAdd = async () => {
    if (!addQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);

    try {
      const data = await searchStandards(addQuery);
      const candidates = (data.recommendations || []).filter(
        (r) => !selectedIds.includes(r.standard_id)
      );
      setSearchResults(candidates.slice(0, 5));
    } catch {
      // fallback: search mock data
      const tokens = addQuery.toLowerCase().split(/\s+/);
      const hits = MOCK_STANDARDS.filter((s) => {
        const text = `${s.standard_id} ${s.title} ${s.domain}`.toLowerCase();
        return tokens.some((t) => t.length > 2 && text.includes(t));
      }).filter((s) => !selectedIds.includes(s.standard_id)).slice(0, 5);
      setSearchResults(hits.map((s) => ({ ...s, match_score: 75 })));
    } finally {
      setSearchLoading(false);
    }
  };

  const addToCompare = (std) => {
    if (selectedIds.length >= 4) return;
    if (selectedIds.includes(std.standard_id)) return;
    setSelectedIds((prev) => [...prev, std.standard_id]);
    setSearchResults([]);
    setAddQuery('');
  };

  return (
    <div className="compare-page">
      <div className="compare-page__header">
        <h1 className="page-title">Compare Standards</h1>
        <p className="page-sub">
          Select 2–4 standards to compare side by side. Differences are highlighted automatically.
        </p>
      </div>

      {/* Add standards panel */}
      <div className="compare-add">
        <div className="compare-add__bar">
          <input
            type="text"
            className="compare-add__input"
            placeholder="Search to add a standard (e.g. IS 269, LED lights, hospital gloves)…"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            aria-label="Search for standard to add"
            disabled={selectedIds.length >= 4}
          />
          <button
            className="compare-add__btn"
            onClick={handleAdd}
            disabled={!addQuery.trim() || selectedIds.length >= 4 || searchLoading}
            aria-label="Search"
          >
            {searchLoading ? '…' : '+ Add'}
          </button>
        </div>

        {selectedIds.length >= 4 && (
          <p className="compare-add__limit">Maximum 4 standards can be compared at once.</p>
        )}

        {/* Search dropdown */}
        {searchResults.length > 0 && (
          <div className="compare-add__dropdown" role="listbox" aria-label="Search results">
            {searchResults.map((r) => (
              <button
                key={r.standard_id}
                className="compare-add__option"
                onClick={() => addToCompare(r)}
                role="option"
                aria-selected="false"
              >
                <span className="compare-add__option-id">{r.standard_id}</span>
                <span className="compare-add__option-title">{r.title || ''}</span>
                <span className="compare-add__option-domain">{r.domain || ''}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected chips */}
        {selectedIds.length > 0 && (
          <div className="compare-selected">
            <span className="compare-selected__label">Selected:</span>
            {selectedIds.map((id) => (
              <div key={id} className="compare-chip">
                <span className="compare-chip__id">{id}</span>
                <button
                  className="compare-chip__remove"
                  onClick={() => handleRemove(id)}
                  aria-label={`Remove ${id}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick-add from mock dataset */}
      {selectedIds.length === 0 && (
        <div className="compare-quick">
          <p className="compare-quick__label">Or pick from catalogue:</p>
          <div className="compare-quick__grid">
            {MOCK_STANDARDS.slice(0, 12).map((s) => (
              <button
                key={s.standard_id}
                className="compare-quick__card"
                onClick={() => addToCompare(s)}
                disabled={selectedIds.includes(s.standard_id)}
                aria-label={`Add ${s.standard_id}`}
              >
                <span className="compare-quick__card-id">{s.standard_id}</span>
                <span className="compare-quick__card-domain">{s.domain}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <LoadingState message="Loading standard details…" />}

      {!loading && selectedIds.length === 0 && (
        <EmptyState
          icon="⇄"
          title="No standards selected"
          message="Search for a standard above or visit the Search page and use the Compare checkbox on results."
        />
      )}

      {!loading && selectedIds.length === 1 && (
        <EmptyState
          icon="⇄"
          title="Select one more standard"
          message="Add at least one more standard to start the comparison."
        />
      )}

      {!loading && standards.length >= 2 && (
        <div className="compare-result">
          <div className="compare-result__header">
            <h2 className="compare-result__title">
              Comparing {standards.length} standard{standards.length !== 1 ? 's' : ''}
            </h2>
            <p className="compare-result__hint">
              <span className="compare-diff-dot" aria-hidden="true" /> Highlighted rows indicate differences
            </p>
          </div>
          <CompareTable standards={standards} onRemove={handleRemove} />
        </div>
      )}
    </div>
  );
}

export default Compare;
