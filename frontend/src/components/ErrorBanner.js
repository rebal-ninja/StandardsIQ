import React from 'react';
import './ErrorBanner.css';

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__body">
        <span className="error-banner__icon" aria-hidden="true">⚠</span>
        <div>
          <strong className="error-banner__label">Error</strong>
          <p className="error-banner__msg">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button className="error-banner__retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
