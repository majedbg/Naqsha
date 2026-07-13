// EtchPreviewHero — the 1:1 "what etches" verification hero (Raster Etch S9, #88;
// CONTEXT.md → Etch / Highlight Hold). It mirrors the extraction Refine step's
// "Binary (what is traced)" hero (ExtractStepper): a `putImageData` paint into a
// canvas whose BACKING STORE is the exact device pixels of the buffer, drawn with
// `image-rendering: pixelated` so every dot stays a crisp square. At fit-to-screen
// canvas zoom the Etch's dots are sub-pixel, so the maker can't verify the real
// dot pattern before an irreversible mirror cut — this hero shows the true dot
// density at 1:1 (and up), with the Highlight Hold band shaded.
//
// SINGLE SOURCE (grilled decision 4, the WYSIWYG invariant): the hero paints the
// SAME resolved `etchBitmap` object useCanvas caches (etchBitmapCacheRef) and
// svgExport embeds (encodeEtchPNG) — surfaced up unchanged via
// useCanvas → RightPanel(onEtchBitmapsChange) → Studio → Inspector, never a second
// resolve/compute. `etchHeroRGBA` materializes it through the very same
// `bitmapToRGBA` the p5 canvas uses, so the hero pixels are bit-for-bit what
// exports (proven in the no-drift test).
//
// Vocabulary is LAW: this is a **preview hero** for an **Etch**, showing the
// **Highlight Hold** band. It is NOT a Stage / Chain / Block / device / effect.

import { useEffect, useMemo, useRef, useState } from 'react';
import { isEtchLayer } from '../../lib/etch/etchLayer';
import { etchHeroRGBA } from '../../lib/etch/etchHeroRGBA';

// Integer zoom stops (device-pixel multipliers). Every stop is >= 1, so the hero
// is NEVER downscaled below 1:1 — a downscaled overview would re-hide the dots the
// hero exists to reveal. Panning is the overflow-auto viewport's own scroll.
const ZOOM_STOPS = [1, 2, 4, 8, 16];

// Paint the composited RGBA into the canvas at its device-pixel backing store.
// jsdom has no 2D context (getContext → null/throws), so this no-ops under test —
// the canvas ELEMENT still renders (sized + zoomed), keeping the hero jsdom-testable;
// real painting happens only in the browser. Mirrors ExtractStepper's paintBuffer.
function paintHero(canvas, rgba, width, height) {
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  let ctx;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return;
  }
  if (!ctx) return;
  try {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  } catch {
    /* preview paint is best-effort */
  }
}

/**
 * The 1:1 "what etches" preview hero. Self-hides for non-Etch layers so the
 * Inspector can drop it in unconditionally (mirrors EtchHighlightHold). Until the
 * async bitmap resolves it shows a resolving placeholder — no crash, no paint.
 *
 * @param {object} props
 * @param {object} props.layer the selected layer (gate: Etch-only)
 * @param {{bits: Uint8Array, held?: Uint8Array, width: number, height: number}|null} props.bitmap
 *   the resolved single-source Etch bitmap (null while resolving)
 * @param {string} [props.color] engrave colour hex (defaults to the layer colour;
 *   bits — hence the verification — are colour-independent)
 */
export default function EtchPreviewHero({ layer, bitmap, color }) {
  const canvasRef = useRef(null);
  const [zoomIndex, setZoomIndex] = useState(0);

  const engrave = color || layer?.color || '#000000';
  const ready = !!(bitmap && bitmap.width > 0 && bitmap.height > 0);
  // Materialize once per resolved buffer (not per render). `bitmap` is stable
  // between async resolves, so a zoom click or an unrelated param edit while an
  // Etch is selected reuses the memo instead of re-running the 4M-px loop.
  const hero = useMemo(
    () => (ready ? etchHeroRGBA(bitmap, engrave) : null),
    [ready, bitmap, engrave]
  );

  // Paint whenever the resolved buffer (or colour) changes — the same object
  // reference that exports, materialized once here.
  useEffect(() => {
    if (!hero) return;
    paintHero(canvasRef.current, hero.data, hero.width, hero.height);
    // hero is rebuilt each render from `bitmap`+`engrave`; those are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, engrave]);

  if (!isEtchLayer(layer)) return null;

  const zoom = ZOOM_STOPS[zoomIndex];
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_STOPS.length - 1;

  return (
    <div className="space-y-2 border-t border-hairline pt-3" data-testid="etch-preview-hero">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          What etches
        </h3>
        {ready && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="etch-preview-zoom-out"
              aria-label="Zoom out"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={!canZoomOut}
              className="h-5 w-5 rounded-xs border border-hairline text-ink-soft hover:text-ink disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center text-[10px] tabular-nums text-ink-soft">{zoom}×</span>
            <button
              type="button"
              data-testid="etch-preview-zoom-in"
              aria-label="Zoom in"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STOPS.length - 1, i + 1))}
              disabled={!canZoomIn}
              className="h-5 w-5 rounded-xs border border-hairline text-ink-soft hover:text-ink disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>

      {ready ? (
        <>
          {/* True dot-scale view. The backing store is the bitmap's device pixels
              (1:1); CSS scales it UP by the integer zoom with pixelated rendering,
              and the overflow-auto viewport scroll-pans it — inspect any region at
              true dot scale before an irreversible cut. */}
          <div
            data-testid="etch-preview-viewport"
            className="max-h-64 overflow-auto rounded-xs border border-hairline bg-white"
          >
            <canvas
              ref={canvasRef}
              data-testid="etch-preview-canvas"
              aria-label="1:1 preview — exactly what etches"
              style={{
                imageRendering: 'pixelated',
                width: `${bitmap.width * zoom}px`,
                height: `${bitmap.height * zoom}px`,
                display: 'block',
              }}
            />
          </div>
          <p className="text-[11px] text-ink-soft/70">
            The exact 1-bit dots that etch — {bitmap.width}×{bitmap.height} px at {zoom}×.
            {hero.heldCount > 0 && (
              <>
                {' '}
                The <span className="text-violet">shaded</span> band is the Highlight Hold — held
                highlights etch no dots.
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-ink-soft/70" data-testid="etch-preview-resolving">
          Resolving the 1-bit preview…
        </p>
      )}
    </div>
  );
}
