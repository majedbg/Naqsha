import { useState, useRef, useEffect } from "react";
import LeftPanel from "../components/LeftPanel";
import RightPanel from "../components/RightPanel";
import LayerGroupModal from "../components/LayerGroupModal";
import CloudSaveModal from "../components/CloudSaveModal";
import AIPatternChat from "../components/AIPatternChat";
import useLayers from "../lib/useLayers";
// import { loadUserAIPatterns } from "../lib/aiPatternService";
import { getDynamicDefaults } from "../lib/patternRegistry";
import useLayerGroups from "../lib/useLayerGroups";
import { useAuth } from "../lib/AuthContext";
import { useGate } from "../lib/useGate";
import AuthButton from "../components/AuthButton";
import ThemeToggle from "../components/ui/ThemeToggle";
import {
  saveDesign,
  loadDesign,
  saveHistorySnapshot,
} from "../lib/designService";
import { exportLayerSVG, exportAllLayersSVG, buildManifest } from "../lib/svgExport";
import { PRESET_SIZES, PPI } from "../constants";
import { DEFAULT_UNIT } from "../lib/units";
import { decodeShare, readShareTokenFromUrl, clearShareTokenFromUrl } from "../lib/shareLink";
import ShareLinkButton from "../components/ShareLinkButton";
import { applyOutputMode } from "../lib/fabrication";

const CANVAS_STORAGE_KEY = "sonoform-canvas";
const VALID_TABS = ["design", "prepare", "export"];
const VALID_UNITS = ["mm", "in", "px"];

function loadCanvasState() {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.presetIndex === "number") return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

export default function Studio() {
  const { loading, user } = useAuth();
  const { limits } = useGate();
  const savedCanvas = loadCanvasState();
  const [presetIndex, setPresetIndex] = useState(savedCanvas?.presetIndex ?? 1);
  const [canvasW, setCanvasW] = useState(
    savedCanvas?.canvasW ?? PRESET_SIZES[1].width * PPI
  );
  const [canvasH, setCanvasH] = useState(
    savedCanvas?.canvasH ?? PRESET_SIZES[1].height * PPI
  );
  const [activeTab, setActiveTab] = useState(() => {
    const saved = savedCanvas?.activeTab;
    return VALID_TABS.includes(saved) ? saved : "design";
  });
  const [unit, setUnit] = useState(() => {
    // Prefer saved unit; otherwise let the preset hint it (A4 → mm, AxiDraw → in).
    const saved = savedCanvas?.unit;
    if (VALID_UNITS.includes(saved)) return saved;
    const presetHint = PRESET_SIZES[savedCanvas?.presetIndex ?? 1]?.unitHint;
    return VALID_UNITS.includes(presetHint) ? presetHint : DEFAULT_UNIT;
  });
  const [margin, setMargin] = useState(savedCanvas?.margin ?? 0);
  const [outputMode, setOutputMode] = useState(() => {
    const saved = savedCanvas?.outputMode;
    return saved === 'laser' || saved === 'plotter' ? saved : 'plotter';
  });
  // Optimization state — each pipeline step tracks its preview value
  // (what the slider shows) vs. its appliedTolerance (what export uses).
  // Export only reads `enabled && appliedTolerance`, so slider drift never
  // silently changes the exported file.
  const [optimizations, setOptimizations] = useState({
    simplify: { enabled: false, tolerance: 0.3, appliedTolerance: null },
    merge:    { enabled: false, tolerance: 0.5, appliedTolerance: null },
    reorder:  { enabled: false },
  });
  const [livePatternInstances, setLivePatternInstances] = useState({});
  const updateOptimization = (key, patch) => {
    setOptimizations((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const applyOptimization = (key) => {
    setOptimizations((prev) => {
      const cur = prev[key];
      if (key === 'reorder') return { ...prev, reorder: { enabled: true } };
      return { ...prev, [key]: { ...cur, enabled: true, appliedTolerance: cur.tolerance } };
    });
  };
  const revertOptimization = (key) => {
    setOptimizations((prev) => {
      if (key === 'reorder') return { ...prev, reorder: { enabled: false } };
      return { ...prev, [key]: { ...prev[key], enabled: false, appliedTolerance: null } };
    });
  };
  // Prepare tab is "configured" once the user has picked a non-default
  // preset, custom size, or margin — controls whether the stale yellow-dot
  // indicator appears when Design edits happen after Prepare is set.
  const prepareConfigured =
    presetIndex !== 1 || margin > 0 || unit !== DEFAULT_UNIT;

  useEffect(() => {
    try {
      localStorage.setItem(
        CANVAS_STORAGE_KEY,
        JSON.stringify({ presetIndex, canvasW, canvasH, activeTab, unit, margin, outputMode })
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [presetIndex, canvasW, canvasH, activeTab, unit, margin, outputMode]);

  const {
    layers,
    addLayer,
    duplicateLayer,
    removeLayer,
    updateLayer,
    reorderLayers,
    randomizeLayer,
    randomizeAll,
    randomizeLayerParams,
    randomizeAllParams,
    loadLayerSet,
    bgColor,
    setBgColor,
  } = useLayers({ persistToLocal: limits.localStorage });

  // On mount, if the URL carries a ?s=<share-token>, hydrate state from it.
  // Intentionally runs once; strips the param so refresh doesn't re-apply.
  useEffect(() => {
    const token = readShareTokenFromUrl();
    if (!token) return;
    const state = decodeShare(token);
    if (!state) return;
    if (Array.isArray(state.layers) && state.layers.length > 0) loadLayerSet(state.layers);
    if (typeof state.canvasW === 'number') setCanvasW(state.canvasW);
    if (typeof state.canvasH === 'number') setCanvasH(state.canvasH);
    if (typeof state.presetIndex === 'number') setPresetIndex(state.presetIndex);
    if (typeof state.unit === 'string' && VALID_UNITS.includes(state.unit)) setUnit(state.unit);
    if (typeof state.margin === 'number') setMargin(state.margin);
    if (typeof state.bgColor === 'string') setBgColor(state.bgColor);
    clearShareTokenFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { groups, saveGroup, deleteGroup, renameGroup } = useLayerGroups();
  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [currentDesignId, setCurrentDesignId] = useState(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatMode, setAiChatMode] = useState("create");
  const [aiChatLayer, setAiChatLayer] = useState(null);

  // Load user's previously generated AI patterns on sign-in
  // useEffect(() => {
  //   if (user !== null || user !== undefined) {
  //     loadUserAIPatterns(user.id).catch(console.error);
  //   }
  // }, []);
  //TODO: uncomment this when we have a way to load user's previously generated AI patterns

  const handleOpenAIChat = (layer) => {
    if (layer?.patternType?.startsWith("ai-")) {
      setAiChatMode("revise");
      setAiChatLayer(layer);
    } else {
      setAiChatMode("create");
      setAiChatLayer(layer || null);
    }
    setAiChatOpen(true);
  };

  const handleAIPatternGenerated = (patternId, defaultParams) => {
    // If we have a target layer, switch it to the new pattern
    if (aiChatLayer) {
      updateLayer(aiChatLayer.id, {
        patternType: patternId,
        params: {
          ...(defaultParams || {}),
          ...(getDynamicDefaults(patternId) || {}),
        },
      });
    }
  };

  const handlePresetChange = (index) => {
    setPresetIndex(index);
    const preset = PRESET_SIZES[index];
    if (preset.width !== null) {
      setCanvasW(preset.width * PPI);
      setCanvasH(preset.height * PPI);
    }
  };

  const handleCustomChange = (w, h) => {
    setCanvasW(Math.round(w));
    setCanvasH(Math.round(h));
  };

  // Build the pipeline opts used by the export — only "applied" tolerances flow through.
  const appliedOptimizations = {
    simplify: {
      enabled: optimizations.simplify.enabled,
      tolerance: optimizations.simplify.appliedTolerance ?? 0,
    },
    merge: {
      enabled: optimizations.merge.enabled,
      tolerance: optimizations.merge.appliedTolerance ?? 0,
    },
    reorder: { enabled: optimizations.reorder.enabled },
  };
  const appliedOpsList = [
    appliedOptimizations.simplify.enabled ? `simplify(${appliedOptimizations.simplify.tolerance}mm)` : null,
    appliedOptimizations.merge.enabled    ? `merge(${appliedOptimizations.merge.tolerance}mm)`       : null,
    appliedOptimizations.reorder.enabled  ? 'reorder'                                                : null,
  ].filter(Boolean);

  const buildExportManifest = () => buildManifest({
    version: '1',
    outputMode,
    bedW: (canvasW / 96 * 25.4).toFixed(1),
    bedH: (canvasH / 96 * 25.4).toFixed(1),
    bedUnit: 'mm',
    layers,
    optimizations: appliedOpsList,
  });

  const handleExportLayer = (layerId) => {
    const layer = layers.find((l) => l.id === layerId);
    const instance = patternInstancesRef.current?.[layerId];
    if (layer && instance) {
      exportLayerSVG(applyOutputMode(layer, outputMode), instance, canvasW, canvasH, {
        metadata: limits.svgMetadata,
        manifest: buildExportManifest(),
        optimizations: appliedOptimizations,
      });
    }
  };

  const handleExportAll = (includeHidden, opts = {}) => {
    const mapped = layers.map((l) => applyOutputMode(l, outputMode));
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
    setSaveName("");
    setShowSaveDialog(true);
  };

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
    setShowSaveDialog(false);
  };

  const handleLoadGroup = (group) => {
    loadLayerSet(group.layers);
    if (group.canvasW && group.canvasH) {
      setCanvasW(group.canvasW);
      setCanvasH(group.canvasH);
      const matchIdx = PRESET_SIZES.findIndex(
        (p) =>
          p.width !== null &&
          p.width * PPI === group.canvasW &&
          p.height * PPI === group.canvasH
      );
      setPresetIndex(matchIdx >= 0 ? matchIdx : PRESET_SIZES.length - 1);
    }
  };

  const handleSaveToCloud = async () => {
    if (!user) return;
    const container = canvasContainerRef.current;
    const canvas = container?.querySelector("canvas");
    let thumbnail = null;
    if (canvas) {
      try {
        thumbnail = canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        /* */
      }
    }
    const config = { layers, canvasW, canvasH, presetIndex };
    try {
      const design = await saveDesign(
        user.id,
        "Untitled",
        config,
        thumbnail,
        currentDesignId
      );
      if (design) {
        setCurrentDesignId(design.id);
        // Pro: auto-save history snapshot
        if (limits.historySnapshots > 0) {
          saveHistorySnapshot(design.id, user.id, config, thumbnail).catch(
            () => {}
          );
        }
      }
    } catch (err) {
      console.error("Cloud save failed:", err);
    }
  };

  const handleLoadCloudDesign = async (designId) => {
    if (!user) return;
    try {
      const design = await loadDesign(designId, user.id);
      if (!design?.config) return;
      const { layers: savedLayers, canvasW: cw, canvasH: ch } = design.config;
      if (savedLayers) loadLayerSet(savedLayers);
      if (cw && ch) {
        setCanvasW(cw);
        setCanvasH(ch);
        const matchIdx = PRESET_SIZES.findIndex(
          (p) =>
            p.width !== null && p.width * PPI === cw && p.height * PPI === ch
        );
        setPresetIndex(matchIdx >= 0 ? matchIdx : PRESET_SIZES.length - 1);
      }
      setCurrentDesignId(design.id);
    } catch (err) {
      console.error("Cloud load failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper">
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

      {/* Top bar */}
      <div className="shrink-0 h-9 bg-paper border-b border-hairline flex items-center px-4 gap-4">
        <span className="text-xs text-ink-soft select-none">Naqsha</span>
        <button
          onClick={() => setShowLoadModal(true)}
          className="text-xs text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
        >
          Load existing
          {groups.length > 0 && (
            <span className="ml-1 text-ink-soft/70 num">({groups.length})</span>
          )}
        </button>
        <ShareLinkButton
          buildState={() => ({
            canvasW,
            canvasH,
            presetIndex,
            unit,
            margin,
            bgColor,
            layers,
          })}
        />
        <div className="ml-auto flex items-center gap-xs">
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>

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
            onTabChange={setActiveTab}
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
            onRemoveLayer={removeLayer}
            onAddLayer={addLayer}
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
            onOpenCloudDesigns={() => setShowCloudModal(true)}
            onOpenAIChat={handleOpenAIChat}
          />
        </div>
        {/* Canvas: DOM-second, ordered first on mobile (top). Mobile gets a
            fixed 45vh so it doesn't eat the LeftPanel's scroll area; desktop
            fills the remaining horizontal space. */}
        <div className="order-1 md:order-none shrink-0 md:shrink h-[45vh] md:h-auto md:flex-1 md:min-h-0 min-w-0">
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
          onClick={() => setShowSaveDialog(false)}
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
              onChange={(e) => setSaveName(e.target.value)}
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
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load modal */}
      {showLoadModal && (
        <LayerGroupModal
          groups={groups}
          onLoad={handleLoadGroup}
          onDelete={deleteGroup}
          onRename={renameGroup}
          onClose={() => setShowLoadModal(false)}
        />
      )}

      {showCloudModal && (
        <CloudSaveModal
          onLoad={handleLoadCloudDesign}
          onLoadConfig={(config) => {
            if (config.layers) loadLayerSet(config.layers);
            if (config.canvasW && config.canvasH) {
              setCanvasW(config.canvasW);
              setCanvasH(config.canvasH);
              const matchIdx = PRESET_SIZES.findIndex(
                (p) =>
                  p.width !== null &&
                  p.width * PPI === config.canvasW &&
                  p.height * PPI === config.canvasH
              );
              setPresetIndex(
                matchIdx >= 0 ? matchIdx : PRESET_SIZES.length - 1
              );
            }
          }}
          onClose={() => setShowCloudModal(false)}
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
          onClose={() => setAiChatOpen(false)}
        />
      )}
    </div>
  );
}
