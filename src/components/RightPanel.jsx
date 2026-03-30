import { useRef, useState, useEffect } from "react";
import useCanvas from "../lib/useCanvas";

const BG_PRESETS = [
  { color: '#0a1628', label: 'Dark Blue' },
  { color: '#ffffff', label: 'White' },
  { color: '#000000', label: 'Black' },
];

export default function RightPanel({
  layers,
  canvasW,
  canvasH,
  patternInstancesRef,
  canvasContainerRef,
  bgColor,
  onBgColorChange,
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  const { patternInstances } = useCanvas(
    containerRef,
    layers,
    canvasW,
    canvasH,
    bgColor
  );

  // Expose pattern instances to parent for SVG export
  useEffect(() => {
    if (patternInstancesRef) {
      patternInstancesRef.current = patternInstances;
    }
  }, [patternInstances, patternInstancesRef]);

  // Expose canvas container so parent can grab thumbnails
  useEffect(() => {
    if (canvasContainerRef) {
      canvasContainerRef.current = containerRef.current;
    }
  }, [canvasContainerRef]);

  // Calculate scale to fit canvas in available space
  useEffect(() => {
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const padding = 48;
      const availW = wrapperRef.current.clientWidth - padding * 2;
      const availH = wrapperRef.current.clientHeight - padding * 2;
      const scaleX = availW / canvasW;
      const scaleY = availH / canvasH;
      setScale(Math.min(scaleX, scaleY, 1));
    };

    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [canvasW, canvasH]);

  return (
    <div
      ref={wrapperRef}
      className="flex-1 h-full bg-surface flex flex-col items-center justify-center overflow-hidden"
    >
      <div
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          boxShadow: "7px 7px 25px 2px rgba(0,0,0, 0.5)",
        }}
      >
        <div ref={containerRef} />
      </div>

      {/* Background color button */}
      <div className="relative mt-4" style={{ transform: `scale(${Math.max(scale, 0.6)})`, transformOrigin: 'center top' }}>
        <button
          onClick={() => setBgPickerOpen(!bgPickerOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1e1e1e] border border-[#333] hover:border-[#555] transition-colors"
        >
          <div
            className="w-4 h-4 rounded border border-[#555]"
            style={{ backgroundColor: bgColor }}
          />
          <span className="text-[11px] text-gray-400">Background</span>
        </button>
        {bgPickerOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1e1e1e] border border-[#444] rounded-lg shadow-xl p-2.5 z-50">
            <div className="flex gap-1.5 mb-2">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => { onBgColorChange(preset.color); setBgPickerOpen(false); }}
                  className={`w-7 h-7 rounded border-2 transition-colors ${
                    bgColor === preset.color ? 'border-accent' : 'border-[#555] hover:border-[#888]'
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
    </div>
  );
}
