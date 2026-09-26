import React, { useRef } from 'react';
import './SearchBar.css';

function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search any product, specification or procurement requirement…',
  loading = false,
  autoFocus = false,
}) {
  const inputRef = useRef(null);

  const handleKey = (e) => {
    if (e.key === 'Enter') onSubmit && onSubmit(value);
  };

  return (
    <div className="search-bar">
      <div className="search-bar__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        ref={inputRef}
        className="search-bar__input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={loading}
        autoFocus={autoFocus}
        aria-label="Search BIS standards"
      />
      <button
        className="search-bar__btn"
        onClick={() => onSubmit && onSubmit(value)}
        disabled={loading || !value.trim()}
        aria-label="Submit search"
      >
        {loading ? (
          <span className="search-bar__spinner" aria-label="Searching…" />
        ) : (
          'Search'
        )}
      </button>
    </div>
  );
}

export default SearchBar;
