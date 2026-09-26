import React from 'react';
import './LoadingState.css';

function LoadingState({ message = 'Loading…', steps = [] }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__spinner" aria-hidden="true" />
      <p className="loading-state__message">{message}</p>
      {steps.length > 0 && (
        <ul className="loading-state__steps" aria-label="Progress steps">
          {steps.map((step, i) => (
            <li
              key={i}
              className={`loading-state__step ${
                step.done ? 'done' : step.active ? 'active' : 'pending'
              }`}
            >
              <span className="loading-state__step-icon" aria-hidden="true">
                {step.done ? '✓' : step.active ? '◉' : '○'}
              </span>
              {step.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LoadingState;
