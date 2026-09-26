import React from 'react';
import StatusBadge from './StatusBadge';
import MatchScore from './MatchScore';
import './CompareTable.css';

const FIELDS = [
  { key: 'standard_id',  label: 'Standard ID',   mono: true },
  { key: 'title',        label: 'Title' },
  { key: 'domain',       label: 'Domain' },
  { key: 'scope',        label: 'Scope' },
  { key: 'status',       label: 'Status',         render: (v) => <StatusBadge status={v} /> },
  { key: 'amendment_no', label: 'Amendment' },
  { key: 'superseded_by',label: 'Superseded By' },
  { key: 'match_score',  label: 'Match Score',    render: (v) => v != null ? <MatchScore score={v} size={44} /> : '—' },
];

function isDifferent(field, standards) {
  const values = standards.map((s) => s[field.key]);
  return new Set(values).size > 1;
}

function CompareTable({ standards, onRemove }) {
  if (!standards || standards.length === 0) return null;

  return (
    <div className="compare-table-wrap">
      <table className="compare-table" aria-label="Standards comparison">
        <thead>
          <tr>
            <th className="compare-table__field-col">Field</th>
            {standards.map((s, i) => (
              <th key={i} className="compare-table__std-col">
                <div className="compare-table__std-header">
                  <span className="compare-table__std-id">{s.standard_id}</span>
                  {onRemove && (
                    <button
                      className="compare-table__remove"
                      onClick={() => onRemove(s.standard_id)}
                      aria-label={`Remove ${s.standard_id} from comparison`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => {
            const diff = isDifferent(field, standards);
            return (
              <tr
                key={field.key}
                className={diff ? 'compare-table__row--diff' : ''}
              >
                <td className="compare-table__label">
                  {field.label}
                  {diff && <span className="compare-table__diff-dot" aria-label="Values differ" title="Values differ" />}
                </td>
                {standards.map((s, i) => {
                  const val = s[field.key];
                  const display = field.render
                    ? field.render(val)
                    : val != null && val !== ''
                      ? (field.mono ? <span className="mono">{val}</span> : val)
                      : <span className="compare-table__empty">—</span>;
                  return (
                    <td
                      key={i}
                      className={`compare-table__cell ${field.mono ? 'mono' : ''}`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CompareTable;
