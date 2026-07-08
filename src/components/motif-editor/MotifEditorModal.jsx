// MotifEditorModal — the pen-editor shell (WI-P2-2).
//
// A large, centred editing "sheet" in the Naqsha design language: cream naqsheh
// paper with a faint graticule (the loom-cartoon anchor), the motif's path drawn
// as a thin violet ornamental outline, and a distinct jewel-madder ⊕ marking the
// root (sprout point) — never mistakable for a path anchor.
//
// This slice renders the path READ-ONLY. It establishes the working-copy chrome:
// an editable name, the "used by N layers" badge (custom motifs are a shared
// asset — Save restamps every layer; Save as copy forks one), an inert Preview
// checkbox (wired to the mini full-canvas preview in WI-P2-5), and the
// focus-trap / Escape-to-cancel / overlay-close idioms shared with the studio's
// other modals. Interactivity (anchors, handles, root drag) arrives in later WIs.

import { useCallback, useEffect, useRef, useState } from 'react';
import useMotifEditor, {
  usedByCount,
  boundsFromWorkingCopy,
} from './useMotifEditor';

/** viewBox string with proportional padding; guards against a degenerate box. */
function viewBoxFor(working) {
  const { minX, minY, maxX, maxY } = boundsFromWorkingCopy(working);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.14 || 1;
  return {
    box: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
    span: Math.max(w, h) + pad * 2,
  };
}

export default function MotifEditorModal({
  glyphId,
  glyph,
  layers = [],
  onSave,
  onSaveAsCopy,
  onCancel,
  // Injected pathModel ops (parseD / anchorsToD). Optional in this slice — the
  // read-only render consumes neither; later WIs wire pathModel.js through here.
  parseD,
  anchorsToD,
}) {
  const { working, setName, serialize } = useMotifEditor(glyph, {
    parseD,
    anchorsToD,
  });
  // Preview is INERT this slice — state settles the layout; WI-P2-5 wires it to
  // the throttled mini full-canvas preview.
  const [preview, setPreview] = useState(false);

  const dialogRef = useRef(null);
  // Establish the trap now: focus the frame on open so keyboard lands inside it
  // (full tab-cycle trapping folds in with the pen tools in later WIs).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Keyboard is SCOPED to the editor: stop it leaking to global app shortcuts,
  // and map Escape → cancel (discard). The scoping matters far more once the pen
  // hotkeys (P/A/V/…) land; we set the seam here.
  const handleKeyDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    },
    [onCancel]
  );

  const n = usedByCount(layers, glyphId);
  const { box, span } = viewBoxFor(working);
  // Root crosshair + non-scaling path stroke sized off the view span so they read
  // consistently whatever the glyph's coordinate scale.
  const rootR = span * 0.045;
  const rx = working.root?.x ?? 0;
  const ry = working.root?.y ?? 0;
  const gridStep = span / 12;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit motif"
        tabIndex={-1}
        data-testid="motif-editor-dialog"
        className="flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-md border border-card-border bg-panel outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header — editable name, shared-asset badge, inert preview, close. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
          <input
            data-testid="motif-editor-name"
            aria-label="Motif name"
            value={working.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled motif"
            className="min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink outline-none hover:border-hairline focus:border-violet"
          />
          {n > 0 && (
            <span
              data-testid="motif-editor-usedby"
              className="shrink-0 rounded-xs bg-paper-warm px-2 py-0.5 text-[11px] text-ink-soft"
              title="Saving updates every layer that uses this motif"
            >
              Used by {n} {n === 1 ? 'layer' : 'layers'}
            </span>
          )}
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-soft">
            <input
              type="checkbox"
              data-testid="motif-editor-preview"
              checked={preview}
              onChange={(e) => setPreview(e.target.checked)}
            />
            <span>Preview</span>
          </label>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="shrink-0 px-1 text-lg leading-none text-ink-soft transition-colors hover:text-ink"
          >
            &times;
          </button>
        </div>

        {/* Editing sheet — naqsheh paper + faint graticule; path read-only. */}
        <div className="min-h-0 flex-1 overflow-hidden bg-paper p-4">
          <svg
            data-testid="motif-editor-canvas"
            viewBox={box}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            style={{ minHeight: '360px' }}
          >
            <defs>
              <pattern
                id="motif-editor-grid"
                width={gridStep}
                height={gridStep}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
                  fill="none"
                  stroke="var(--hairline)"
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              </pattern>
            </defs>
            <rect
              x="-100000"
              y="-100000"
              width="200000"
              height="200000"
              fill="url(#motif-editor-grid)"
            />

            {/* The motif path(s): thin violet ornamental outline, fill:none. */}
            <g style={{ color: 'var(--violet)' }}>
              {working.paths.map((p, i) => (
                <path
                  key={i}
                  data-testid="motif-editor-path"
                  d={p.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* Root marker — distinct jewel-madder ⊕ crosshair (read-only). */}
            <g
              data-testid="motif-editor-root"
              style={{ color: 'var(--jewel-madder)' }}
            >
              <circle
                cx={rx}
                cy={ry}
                r={rootR}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={rx - rootR * 1.6}
                y1={ry}
                x2={rx + rootR * 1.6}
                y2={ry}
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={rx}
                y1={ry - rootR * 1.6}
                x2={rx}
                y2={ry + rootR * 1.6}
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>

        {/* Footer — discard / fork / commit. Hierarchy: Save is the load-bearing
            saffron fill; Save as copy is the secondary violet outline; Cancel is
            a quiet ghost. */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button
            type="button"
            data-testid="motif-editor-cancel"
            onClick={onCancel}
            className="rounded-xs px-3 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="motif-editor-save-copy"
            onClick={() => onSaveAsCopy?.(serialize())}
            className="rounded-xs border border-violet px-3 py-1.5 text-xs font-medium text-violet transition-colors hover:bg-violet/10"
          >
            Save as copy
          </button>
          <button
            type="button"
            data-testid="motif-editor-save"
            onClick={() => onSave?.(serialize())}
            className="rounded-xs bg-saffron px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-saffron-hover"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
