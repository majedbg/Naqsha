import { useEffect, useState } from 'react';
import { listForOrg } from '../../../lib/org/submissionService';

export default function AdminQueue({ orgId, isAdmin, onSelectionChange }) {
  const [rows, setRows] = useState([]);
  const [materialFilter, setMaterialFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    listForOrg(orgId)
      .then((data) => {
        if (active) setRows(data || []);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, [orgId, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-4 text-sm text-rose-600">
        Access denied — admins only.
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === 'pending');

  const materials = [];
  const seen = new Set();
  for (const r of pending) {
    if (!seen.has(r.org_material_id)) {
      seen.add(r.org_material_id);
      materials.push({ id: r.org_material_id, label: r.material_label });
    }
  }

  const visible = materialFilter
    ? pending.filter((r) => r.org_material_id === materialFilter)
    : pending;

  function toggle(row) {
    const nextIds = selectedIds.includes(row.id)
      ? selectedIds.filter((id) => id !== row.id)
      : [...selectedIds, row.id];
    setSelectedIds(nextIds);
    if (onSelectionChange) {
      onSelectionChange(pending.filter((r) => nextIds.includes(r.id)));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        Material
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={materialFilter}
          onChange={(e) => setMaterialFilter(e.target.value)}
        >
          <option value="">All materials</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <ul className="flex flex-col gap-2">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                aria-label={`Select ${row.name}`}
                checked={selectedIds.includes(row.id)}
                onChange={() => toggle(row)}
              />
              <div className="flex flex-col">
                <span className="font-medium text-gray-900">{row.name}</span>
                <span className="text-xs text-gray-500">
                  {row.material_label}
                </span>
              </div>
            </div>
            <span className="text-xs text-gray-500">
              {`${row.width_mm} × ${row.height_mm} mm`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
