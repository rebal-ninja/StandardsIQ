import React from 'react';
import MatchScore from './MatchScore';
import StatusBadge from './StatusBadge';
import './StandardCard.css';

/**
 * Reusable standard result card.
 *
 * Props:
 *  standard      — { standard_id, title, domain, scope, status, match_score, rationale, matched_by }
 *  rank          — optional rank number
 *  onAddCompare  — optional callback(standard_id) — shows checkbox if provided
 *  compareIds    — array of currently selected compare IDs
 *  showScore     — default true
 */
function StandardCard({ standard, rank, onAddCompare, compareIds = [], showScore = true }) {
  const isSelected = compareIds.includes(standard.standard_id);

  return (
    <div className={`std-card ${isSelected ? 'std-card--selected' : ''}`}>
      {/* Top row */}
      <div className="std-card__header">
        <div className="std-card__left">
          {rank != null && (
            <span className="std-card__rank" aria-label={`Rank ${rank}`}>#{rank}</span>
          )}
          <div>
            <span className="std-card__id">{standard.standard_id}</span>
            {standard.amendment_no && (
              <span className="std-card__amendment">{standard.amendment_no}</span>
            )}
          </div>
        </div>

        <div className="std-card__badges">
          {standard.status && <StatusBadge status={standard.status} />}
          {standard.domain && (
            <span className="std-card__domain">{standard.domain}</span>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="std-card__title">{standard.title || standard.standard_id}</h3>

      {/* Scope */}
      {standard.scope && (
        <p className="std-card__scope">{standard.scope}</p>
      )}

      {/* Footer */}
      <div className="std-card__footer">
        <div className="std-card__meta">
          {standard.rationale && (
            <p className="std-card__rationale">
              <span className="std-card__rationale-label">Why it matches: </span>
              {standard.rationale}
            </p>
          )}
          {standard.matched_by && (
            <span className="std-card__method">
              via {standard.matched_by}
            </span>
          )}
          {standard.superseded_by && (
            <p className="std-card__superseded">
              ⚠ Superseded by {standard.superseded_by}
            </p>
          )}
        </div>

        <div className="std-card__actions">
          {showScore && standard.match_score != null && (
            <MatchScore score={standard.match_score} size={52} />
          )}
          {onAddCompare && (
            <label className="std-card__compare-label" aria-label="Add to compare">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onAddCompare(standard.standard_id)}
                aria-label={`Compare ${standard.standard_id}`}
              />
              <span>Compare</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

export default StandardCard;
