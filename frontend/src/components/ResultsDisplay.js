import React from 'react';
import StandardCard from './StandardCard';
import './ResultsDisplay.css';

function ResultsDisplay({ recommendations, latency, matchedBy }) {
  return (
    <div className="results-display">
      <div className="results-header">
        <h2>📋 Recommended Standards</h2>
        <div className="results-metadata">
          <span className="metadata-item">
            ⚡ Response Time: <strong>{latency.toFixed(3)}s</strong>
          </span>
          <span className="metadata-item">
            🎯 Source: <strong>{matchedBy}</strong>
          </span>
        </div>
      </div>

      <div className="standards-grid">
        {recommendations.map((rec, index) => (
          <StandardCard key={index} standard={rec} rank={index + 1} />
        ))}
      </div>

      <div className="results-footer">
        <p>
          ✓ These standards are recommended based on your product description.
          Verify with official BIS documentation before implementation.
        </p>
      </div>
    </div>
  );
}

export default ResultsDisplay;
