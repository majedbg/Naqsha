import { useState, useRef, useCallback } from "react";
import RightPanel from "../components/RightPanel";
import Inspector from "../components/shell/Inspector";
import PatternPickerModal from "../components/PatternPickerModal";
import ShareLinkButton from "../components/ShareLinkButton";
import AuthButton from "../components/AuthButton";
import ThemeToggle from "../components/ui/ThemeToggle";
import useLayers from "../lib/useLayers";
import useCanvasSize, { loadCanvasState } from "../lib/hooks/useCanvasSize";
import { useGate } from "../lib/useGate";
import { exportAllLayersSVG } from "../lib/svgExport";
import { resolveExportColor } from "../lib/fabrication";
import { seedOperations } from "../lib/operations";

// Simplified mobile view (Lane B / B7, issue #16).
//
// Below the 768px desktop breakpoint the pro shell's eight-region layout does
// not fit. Rather than fall back to the (now-removed) legacy two-pane layout,
// this is a deliberately single-column "best viewed on desktop" editing view:
// a live canvas plus the essentials — add a layer, select + edit its params,
// export, and share. It hosts the SAME RightPanel canvas surface and the SAME
// shell Inspector the desktop shell uses, so behavior is consistent.
//
// It owns a small, independent slice of Studio's state (layers + canvas size).
// Machine-profile / operations editing, optimization, and document setup live
// only on the desktop shell — the banner sets that expectation. Export resolves
// colors through the seeded operation library against the persisted output mode
// so a quick mobile export matches the desktop default for the same document.
export default function MobileStudio() {
  const { limits } = useGate();
  const savedCanvas = loadCanvasState();

  const {
    presetIndex,
    canvasW,
    canvasH,
    unit,
    margin,
    outputMode,
  } = useCanvasSize({ savedCanvas });

  const {
    layers,
    addLayer,
    removeLayer,
    updateLayer,
    changeLayerPattern,
    bgColor,
    setBgColor,
  } = useLayers({ persistToLocal: limits.localStorage, maxLayers: limits.maxLayers });

  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [showInspector, setShowInspector] = useState(false);

  // The active machine profile is the persisted output mode (the desktop shell's
  // machine selector owns switching it; mobile is read-only here). Operations are
  // seeded identically to the desktop path so export colors match.
  const operations = useRef(seedOperations()).current;
  const machineProfile = outputMode;

  const selectionExists =
    selectedLayerId != null && layers.some((l) => l.id === selectedLayerId);
  const inspectorLayerId = selectionExists ? selectedLayerId : null;

  const handleSelectLayer = useCallback((id) => {
    setSelectedLayerId(id);
    setShowInspector(true);
  }, []);

  const exportLayer = (layer) => ({
    ...layer,
    color: resolveExportColor(layer, { operations, outputMode: machineProfile }),
  });

  const handleExportAll = useCallback(() => {
    const mapped = layers.map(exportLayer);
    exportAllLayersSVG(
      mapped,
      patternInstancesRef.current || {},
      canvasW,
      canvasH,
      true,
      { metadata: limits.svgMetadata, profileId: machineProfile }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, canvasW, canvasH, limits.svgMetadata, machineProfile]);

  const buildShareState = () => ({
    canvasW,
    canvasH,
    presetIndex,
    unit,
    margin,
    bgColor,
    layers,
  });

  return (
    <div className="flex flex-col h-dvh bg-paper">
      {/* Header: title + best-viewed-on-desktop note + account cluster. */}
      <div className="shrink-0 bg-paper-warm border-b border-hairline px-3 py-2 flex items-center gap-3">
        <h1 className="display text-sm font-semibold text-ink tracking-tight select-none">
          Naqsha
        </h1>
        <span className="text-[10px] text-ink-soft leading-tight">
          Best viewed on desktop
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ShareLinkButton buildState={buildShareState} />
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>

      {/* Canvas surface — the same RightPanel the desktop shell hosts. */}
      <div className="relative flex-1 min-h-0">
        <RightPanel
          layers={layers}
          canvasW={canvasW}
          canvasH={canvasH}
          patternInstancesRef={patternInstancesRef}
          canvasContainerRef={canvasContainerRef}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          unit={unit}
        />
      </div>

      {/* Layer strip — horizontally scrollable chips to select / add layers. */}
      <div className="shrink-0 border-t border-hairline bg-panel px-3 py-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => handleSelectLayer(layer.id)}
              className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                layer.id === selectedLayerId
                  ? "bg-accent/20 text-accent border border-violet/40"
                  : "bg-paper-warm text-ink-soft border border-hairline"
              }`}
            >
              {layer.name || "Layer"}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(true)}
            className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium bg-paper-warm text-ink-soft border border-dashed border-hairline hover:text-saffron hover:border-violet transition-colors"
          >
            + Layer
          </button>
        </div>
      </div>

      {/* Essentials action row. */}
      <div className="shrink-0 border-t border-hairline bg-paper-warm px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => setShowInspector((v) => !v)}
          disabled={!selectionExists}
          className="text-xs px-3 py-1.5 rounded-md bg-paper border border-hairline text-ink-soft enabled:hover:text-ink disabled:opacity-40 transition-colors"
        >
          Edit
        </button>
        {selectionExists && (
          <button
            onClick={() => {
              removeLayer(selectedLayerId);
              setSelectedLayerId(null);
              setShowInspector(false);
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-paper border border-hairline text-ink-soft hover:text-tone-strong transition-colors"
          >
            Delete
          </button>
        )}
        <button
          onClick={handleExportAll}
          disabled={layers.length === 0}
          className="ml-auto text-xs px-3 py-1.5 rounded-md bg-saffron text-ink hover:bg-saffron-hover disabled:opacity-40 transition-colors font-medium"
        >
          Export SVG
        </button>
      </div>

      {/* Inspector drawer — slides up from the bottom for the selected layer. */}
      {showInspector && selectionExists && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 flex items-end"
          onClick={() => setShowInspector(false)}
        >
          <div
            className="w-full max-h-[70dvh] overflow-y-auto bg-panel border-t border-hairline rounded-t-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-panel border-b border-hairline">
              <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                Parameters
              </span>
              <button
                onClick={() => setShowInspector(false)}
                className="text-xs text-ink-soft hover:text-ink"
                aria-label="Close parameters"
              >
                Done
              </button>
            </div>
            <Inspector
              layers={layers}
              selectedLayerId={inspectorLayerId}
              unit={unit}
              profileId={machineProfile}
              onUpdateLayer={updateLayer}
              onChangeLayerPattern={changeLayerPattern}
            />
          </div>
        </div>
      )}

      <PatternPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onPick={(id) => {
          addLayer(id);
          setShowPicker(false);
        }}
      />
    </div>
  );
}
