// PlotOverlay — the Run Plan's machine-view canvas (issue #73, Wave-3 Lane G),
// evolved from the legacy plot-preview overlay (Lane C / C7, #15).
//
// TWO MODES, switched on whether a `route` prop is supplied:
//
//   1. MACHINE VIEW (route provided — the Run Plan). The plan panel (Lane I) owns
//      the runPlanModel and feeds this component the relevant slices; this overlay
//      is PRESENTATIONAL and does NOT recompute the model, so canvas and panel
//      always agree. It renders: draw segments tinted by their Operation color;
//      travel segments as faint DASHED hops; crops ghosted at the Sheet edge; the
//      Sheet + Bed rects; a two-way highlight (clicking a draw segment / crop fires
//      onLocate so the panel highlights the matching row); and a Play button that
//      animates a dot running the route in EXECUTION order, time-scaled to ~15s.
//      prefers-reduced-motion → the static full trace, no animated dot (and no Play
//      control — the trace already IS the finished run).
//
//   2. LEGACY FALLBACK (no route — pre-Lane-I / existing callers). Keeps the
//      original behavior: compute the route from `layers`+`patternInstances` via
//      the fabrication pipeline and ring pre-optimize overlaps. Retained on purpose
//      so the app builds and existing tests stay green before Lane I wires the
//      plan model through. Documented deviation from the "prop-fed-only" recommendation:
//      ground rule 7 mandates existing tests (which pass `layers`, no `route`) stay
//      green, so the fallback lives on; the machine view activates the moment a
//      `route` is passed.
//
// Coordinate contract (both modes): everything lives in the canvas-px viewBox
// `0 0 canvasW canvasH`, so this SVG renders as a sibling of the p5 surface INSIDE
// the scaled wrapper and auto-aligns with the live design + canvas transform.
// `route`/`crops` points are canvas px; `sheetRect` is canvas px; `bedSize` is mm,
// anchored at the origin and converted via PX_PER_MM (unitToPx). The Play control is
// screen-space (a sibling div) so it does not scale/warp with zoom.

/* eslint-disable react-refresh/only-export-components --
   The pure timing helpers (computeRunPlanTiming / runDotPositionAt / RUN_PLAN_TOTAL_MS)
   are co-exported from this file so the ~15s run-animation math can be unit-tested in
   isolation (per the Lane G test plan). Splitting them into their own module is out of
   this lane's file ownership (issue #73 Wave-3 Lane G edits PlotOverlay + RightPanel
   only). Fast-refresh of this component is unaffected in practice. */
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  buildPlottableLayers,
  buildRouteFromLayers,
} from '../../lib/plotter/fabricationPipeline';
import { countOverlaps } from '../../lib/plotter/overlapCheck';
import { unitToPx } from '../../lib/units';

const MAX_SAMPLES = 24;

// Total wall-clock budget for one animated run-through of the whole route.
export const RUN_PLAN_TOTAL_MS = 15000;

function segLength(s) {
  const dx = s.to[0] - s.from[0];
  const dy = s.to[1] - s.from[1];
  return Math.hypot(dx, dy);
}

// Pure timing model for the run animation. Scales the WHOLE route (draw + travel)
// by total length to a fixed ~15s budget — a constant-speed physical read of the
// pen/head running the plan in execution order. (Deliberately separate from the
// plan panel's profile-aware TIME ESTIMATE, per ADR 0002; this is a preview pace,
// not an estimate.) Returns per-segment [startMs, endMs) windows in execution order.
export function computeRunPlanTiming(route, totalMs = RUN_PLAN_TOTAL_MS) {
  const segs = Array.isArray(route) ? route : [];
  const lengths = segs.map(segLength);
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const segments = [];
  let t = 0;
  for (let i = 0; i < segs.length; i++) {
    const frac =
      totalLength > 0 ? lengths[i] / totalLength : segs.length ? 1 / segs.length : 0;
    const durMs = frac * totalMs;
    segments.push({
      index: i,
      type: segs[i].type,
      from: segs[i].from,
      to: segs[i].to,
      length: lengths[i],
      startMs: t,
      endMs: t + durMs,
      durMs,
    });
    t += durMs;
  }
  return { totalLength, totalMs, segments };
}

// Pure: where the run-dot sits at time `ms` (clamped to [0, totalMs]). Walks the
// timing windows in execution order, skipping zero-length hops, and lerps within
// the active segment. Returns [x, y] in canvas px, or null for an empty route.
export function runDotPositionAt(timing, ms) {
  const segs = timing?.segments || [];
  if (!segs.length) return null;
  const clamped = Math.max(0, Math.min(ms, timing.totalMs));
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.durMs === 0) continue;
    if (clamped < s.endMs || i === segs.length - 1) {
      const f = Math.max(0, Math.min(1, (clamped - s.startMs) / s.durMs));
      return [s.from[0] + (s.to[0] - s.from[0]) * f, s.from[1] + (s.to[1] - s.from[1]) * f];
    }
  }
  const last = segs[segs.length - 1];
  return [last.to[0], last.to[1]];
}

function pointsAttr(points) {
  return (points || []).map((p) => `${p[0]},${p[1]}`).join(' ');
}

export default function PlotOverlay({
  // --- legacy fallback inputs ---
  layers,
  patternInstances,
  appliedOptimizations = null,
  // --- shared ---
  canvasW,
  canvasH,
  // --- machine-view inputs (Lane I feeds these via RightPanel) ---
  route = null,
  crops = null,
  bedSize = null, // { width, height, unit:'mm' } — machine reachable area
  sheetRect = null, // { x, y, width, height } px — the Sheet work-piece
  opRows = null, // [{ opId, color }] — tint→Operation lookup for two-way highlight
  // Two-way locate (PRD story 25): the shared target set from the panel side —
  // { opId } rings that Operation's draw segments, { layerId } rings the
  // matching ghosted crop. Ephemeral: click-again or Esc clears it.
  locate = null,
  playing = false,
  onLocate = () => {},
  onPlayingChange = null,
  prefersReducedMotion, // bool; falls back to the CSS media query when undefined
}) {
  const machineView = Array.isArray(route);

  // --- LEGACY: route preview (post-optimize) + pre-optimize overlaps -----------
  const legacyRoute = useMemo(() => {
    if (machineView || !layers || !patternInstances) return [];
    const plottable = buildPlottableLayers(layers, patternInstances, {
      optimizations: appliedOptimizations,
    });
    return buildRouteFromLayers(plottable);
  }, [machineView, layers, patternInstances, appliedOptimizations]);

  const legacyOverlaps = useMemo(() => {
    if (machineView || !layers || !patternInstances) return [];
    const plottable = buildPlottableLayers(layers, patternInstances, {});
    const samples = [];
    for (const layer of plottable) {
      const res = countOverlaps(layer.paths);
      for (const s of res.samples) {
        if (samples.length < MAX_SAMPLES) samples.push(s);
      }
    }
    return samples;
  }, [machineView, layers, patternInstances]);

  // --- Reduced motion: prop wins (testable); else read the media query ---------
  const reduced =
    prefersReducedMotion ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false);

  // --- Play state: seeded from the prop, works standalone before Lane I wires --
  const [isPlaying, setIsPlaying] = useState(playing);
  useEffect(() => {
    setIsPlaying(playing);
  }, [playing]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      const next = !p;
      if (onPlayingChange) onPlayingChange(next);
      return next;
    });
  }, [onPlayingChange]);

  // --- Run-through animation ---------------------------------------------------
  const timing = useMemo(
    () => (machineView ? computeRunPlanTiming(route) : null),
    [machineView, route]
  );

  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(null);
  // Accumulator that survives effect teardown. If Lane I hands us a freshly-built
  // `route` array on a re-render (new `timing` identity), the effect re-runs — but
  // we RESUME from the last elapsed instead of snapping the dot back to the start.
  const elapsedRef = useRef(0);
  const animating = machineView && isPlaying && !reduced && !!timing && timing.totalLength > 0;

  useEffect(() => {
    if (!animating) return undefined;
    const total = timing.totalMs;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const origin = clock() - elapsedRef.current; // resume, don't reset
    const tick = () => {
      const e = (clock() - origin) % total; // loop for a continuous preview
      elapsedRef.current = e;
      setElapsed(e);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animating, timing]);

  const dot = animating ? runDotPositionAt(timing, elapsed) : null;

  // --- Two-way highlight: segment/crop click → onLocate(target) ----------------
  const colorToOpId = useMemo(() => {
    const m = new Map();
    if (Array.isArray(opRows)) {
      for (const r of opRows) {
        if (r && r.color != null && !m.has(r.color)) m.set(r.color, r.opId);
      }
    }
    return m;
  }, [opRows]);

  // Locate ring state (mirrors RunPlanPanel). The prop is the shared target
  // (panel → canvas); a segment/crop click echoes locally so the ring paints
  // even before the parent round-trips. Sentinel: undefined = defer to the
  // prop, null = explicitly cleared.
  const [localLocate, setLocalLocate] = useState(undefined);
  useEffect(() => {
    setLocalLocate(undefined); // a new shared target wins over a stale echo
  }, [locate]);
  const effectiveLocate = localLocate === undefined ? locate ?? null : localLocate;

  const clearLocate = useCallback(() => {
    setLocalLocate(null);
    onLocate(null);
  }, [onLocate]);

  // Ephemeral: clicking the located segment/crop again toggles off; Esc clears.
  useEffect(() => {
    if (!effectiveLocate) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') clearLocate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveLocate, clearLocate]);

  const locateSegment = useCallback(
    (seg) => {
      const opId = colorToOpId.get(seg.color);
      if (opId == null) return; // unresolvable colour → no-op (don't fire undefined)
      if (effectiveLocate?.opId === opId) return clearLocate();
      setLocalLocate({ opId });
      onLocate({ opId });
    },
    [colorToOpId, onLocate, effectiveLocate, clearLocate]
  );

  const locateCrop = useCallback(
    (crop) => {
      if (crop.layerId == null) return;
      if (effectiveLocate?.layerId === crop.layerId) return clearLocate();
      setLocalLocate({ layerId: crop.layerId });
      onLocate({ layerId: crop.layerId });
    },
    [onLocate, effectiveLocate, clearLocate]
  );

  const span = Math.max(canvasW || 0, canvasH || 0, 1);

  // ===========================================================================
  // MACHINE VIEW
  // ===========================================================================
  if (machineView) {
    const drawW = span * 0.0016;
    const travelW = span * 0.001;
    const cropW = span * 0.0014;
    const frameW = span * 0.0012;
    const dotR = span * 0.01;

    const bedPx = bedSize
      ? {
          w: unitToPx(bedSize.width || 0, bedSize.unit || 'mm'),
          h: unitToPx(bedSize.height || 0, bedSize.unit || 'mm'),
        }
      : null;

    const showControls = !reduced && timing && timing.totalLength > 0;

    return (
      <>
        <svg
          data-testid="plot-overlay"
          className="machine-view pointer-events-none absolute inset-0"
          width={canvasW}
          height={canvasH}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          // Let the Bed frame extend past the Sheet without being clipped.
          style={{ overflow: 'visible' }}
          aria-label="Run Plan machine view"
        >
          {/* Bed — the machine's reachable area, anchored at the origin. */}
          {bedPx && (
            <rect
              data-overlay="bed"
              className="machine-bed"
              x={0}
              y={0}
              width={Math.max(0, bedPx.w)}
              height={Math.max(0, bedPx.h)}
              fill="none"
              stroke="var(--hairline, #c9c4b8)"
              strokeOpacity={0.9}
              strokeWidth={frameW}
              strokeDasharray={`${span * 0.01} ${span * 0.006}`}
            />
          )}

          {/* Sheet — the physical work-piece the design maps onto. */}
          {sheetRect && (
            <rect
              data-overlay="sheet"
              className="machine-sheet"
              x={sheetRect.x}
              y={sheetRect.y}
              width={Math.max(0, sheetRect.width)}
              height={Math.max(0, sheetRect.height)}
              fill="none"
              stroke="var(--ink-soft, #6b6f76)"
              strokeOpacity={0.7}
              strokeWidth={frameW}
            />
          )}

          {/* Crops — content clipped at the Sheet edge, ghosted in the layer's
              own colour so the maker sees WHICH layer is being cropped. */}
          {(Array.isArray(crops) ? crops : []).map((crop, i) => {
            const Tag = crop.closed ? 'polygon' : 'polyline';
            return (
              <Tag
                key={`c-${i}`}
                data-overlay="crop"
                data-ghost="true"
                data-layer-id={crop.layerId}
                className="machine-crop"
                points={pointsAttr(crop.points)}
                fill="none"
                stroke={crop.color || 'var(--tone-strong, #b23a48)'}
                strokeOpacity={0.35}
                strokeWidth={cropW}
                strokeDasharray={`${span * 0.004} ${span * 0.004}`}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={() => locateCrop(crop)}
              />
            );
          })}

          {/* Route — draw segments tinted by Operation colour (clickable for the
              two-way highlight); travel segments faint + dashed (non-interactive). */}
          {route.map((seg, i) =>
            seg.type === 'draw' ? (
              <line
                key={`d-${i}`}
                data-overlay="route"
                className="machine-draw"
                x1={seg.from[0]}
                y1={seg.from[1]}
                x2={seg.to[0]}
                y2={seg.to[1]}
                stroke={seg.color || 'var(--ink, #26324d)'}
                strokeOpacity={0.9}
                strokeWidth={drawW}
                strokeLinecap="round"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={() => locateSegment(seg)}
              />
            ) : (
              <line
                key={`t-${i}`}
                data-overlay="travel"
                className="machine-travel"
                x1={seg.from[0]}
                y1={seg.from[1]}
                x2={seg.to[0]}
                y2={seg.to[1]}
                stroke="var(--ink-soft, #9aa0a6)"
                strokeOpacity={0.4}
                strokeWidth={travelW}
                strokeDasharray={span * 0.006}
              />
            )
          )}

          {/* Locate ring — the two-way highlight (PRD story 25). A calm violet
              halo hugging the located Operation's draw segments or the located
              crop's own outline. STATIC — it renders under reduced motion too;
              only the run-dot animation is motion-gated. */}
          {effectiveLocate?.opId != null &&
            route
              .filter(
                (seg) =>
                  seg.type === 'draw' &&
                  colorToOpId.get(seg.color) === effectiveLocate.opId
              )
              .map((seg, i) => (
                <line
                  key={`lr-${i}`}
                  data-overlay="locate-ring"
                  className="machine-locate-ring"
                  x1={seg.from[0]}
                  y1={seg.from[1]}
                  x2={seg.to[0]}
                  y2={seg.to[1]}
                  stroke="var(--violet, #7c4dff)"
                  strokeOpacity={0.45}
                  strokeWidth={drawW * 3.5}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
          {effectiveLocate?.layerId != null &&
            (Array.isArray(crops) ? crops : [])
              .filter((crop) => crop.layerId === effectiveLocate.layerId)
              .map((crop, i) => {
                const Tag = crop.closed ? 'polygon' : 'polyline';
                return (
                  <Tag
                    key={`lrc-${i}`}
                    data-overlay="locate-ring"
                    className="machine-locate-ring"
                    points={pointsAttr(crop.points)}
                    fill="none"
                    stroke="var(--violet, #7c4dff)"
                    strokeOpacity={0.45}
                    strokeWidth={cropW * 3.5}
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}

          {/* Run-dot — the head running the plan in execution order. Violet (the
              one load-bearing ornamental accent; --saffron is reserved for Export).
              Never rendered under reduced motion. */}
          {dot && (
            <circle
              data-testid="run-dot"
              data-overlay="run-dot"
              cx={dot[0]}
              cy={dot[1]}
              r={dotR}
              fill="var(--violet, #7c4dff)"
              stroke="var(--paper, #fff)"
              strokeWidth={span * 0.003}
            />
          )}
        </svg>

        {/* Play control — screen-space (does not scale with zoom). Hidden under
            reduced motion: the static trace already shows the finished run. */}
        {showControls && (
          <div
            className="machine-run-controls"
            style={{
              position: 'absolute',
              left: 'var(--space-md, 16px)',
              bottom: 'var(--space-md, 16px)',
              pointerEvents: 'auto',
            }}
          >
            <button
              type="button"
              data-testid="run-play"
              onClick={togglePlay}
              aria-pressed={isPlaying}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2xs, 4px)',
                padding: '6px 12px',
                fontSize: 'var(--text-sm, 13px)',
                fontFamily: 'var(--font-body, inherit)',
                color: 'var(--ink, #26324d)',
                background: 'var(--paper, #fff)',
                border: '1px solid var(--hairline, #c9c4b8)',
                borderRadius: 'var(--radius-xs, 2px)',
                cursor: 'pointer',
              }}
            >
              {isPlaying ? 'Pause run' : 'Play run'}
            </button>
          </div>
        )}
      </>
    );
  }

  // ===========================================================================
  // LEGACY FALLBACK (no route) — unchanged plot preview + overlap rings.
  // ===========================================================================
  if (!layers?.length) return null;

  const drawW = span * 0.0016;
  const travelW = span * 0.001;
  const markR = span * 0.012;

  return (
    <svg
      data-testid="plot-overlay"
      className="pointer-events-none absolute inset-0"
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      aria-label="Plot preview and overlap overlay"
    >
      {/* Plot route trace (static) — draw strokes solid, travel hops dashed. */}
      {legacyRoute.map((seg, i) =>
        seg.type === 'draw' ? (
          <line
            key={`d-${i}`}
            data-overlay="route"
            x1={seg.from[0]} y1={seg.from[1]}
            x2={seg.to[0]}   y2={seg.to[1]}
            stroke={seg.color || '#00c9b1'}
            strokeOpacity={0.85}
            strokeWidth={drawW}
            strokeLinecap="round"
          />
        ) : (
          <line
            key={`t-${i}`}
            data-overlay="travel"
            x1={seg.from[0]} y1={seg.from[1]}
            x2={seg.to[0]}   y2={seg.to[1]}
            stroke="#9aa0a6"
            strokeOpacity={0.5}
            strokeWidth={travelW}
            strokeDasharray={span * 0.006}
          />
        )
      )}

      {/* Overlap highlights — ring each detected crossing point. */}
      {legacyOverlaps.map((pt, i) => (
        <circle
          key={`o-${i}`}
          data-overlay="overlap"
          data-x={pt[0]}
          data-y={pt[1]}
          cx={pt[0]}
          cy={pt[1]}
          r={markR}
          fill="#ff4d4d"
          fillOpacity={0.25}
          stroke="#ff4d4d"
          strokeOpacity={0.9}
          strokeWidth={span * 0.0016}
        />
      ))}
    </svg>
  );
}
