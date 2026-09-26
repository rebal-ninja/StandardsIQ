import React, { useState } from 'react';
import { verifyStandard } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import './Verify.css';

const EXAMPLES = [
  'IS 269:1989',
  'IS 8112:1989',
  'IS 1786:2008',
  'IS 694:2010',
  'IS 4148:1980',
  'IS 1520:1980',
];

function DetailRow({ label, value, mono = false, highlight = false }) {
  if (!value) return null;
  return (
    <div className={`verify-detail-row ${highlight ? 'verify-detail-row--highlight' : ''}`}>
      <dt className="verify-detail-row__label">{label}</dt>
      <dd className={`verify-detail-row__value ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Verify() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runVerify = async (id) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Small simulated delay for UX
      await new Promise((r) => setTimeout(r, 400));
      const data = verifyStandard(id.trim());
      setResult(data);
    } catch (err) {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runVerify(input);
  };

  return (
    <div className="verify-page">
      <div className="verify-page__header">
        <h1 className="page-title">Verify Standard</h1>
        <p className="page-sub">
          Enter a standard ID to check its current status, amendments, and scope.
        </p>
      </div>

      {/* Input */}
      <form className="verify-form" onSubmit={handleSubmit}>
        <div className="verify-form__bar">
          <input
            type="text"
            className="verify-form__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. IS 269:1989 or IS 1786:2008"
            aria-label="Standard ID to verify"
            disabled={loading}
          />
          <button
            type="submit"
            className="verify-form__btn"
            disabled={loading || !input.trim()}
          >
            {loading ? '…' : 'Verify'}
          </button>
        </div>
        <div className="verify-form__examples">
          <span className="verify-form__examples-label">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="dash-hero__chip"
              onClick={() => { setInput(ex); runVerify(ex); }}
              aria-label={`Verify ${ex}`}
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {loading && <LoadingState message={`Verifying ${input}…`} />}

      {error && !loading && (
        <div className="verify-error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {result && !loading && (
        <div className="verify-result">
          {/* Header */}
          <div className="verify-result__header">
            <div>
              <span className="verify-result__id">{result.standard_id}</span>
              {result.verified ? (
                <span className="verify-result__matched">✓ Found in dataset</span>
              ) : (
                <span className="verify-result__not-matched">⚠ Not in local dataset — limited details</span>
              )}
            </div>
            <div className="verify-result__status-row">
              <StatusBadge status={result.status} />
            </div>
          </div>

          <h2 className="verify-result__title">{result.title}</h2>

          {/* Detail table */}
          <dl className="verify-detail">
            <DetailRow label="Domain" value={result.domain} />
            <DetailRow label="Scope" value={result.scope} />
            <DetailRow label="Status" value={
              <StatusBadge status={result.status} />
            } />
            <DetailRow label="Amendment" value={result.amendment_no} mono />
            <DetailRow
              label="Superseded By"
              value={result.superseded_by}
              mono
              highlight={!!result.superseded_by}
            />
          </dl>

          {/* Dataset date banner */}
          <div className="verify-dataset-banner">
            <span aria-hidden="true">🗓</span>
            <div>
              <strong>Verified against dataset dated:</strong> {result.dataset_date}
              <p className="verify-dataset-banner__sub">
                This check is based on the local BIS SP 21 dataset. For legally binding verification,
                consult the official Bureau of Indian Standards catalogue at{' '}
                <a
                  href="https://www.bis.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="verify-link"
                >
                  bis.gov.in
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Verify;
