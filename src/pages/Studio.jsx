import { useState, useRef, useEffect } from "react";
import LeftPanel from "../components/LeftPanel";
import RightPanel from "../components/RightPanel";
import LayerGroupModal from "../components/LayerGroupModal";
import CloudSaveModal from "../components/CloudSaveModal";
import AIPatternChat from "../components/AIPatternChat";
import useLayers from "../lib/useLayers";
import { loadUserAIPatterns } from "../lib/aiPatternService";
import { getDynamicDefaults } from "../lib/patternRegistry";
import useLayerGroups from "../lib/useLayerGroups";
import { useAuth } from "../lib/AuthContext";
import { useGate } from "../lib/useGate";
import AuthButton from "../components/AuthButton";
import {
  saveDesign,
  loadDesign,
  countUserDesigns,
  saveHistorySnapshot,
} from "../lib/designService";
import { exportLayerSVG, exportAllLayersSVG } from "../lib/svgExport";
import { PRESET_SIZES, PPI } from "../constants";

const CANVAS_STORAGE_KEY = "sonoform-canvas";

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
  const { loading } = useAuth();
  const { limits } = useGate();
  const savedCanvas = loadCanvasState();
  const [presetIndex, setPresetIndex] = useState(savedCanvas?.presetIndex ?? 1);
  const [canvasW, setCanvasW] = useState(
    savedCanvas?.canvasW ?? PRESET_SIZES[1].width * PPI
  );
  const [canvasH, setCanvasH] = useState(
    savedCanvas?.canvasH ?? PRESET_SIZES[1].height * PPI
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        CANVAS_STORAGE_KEY,
        JSON.stringify({ presetIndex, canvasW, canvasH })
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [presetIndex, canvasW, canvasH]);

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
  } = useLayers({ persistToLocal: limits.localStorage });
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

  const handleExportLayer = (layerId) => {
    const layer = layers.find((l) => l.id === layerId);
    const instance = patternInstancesRef.current?.[layerId];
    if (layer && instance) {
      exportLayerSVG(layer, instance, canvasW, canvasH, {
        metadata: limits.svgMetadata,
      });
    }
  };

  const handleExportAll = (includeHidden) => {
    exportAllLayersSVG(
      layers,
      patternInstancesRef.current || {},
      canvasW,
      canvasH,
      includeHidden,
      { metadata: limits.svgMetadata }
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
      <div className="h-screen bg-surface flex items-center justify-center">
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* App title */}
      <div className="shrink-0 bg-[#0e0e0e] border-b border-[#1a1a1a] px-4 py-2 group/title relative">
        <h1 className="text-sm font-semibold text-gray-300 tracking-wide cursor-default select-none">
          Naqsha
        </h1>
        <div className="absolute left-4 top-full mt-1 z-50 w-[420px] opacity-0 pointer-events-none group-hover/title:opacity-100 group-hover/title:pointer-events-auto transition-opacity duration-300">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4 shadow-2xl">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <span className="text-gray-200 font-medium">Naqsha</span> takes its name from the Arabic and Persian{" "}
              <span className="font-medium text-gray-300" dir="rtl">نقشه</span>{" "}
              — a word that refuses to separate the pattern from the plan, the visible form from the rules that generated it.
              Naqsha is that process as a tool — generative algorithms, parameters you control, output sized for posters,
              laser-cut acrylic and pen plotters, each session a record of where your rules led you on that particular day
              with that particular seed. The design is always regenerable and never finished, which is not a limitation but the point.
            </p>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="shrink-0 h-9 bg-panel border-b border-[#2e2e2e] flex items-center px-4 gap-4">
        <span className="text-[11px] text-gray-500 select-none">Naqsha</span>
        <button
          onClick={() => setShowLoadModal(true)}
          className="text-[11px] text-gray-400 hover:text-accent transition-colors"
        >
          Load Existing
          {groups.length > 0 && (
            <span className="ml-1 text-gray-600">({groups.length})</span>
          )}
        </button>
        <div className="ml-auto">
          <AuthButton />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <LeftPanel
          width={canvasW}
          height={canvasH}
          presetIndex={presetIndex}
          onPresetChange={handlePresetChange}
          onCustomChange={handleCustomChange}
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
        <RightPanel
          layers={layers}
          canvasW={canvasW}
          canvasH={canvasH}
          patternInstancesRef={patternInstancesRef}
          canvasContainerRef={canvasContainerRef}
        />
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="bg-panel border border-card-border rounded-lg w-80 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-200">
              Save Layer Group
            </h3>
            <input
              className="w-full bg-[#333] text-gray-200 text-sm px-2.5 py-1.5 rounded border border-[#444] outline-none focus:border-accent"
              placeholder="Untitled"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmSave()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleConfirmSave}
                className="flex-1 py-1.5 text-sm font-medium rounded bg-accent text-black hover:bg-accent-hover transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-1.5 text-sm font-medium rounded bg-[#333] text-gray-400 hover:bg-[#3a3a3a] transition-colors"
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
