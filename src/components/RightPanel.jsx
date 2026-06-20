import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import useCanvas from "../lib/useCanvas";
import CanvasChrome from "./canvas/CanvasChrome";
import PlotOverlay from "./canvas/PlotOverlay";
import { cursorToUnit } from "../lib/canvasChrome";
import { screenToCanvas } from "../lib/canvas/coords";
import { buildSelectables, pickTopmost } from "../lib/scene/selectables";
import { applyMoveDelta } from "../lib/tools/moveTransform";
import {
  classifyPointer,
  rotateTransform,
  scaleTransform,
} from "../lib/tools/transformGestures";
import { ROTATE_OFFSET } from "../lib/transform/handles";
import { ghostSvg } from "../lib/scene/placement";

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

const BG_PRESETS = [
  { color: "#0a1628", label: "Dark Blue" },
  { color: "#ffffff", label: "White" },
  { color: "#000000", label: "Black" },
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export default function RightPanel({
  layers,
  canvasW,
  canvasH,
  patternInstancesRef,
  canvasContainerRef,
  onPatternInstancesChange,
  bgColor,
  onBgColorChange,
  unit = 'mm',
  // Optional controlled view (pro shell's Hand/Zoom tools — B6 / #9). When
  // `externalZoom` is provided the canvas zoom is controlled by the shell and
  // `setZoom` updates flow through `onZoomChange`; when absent (legacy / flag-OFF
  // path) the panel keeps its own internal zoom state — byte-identical behavior.
  // `externalPan` similarly translates the artboard when the shell drives pan.
  externalZoom,
  onZoomChange,
  externalPan,
  // Canvas chrome (pro shell only — B4 / #7). When `bedSize` is supplied the
  // panel renders the mm rulers + machine-bed artboard over the canvas and
  // reports the live cursor position (in the active unit) via `onCursorMove`.
  // All three are wired ONLY on the flag-ON path, so legacy/flag-OFF stays a
  // byte-identical no-op (no chrome, no cursor tracking).
  bedSize,
  onCursorMove,
  // Plot preview + overlap overlay (pro shell only — C7 / #15). When
  // `showPlotOverlay` is true the panel renders <PlotOverlay/> as a sibling of
  // the p5 surface INSIDE the scaled wrapper, so it auto-aligns with the live
  // design and scales with the canvas transform. OFF by default (the parent
  // simply doesn't pass it / passes false) → a true no-op clean canvas, matching
  // the legacy/flag-OFF path byte-for-byte. `appliedOptimizations` selects the
  // route-preview basis (post-optimize, like the legacy PlotPreviewSection).
  showPlotOverlay = false,
  appliedOptimizations = null,
  // Canvas interaction (Select/Move/Resize/Rotate + Hand-pan). The shell owns
  // the active tool + selection + per-layer transforms; this panel turns raw
  // pointer events over the canvas into select/transform/pan callbacks. All
  // default to no-ops so the panel renders unchanged when the parent doesn't
  // wire interaction (mobile / legacy path / tests). `activeTool` defaults to
  // null (not "select") so the pointer overlay stays inert — a true no-op —
  // until the desktop shell explicitly drives a tool.
  activeTool = null,
  transforms = {},
  selectedNodeId = null,
  onSelect = () => {},
  onMove = () => {},
  onCommit = () => {},
  onPanBy = () => {},
  // Click-to-place mode (kit / imported assets). When `placement` is set
  // ({ svg, paths, bbox }) the overlay shows a cursor-following ghost and a
  // click commits it via `onPlaceAsset(canvasPoint)`. Null → inert (no-op).
  placement = null,
  onPlaceAsset = () => {},
  onCancelPlacement = () => {},
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [internalZoom, setInternalZoom] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  // Click-to-place ghost. `ghostPoint` is the live cursor in canvas units; seeded
  // to the canvas centre so the ghost is visible the instant placement arms (the
  // cursor isn't over the canvas yet, before the first pointer move).
  const placing = !!placement;
  const [ghostPoint, setGhostPoint] = useState({ x: canvasW / 2, y: canvasH / 2 });
  // Re-seed the ghost to the canvas centre whenever a NEW placement arms (the
  // cursor isn't over the canvas yet). Done during render via a prev-value ref —
  // the React-blessed "adjust state on prop change" pattern, not an effect.
  const prevPlacementRef = useRef(placement);
  if (placement && placement !== prevPlacementRef.current) {
    setGhostPoint({ x: canvasW / 2, y: canvasH / 2 });
  }
  prevPlacementRef.current = placement;
  const ghostMarkup = useMemo(
    () => (placement ? ghostSvg(placement.paths, placement.bbox) : null),
    [placement]
  );

  // Controlled when the shell supplies a zoom value + setter; otherwise internal.
  const isControlledZoom = externalZoom != null && typeof onZoomChange === "function";
  const zoom = isControlledZoom ? externalZoom : internalZoom;
  const setZoom = useCallback(
    (next) => {
      if (isControlledZoom) {
        onZoomChange((prev) => (typeof next === "function" ? next(prev) : next));
      } else {
        setInternalZoom(next);
      }
    },
    [isControlledZoom, onZoomChange]
  );
  const pan = externalPan ?? { x: 0, y: 0 };
  // Only prepend a translate when the shell actually drives pan, so the legacy
  // (flag-OFF) transform string stays byte-identical.
  const panTransform = externalPan ? `translate(${pan.x}px, ${pan.y}px) ` : "";

  const { patternInstances } = useCanvas(
    containerRef,
    layers,
    canvasW,
    canvasH,
    bgColor,
    transforms,
    selectedNodeId
  );

  // Latest transforms readable inside pointer handlers without stale closures
  // (the map identity changes on every drag frame; handlers stay stable).
  const transformsLiveRef = useRef(transforms);
  useEffect(() => {
    transformsLiveRef.current = transforms;
  }, [transforms]);

  // Drag/pan session state (refs so handlers don't re-bind / re-render per move).
  const dragRef = useRef(null); // { id, kind, startPoint, startTransform, center, moved }
  const panRef = useRef(null); // { lastX, lastY } during a Hand-tool pan

  // Expose pattern instances to parent for SVG export and optimization stats.
  useEffect(() => {
    if (patternInstancesRef) {
      patternInstancesRef.current = patternInstances;
    }
    if (onPatternInstancesChange) {
      onPatternInstancesChange(patternInstances);
    }
  }, [patternInstances, patternInstancesRef, onPatternInstancesChange]);

  // Expose canvas container so parent can grab thumbnails
  useEffect(() => {
    if (canvasContainerRef) {
      canvasContainerRef.current = containerRef.current;
    }
  }, [canvasContainerRef]);

  // Calculate fit scale
  useEffect(() => {
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const padding = 48;
      const availW = wrapperRef.current.clientWidth - padding * 2;
      const availH = wrapperRef.current.clientHeight - padding * 2;
      const scaleX = availW / canvasW;
      const scaleY = availH / canvasH;
      setFitScale(Math.min(scaleX, scaleY, 1));
    };

    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [canvasW, canvasH]);

  // Scroll wheel zoom
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
    },
    [setZoom]
  );

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25));
  const resetZoom = () => setZoom(1);

  const finalScale = fitScale * zoom;
  const zoomPercent = Math.round(zoom * 100);

  // Pro-shell canvas chrome (B4 / #7): only active when the shell supplies a
  // bed size. Reporting the cursor uses the SAME on-screen scale (finalScale)
  // the rulers use, so the status-bar readout reads correctly against them.
  const showChrome = bedSize != null;

  // Chrome alignment (B4 / #7 fix): the canvas surface is flex-CENTERED in the
  // wrapper (and pan/zoom-transformed), but CanvasChrome is `absolute inset-0`
  // of the wrapper — so without this it pins the rulers + bed to the wrapper's
  // top-left while the artwork sits centered elsewhere. Measure the live canvas
  // rect (the SAME element the cursor readout measures, so ticks ↔ cursor agree
  // by construction) relative to the wrapper, and feed CanvasChrome that origin
  // so ruler 0,0 tracks the canvas corner under centering, pan, zoom AND the
  // overflow-auto scroll that kicks in past 1.25x.
  const [chromeOrigin, setChromeOrigin] = useState(null);
  useLayoutEffect(() => {
    if (!showChrome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot reset when chrome turns off; no cascading loop
      setChromeOrigin(null);
      return undefined;
    }
    const measure = () => {
      const surface = containerRef.current;
      const wrap = wrapperRef.current;
      if (!surface || !wrap) return;
      const sRect = surface.getBoundingClientRect();
      const wRect = wrap.getBoundingClientRect();
      setChromeOrigin({ x: sRect.left - wRect.left, y: sRect.top - wRect.top });
    };
    measure();
    const wrap = wrapperRef.current;
    window.addEventListener("resize", measure);
    wrap?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      wrap?.removeEventListener("scroll", measure);
    };
  }, [showChrome, finalScale, pan.x, pan.y, canvasW, canvasH, bedSize]);

  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (!onCursorMove) return;
      const surface = containerRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      // Offset from the artboard origin in screen px, then back-projected to the
      // active unit through the shared scale.
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      onCursorMove({
        x: cursorToUnit(sx, unit, finalScale),
        y: cursorToUnit(sy, unit, finalScale),
      });
    },
    [onCursorMove, unit, finalScale]
  );
  const handleCanvasMouseLeave = useCallback(() => {
    if (onCursorMove) onCursorMove(null);
  }, [onCursorMove]);

  // --- Canvas interaction: Hand-pan + Select/Move/Resize/Rotate ------------
  const handActive = activeTool === "hand";
  const selectActive = activeTool === "select";

  // Map a browser pointer position to canvas-internal coordinates. Uses the live
  // canvas-surface rect, so it's correct under centering, pan AND zoom.
  const toCanvasPoint = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return screenToCanvas(clientX, clientY, rect, finalScale);
    },
    [finalScale]
  );

  const capturePointer = (e) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer was already released */
    }
  };
  const releasePointer = (e) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;

      // Click-to-place: a click commits the armed asset at the cursor (canvas
      // space). Takes precedence over select/hand; no drag session is started.
      if (placing) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (pt) onPlaceAsset(pt);
        return;
      }

      // Hand tool (or held Space): start a screen-space pan drag.
      if (handActive) {
        panRef.current = { lastX: e.clientX, lastY: e.clientY };
        capturePointer(e);
        return;
      }
      if (!selectActive) return;

      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const liveTransforms = transformsLiveRef.current || {};
      const selectables = buildSelectables({ layers, canvasW, canvasH });

      // 1) If a layer is selected, its rotate/resize handles take priority over
      //    re-selecting/moving — a handle hit starts a transform WITHOUT changing
      //    selection. Handles are hit-tested in the node's LOCAL space.
      if (selectedNodeId) {
        const selDef = selectables.find((s) => s.id === selectedNodeId);
        if (selDef) {
          const startTransform = liveTransforms[selectedNodeId] || IDENTITY;
          const hit = classifyPointer(
            pt,
            { transform: startTransform, localBBox: selDef.localBBox },
            canvasW,
            canvasH
          );
          if (hit.kind === "rotate" || hit.kind === "resize") {
            dragRef.current = {
              id: selectedNodeId,
              kind: hit.kind,
              startPoint: pt,
              startTransform,
              center: selDef.pivot,
              moved: false,
            };
            capturePointer(e);
            return;
          }
        }
      }

      // 2) Otherwise pick the topmost layer under the pointer → select + move.
      const id = pickTopmost(pt, selectables, liveTransforms);
      if (!id) {
        onSelect(null); // empty-space click clears selection (no history commit)
        return;
      }
      onSelect(id);
      const picked = selectables.find((s) => s.id === id);
      dragRef.current = {
        id,
        kind: "move",
        startPoint: pt,
        startTransform: liveTransforms[id] || IDENTITY,
        center: picked ? picked.pivot : { x: canvasW / 2, y: canvasH / 2 },
        moved: false,
      };
      capturePointer(e);
    },
    [placing, onPlaceAsset, handActive, selectActive, toCanvasPoint, layers, canvasW, canvasH, selectedNodeId, onSelect]
  );

  const handlePointerMove = useCallback(
    (e) => {
      // Click-to-place: track the cursor so the ghost preview follows it.
      if (placing) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (pt) setGhostPoint(pt);
        return;
      }

      // Hand-pan: translate the artboard by the screen-space pointer delta.
      const pan = panRef.current;
      if (pan) {
        const dx = e.clientX - pan.lastX;
        const dy = e.clientY - pan.lastY;
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        if (dx || dy) onPanBy(dx, dy);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const dx = pt.x - drag.startPoint.x;
      const dy = pt.y - drag.startPoint.y;
      if (!drag.moved && (dx !== 0 || dy !== 0)) drag.moved = true;

      let next;
      if (drag.kind === "rotate") {
        next = rotateTransform(drag.startTransform, drag.center, drag.startPoint, pt, e.shiftKey);
      } else if (drag.kind === "resize") {
        next = scaleTransform(drag.startTransform, drag.center, drag.startPoint, pt);
      } else {
        next = applyMoveDelta(drag.startTransform, dx, dy);
      }
      onMove(drag.id, next);
    },
    [placing, toCanvasPoint, onMove, onPanBy]
  );

  const handlePointerUp = useCallback(
    (e) => {
      if (panRef.current) {
        panRef.current = null;
        releasePointer(e);
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      releasePointer(e);
      // Only commit (persist to the layer) if the node actually moved — a plain
      // selecting click must not write a no-op transform.
      if (drag.moved) onCommit();
    },
    [onCommit]
  );

  return (
    <div
      ref={wrapperRef}
      className={`h-full bg-surface flex flex-col items-center justify-center relative ${zoom > 1.25 ? "overflow-auto" : "overflow-hidden"}`}
      onMouseMove={showChrome ? handleCanvasMouseMove : undefined}
      onMouseLeave={showChrome ? handleCanvasMouseLeave : undefined}
    >
      {/* Pro-shell fabrication chrome (B4 / #7): mm rulers + bed artboard.
          Sits OUTSIDE the canvas transform and consumes the full on-screen
          scale (finalScale) as its zoom, so its ticks align with the scaled
          canvas and with the cursor readout (which divides by the same scale).
          Null bedSize (legacy / flag-OFF) → not rendered, a true no-op. */}
      {showChrome && (
        <CanvasChrome
          canvasWidthPx={canvasW}
          canvasHeightPx={canvasH}
          bedWidthMm={bedSize.width}
          bedHeightMm={bedSize.height}
          unit={unit}
          zoom={finalScale}
          pan={pan}
          origin={chromeOrigin}
        />
      )}
      <div
        style={{
          width: canvasW,
          height: canvasH,
          transform: `${panTransform}scale(${finalScale})`,
          transformOrigin: "center center",
          boxShadow: "7px 7px 25px 2px rgba(0,0,0, 0.5)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div ref={containerRef} />
        {/* Plot preview + overlap overlay (C7 / #15). Sibling of the p5 surface
            inside the scaled wrapper, so it shares the artwork's coordinate
            space and the canvas transform. Gated by the shell's Overlays toggle;
            null when off → clean canvas. */}
        {showPlotOverlay && (
          <PlotOverlay
            layers={layers}
            patternInstances={patternInstances}
            canvasW={canvasW}
            canvasH={canvasH}
            appliedOptimizations={appliedOptimizations}
          />
        )}
        {/* Select overlay. Sits inside the scaled box so pointer coords map
            through finalScale (move/rotate/resize need canvas-space). Active only
            for the Select tool; transparent otherwise so wheel-zoom and the
            background picker pass through. Hand-pan is handled by the full-viewport
            overlay below — it needs no canvas mapping (pure screen deltas) and so
            can start a drag from anywhere in the viewport. The top is extended
            above the canvas so the rotate handle (which floats at local
            y = -ROTATE_OFFSET) can receive its initiating pointerdown. */}
        {/* Click-to-place ghost — a to-scale preview that follows the cursor in
            canvas space, so the user sees exactly where/how big the asset lands.
            Centred on the cursor (its bbox centre = content centre = commit point).
            Pointer-transparent; the overlay below owns the events. */}
        {placing && ghostMarkup && (
          <div
            data-testid="placement-ghost"
            className="absolute"
            style={{
              left: ghostPoint.x,
              top: ghostPoint.y,
              width: placement.bbox.w,
              height: placement.bbox.h,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              opacity: 0.7,
            }}
            dangerouslySetInnerHTML={{ __html: ghostMarkup }}
          />
        )}
        <div
          data-testid="select-overlay"
          className="absolute"
          style={{
            top: -(ROTATE_OFFSET + 8),
            right: 0,
            bottom: 0,
            left: 0,
            pointerEvents: selectActive || placing ? "auto" : "none",
            cursor: placing ? "crosshair" : "default",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      {/* Hand-pan overlay — full viewport, OUTSIDE the canvas transform. Hand-pan
          works from screen-space deltas alone, so it needn't sit on the artboard:
          this lets a pan drag start anywhere in the canvas region (incl. the empty
          surface around the artboard), not just on top of the artwork. Active only
          in Hand mode; transparent otherwise so the canvas, select overlay and
          wheel-zoom keep working. Placed AFTER the scaled box so it sits above the
          canvas, but BEFORE the zoom/background buttons so those stay clickable. */}
      <div
        data-testid="pan-overlay"
        className="absolute inset-0"
        style={{
          // Suppressed during placement so the canvas-space select overlay
          // receives the placing click even when the Hand tool is active.
          pointerEvents: handActive && !placing ? "auto" : "none",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Click-to-place prompt — a popper pinned to the top of the canvas telling
          the user the mode is armed. Cancel button + Esc both abort. */}
      {placing && (
        <div
          data-testid="placement-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-3.5 py-2 rounded-full bg-ink text-paper text-xs font-medium shadow-xl"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-violet opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet" />
          </span>
          Click to place object on canvas
          <button
            type="button"
            onClick={onCancelPlacement}
            className="ml-1 text-paper/70 hover:text-paper transition-colors"
          >
            Cancel <span className="opacity-60">(Esc)</span>
          </button>
        </div>
      )}

      {/* Background color button — bottom left, aligned with zoom controls */}
      <div className="absolute bottom-4 left-4">
        <button
          onClick={() => setBgPickerOpen(!bgPickerOpen)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-paper-warm border border-hairline hover:border-ink-soft transition-colors shadow-lg"
        >
          <div
            className="w-4 h-4 rounded border border-hairline"
            style={{ backgroundColor: bgColor }}
          />
          <span className="text-xs text-ink-soft">Background</span>
        </button>
        {bgPickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-paper-warm border border-hairline rounded-lg shadow-xl p-2.5 z-50">
            <div className="flex gap-1.5 mb-2">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => {
                    onBgColorChange(preset.color);
                    setBgPickerOpen(false);
                  }}
                  className={`w-7 h-7 rounded border-2 transition-colors ${
                    bgColor === preset.color
                      ? "border-violet"
                      : "border-hairline hover:border-ink-soft"
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.label}
                />
              ))}
            </div>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="w-full h-7 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1.5">
        {zoomPercent > 120 && (
          <div className="text-[9px] text-ink-soft bg-paper-warm/90 border border-hairline rounded px-2 py-1 max-w-[180px] text-right leading-snug">
            Preview may appear pixelated, but exported vector file will not be
          </div>
        )}
        <div className="flex items-center gap-1 bg-paper-warm border border-hairline rounded-lg px-1.5 py-1 shadow-lg">
          <button
            onClick={zoomOut}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-soft hover:text-ink hover:bg-muted transition-colors text-sm font-medium"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-1.5 min-w-[40px] text-center text-[10px] text-ink-soft hover:text-saffron transition-colors font-medium"
            title="Reset zoom"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={zoomIn}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-soft hover:text-ink hover:bg-muted transition-colors text-sm font-medium"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
