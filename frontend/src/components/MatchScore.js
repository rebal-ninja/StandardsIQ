import React from 'react';
import './MatchScore.css';

/**
 * Circular score indicator.
 * score: 0–100
 */
function MatchScore({ score, size = 52 }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 70 ? 'var(--accent-teal)' :
    score >= 40 ? 'var(--accent-amber)' :
    'var(--accent-red)';

  const label =
    score >= 70 ? 'high' :
    score >= 40 ? 'medium' : 'low';

  return (
    <div
      className={`match-score match-score--${label}`}
      style={{ width: size, height: size }}
      aria-label={`Match score: ${score}%`}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
        />
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="match-score__value" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export default MatchScore;
