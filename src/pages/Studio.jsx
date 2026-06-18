import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import LeftPanel from "../components/LeftPanel";
import Inspector from "../components/shell/Inspector";
import MenuBar from "../components/shell/MenuBar";
import { useInspectorSlot, useMenuSlot } from "../components/shell/shellSlots";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { EXAMPLES, EXAMPLE_COUNT } from "../examples";
import RightPanel from "../components/RightPanel";
import LayerGroupModal from "../components/LayerGroupModal";
import CloudSaveModal from "../components/CloudSaveModal";
import PatternPickerModal from "../components/PatternPickerModal";
import AIPatternChat from "../components/AIPatternChat";
import useLayers from "../lib/useLayers";
import { getDynamicDefaults } from "../lib/patternRegistry";
import useLayerGroups from "../lib/useLayerGroups";
import { useAuth } from "../lib/AuthContext";
import { useGate } from "../lib/useGate";
import AuthButton from "../components/AuthButton";
import ThemeToggle from "../components/ui/ThemeToggle";
import { exportLayerSVG, exportAllLayersSVG, buildManifest } from "../lib/svgExport";
import ShareLinkButton from "../components/ShareLinkButton";
import { resolveExportColor } from "../lib/fabrication";
import { seedOperations } from "../lib/operations";
import useCanvasSize, { loadCanvasState } from "../lib/hooks/useCanvasSize";

// Document operation library. Stable seed ids (op-cut/op-score/op-engrave) match
// the ids on bundled examples and the migration shim, so any layer's
// `operationId` resolves here. No CRUD UI yet (Operations panel is a later
// issue); the library is a constant for now.
const DOCUMENT_OPERATIONS = seedOperations();
import useUIState from "../lib/hooks/useUIState";
import useOptimizations from "../lib/hooks/useOptimizations";
import useDesignPersistence from "../lib/hooks/useDesignPersistence";
import useCloudPersistence from "../lib/hooks/useCloudPersistence";

export default function Studio() {
  const { loading, user } = useAuth();
  const { limits } = useGate();
  const savedCanvas = loadCanvasState();

  // === UI chrome (active tab + modals + AI-chat) ===
  const { ui, set: setUI } = useUIState({ savedTab: savedCanvas?.activeTab });
  const {
    activeTab,
    showLoadModal,
    showCloudModal,
    showSaveDialog,
    saveName,
    showExamples,
    pendingExample,
    aiChatOpen,
    aiChatMode,
    aiChatLayer,
  } = ui;

  // === Canvas sizing (owns the sonoform-canvas blob incl. activeTab) ===
  const {
    presetIndex,
    setPresetIndex,
    canvasW,
    setCanvasW,
    canvasH,
    setCanvasH,
    unit,
    setUnit,
    margin,
    setMargin,
    outputMode,
    setOutputMode,
    prepareConfigured,
    handlePresetChange,
    handleCustomChange,
    applyCanvasSize,
    bedWmm,
    bedHmm,
  } = useCanvasSize({ savedCanvas, activeTab });

  // === Optimization preview/applied state machine ===
  const {
    optimizations,
    updateOptimization,
    applyOptimization,
    revertOptimization,
    appliedOptimizations,
    appliedOpsList,
  } = useOptimizations();

  // === Layers ===
  const {
    layers,
    addLayer,
    duplicateLayer,
    removeLayer,
    updateLayer,
    reorderLayers,
    changeLayerPattern,
    randomizeLayer,
    randomizeAll,
    randomizeLayerParams,
    randomizeAllParams,
    loadLayerSet,
    bgColor,
    setBgColor,
  } = useLayers({ persistToLocal: limits.localStorage, maxLayers: limits.maxLayers });

  // Pro-shell Inspector slot (B3 / #6). Null in the legacy layout (no provider),
  // so the portal below is a true no-op when the pro shell is off. Until the
  // object tree (#5) owns selection, the inspector defaults to the top layer
  // (index 0 = front) so it is populated and editable in the shell.
  const inspectorSlot = useInspectorSlot();
  const selectedLayerId = layers[0]?.id ?? null;

  // Pro-shell menu-bar slot (B5 / #8). Null in the legacy layout (no provider),
  // so the menu-bar portal below is a no-op AND the legacy loose top bar keeps
  // rendering unchanged. When present, the menu bar is portaled into the shell's
  // Menu bar region and the legacy loose top bar is suppressed (no orphans).
  const menuSlot = useMenuSlot();

  const { groups, saveGroup, deleteGroup, renameGroup } = useLayerGroups();
  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);
  const [livePatternInstances, setLivePatternInstances] = useState({});

  // === Dirty-tracking + share-link hydration ===
  const { markCleanFrom, isDirty } = useDesignPersistence({
    layers,
    bgColor,
    loadLayerSet,
    setBgColor,
    setCanvasW,
    setCanvasH,
    setPresetIndex,
    setUnit,
    setMargin,
    persistToLocal: limits.localStorage,
  });

  // === Cloud save/load ===
  const {
    setCurrentDesignId,
    handleSaveToCloud,
    handleLoadCloudDesign,
  } = useCloudPersistence({
    user,
    limits,
    layers,
    canvasW,
    canvasH,
    presetIndex,
    bgColor,
    loadLayerSet,
    applyCanvasSize,
    markCleanFrom,
    canvasContainerRef,
  });

  const handleOpenAIChat = (layer) => {
    if (layer?.patternType?.startsWith("ai-")) {
      setUI("aiChatMode", "revise");
      setUI("aiChatLayer", layer);
    } else {
      setUI("aiChatMode", "create");
      setUI("aiChatLayer", layer || null);
    }
    setUI("aiChatOpen", true);
  };

  const handleAIPatternGenerated = (patternId, defaultParams) => {
    // If we have a target layer, switch it to the new pattern. Route through the
    // pair-aware router so that switching a Moiré member to an AI pattern
    // DISSOLVES the pair (removes the partner, clears role fields) instead of
    // leaving a dangling half-pair. For non-moiré layers this is identical to a
    // plain updateLayer (default branch of changeLayerPattern).
    if (aiChatLayer) {
      changeLayerPattern(aiChatLayer.id, {
        patternType: patternId,
        params: {
          ...(defaultParams || {}),
          ...(getDynamicDefaults(patternId) || {}),
        },
      });
    }
  };

  // The active machine profile is the migrated `outputMode` (laser | plotter).
  const machineProfile = outputMode;

  // Resolve a layer's export color through its operation (A4). Laser → the
  // operation's locked-convention color; plotter → the layer's own color.
  const exportLayer = (layer) => ({
    ...layer,
    color: resolveExportColor(layer, {
      operations: DOCUMENT_OPERATIONS,
      outputMode: machineProfile,
    }),
  });

  const buildExportManifest = () =>
    buildManifest({
      version: "1",
      machineProfile,
      operations: DOCUMENT_OPERATIONS,
      bedW: bedWmm,
      bedH: bedHmm,
      bedUnit: "mm",
      layers,
      optimizations: appliedOpsList,
    });

  const handleExportLayer = (layerId) => {
    const layer = layers.find((l) => l.id === layerId);
    const instance = patternInstancesRef.current?.[layerId];
    if (layer && instance) {
      exportLayerSVG(exportLayer(layer), instance, canvasW, canvasH, {
        metadata: limits.svgMetadata,
        manifest: buildExportManifest(),
        optimizations: appliedOptimizations,
      });
    }
  };

  const handleExportAll = (includeHidden, opts = {}) => {
    const mapped = layers.map(exportLayer);
    exportAllLayersSVG(
      mapped,
      patternInstancesRef.current || {},
      canvasW,
      canvasH,
      includeHidden,
      {
        metadata: limits.svgMetadata,
        manifest: buildExportManifest(),
        filename: opts.filename,
        optimizations: appliedOptimizations,
      }
    );
  };

  const handleSaveLayerGroup = () => {
    setUI("saveName", "");
    setUI("showSaveDialog", true);
  };

  // Share-link state snapshot, shared by the legacy top bar's ShareLinkButton
  // and the pro menu bar's account cluster so both reproduce the same design.
  const buildShareState = () => ({
    canvasW,
    canvasH,
    presetIndex,
    unit,
    margin,
    bgColor,
    layers,
  });

  const handleConfirmSave = () => {
    const container = canvasContainerRef.current;
    const canvas = container?.querySelector("canvas");
    let thumbnail = null;
    if (canvas) {
      try {
        thumbnail = canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        /* tainted canvas or unavailable */
      }
    }
    const name = saveName.trim() || "Untitled";
    saveGroup(name, layers, canvasW, canvasH, thumbnail);
    setUI("showSaveDialog", false);
  };

  const handleLoadGroup = (group) => {
    loadLayerSet(group.layers);
    if (group.canvasW && group.canvasH) {
      applyCanvasSize(group.canvasW, group.canvasH);
    }
    markCleanFrom(group.layers, bgColor);
  };

  // === Examples ===
  // Apply a curated example onto the canvas: layers, background, and size.
  // presetIndex is recomputed from the canvas size (as the cloud loader does),
  // so the example JSON never has to store it. currentDesignId is cleared so a
  // later Save creates a new design rather than overwriting a real saved one.
  const applyExample = useCallback(
    (example) => {
      const cfg = example?.config;
      if (!cfg?.layers) return;
      loadLayerSet(cfg.layers);
      if (typeof cfg.bgColor === "string") setBgColor(cfg.bgColor);
      if (cfg.canvasW && cfg.canvasH) {
        applyCanvasSize(cfg.canvasW, cfg.canvasH);
      }
      setCurrentDesignId(null);
      markCleanFrom(cfg.layers, cfg.bgColor ?? bgColor);
      setUI("activeTab", "design");
      setUI("showExamples", false);
      setUI("pendingExample", null);
    },
    [
      loadLayerSet,
      setBgColor,
      applyCanvasSize,
      setCurrentDesignId,
      markCleanFrom,
      bgColor,
      setUI,
    ]
  );

  // Card click: confirm first if there's unsaved work, otherwise load now.
  const handleSelectExample = useCallback(
    (example) => {
      if (isDirty()) setUI("pendingExample", example);
      else applyExample(example);
    },
    [isDirty, applyExample, setUI]
  );

  if (loading) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-paper">
      {/* App title — the naqsheh etymology lives in the hover card. */}
      <div className="shrink-0 bg-paper-warm border-b border-hairline px-4 py-2 group/title relative">
        <h1 className="display text-md font-semibold text-ink tracking-tight cursor-default select-none">
          Naqsha
        </h1>
        <div className="absolute left-4 top-full mt-1 z-50 w-[420px] opacity-0 pointer-events-none group-hover/title:opacity-100 group-hover/title:pointer-events-auto transition-opacity duration-medium ease-out-quart">
          <div className="bg-paper border border-hairline rounded-sm p-4">
            <p className="text-xs text-ink-soft leading-relaxed">
              <span className="text-ink font-medium">Naqsha</span> takes its name from the Arabic and Persian{" "}
              <span className="font-medium text-ink display" dir="rtl">نقشه</span>{" "}
              — a word that refuses to separate the pattern from the plan, the visible form from the rules that generated it.
              Naqsha is that process as a tool — generative algorithms, parameters you control, output sized for posters,
              laser-cut acrylic and pen plotters, each session a record of where your rules led you on that particular day
              with that particular seed. The design is always regenerable and never finished, which is not a limitation but the point.
            </p>
          </div>
        </div>
      </div>

      {/* Legacy loose top bar. Suppressed when hosted in the pro shell (menuSlot
          present) — those actions are folded into the portaled <MenuBar/> below,
          so no orphaned buttons remain. Rendered unchanged in the legacy layout
          (menuSlot null) → flag-OFF is a true no-op. */}
      {!menuSlot && (
        <div className="shrink-0 h-9 bg-paper border-b border-hairline flex items-center px-4 gap-4">
          <span className="text-xs text-ink-soft select-none">Naqsha</span>
          <button
            onClick={() => setUI("showExamples", !showExamples)}
            aria-pressed={showExamples}
            className={`text-xs transition-colors duration-fast ease-out-quart ${
              showExamples ? "text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            Examples
            {EXAMPLE_COUNT > 0 && (
              <span className="ml-1 text-ink-soft/70 num">({EXAMPLE_COUNT})</span>
            )}
          </button>
          <button
            onClick={() => setUI("showLoadModal", true)}
            className="text-xs text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
          >
            Load existing
            {groups.length > 0 && (
              <span className="ml-1 text-ink-soft/70 num">({groups.length})</span>
            )}
          </button>
          <ShareLinkButton buildState={buildShareState} />
          <div className="ml-auto flex items-center gap-xs">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      )}

      {/* Main content — column on mobile (canvas on top), row on desktop.
          Mobile: canvas gets a fixed 45vh, LeftPanel gets the remaining space
          with an internal scroll. Desktop: LeftPanel has a fixed width,
          canvas fills the rest horizontally. */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* LeftPanel: below canvas on mobile (flex-1 so internal scroll has a
            height to scroll against); fixed-width on desktop. */}
        <div className="order-2 md:order-none flex flex-col flex-1 md:flex-none min-h-0 overflow-hidden">
          <LeftPanel
            width={canvasW}
            height={canvasH}
            presetIndex={presetIndex}
            unit={unit}
            onUnitChange={setUnit}
            margin={margin}
            onMarginChange={setMargin}
            onPresetChange={handlePresetChange}
            onCustomChange={handleCustomChange}
            activeTab={activeTab}
            onTabChange={(tab) => setUI("activeTab", tab)}
            prepareStale={false}
            prepareConfigured={prepareConfigured}
            outputMode={outputMode}
            onOutputModeChange={setOutputMode}
            optimizations={optimizations}
            appliedOptimizations={appliedOptimizations}
            onOptimizationChange={updateOptimization}
            onOptimizationApply={applyOptimization}
            onOptimizationRevert={revertOptimization}
            patternInstances={livePatternInstances}
            layers={layers}
            onUpdateLayer={updateLayer}
            onChangeLayerPattern={changeLayerPattern}
            onRemoveLayer={removeLayer}
            onAddLayer={() => setUI("showPatternPicker", true)}
            onDuplicateLayer={duplicateLayer}
            onRandomizeLayer={randomizeLayer}
            onRandomizeAll={randomizeAll}
            onRandomizeLayerParams={randomizeLayerParams}
            onRandomizeAllParams={randomizeAllParams}
            onReorderLayers={reorderLayers}
            onExportLayer={handleExportLayer}
            onExportAll={handleExportAll}
            onSaveLayerGroup={handleSaveLayerGroup}
            onSaveToCloud={handleSaveToCloud}
            onOpenCloudDesigns={() => setUI("showCloudModal", true)}
            onOpenAIChat={handleOpenAIChat}
            examplesOpen={showExamples}
            examples={EXAMPLES}
            onSelectExample={handleSelectExample}
            onCloseExamples={() => setUI("showExamples", false)}
          />
        </div>
        {/* Canvas: DOM-second, ordered first on mobile (top). Mobile gets a
            fixed 45vh so it doesn't eat the LeftPanel's scroll area; desktop
            fills the remaining horizontal space. */}
        <div className="order-1 md:order-none shrink-0 md:shrink h-[45dvh] md:h-auto md:flex-1 md:min-h-0 min-w-0">
          <RightPanel
            layers={layers}
            canvasW={canvasW}
            canvasH={canvasH}
            patternInstancesRef={patternInstancesRef}
            canvasContainerRef={canvasContainerRef}
            onPatternInstancesChange={setLivePatternInstances}
            bgColor={bgColor}
            onBgColorChange={setBgColor}
            displayMode={activeTab}
            unit={unit}
            marginPx={margin}
          />
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center"
          onClick={() => setUI("showSaveDialog", false)}
        >
          <div
            className="bg-paper border border-hairline rounded-sm w-80 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-ink">
              Save layer group
            </h3>
            <input
              className="w-full bg-paper-warm text-ink text-sm px-2.5 py-1.5 rounded-xs border border-hairline outline-none focus:border-violet transition-colors duration-fast ease-out-quart"
              placeholder="Untitled"
              value={saveName}
              onChange={(e) => setUI("saveName", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmSave()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleConfirmSave}
                className="flex-1 py-1.5 text-sm font-medium rounded-xs bg-saffron text-ink hover:bg-saffron-hover transition-colors duration-fast ease-out-quart"
              >
                Save
              </button>
              <button
                onClick={() => setUI("showSaveDialog", false)}
                className="flex-1 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-layer pattern picker (the "periodic table") */}
      <PatternPickerModal
        open={ui.showPatternPicker}
        onClose={() => setUI("showPatternPicker", false)}
        onPick={(id) => {
          addLayer(id);
          setUI("showPatternPicker", false);
        }}
      />

      {/* Load modal */}
      {showLoadModal && (
        <LayerGroupModal
          groups={groups}
          onLoad={handleLoadGroup}
          onDelete={deleteGroup}
          onRename={renameGroup}
          onClose={() => setUI("showLoadModal", false)}
        />
      )}

      {showCloudModal && (
        <CloudSaveModal
          onLoad={handleLoadCloudDesign}
          onLoadConfig={(config) => {
            if (config.layers) loadLayerSet(config.layers);
            if (config.canvasW && config.canvasH) {
              applyCanvasSize(config.canvasW, config.canvasH);
            }
            markCleanFrom(config.layers || layers, bgColor);
          }}
          onClose={() => setUI("showCloudModal", false)}
        />
      )}

      {aiChatOpen && (
        <AIPatternChat
          mode={aiChatMode}
          existingSource={
            aiChatMode === "revise" && aiChatLayer ? null : undefined
          }
          existingName={aiChatLayer?.name}
          onPatternGenerated={handleAIPatternGenerated}
          onClose={() => setUI("aiChatOpen", false)}
        />
      )}

      {/* Pro-shell top menu bar (B5 / #8). Portaled into the shell's Menu bar
          region when the slot is present; renders nothing in the legacy layout
          (slot is null → no-op). Its items wire to the existing Studio handlers
          (Examples/Load/Cloud/Export/Save/Share), so behavior is unchanged. */}
      {menuSlot &&
        createPortal(
          <MenuBar
            onOpen={() => setUI("showLoadModal", true)}
            onExamples={() => setUI("showExamples", !showExamples)}
            onExport={() => handleExportAll(true)}
            onSave={handleSaveLayerGroup}
            onSaveToCloud={handleSaveToCloud}
            onOpenCloudDesigns={() => setUI("showCloudModal", true)}
            buildShareState={buildShareState}
          />,
          menuSlot
        )}

      {/* Pro-shell param inspector (B3 / #6). Portaled into the shell's right
          Inspector region when the slot is present; renders nothing in the
          legacy layout (slot is null → no-op). */}
      {inspectorSlot &&
        createPortal(
          <Inspector
            layers={layers}
            selectedLayerId={selectedLayerId}
            onUpdateLayer={updateLayer}
            onChangeLayerPattern={changeLayerPattern}
          />,
          inspectorSlot
        )}

      <ConfirmDialog
        open={pendingExample !== null}
        title="Discard current work?"
        message="Loading this example replaces everything on the canvas. This can't be undone."
        confirmLabel="Load example"
        cancelLabel="Cancel"
        onConfirm={() => applyExample(pendingExample)}
        onCancel={() => setUI("pendingExample", null)}
      />
    </div>
  );
}
