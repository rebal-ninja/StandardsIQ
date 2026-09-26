import React from 'react';
import './DiscoverForm.css';

function DiscoverForm({ description, setDescription, onDiscover, onClear, loading }) {
  return (
    <div className="discover-form">
      <label htmlFor="description" className="form-label">
        Product Description
      </label>
      <textarea
        id="description"
        className="form-textarea"
        placeholder="E.g., High-strength concrete beams for bridge construction, reinforced with steel bars and subjected to heavy loads..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={loading}
        rows="6"
      />
      <div className="form-buttons">
        <button
          className="btn btn-primary"
          onClick={onDiscover}
          disabled={loading || !description.trim()}
        >
          {loading ? 'Discovering...' : '🔍 Discover Standards'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onClear}
          disabled={loading}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default DiscoverForm;
