import CanvasSection from './CanvasSection';
import OutputModeSection from './OutputModeSection';

export default function PrepareTab({
  width,
  height,
  presetIndex,
  unit,
  onUnitChange,
  margin,
  onMarginChange,
  onPresetChange,
  onCustomChange,
  outputMode,
  onOutputModeChange,
  layers,
  onUpdateLayer,
}) {
  return (
    <div
      role="tabpanel"
      id="tabpanel-prepare"
      aria-labelledby="tab-prepare"
      className="space-y-6"
    >
      <div className="px-1">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Bed size, units, and output mode live here — this is where the design
          becomes a plan for a real machine.
        </p>
      </div>

      <CanvasSection
        width={width}
        height={height}
        presetIndex={presetIndex}
        unit={unit}
        onUnitChange={onUnitChange}
        margin={margin}
        onMarginChange={onMarginChange}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
      />

      <OutputModeSection
        outputMode={outputMode}
        onOutputModeChange={onOutputModeChange}
        layers={layers}
        onUpdateLayer={onUpdateLayer}
      />

      <section className="space-y-2 opacity-60">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Optimize
        </h3>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Simplify · Merge · Reorder — preview &amp; apply controls land next.
          Every optimization will default off, preview before applying, and
          stay revertable.
        </p>
      </section>
    </div>
  );
}
