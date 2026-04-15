import { useRef, useState, useEffect, useCallback } from "react";
import useCanvas from "../lib/useCanvas";
import BedOverlay from "./canvas/BedOverlay";

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
  displayMode = 'design',
  unit = 'mm',
  marginPx = 0,
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

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
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }, []);

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

  const isPrepare = displayMode === 'prepare';

  return (
    <div
      ref={wrapperRef}
      className={`h-full bg-surface flex flex-col items-center justify-center relative ${zoom > 1.25 ? "overflow-auto" : "overflow-hidden"}`}
    >
      {isPrepare && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#141414]/90 border border-accent/40 text-accent/90 text-[10px] uppercase tracking-wider font-semibold rounded-md px-2.5 py-1 z-10 pointer-events-none">
          Prepare · Bed view
        </div>
      )}
      <div
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${finalScale})`,
          transformOrigin: "center center",
          boxShadow: isPrepare
            ? "0 0 0 1px rgba(0,201,177,0.35), 7px 7px 25px 2px rgba(0,0,0, 0.5)"
            : "7px 7px 25px 2px rgba(0,0,0, 0.5)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div ref={containerRef} />
        {isPrepare && (
          <BedOverlay
            canvasW={canvasW}
            canvasH={canvasH}
            marginPx={marginPx}
            unit={unit}
          />
        )}
      </div>

      {/* Background color button — bottom left, aligned with zoom controls */}
      <div className="absolute bottom-4 left-4">
        <button
          onClick={() => setBgPickerOpen(!bgPickerOpen)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1e1e1e] border border-[#333] hover:border-[#555] transition-colors shadow-lg"
        >
          <div
            className="w-4 h-4 rounded border border-[#555]"
            style={{ backgroundColor: bgColor }}
          />
          <span className="text-xs text-gray-400">Background</span>
        </button>
        {bgPickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-[#1e1e1e] border border-[#444] rounded-lg shadow-xl p-2.5 z-50">
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
                      ? "border-accent"
                      : "border-[#555] hover:border-[#888]"
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
          <div className="text-[9px] text-gray-500 bg-[#1e1e1e]/90 border border-[#333] rounded px-2 py-1 max-w-[180px] text-right leading-snug">
            Preview may appear pixelated, but exported vector file will not be
          </div>
        )}
        <div className="flex items-center gap-1 bg-[#1e1e1e] border border-[#333] rounded-lg px-1.5 py-1 shadow-lg">
          <button
            onClick={zoomOut}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-[#333] transition-colors text-sm font-medium"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-1.5 min-w-[40px] text-center text-[10px] text-gray-400 hover:text-accent transition-colors font-medium"
            title="Reset zoom"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={zoomIn}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-[#333] transition-colors text-sm font-medium"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
