import { useEffect, useState } from 'react';
import { listMine } from '../../lib/org/submissionService';

const STATUS_LABELS = {
  pending: 'Pending',
  cut: 'Cut',
  rejected: 'Rejected',
  canceled: 'Canceled',
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  cut: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  canceled: 'bg-gray-200 text-gray-600',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function MySubmissions({ orgId, userId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listMine(orgId, userId)
      .then((data) => {
        if (!active) return;
        setRows(data || []);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId, userId]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-rose-600">
        Couldn&rsquo;t load your submissions.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">No submissions yet</div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="flex flex-col">
            <span className="font-medium text-gray-900">{row.name}</span>
            <span className="text-xs text-gray-500">{row.material_label}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {`${row.width_mm} × ${row.height_mm} mm`}
            </span>
            <StatusBadge status={row.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
