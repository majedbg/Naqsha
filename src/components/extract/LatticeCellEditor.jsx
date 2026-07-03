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
// Oblique cell (S5b, issue #66): a basis vector shorter than this, or a basis
// whose |sin(angle)| falls below MIN_BASIS_SIN, is degenerate — don't commit it
// (validateLattice would reject a near-collinear/near-zero basis).
const MIN_BASIS_LEN = 6;
const MIN_BASIS_SIN = 0.12;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const vlen = (v) => Math.hypot(v[0], v[1]);
const vcross = (a, b) => a[0] * b[1] - a[1] * b[0];
const round1 = (n) => Math.round(n * 10) / 10;

export default function LatticeCellEditor({
  imageURL, // selection raster (dataURL)
  imageWidth, // selection size in image pixels
  imageHeight,
  cell, // {x,y,width,height} in image pixels
  basis = null, // {t1,t2} → oblique parallelogram mode (S5b); null → rectangle
  origin = null, // {x,y} parallelogram origin in image px (oblique mode)
  confidence = null, // 0..1, or null for a manually seeded cell
  busy = false, // re-extraction in flight — interactions disabled
  onCommit, // (cell) → void, fired on pointer-up when the cell changed
  onOptOut, // () → void, "no repeat — use single motif"
}) {
  const boxRef = useRef(null);
  // In-flight drag: { mode: 'move'|'resize'|'origin'|'t1'|'t2', sx, sy, orig }
  // (pointer start in client px + the cell/basis at drag start).
  const [drag, setDrag] = useState(null);
  const [draftCell, setDraftCell] = useState(null);
  // Oblique draft: { origin:{x,y}, t1:[x,y], t2:[x,y] } during a basis drag.
  const [draftObl, setDraftObl] = useState(null);
  const oblique = !!(basis && origin);
  const shown = draftCell ?? cell;
  const shownObl = draftObl ?? (oblique ? { origin, t1: basis.t1, t2: basis.t2 } : null);

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

  // Oblique handle drag (S5b): origin (whole cell), or the free endpoint of t1
  // or t2 — the two basis vectors move INDEPENDENTLY.
  const startBasisDrag = (mode) => (e) => {
    if (busy) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      mode,
      sx: e.clientX,
      sy: e.clientY,
      orig: {
        origin: { ...shownObl.origin },
        t1: [...shownObl.t1],
        t2: [...shownObl.t2],
      },
    });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const d = toImageDelta(e);
    if (!d) return;
    const { orig } = drag;
    if (drag.mode === 'origin' || drag.mode === 't1' || drag.mode === 't2') {
      if (drag.mode === 'origin') {
        setDraftObl({
          ...orig,
          origin: {
            x: clamp(orig.origin.x + d.dx, 0, imageWidth),
            y: clamp(orig.origin.y + d.dy, 0, imageHeight),
          },
        });
      } else {
        // Move the free endpoint of t1/t2 → the basis vector changes.
        const v = orig[drag.mode];
        setDraftObl({ ...orig, [drag.mode]: [v[0] + d.dx, v[1] + d.dy] });
      }
      return;
    }
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
    const mode = drag.mode;
    setDrag(null);
    // Oblique commit: origin + basis, only when non-degenerate (guards
    // validateLattice against a near-collinear / near-zero basis).
    if (mode === 'origin' || mode === 't1' || mode === 't2') {
      if (draftObl) {
        const { origin: o, t1, t2 } = draftObl;
        setDraftObl(null);
        const sin = Math.abs(vcross(t1, t2)) / (vlen(t1) * vlen(t2) || 1);
        const ok =
          vlen(t1) >= MIN_BASIS_LEN && vlen(t2) >= MIN_BASIS_LEN && sin >= MIN_BASIS_SIN;
        const changed =
          Math.round(o.x) !== Math.round(origin.x) ||
          Math.round(o.y) !== Math.round(origin.y) ||
          round1(t1[0]) !== round1(basis.t1[0]) ||
          round1(t1[1]) !== round1(basis.t1[1]) ||
          round1(t2[0]) !== round1(basis.t2[0]) ||
          round1(t2[1]) !== round1(basis.t2[1]);
        if (ok && changed) {
          onCommit?.({
            x: Math.round(o.x),
            y: Math.round(o.y),
            t1: [round1(t1[0]), round1(t1[1])],
            t2: [round1(t2[0]), round1(t2[1])],
          });
        }
      }
      return;
    }
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

  // Oblique overlay geometry (S5b, issue #66): the sheared cell + its neighbour
  // ghosts are drawn as SVG polygons in image coordinates (viewBox = image),
  // reflecting the ACTUAL lattice — origin + i·t1 + j·t2 — not an axis rect.
  let oblCell = null;
  let oblGhosts = [];
  let oblHandles = null;
  if (oblique) {
    const { origin: o, t1, t2 } = shownObl;
    const corners = (ox, oy) =>
      `${ox},${oy} ${ox + t1[0]},${oy + t1[1]} ${ox + t1[0] + t2[0]},${oy + t1[1] + t2[1]} ${ox + t2[0]},${oy + t2[1]}`;
    oblCell = corners(o.x, o.y);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        oblGhosts.push({
          key: `${i},${j}`,
          points: corners(o.x + i * t1[0] + j * t2[0], o.y + i * t1[1] + j * t2[1]),
        });
      }
    }
    oblHandles = {
      origin: [o.x, o.y],
      t1: [o.x + t1[0], o.y + t1[1]],
      t2: [o.x + t2[0], o.y + t2[1]],
    };
  }
  // Handle radius in image px, scaled so it stays a sensible on-screen size
  // regardless of the (unknown here) display scale — a small fraction of the cell.
  const hr = Math.max(3, Math.round(Math.min(imageWidth, imageHeight) / 40));

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
        {oblique ? (
          // Sheared-cell overlay: parallelogram + neighbour ghosts + two
          // independently draggable basis handles, all in image coordinates.
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            preserveAspectRatio="none"
            data-testid="lattice-cell-oblique"
          >
            {oblGhosts.map((g) => (
              <polygon
                key={g.key}
                aria-hidden
                points={g.points}
                className="fill-saffron/5 stroke-saffron/40 pointer-events-none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon
              data-testid="lattice-cell"
              role="button"
              aria-label="Repeat cell — drag to move"
              points={oblCell}
              className={`fill-saffron/15 stroke-saffron pointer-events-auto ${busy ? '' : 'cursor-move'}`}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              onPointerDown={startBasisDrag('origin')}
            />
            {/* t1 / t2 guide lines from the origin to each endpoint. */}
            <line
              x1={oblHandles.origin[0]} y1={oblHandles.origin[1]}
              x2={oblHandles.t1[0]} y2={oblHandles.t1[1]}
              className="stroke-saffron/70" strokeWidth="1.5" vectorEffect="non-scaling-stroke" aria-hidden
            />
            <line
              x1={oblHandles.origin[0]} y1={oblHandles.origin[1]}
              x2={oblHandles.t2[0]} y2={oblHandles.t2[1]}
              className="stroke-saffron/70" strokeWidth="1.5" vectorEffect="non-scaling-stroke" aria-hidden
            />
            <circle
              data-testid="cell-handle-t1"
              role="button"
              aria-label="Drag the first repeat vector"
              cx={oblHandles.t1[0]} cy={oblHandles.t1[1]} r={hr}
              className={`fill-saffron stroke-ink/30 pointer-events-auto ${busy ? '' : 'cursor-grab'}`}
              onPointerDown={startBasisDrag('t1')}
            />
            <circle
              data-testid="cell-handle-t2"
              role="button"
              aria-label="Drag the second repeat vector"
              cx={oblHandles.t2[0]} cy={oblHandles.t2[1]} r={hr}
              className={`fill-saffron stroke-ink/30 pointer-events-auto ${busy ? '' : 'cursor-grab'}`}
              onPointerDown={startBasisDrag('t2')}
            />
          </svg>
        ) : (
          <>
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
          </>
        )}
      </div>
      <p className="text-[10px] text-ink-faint">
        {oblique
          ? 'Drag the cell to move it, or either dot to reshape the repeat — the tiling re-traces on release.'
          : 'Drag the cell to move it, the corner to resize — the tiling re-traces on release.'}
      </p>
    </div>
  );
}
