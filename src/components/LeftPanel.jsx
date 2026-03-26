import DimensionsSection from "./DimensionsSection";
import LayersSection from "./LayersSection";
import ExportSection from "./ExportSection";

export default function LeftPanel({
  width,
  height,
  presetIndex,
  onPresetChange,
  onCustomChange,
  layers,
  onUpdateLayer,
  onRemoveLayer,
  onAddLayer,
  onDuplicateLayer,
  onRandomizeLayer,
  onRandomizeAll,
  onRandomizeLayerParams,
  onRandomizeAllParams,
  onReorderLayers,
  onExportLayer,
  onExportAll,
  onSaveLayerGroup,
  onSaveToCloud,
  onOpenCloudDesigns,
  onOpenAIChat,
}) {
  return (
    <div className="w-[420px] min-w-[420px] h-full bg-panel border-r border-[#2e2e2e] overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-lg font-bold text-gray-100">
            Generative Art Studio
          </h1>
          <p className="text-[11px] text-gray-600">
            Multi-layer SVG for laser-cut acrylic
          </p>
        </div>

        <DimensionsSection
          width={width}
          height={height}
          presetIndex={presetIndex}
          onPresetChange={onPresetChange}
          onCustomChange={onCustomChange}
        />

        <LayersSection
          layers={layers}
          onUpdate={onUpdateLayer}
          onRemove={onRemoveLayer}
          onAdd={onAddLayer}
          onDuplicate={onDuplicateLayer}
          onRandomize={onRandomizeLayer}
          onRandomizeAll={onRandomizeAll}
          onRandomizeParams={onRandomizeLayerParams}
          onRandomizeAllParams={onRandomizeAllParams}
          onReorder={onReorderLayers}
          onExportLayer={onExportLayer}
          onOpenAIChat={onOpenAIChat}
        />

        <ExportSection
          onExportAll={onExportAll}
          onSaveLayerGroup={onSaveLayerGroup}
          onSaveToCloud={onSaveToCloud}
          onOpenCloudDesigns={onOpenCloudDesigns}
        />
      </div>
    </div>
  );
}
