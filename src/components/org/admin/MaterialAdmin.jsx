import { useCallback, useEffect, useState } from 'react';
import {
  listMaterials,
  listOrgMaterials,
  addOrgMaterial,
  toggleOrgMaterial,
} from '../../../lib/org/materialService';

// Standard Canal Plastics sheet sizes (inches). Selecting one fills the
// sheet_w/h fields in millimetres. Rounded to 0.1mm so the converted values
// are float-clean (e.g. 12in -> exactly 304.8mm, not 304.7999…).
const INCH_MM = 25.4;
const toMm = (inches) => Math.round(inches * INCH_MM * 10) / 10;
const STANDARD_SHEET_SIZES = [
  [6, 12],
  [12, 12],
  [12, 18],
  [12, 24],
  [18, 24],
  [18, 32],
  [24, 24],
  [24, 36],
  [24, 48],
  [48, 72],
  [48, 96],
].map(([w, h]) => ({
  key: `${w}x${h}`,
  label: `${w}″ × ${h}″`,
  wMm: toMm(w),
  hMm: toMm(h),
}));

// `catalog` is the global `materials` catalog (id, name, type, thickness_mm,
// color). By default MaterialAdmin fetches it itself via listMaterials();
// callers (and tests) MAY pass a `catalog` prop to override the fetch.
export default function MaterialAdmin({ orgId, catalog }) {
  const [rows, setRows] = useState([]);
  const [fetchedCatalog, setFetchedCatalog] = useState([]);
  const [materialId, setMaterialId] = useState('');
  const [sheetW, setSheetW] = useState('');
  const [sheetH, setSheetH] = useState('');
  const [sheetSizeKey, setSheetSizeKey] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  // Selecting a standard size fills the (mm) width/height fields; choosing
  // "Custom…" leaves whatever was typed so manual entry still works.
  function handleStandardSize(key) {
    setSheetSizeKey(key);
    const size = STANDARD_SHEET_SIZES.find((s) => s.key === key);
    if (size) {
      setSheetW(String(size.wMm));
      setSheetH(String(size.hMm));
    }
  }

  // Prop override wins; otherwise use the self-fetched global catalog.
  const resolvedCatalog =
    catalog && catalog.length > 0 ? catalog : fetchedCatalog;

  const refresh = useCallback(
    () =>
      listOrgMaterials(orgId)
        .then((data) => setRows(data || []))
        .catch(() => setRows([])),
    [orgId],
  );

  // Load the global catalog ourselves unless the caller overrides via prop.
  useEffect(() => {
    if (catalog && catalog.length > 0) return undefined;
    let active = true;
    listMaterials()
      .then((data) => {
        if (active) setFetchedCatalog(data || []);
      })
      .catch(() => {
        if (active) setFetchedCatalog([]);
      });
    return () => {
      active = false;
    };
  }, [catalog]);

  useEffect(() => {
    let active = true;
    listOrgMaterials(orgId)
      .then((data) => {
        if (active) setRows(data || []);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  async function handleAdd() {
    if (!materialId) return;
    setError('');
    try {
      await addOrgMaterial(orgId, materialId, {
        sheet_w_mm: Number(sheetW),
        sheet_h_mm: Number(sheetH),
        price: Number(price),
      });
      setMaterialId('');
      setSheetW('');
      setSheetH('');
      setSheetSizeKey('');
      setPrice('');
      await refresh();
    } catch (e) {
      setError(e?.message || 'Could not add material.');
    }
  }

  async function handleToggle(row) {
    setError('');
    try {
      await toggleOrgMaterial(row.id, !row.is_active);
      await refresh();
    } catch (e) {
      setError(e?.message || 'Could not update material.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col text-xs text-gray-700">
          Material
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="">Select…</option>
            {resolvedCatalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-700">
          Standard sheet size
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={sheetSizeKey}
            onChange={(e) => handleStandardSize(e.target.value)}
          >
            <option value="">Custom…</option>
            {STANDARD_SHEET_SIZES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-700">
          Sheet width (mm)
          <input
            type="number"
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            value={sheetW}
            onChange={(e) => setSheetW(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-700">
          Sheet height (mm)
          <input
            type="number"
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            value={sheetH}
            onChange={(e) => setSheetH(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-700">
          Price
          <input
            type="number"
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white"
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3"
          >
            <div className="flex flex-col">
              <span className="font-medium text-gray-900">{row.name}</span>
              <span className="text-xs text-gray-500">{`${row.thickness_mm} mm thick`}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{`${row.sheet_w_mm} × ${row.sheet_h_mm} mm`}</span>
              <span>{row.is_active ? 'Active' : 'Inactive'}</span>
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-700"
                onClick={() => handleToggle(row)}
              >
                {row.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
