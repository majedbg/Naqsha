import { useRef } from "react";
import Slider from "./ui/Slider";

export default function LayerBgFill({ layer, onUpdate }) {
  const bgColorRef = useRef(null);

  return (
    <div className="space-y-2">
      <span className="text-xs text-ink-soft">Background Fill</span>
      {/* Quick presets */}
      <div className="flex items-center gap-1.5">
        {[
          { color: "#000000", label: "Black" },
          { color: "#ffffff", label: "White" },
          { color: "#132639", label: "Navy" },
        ].map((preset) => (
          <button
            key={preset.color}
            className={`w-6 h-6 rounded border transition-colors ${
              layer.bgColor === preset.color && layer.bgOpacity === 100
                ? "border-violet ring-1 ring-accent/50"
                : "border-hairline hover:border-ink-soft"
            }`}
            style={{ backgroundColor: preset.color }}
            title={preset.label}
            onClick={() => onUpdate({ bgColor: preset.color, bgOpacity: 100 })}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="w-6 h-6 rounded cursor-pointer border border-hairline hover:border-violet transition-colors"
            style={{
              backgroundColor: layer.bgColor,
              opacity: layer.bgOpacity / 100,
              backgroundImage:
                layer.bgOpacity === 0
                  ? "linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)"
                  : "none",
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0px",
            }}
            onClick={() => bgColorRef.current?.click()}
            title="Layer background color"
          />
          <input
            ref={bgColorRef}
            type="color"
            value={layer.bgColor}
            onChange={(e) => onUpdate({ bgColor: e.target.value })}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
          />
        </div>
        <div className="flex-1">
          <Slider
            label="Fill Opacity"
            value={layer.bgOpacity}
            min={0}
            max={100}
            step={1}
            onChange={(v) => onUpdate({ bgOpacity: v })}
            tooltip="Background fill opacity — 0 means transparent (no fill)"
          />
        </div>
      </div>
    </div>
  );
}
