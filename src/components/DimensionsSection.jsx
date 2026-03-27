import { PRESET_SIZES } from "../constants";
import { useGate } from "../lib/useGate";
import NumberInput from "./ui/NumberInput";

export default function DimensionsSection({
  width,
  height,
  presetIndex,
  onPresetChange,
  onCustomChange,
}) {
  const { check } = useGate();
  const isCustom = PRESET_SIZES[presetIndex]?.width === null;
  const customGate = check("customSize");

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Dimensions
      </h3>
      <div className="flex justify-between items-center">
        <select
          value={presetIndex}
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            // Check if this preset or custom size is allowed
            const isCustomIdx = PRESET_SIZES[idx]?.width === null;
            if (isCustomIdx && !customGate.allowed) return;
            const presetGate = check("preset", idx);
            if (!isCustomIdx && !presetGate.allowed) return;
            onPresetChange(idx);
          }}
          className="w-auto mr-2 bg-[#333] text-gray-200 text-sm px-3 py-2 rounded border border-[#444] outline-none focus:border-accent"
        >
          {PRESET_SIZES.map((size, i) => {
            const isCustomOpt = size.width === null;
            const gate = isCustomOpt ? customGate : check("preset", i);
            return (
              <option key={i} value={i} disabled={!gate.allowed}>
                {size.label}
                {!gate.allowed ? " 🔒" : ""}
              </option>
            );
          })}
        </select>
        <div className="flex gap-2">
          {isCustom ? (
            <div className="flex gap-2">
              <NumberInput
                label="Width (in)"
                value={width / 96}
                onChange={(v) => onCustomChange(Math.max(1, v) * 96, height)}
                min={1}
                max={48}
                step={0.5}
              />
              <NumberInput
                label="Height (in)"
                value={height / 96}
                onChange={(v) => onCustomChange(width, Math.max(1, v) * 96)}
                min={1}
                max={48}
                step={0.5}
              />
            </div>
          ) : (
            <div className="flex gap-4 text-sm text-gray-400">
              <span>{width / 96}" W</span>
              <span>×</span>
              <span>{height / 96}" H</span>
              <span className="text-gray-600">
                ({width} × {height} px)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
