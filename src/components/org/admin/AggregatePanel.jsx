import { useState } from 'react';
import { gridPlace } from '../../../lib/aggregate/gridPlace';
import { composeSheet } from '../../../lib/aggregate/composeSheet';
import { sanitizeSvg } from '../../../lib/svg/sanitizeSvg';
import { markStatus } from '../../../lib/org/submissionService';

// AggregatePanel — admin-side aggregate/export (spec §5).
//
// Given the submissions selected in the queue and a sheet config, it:
//   loadSvg(svg_path) -> sanitizeSvg (re-sanitize on render, §12) ->
//   gridPlace onto sheets (spillover -> more sheets) -> composeSheet per sheet ->
//   download one combined SVG per sheet -> markStatus(id, 'cut') -> onCut(ids).

function triggerDownload(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AggregatePanel({ selected, sheet, loadSvg, onCut }) {
  const isEmpty = !selected || selected.length === 0;
  const [error, setError] = useState(null);

  const handleAggregate = async () => {
    setError(null);
    try {
      // Load + re-sanitize each piece; build an id -> { clean, ops } lookup so
      // the placed coordinates from gridPlace can be merged back with geometry.
      const byId = new Map();
      const pieces = [];
      for (const sub of selected) {
        const raw = await loadSvg(sub.svg_path);
        const { clean } = sanitizeSvg(raw);
        byId.set(sub.id, { clean, ops: sub.ops });
        pieces.push({ id: sub.id, wMm: sub.width_mm, hMm: sub.height_mm });
      }

      // Throws (PIECE_TOO_LARGE/INVALID_*) before any download or markStatus,
      // so a bad selection never half-commits.
      const sheets = gridPlace(pieces, sheet);
      const sheetDims = { widthMm: sheet.sheetWMm, heightMm: sheet.sheetHMm };

      sheets.forEach((placed, i) => {
        const sheetPieces = placed.map((p) => {
          const { clean, ops } = byId.get(p.id);
          return { id: p.id, xMm: p.xMm, yMm: p.yMm, svg: clean, ops };
        });
        triggerDownload(composeSheet(sheetPieces, sheetDims), `sheet-${i + 1}.svg`);
      });

      const ids = sheets.flat().map((p) => p.id);
      for (const id of ids) await markStatus(id, 'cut');
      onCut(ids);
    } catch (err) {
      setError(err.message || 'Aggregation failed.');
    }
  };

  return (
    <div>
      <button type="button" onClick={handleAggregate} disabled={isEmpty}>
        Aggregate / Export
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
