import React from 'react';
import './EmptyState.css';

function EmptyState({ icon = '📋', title = 'No results', message, action, onAction }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__icon" aria-hidden="true">{icon}</div>
      <h3 className="empty-state__title">{title}</h3>
      {message && <p className="empty-state__message">{message}</p>}
      {action && onAction && (
        <button className="empty-state__btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
