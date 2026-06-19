import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import useCanvas from "../lib/useCanvas";
import CanvasChrome from "./canvas/CanvasChrome";
import PlotOverlay from "./canvas/PlotOverlay";
import { cursorToUnit } from "../lib/canvasChrome";

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
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [internalZoom, setInternalZoom] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

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
    bgColor
  );

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
      </div>

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
