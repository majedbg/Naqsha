import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import LeftPanel from "../components/LeftPanel";
import Inspector from "../components/shell/Inspector";
import LayerTree from "../components/shell/LayerTree";
import MenuBar from "../components/shell/MenuBar";
import ToolStrip from "../components/shell/ToolStrip";
import ControlBar from "../components/shell/ControlBar";
import {
  useInspectorSlot,
  useMenuSlot,
  useToolStripSlot,
  useControlBarSlot,
  useObjectTreeSlot,
} from "../components/shell/shellSlots";
import useActiveTool from "../lib/hooks/useActiveTool";
import useCanvasView from "../lib/hooks/useCanvasView";
import useSvgImport from "../lib/hooks/useSvgImport";
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
import { remapOperationsToProfile } from "../lib/machineProfiles";
import { findMoirePartnerA } from "../lib/moirePair";
import useCanvasSize, { loadCanvasState } from "../lib/hooks/useCanvasSize";
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
    addImportedLayer,
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

  // Pro-shell Inspector + Object-tree slots (B3 / #6, B2 / #5). Null in the
  // legacy layout (no provider), so the portals below are true no-ops when the
  // pro shell is off.
  const inspectorSlot = useInspectorSlot();
  const objectTreeSlot = useObjectTreeSlot();

  // === Document operation library + active machine profile (B2 / #5) ===
  // Both are lifted into LIVE state here so the object tree's profile selector
  // can re-map operation colors. Seeded EXACTLY as before so export stays
  // byte-stable: operations start from seedOperations() (same ids/colors), and
  // the active profile is seeded FROM the migrated `outputMode` (not the laser
  // default) — so on load `activeProfileId === outputMode` and the export path
  // resolves identical colors. A remap only fires when the user switches.
  const [operations, setOperations] = useState(() => seedOperations());
  const [activeProfileId, setActiveProfileId] = useState(outputMode);

  // Keep the active profile tracking the legacy `outputMode` so the legacy
  // OutputModeSection toggle (flag-OFF path) still drives export colors exactly
  // as before — `machineProfile` below derives from `activeProfileId`, and
  // without this sync a frozen initial value would silently stop the legacy
  // toggle from changing export output. Same-value setState bails out (no loop);
  // `dragCutter` (no legacy outputMode) is set only via the profile selector and
  // is unaffected because outputMode never becomes 'dragCutter'.
  useEffect(() => {
    setActiveProfileId(outputMode);
  }, [outputMode]);

  // === Live selection state (B2 / #5) ===
  // Replaces the old hardcoded `layers[0]` placeholder. Clicking a tree row sets
  // this; the Inspector consumes it. Falls back to the top layer when nothing is
  // selected yet (so the shell inspector is populated) and self-heals when the
  // selected layer is removed.
  const [selectedLayerIdState, setSelectedLayerId] = useState(null);
  const selectionExists =
    selectedLayerIdState != null &&
    layers.some((l) => l.id === selectedLayerIdState);
  const selectedLayerId = selectionExists
    ? selectedLayerIdState
    : layers[0]?.id ?? null;

  // Switching the machine profile sets the document's active profile AND re-maps
  // the operation library to that profile's process/param/color vocabulary
  // (laser locks cut/score/engrave colors; plotter/drag leave them editable).
  // Keep the legacy `outputMode` in sync for the laser/plotter pair so the
  // export path (which still reads it) follows the selector.
  const handleProfileChange = useCallback(
    (nextProfileId) => {
      setActiveProfileId(nextProfileId);
      setOperations((ops) => remapOperationsToProfile(ops, nextProfileId));
      if (nextProfileId === "laser" || nextProfileId === "plotter") {
        setOutputMode(nextProfileId);
      }
    },
    [setOutputMode]
  );

  // The inspector edits the selected layer — EXCEPT for a Moiré role-B layer,
  // whose params live on its partner A (B reads A). Redirect edits to A so
  // selecting/editing a role-B row behaves like the legacy LayersSection. When A
  // is missing (orphan B) or the layer is not role-B, the target is the layer
  // itself.
  const inspectorTargetId =
    findMoirePartnerA(
      layers.find((l) => l.id === selectedLayerId),
      layers
    )?.id ?? selectedLayerId;

  // Pro-shell menu-bar slot (B5 / #8). Null in the legacy layout (no provider),
  // so the menu-bar portal below is a no-op AND the legacy loose top bar keeps
  // rendering unchanged. When present, the menu bar is portaled into the shell's
  // Menu bar region and the legacy loose top bar is suppressed (no orphans).
  const menuSlot = useMenuSlot();

  // Pro-shell tool-strip + contextual-control-bar slots (B6 / #9). Null in the
  // legacy layout (no provider) → both portals are no-ops. Active-tool state is
  // owned here (Studio) so the same state drives the tool strip and the control
  // bar; hotkeys are bound only when the tool strip slot is present (flag-ON),
  // so V/T/space never hijack the legacy layout.
  const toolStripSlot = useToolStripSlot();
  const controlBarSlot = useControlBarSlot();
  const { activeTool, setActiveTool } = useActiveTool({
    enabled: !!toolStripSlot,
  });
  // Canvas pan/zoom the Hand/Zoom tools drive. Only wired into RightPanel on the
  // flag-ON (pro shell) path — `inProShell` below — so the legacy canvas keeps
  // its own internal zoom and stays byte-identical when the flag is off.
  const canvasView = useCanvasView();
  const inProShell = !!toolStripSlot;

  const { groups, saveGroup, deleteGroup, renameGroup } = useLayerGroups();
  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);
  const [livePatternInstances, setLivePatternInstances] = useState({});

  // === SVG import (issue #12, C4 — place as artwork) ===
  // One import = one layer, via three entry points: File>Import (file picker),
  // drag-drop onto the canvas, and paste. All funnel through addImportedLayer;
  // malformed/empty SVG surfaces a brief inline message (the app has no toast).
  const importFileInputRef = useRef(null);
  const [importError, setImportError] = useState(null);
  const importErrorTimer = useRef(null);

  const handleImportSVG = useCallback(
    (svgText) => {
      const outcome = addImportedLayer(svgText);
      if (!outcome.ok) {
        setImportError(outcome.error || "Could not import this SVG.");
        clearTimeout(importErrorTimer.current);
        importErrorTimer.current = setTimeout(() => setImportError(null), 4000);
      } else {
        setImportError(null);
      }
    },
    [addImportedLayer]
  );

  // File > Import — open a file picker and read the chosen .svg.
  const handleImportClick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-importing the same file
      if (!file) return;
      try {
        const text = await file.text();
        handleImportSVG(text);
      } catch {
        setImportError("Could not read that file.");
      }
    },
    [handleImportSVG]
  );

  // Drag-drop + paste onto the canvas (the other two entry points).
  useSvgImport(canvasContainerRef, handleImportSVG);

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

  // The active machine profile drives export. Seeded from `outputMode`, kept in
  // sync by handleProfileChange, so this stays equal to the legacy `outputMode`
  // on the export path (laser | plotter) and the resolved colors are unchanged.
  const machineProfile = activeProfileId;

  // Resolve a layer's export color through its operation (A4). Laser → the
  // operation's locked-convention color; plotter → the layer's own color.
  const exportLayer = (layer) => ({
    ...layer,
    color: resolveExportColor(layer, {
      operations,
      outputMode: machineProfile,
    }),
  });

  const buildExportManifest = () =>
    buildManifest({
      version: "1",
      machineProfile,
      operations,
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
      {/* Hidden file input backing File > Import (issue #12). Click is triggered
          by the menu item; reads the chosen .svg and adds one artwork layer. */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={handleImportFileChange}
      />
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
        <div className="order-1 md:order-none shrink-0 md:shrink h-[45dvh] md:h-auto md:flex-1 md:min-h-0 min-w-0 relative">
          {/* SVG import failure message (issue #12). No toast system in the app,
              so a brief inline banner over the canvas. Auto-clears after 4s. */}
          {importError && (
            <div
              role="alert"
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-paper border border-red-500/50 text-red-500 text-xs rounded-md px-3 py-1.5 shadow-sm"
            >
              {importError}
            </div>
          )}
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
            externalZoom={inProShell ? canvasView.zoom : undefined}
            onZoomChange={inProShell ? canvasView.setZoom : undefined}
            externalPan={inProShell ? canvasView.pan : undefined}
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
            onImport={handleImportClick}
            onExport={() => handleExportAll(true)}
            onSave={handleSaveLayerGroup}
            onSaveToCloud={handleSaveToCloud}
            onOpenCloudDesigns={() => setUI("showCloudModal", true)}
            buildShareState={buildShareState}
          />,
          menuSlot
        )}

      {/* Pro-shell tool strip (B6 / #9). Portaled into the shell's Tool strip
          region when the slot is present; renders nothing in the legacy layout
          (slot is null → no-op). Active-tool state is owned by Studio so it also
          drives the contextual control bar below. */}
      {toolStripSlot &&
        createPortal(
          <ToolStrip activeTool={activeTool} onToolChange={setActiveTool} />,
          toolStripSlot
        )}

      {/* Pro-shell contextual control bar (B6 / #9). Portaled into the shell's
          Contextual control bar region; swaps its contents by the active tool /
          selection. No-op in the legacy layout (slot null). The inspector
          defaults to the top layer for now (object-tree selection is #5), so a
          selection exists whenever there are layers. */}
      {controlBarSlot &&
        createPortal(
          <ControlBar
            activeTool={activeTool}
            hasSelection={selectedLayerId !== null}
            docInfo={{
              canvasW,
              canvasH,
              unit,
              layerCount: layers.length,
            }}
            view={canvasView}
          />,
          controlBarSlot
        )}

      {/* Pro-shell param inspector (B3 / #6). Portaled into the shell's right
          Inspector region when the slot is present; renders nothing in the
          legacy layout (slot is null → no-op). */}
      {inspectorSlot &&
        createPortal(
          <Inspector
            layers={layers}
            // For a Moiré role-B selection this is the partner-A id, so edits
            // redirect to A (B reads A) — matching legacy LayersSection behavior.
            selectedLayerId={inspectorTargetId}
            onUpdateLayer={updateLayer}
            onChangeLayerPattern={changeLayerPattern}
          />,
          inspectorSlot
        )}

      {/* Pro-shell object tree + machine-profile selector (B2 / #5). Portaled
          into the shell's left Object-tree region when the slot is present;
          renders nothing in the legacy layout (slot null → no-op). Drives live
          selection (consumed by the Inspector above) and the document profile /
          operation-library remap. */}
      {objectTreeSlot &&
        createPortal(
          <LayerTree
            layers={layers}
            operations={operations}
            profileId={activeProfileId}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onUpdateLayer={updateLayer}
            onReorderLayers={reorderLayers}
            onProfileChange={handleProfileChange}
          />,
          objectTreeSlot
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
