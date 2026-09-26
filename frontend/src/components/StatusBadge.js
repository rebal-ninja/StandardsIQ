import React from 'react';
import './StatusBadge.css';

const STATUS_MAP = {
  active:     { label: 'Active',     cls: 'status--active' },
  superseded: { label: 'Superseded', cls: 'status--superseded' },
  amended:    { label: 'Amended',    cls: 'status--amended' },
  withdrawn:  { label: 'Withdrawn',  cls: 'status--withdrawn' },
  unknown:    { label: 'Unverified', cls: 'status--unknown' },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.unknown;
  return (
    <span className={`status-badge ${s.cls}`}>{s.label}</span>
  );
}

export default StatusBadge;
