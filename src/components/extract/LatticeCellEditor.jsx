// LatticeCellEditor — the draggable repeat-cell proposal (S5, issue #54;
// locked decision 8: every auto result is an EDITABLE proposal with a
// confidence signal).
//
// Renders the SELECTION raster with the detected (or manually seeded) repeat
// cell overlaid as a draggable/resizable rectangle plus ghost outlines of the
// neighboring copies, a confidence badge, and the "Use single motif" opt-out.
// The cell is COMMITTED on pointer-up (onCommit, image-pixel coords) — the
// parent re-runs extraction with options.lattice.cell so the heavy re-crop +
// re-trace stays in the worker; this component only renders handles (same
// division of labor as FlattenStep).
//
// jsdom-testable: pointer math needs only getBoundingClientRect on the
// overlay, and setPointerCapture is optional-called (FlattenStep pattern).

import { useRef, useState } from 'react';

const MIN_CELL_PX = 8;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function LatticeCellEditor({
  imageURL, // selection raster (dataURL)
  imageWidth, // selection size in image pixels
  imageHeight,
  cell, // {x,y,width,height} in image pixels
  confidence = null, // 0..1, or null for a manually seeded cell
  busy = false, // re-extraction in flight — interactions disabled
  onCommit, // (cell) → void, fired on pointer-up when the cell changed
  onOptOut, // () → void, "no repeat — use single motif"
}) {
  const boxRef = useRef(null);
  // In-flight drag: { mode: 'move'|'resize', sx, sy, orig } (pointer start in
  // client px + the cell at drag start). Display cell = draft result or prop.
  const [drag, setDrag] = useState(null);
  const [draftCell, setDraftCell] = useState(null);
  const shown = draftCell ?? cell;

  const toImageDelta = (e) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      dx: ((e.clientX - drag.sx) / box.width) * imageWidth,
      dy: ((e.clientY - drag.sy) / box.height) * imageHeight,
    };
  };

  const startDrag = (mode) => (e) => {
    if (busy) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ mode, sx: e.clientX, sy: e.clientY, orig: { ...shown } });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const d = toImageDelta(e);
    if (!d) return;
    const { orig } = drag;
    if (drag.mode === 'move') {
      setDraftCell({
        ...orig,
        x: clamp(orig.x + d.dx, 0, imageWidth - orig.width),
        y: clamp(orig.y + d.dy, 0, imageHeight - orig.height),
      });
    } else {
      setDraftCell({
        ...orig,
        width: clamp(orig.width + d.dx, MIN_CELL_PX, imageWidth - orig.x),
        height: clamp(orig.height + d.dy, MIN_CELL_PX, imageHeight - orig.y),
      });
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    if (draftCell) {
      const committed = {
        x: Math.round(draftCell.x),
        y: Math.round(draftCell.y),
        width: Math.round(draftCell.width),
        height: Math.round(draftCell.height),
      };
      setDraftCell(null);
      if (
        committed.x !== cell.x ||
        committed.y !== cell.y ||
        committed.width !== cell.width ||
        committed.height !== cell.height
      ) {
        onCommit?.(committed);
      }
    }
  };

  const pct = (v, total) => `${(v / total) * 100}%`;
  const cellStyle = {
    left: pct(shown.x, imageWidth),
    top: pct(shown.y, imageHeight),
    width: pct(shown.width, imageWidth),
    height: pct(shown.height, imageHeight),
  };

  // Ghost outlines of the 8 neighboring copies — the "this is how it repeats"
  // signal that moves live with the drag. Overflow is clipped by the box.
  const ghosts = [];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      ghosts.push({
        key: `${i},${j}`,
        left: pct(shown.x + i * shown.width, imageWidth),
        top: pct(shown.y + j * shown.height, imageHeight),
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-2" data-testid="lattice-cell-editor">
      <div className="flex items-center gap-2">
        <span
          data-testid="lattice-confidence"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-sm bg-paper-warm border border-hairline text-ink"
        >
          {confidence == null
            ? 'Repeat cell — manual'
            : `Repeat detected · ${Math.round(confidence * 100)}%`}
        </span>
        {onOptOut && (
          <button
            type="button"
            className="px-2 py-0.5 text-[11px] font-medium rounded-xs bg-paper-warm text-ink-soft border border-hairline hover:text-ink disabled:opacity-40 transition-colors duration-fast ease-out-quart"
            onClick={onOptOut}
            disabled={busy}
          >
            Use single motif
          </button>
        )}
      </div>
      <div
        ref={boxRef}
        className="relative inline-block select-none touch-none overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="lattice-cell-box"
      >
        <img
          src={imageURL}
          alt="Selection with repeat cell overlay"
          draggable={false}
          className="max-h-56 w-auto rounded-xs border border-hairline"
        />
        {ghosts.map((g) => (
          <div
            key={g.key}
            aria-hidden
            className="absolute border border-saffron/40 pointer-events-none"
            style={{ left: g.left, top: g.top, width: cellStyle.width, height: cellStyle.height }}
          />
        ))}
        <div
          data-testid="lattice-cell"
          role="button"
          aria-label="Repeat cell — drag to move"
          className={`absolute border-2 border-saffron bg-saffron/15 ${busy ? 'cursor-default' : 'cursor-move'}`}
          style={cellStyle}
          onPointerDown={startDrag('move')}
        >
          <span
            data-testid="cell-resize-handle"
            role="button"
            aria-label="Resize repeat cell"
            className={`absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-saffron border border-ink/30 ${busy ? 'cursor-default' : 'cursor-nwse-resize'}`}
            onPointerDown={startDrag('resize')}
          />
        </div>
      </div>
      <p className="text-[10px] text-ink-faint">
        Drag the cell to move it, the corner to resize — the tiling re-traces on release.
      </p>
    </div>
  );
}
