import { useState, useCallback, useEffect } from "react";
import DimensionsSection from "./DimensionsSection";
import LayersSection from "./LayersSection";
import ExportSection from "./ExportSection";
import { useGate } from "../lib/useGate";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

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
  const isMobile = useIsMobile();
  const { check, limits } = useGate();
  const [collapsed, setCollapsed] = useState(false);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);

  // Clamp active index when layers change
  const clampedIndex = activeLayerIndex >= layers.length
    ? Math.max(0, layers.length - 1)
    : activeLayerIndex;
  if (clampedIndex !== activeLayerIndex) {
    setActiveLayerIndex(clampedIndex);
  }

  const prevLayer = useCallback(() => {
    setActiveLayerIndex((i) => (i > 0 ? i - 1 : layers.length - 1));
  }, [layers.length]);

  const nextLayer = useCallback(() => {
    setActiveLayerIndex((i) => (i < layers.length - 1 ? i + 1 : 0));
  }, [layers.length]);

  // Desktop layout — unchanged
  if (!isMobile) {
    return (
      <div className="w-[320px] min-w-[320px] lg:w-[420px] lg:min-w-[420px] h-full bg-panel border-r border-[#2e2e2e] overflow-y-auto">
        <div className="p-4 space-y-6">
          <div>
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

  // Mobile layout — collapsible panel below canvas
  return (
    <div className="w-full h-full bg-panel border-t border-[#2e2e2e] flex flex-col mobile-panel">
      {/* Collapse toggle bar */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a1a] border-b border-[#2e2e2e] active:bg-[#222] transition-colors"
      >
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Controls
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-500 transition-transform duration-200 ${
            collapsed ? "" : "rotate-180"
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!collapsed && (
        <div className="overflow-y-auto overscroll-contain flex-1 mobile-panel-content">
          <div className="p-3 space-y-4">
            <DimensionsSection
              width={width}
              height={height}
              presetIndex={presetIndex}
              onPresetChange={onPresetChange}
              onCustomChange={onCustomChange}
            />

            {/* Layer tab navigation — arrows to switch between layers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Layers
                </h3>
                <span className="text-[10px] text-gray-600">
                  {activeLayerIndex + 1} / {layers.length}
                </span>
              </div>

              {/* Arrow navigation row */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={prevLayer}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#252525] border border-[#333] text-gray-400 hover:text-accent hover:border-accent active:bg-[#333] transition-colors"
                  aria-label="Previous layer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {/* Layer name pills — scrollable row */}
                <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
                  {layers.map((layer, i) => (
                    <button
                      key={layer.id}
                      onClick={() => setActiveLayerIndex(i)}
                      className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        i === activeLayerIndex
                          ? "bg-accent/20 text-accent border border-accent/40"
                          : "bg-[#252525] text-gray-500 border border-[#333] active:bg-[#333]"
                      }`}
                    >
                      {layer.name || `Layer ${i + 1}`}
                    </button>
                  ))}
                  {/* + New layer pill */}
                  {check("layers", layers.length + 1).allowed &&
                    layers.length < limits.maxLayers && (
                      <button
                        onClick={() => {
                          onAddLayer();
                          setActiveLayerIndex(layers.length);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#252525] text-gray-500 border border-dashed border-[#444] active:bg-[#333] hover:text-accent hover:border-accent transition-colors"
                      >
                        + New
                      </button>
                    )}
                </div>

                <button
                  onClick={nextLayer}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#252525] border border-[#333] text-gray-400 hover:text-accent hover:border-accent active:bg-[#333] transition-colors"
                  aria-label="Next layer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Single layer view */}
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
                mobileActiveIndex={activeLayerIndex}
              />
            </div>

            <ExportSection
              onExportAll={onExportAll}
              onSaveLayerGroup={onSaveLayerGroup}
              onSaveToCloud={onSaveToCloud}
              onOpenCloudDesigns={onOpenCloudDesigns}
            />
          </div>
        </div>
      )}
    </div>
  );
}
