import { useState } from 'react';
import { FileUp, AlertTriangle, Info } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MatchScore from '../components/MatchScore';
import { api } from '../mockApi';

// Product type matches the shape returned by both the real and mock APIs
type ProductResult = {
  product_name: string;
  specification: string;
  source_pages?: number[];
  raw_context?: string;
  recommendations: {
    standard: {
      standard_id: string;
      title: string;
      domain: string;
      scope: string;
      status: string;
    };
    match_score: number;
    rationale: string;
    matched_by: string;
  }[];
};

type ScanMeta = {
  filename?: string;
  page_count?: number;
  text_pages?: number;
  extraction_method?: string;
  truncated?: boolean;
  warnings?: string[];
  processing_time_ms?: number;
};

const ScanTender = () => {
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const pdfFile = e.target.files[0];

    setIsProcessing(true);
    setError(null);
    setProducts([]);
    setMeta(null);

    try {
      const result = await api.scanTender(pdfFile);

      // api.scanTender returns { products, ... }
      // The real backend also returns page_count, warnings, etc. at the top level
      // through the mockApi adapter.
      const raw = result as any;
      setProducts(result.products);
      setMeta({
        filename:          raw.filename,
        page_count:        raw.page_count,
        text_pages:        raw.text_pages,
        extraction_method: raw.extraction_method,
        truncated:         raw.truncated,
        warnings:          raw.warnings,
        processing_time_ms: raw.processing_time_ms,
      });
    } catch (err: any) {
      const msg =
        err?.message ??
        'An unexpected error occurred while processing the PDF.';
      setError(msg);
    } finally {
      setIsProcessing(false);
      // Reset the input so the same file can be re-uploaded
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload zone */}
      <GlassCard>
        <div
          className="border-2 border-dashed border-glass-border rounded-lg p-12 text-center cursor-pointer"
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <input
            type="file"
            id="file-upload"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          {isProcessing ? (
            <div className="animate-pulse">
              <FileUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold">Analysing PDF…</p>
              <p className="text-text-muted mt-1 text-sm">
                Extracting procurement items and matching BIS standards
              </p>
            </div>
          ) : (
            <>
              <FileUp className="w-12 h-12 mx-auto text-accent-teal mb-4" />
              <h3 className="text-lg font-bold">
                Drag &amp; drop a tender PDF or click to browse
              </h3>
              <p className="text-text-muted mt-2">
                Upload a tender document to extract products and find
                applicable BIS standards
              </p>
            </>
          )}
        </div>
      </GlassCard>

      {/* Error banner */}
      {error && (
        <GlassCard>
          <div className="flex items-start gap-3 text-red-400">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Could not process PDF</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Scan metadata */}
      {meta && !error && (
        <div className="flex flex-wrap gap-4 text-sm text-text-muted">
          {meta.filename && (
            <span>
              <span className="font-semibold">File:</span> {meta.filename}
            </span>
          )}
          {meta.page_count != null && (
            <span>
              <span className="font-semibold">Pages:</span>{' '}
              {meta.text_pages}/{meta.page_count} text-searchable
            </span>
          )}
          {meta.extraction_method && (
            <span>
              <span className="font-semibold">Extraction:</span>{' '}
              {meta.extraction_method}
            </span>
          )}
          {meta.processing_time_ms != null && (
            <span>
              <span className="font-semibold">Time:</span>{' '}
              {(meta.processing_time_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}

      {/* Warnings */}
      {meta?.warnings && meta.warnings.length > 0 && (
        <GlassCard>
          <div className="space-y-2">
            {meta.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-yellow-400 text-sm">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* No items found */}
      {!error && !isProcessing && meta && products.length === 0 && (
        <GlassCard>
          <p className="text-text-muted text-center py-4">
            No procurement items could be identified in this document.
            The document may be a general reference or policy document.
          </p>
        </GlassCard>
      )}

      {/* Results */}
      {products.length > 0 && (
        <div className="space-y-4">
          {products.map((product, index) => (
            <GlassCard key={index}>
              <div className="flex-1">
                {/* Item header */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="text-xl font-bold">{product.product_name}</h3>
                  {product.source_pages && product.source_pages.length > 0 && (
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      p.&nbsp;{product.source_pages.join(', ')}
                    </span>
                  )}
                </div>

                {/* Specification */}
                <p className="text-text-muted mb-4 text-sm leading-relaxed">
                  {product.specification}
                </p>

                {/* BIS recommendations */}
                {product.recommendations.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      BIS Standards
                    </p>
                    {product.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <MatchScore score={rec.match_score} />
                        <div className="min-w-0">
                          <div className="mono font-semibold">
                            {rec.standard.standard_id}
                          </div>
                          {rec.standard.title && (
                            <div className="text-sm">{rec.standard.title}</div>
                          )}
                          {rec.standard.domain && (
                            <div className="text-xs text-text-muted">
                              {rec.standard.domain}
                              {rec.standard.status &&
                                rec.standard.status !== 'active' && (
                                  <span className="ml-2 text-yellow-400">
                                    [{rec.standard.status}]
                                  </span>
                                )}
                            </div>
                          )}
                          {rec.rationale && (
                            <div className="text-xs text-text-muted mt-1 italic">
                              {rec.rationale}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic">
                    No BIS standards found for this item in the current knowledge base.
                  </p>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScanTender;
