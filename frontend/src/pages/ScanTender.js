import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { scanTender } from '../services/api';
import StandardCard from '../components/StandardCard';
import LoadingState from '../components/LoadingState';
import ErrorBanner from '../components/ErrorBanner';
import './ScanTender.css';

const SCAN_STEPS = [
  { label: 'Upload PDF' },
  { label: 'Extract text content' },
  { label: 'Identify procurement items' },
  { label: 'Find applicable standards' },
  { label: 'Rank and score results' },
];

function ScanTender() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [stepMsg, setStepMsg] = useState('');
  const [activeStep, setActiveStep] = useState(-1);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [compareIds, setCompareIds] = useState([]);

  const processFile = async (f) => {
    if (!f || f.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    setFile(f);
    setProcessing(true);
    setError(null);
    setResults(null);
    setActiveStep(0);

    const progressFn = (msg) => {
      setStepMsg(msg);
      setActiveStep((prev) => {
        const next = Math.min(prev + 1, SCAN_STEPS.length - 1);
        return next;
      });
    };

    try {
      const data = await scanTender(f, progressFn);
      setResults(data);
      setActiveStep(SCAN_STEPS.length);
    } catch (err) {
      setError(err.message || 'Failed to process tender document.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const goCompare = () => {
    navigate(`/compare?ids=${compareIds.map(encodeURIComponent).join(',')}`);
  };

  const reset = () => {
    setFile(null);
    setResults(null);
    setError(null);
    setActiveStep(-1);
    setStepMsg('');
    setCompareIds([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const doneSteps = SCAN_STEPS.map((s, i) => ({
    ...s,
    done: i < activeStep,
    active: i === activeStep && processing,
  }));

  return (
    <div className="scan-page">
      <div className="scan-page__header">
        <h1 className="page-title">Scan Tender</h1>
        <p className="page-sub">
          Upload a tender PDF to automatically extract procurement items and find applicable BIS standards.
        </p>
      </div>

      {/* Demo notice */}
      <div className="scan-page__notice" role="note">
        <span aria-hidden="true">ℹ</span>
        <span>
          <strong>Demo mode:</strong> The backend does not currently include a PDF extraction endpoint.
          This page uses the real BIS search API for each identified item, with items inferred from
          the filename. Upload any PDF to see the complete workflow.
        </span>
      </div>

      {/* Upload zone */}
      {!processing && !results && (
        <div
          className={`scan-drop-zone ${dragOver ? 'scan-drop-zone--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload tender PDF"
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="scan-drop-zone__input"
            onChange={handleFileChange}
            aria-label="Choose PDF file"
          />
          <div className="scan-drop-zone__icon" aria-hidden="true">📄</div>
          <h3 className="scan-drop-zone__title">
            {dragOver ? 'Drop to upload' : 'Drag & drop a tender PDF'}
          </h3>
          <p className="scan-drop-zone__sub">or click to browse files</p>
          <div className="scan-drop-zone__hint">
            Try filenames like: <code>electrical_tender.pdf</code>, <code>medical_supply.pdf</code>, <code>construction_project.pdf</code>
          </div>
        </div>
      )}

      {/* Processing */}
      {processing && (
        <div className="scan-processing">
          <div className="scan-processing__file">
            <span aria-hidden="true">📄</span> {file?.name}
          </div>
          <LoadingState
            message={stepMsg || 'Processing tender document…'}
            steps={doneSteps}
          />
        </div>
      )}

      {/* Error */}
      {error && !processing && (
        <div style={{ marginTop: 8 }}>
          <ErrorBanner message={error} onRetry={reset} />
        </div>
      )}

      {/* Results */}
      {results && !processing && (
        <div className="scan-results">
          <div className="scan-results__header">
            <div>
              <h2 className="scan-results__title">Scan Results</h2>
              <p className="scan-results__file">
                <span aria-hidden="true">📄</span> {results.filename}
                {' · '}
                {results.products.length} procurement item{results.products.length !== 1 ? 's' : ''} identified
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {compareIds.length >= 2 && (
                <button className="compare-bar__go" onClick={goCompare}>
                  Compare ({compareIds.length}) →
                </button>
              )}
              <button className="scan-results__new-btn" onClick={reset}>
                Scan Another
              </button>
            </div>
          </div>

          <div className="scan-results__items">
            {results.products.map((product, pi) => (
              <div key={pi} className="scan-item">
                <div className="scan-item__header">
                  <div className="scan-item__index">{pi + 1}</div>
                  <div>
                    <h3 className="scan-item__name">{product.product_name}</h3>
                    <p className="scan-item__spec">{product.specification}</p>
                  </div>
                  {product.source === 'mock' && (
                    <span className="scan-item__badge scan-item__badge--offline">Offline</span>
                  )}
                  {product.source === 'backend' && (
                    <span className="scan-item__badge scan-item__badge--live">Live</span>
                  )}
                </div>

                <div className="scan-item__standards">
                  {product.recommendations.length === 0 ? (
                    <p className="scan-item__no-std">No applicable standards found for this item.</p>
                  ) : (
                    product.recommendations.map((rec, ri) => (
                      <StandardCard
                        key={rec.standard_id + ri}
                        standard={rec}
                        rank={ri + 1}
                        onAddCompare={toggleCompare}
                        compareIds={compareIds}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScanTender;
