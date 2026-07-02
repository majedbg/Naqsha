// FlattenStep — manual 4-corner perspective rectify + skip (S3, issue #52;
// locked decision 2: flatten-first, always present but skippable).
//
// Two phases inside the stepper's Flatten step:
//   adjust  : the photo with a draggable 4-corner quad (TL/TR/BR/BL handles)
//             the user positions over the ornament plane. Apply → the parent
//             runs the warp through the WorkerBridge (heavy compute stays in
//             the worker; this component only renders handles).
//   preview : before/after — the original beside the rectified result — with
//             "Adjust corners" (editable proposal, locked decision 8),
//             "Use original", and "Continue".
//
// The quad is CONTROLLED (quad/onQuadChange, fractional [TL,TR,BR,BL] in
// 0..1 image coords) — the S4 auto-detect slice pre-fills it programmatically
// (detectQuad → onQuadChange/initialQuad) and this same UI becomes the
// hand-correction surface. Coordinates stay fractional so they survive any
// display scaling; the parent converts to pixels at apply time.
//
// jsdom-testable: pointer math needs only getBoundingClientRect on the
// overlay, and setPointerCapture is optional-called (same pattern as the
// Select step's crop drag).

import { useRef, useState } from 'react';
import { validateQuad } from '../../lib/extraction/rectifier';

/** Default quad when no detection pre-fills one: a 12%-inset rectangle. */
export const DEFAULT_QUAD = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 },
];

const CORNER_LABELS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

const PRIMARY_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-saffron text-ink hover:bg-saffron-hover disabled:opacity-40 disabled:cursor-default transition-colors duration-fast ease-out-quart';
const GHOST_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export default function FlattenStep({
  imageURL, // original photo (always the "before")
  quad, // fractional [TL,TR,BR,BL]
  onQuadChange,
  rectifiedURL, // non-null → preview phase
  flattening,
  onApply,
  onSkip, // "already flat" / "use original" escape hatch
  onBack,
  onAdjust, // preview → back to the handles (rectified discarded)
  onContinue, // accept the rectified image → Select
}) {
  const boxRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);

  const quadCheck = validateQuad(quad);

  const fractionPoint = (e) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: clamp01((e.clientX - box.left) / box.width),
      y: clamp01((e.clientY - box.top) / box.height),
    };
  };

  const onPointerDown = (e) => {
    const idx = Number(e.target?.dataset?.cornerIndex);
    if (!Number.isInteger(idx)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragIdx(idx);
  };
  const onPointerMove = (e) => {
    if (dragIdx == null) return;
    const p = fractionPoint(e);
    if (p) onQuadChange(quad.map((c, i) => (i === dragIdx ? p : c)));
  };
  const onPointerUp = () => setDragIdx(null);

  // --- preview phase: before / after -----------------------------------------
  if (rectifiedURL) {
    return (
      <>
        <div className="flex items-start justify-center gap-4">
          <figure className="flex flex-col items-center gap-1">
            <img
              src={imageURL}
              alt="Original photo"
              className="max-h-40 w-auto rounded-xs border border-hairline opacity-70"
            />
            <figcaption className="text-[11px] text-ink-faint">Before</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1">
            <img
              src={rectifiedURL}
              alt="Flattened photo"
              className="max-h-64 w-auto rounded-xs border border-saffron"
            />
            <figcaption className="text-[11px] text-ink-soft">After — flattened</figcaption>
          </figure>
        </div>
        <p className="text-xs text-ink-soft max-w-md text-center">
          The marked plane is now viewed straight-on. Not right? Adjust the corners and re-apply.
        </p>
        <div className="flex gap-2">
          <button type="button" className={GHOST_BTN} onClick={onAdjust}>
            Adjust corners
          </button>
          <button type="button" className={GHOST_BTN} onClick={onSkip}>
            Use original
          </button>
          <button type="button" className={PRIMARY_BTN} onClick={onContinue}>
            Continue →
          </button>
        </div>
      </>
    );
  }

  // --- adjust phase: draggable corner handles ---------------------------------
  const points = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <>
      <p className="text-xs text-ink-soft max-w-md text-center">
        Shot at an angle? Drag the four corners onto the pattern&apos;s plane and apply — the
        photo is flattened to a straight-on view before tracing.
      </p>
      <div
        ref={boxRef}
        className="relative inline-block select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="flatten-area"
      >
        {imageURL && (
          <img
            src={imageURL}
            alt="Mark the pattern plane"
            draggable={false}
            className="max-h-80 w-auto rounded-xs border border-hairline"
          />
        )}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon
            points={points}
            fill="rgba(230, 179, 30, 0.12)"
            stroke={quadCheck.ok ? 'var(--color-saffron, #e6b31e)' : '#ef4444'}
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {quad.map((p, i) => (
          <div
            key={CORNER_LABELS[i]}
            role="button"
            aria-label={`Drag ${CORNER_LABELS[i]} corner`}
            data-corner-index={i}
            data-testid={`corner-handle-${i}`}
            className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow cursor-grab touch-none ${
              quadCheck.ok ? 'bg-saffron' : 'bg-red-500'
            } ${dragIdx === i ? 'scale-125' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}
      </div>
      {!quadCheck.ok && (
        <p role="alert" className="text-xs text-red-500">
          Corners are crossed or folded — drag them into a simple four-sided shape.
        </p>
      )}
      {flattening && <p className="text-xs text-ink-soft">Flattening…</p>}
      <div className="flex gap-2">
        <button type="button" className={GHOST_BTN} onClick={onBack}>
          Back
        </button>
        <button type="button" className={GHOST_BTN} onClick={onSkip}>
          Already flat — skip flatten →
        </button>
        <button
          type="button"
          className={PRIMARY_BTN}
          onClick={onApply}
          disabled={flattening || !quadCheck.ok}
        >
          {flattening ? 'Flattening…' : 'Apply flatten'}
        </button>
      </div>
    </>
  );
}
