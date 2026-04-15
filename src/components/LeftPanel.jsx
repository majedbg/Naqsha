import { useState, useCallback, useEffect } from "react";
import LayersSection from "./LayersSection";
import ExportSection from "./ExportSection";
import SidebarTabs from "./sidebar/SidebarTabs";
import PrepareTab from "./prepare/PrepareTab";
import { useGate } from "../lib/useGate";
import { pxToUnit } from "../lib/units";
import { PRESET_SIZES } from "../constants";

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

function SizeChip({ width, height, unit, preset, onClick }) {
  const w = pxToUnit(width, unit);
  const h = pxToUnit(height, unit);
  const precision = unit === 'in' ? 2 : 0;
  return (
    <button
      onClick={onClick}
      title="Change size in Prepare"
      className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#161616] border border-[#2a2a2a] text-[11px] text-gray-400 hover:text-gray-200 hover:border-[#3a3a3a] transition-colors"
    >
      <span className="font-mono">{w.toFixed(precision)} × {h.toFixed(precision)} {unit}</span>
      {preset?.category && preset.category !== 'custom' && preset.category !== 'artwork' && (
        <span className="text-[9px] uppercase tracking-wider text-gray-600">· {preset.category}</span>
      )}
    </button>
  );
}

export default function LeftPanel({
  width,
  height,
  presetIndex,
  unit,
  onUnitChange,
  margin,
  onMarginChange,
  onPresetChange,
  onCustomChange,
  activeTab,
  onTabChange,
  prepareStale,
  prepareConfigured,
  outputMode,
  onOutputModeChange,
  optimizations,
  onOptimizationChange,
  onOptimizationApply,
  onOptimizationRevert,
  patternInstances,
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
  const preset = PRESET_SIZES[presetIndex];

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

  // Desktop layout — tabbed (Design / Prepare / Export)
  if (!isMobile) {
    return (
      <div className="w-[320px] min-w-[320px] lg:w-[420px] lg:min-w-[420px] h-full bg-panel border-r border-[#2e2e2e] overflow-hidden flex flex-col">
        {/* Sticky tab header */}
        <div className="shrink-0 p-3 pb-2 border-b border-[#2a2a2a] bg-panel space-y-2">
          <SidebarTabs
            activeTab={activeTab}
            onChange={onTabChange}
            prepareStale={prepareStale}
            prepareConfigured={prepareConfigured}
          />
          {activeTab === 'design' && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-600">Multi-layer SVG for laser + plotter</p>
              <SizeChip
                width={width}
                height={height}
                unit={unit}
                preset={preset}
                onClick={() => onTabChange('prepare')}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'design' && (
            <div
              role="tabpanel"
              id="tabpanel-design"
              aria-labelledby="tab-design"
              className="space-y-6"
            >
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
            </div>
          )}

          {activeTab === 'prepare' && (
            <PrepareTab
              width={width}
              height={height}
              presetIndex={presetIndex}
              unit={unit}
              onUnitChange={onUnitChange}
              margin={margin}
              onMarginChange={onMarginChange}
              onPresetChange={onPresetChange}
              onCustomChange={onCustomChange}
              outputMode={outputMode}
              onOutputModeChange={onOutputModeChange}
              optimizations={optimizations}
              onOptimizationChange={onOptimizationChange}
              onOptimizationApply={onOptimizationApply}
              onOptimizationRevert={onOptimizationRevert}
              patternInstances={patternInstances}
              layers={layers}
              onUpdateLayer={onUpdateLayer}
            />
          )}

          {activeTab === 'export' && (
            <div
              role="tabpanel"
              id="tabpanel-export"
              aria-labelledby="tab-export"
              className="space-y-6"
            >
              <ExportSection
                onExportAll={onExportAll}
                onSaveLayerGroup={onSaveLayerGroup}
                onSaveToCloud={onSaveToCloud}
                onOpenCloudDesigns={onOpenCloudDesigns}
                layers={layers}
                canvasW={width}
                canvasH={height}
                presetIndex={presetIndex}
                unit={unit}
                margin={margin}
                outputMode={outputMode}
                onTabChange={onTabChange}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mobile layout — collapsible panel below canvas
  return (
    <div className={`w-full bg-panel border-t border-[#2e2e2e] flex flex-col mobile-panel ${
      collapsed ? "shrink-0" : "flex-1 min-h-0"
    }`}>
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
          <div className="p-3 pb-2 border-b border-[#2a2a2a] bg-panel">
            <SidebarTabs
              activeTab={activeTab}
              onChange={onTabChange}
              prepareStale={prepareStale}
              prepareConfigured={prepareConfigured}
            />
          </div>
          <div className="p-3 space-y-4">
            {activeTab === 'design' && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-600">Design</p>
                  <SizeChip
                    width={width}
                    height={height}
                    unit={unit}
                    preset={preset}
                    onClick={() => onTabChange('prepare')}
                  />
                </div>
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
              </>
            )}

            {activeTab === 'prepare' && (
              <PrepareTab
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
            )}

            {activeTab === 'export' && (
              <ExportSection
                onExportAll={onExportAll}
                onSaveLayerGroup={onSaveLayerGroup}
                onSaveToCloud={onSaveToCloud}
                onOpenCloudDesigns={onOpenCloudDesigns}
                layers={layers}
                canvasW={width}
                canvasH={height}
                presetIndex={presetIndex}
                unit={unit}
                margin={margin}
                outputMode={outputMode}
                onTabChange={onTabChange}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
