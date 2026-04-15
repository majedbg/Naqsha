import CanvasSection from './CanvasSection';
import OutputModeSection from './OutputModeSection';
import OptimizeSection from './OptimizeSection';

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
  optimizations,
  onOptimizationChange,
  onOptimizationApply,
  onOptimizationRevert,
  patternInstances,
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

      <OptimizeSection
        optimizations={optimizations}
        patternInstances={patternInstances}
        layers={layers}
        onChange={onOptimizationChange}
        onApply={onOptimizationApply}
        onRevert={onOptimizationRevert}
      />
    </div>
  );
}
