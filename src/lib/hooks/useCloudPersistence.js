import { useState, useCallback } from "react";
import { saveDesign, loadDesign, saveHistorySnapshot } from "../designService";
import { normalizePanels } from "../panels";

// Cloud save/load concern extracted from Studio (AR-3A).
//
// Wraps `designService` (unchanged). Owns the current design id and the
// thumbnail-capture + save/load handlers. Canvas mutation goes through the
// injected `applyCanvasSize` seam (same dims-set + presetIndex recompute the
// inline code did); clean-baseline marking goes through injected `markCleanFrom`.
export default function useCloudPersistence({
  user,
  limits,
  layers,
  canvasW,
  canvasH,
  presetIndex,
  bgColor,
  panels,
  setPanels,
  loadLayerSet,
  applyCanvasSize,
  markCleanFrom,
  canvasContainerRef,
}) {
  const [currentDesignId, setCurrentDesignId] = useState(null);
  // Observable save state (Rec 1). `saveState` ∈ idle|saving|saved|error drives
  // the inline status indicator; `lastSavedAt` is the success timestamp (the
  // component formats it). These replace the previously-silent save: success and
  // failure are now both visible.
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Named documents (Rec 1). The doc name was hardcoded "Untitled"; it is now
  // editable state sent as the save `name` arg. Default stays "Untitled".
  const [designName, setDesignName] = useState("Untitled");

  const captureThumbnail = useCallback(() => {
    const container = canvasContainerRef.current;
    const canvas = container?.querySelector("canvas");
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      /* tainted canvas or unavailable */
      return null;
    }
  }, [canvasContainerRef]);

  const handleSaveToCloud = useCallback(async () => {
    if (!user) return;
    const thumbnail = captureThumbnail();
    const config = { layers, canvasW, canvasH, presetIndex, panels };
    setSaveState("saving");
    setSaveError(null);
    try {
      const design = await saveDesign(
        user.id,
        designName,
        config,
        thumbnail,
        currentDesignId
      );
      if (design) {
        setCurrentDesignId(design.id);
        markCleanFrom(layers, bgColor);
        // Pro: auto-save history snapshot
        if (limits.historySnapshots > 0) {
          saveHistorySnapshot(design.id, user.id, config, thumbnail).catch(
            () => {}
          );
        }
      }
      setLastSavedAt(Date.now());
      setSaveState("saved");
    } catch (err) {
      // Surface the failure as observable state instead of swallowing it to the
      // console — the indicator renders "Couldn't save" + a Retry affordance.
      console.error("Cloud save failed:", err);
      setSaveError(err);
      setSaveState("error");
    }
  }, [
    user,
    captureThumbnail,
    designName,
    layers,
    canvasW,
    canvasH,
    presetIndex,
    currentDesignId,
    markCleanFrom,
    bgColor,
    panels,
    limits.historySnapshots,
  ]);

  const handleLoadCloudDesign = useCallback(
    async (designId) => {
      if (!user) return;
      try {
        const design = await loadDesign(designId, user.id);
        if (!design?.config) return;
        const { layers: savedLayers, canvasW: cw, canvasH: ch } = design.config;
        const { panels: normPanels, layers: normLayers } = normalizePanels(
          design.config.panels,
          savedLayers || []
        );
        if (savedLayers) loadLayerSet(normLayers);
        setPanels?.(normPanels);
        if (cw && ch) applyCanvasSize(cw, ch);
        setCurrentDesignId(design.id);
        markCleanFrom(savedLayers ? normLayers : layers, bgColor);
        // Adopt the loaded name (guard against undefined so the default holds),
        // and present the freshly-loaded design as a saved baseline: clear any
        // stale error so the indicator doesn't read "Couldn't save" post-load.
        if (design.name) setDesignName(design.name);
        setSaveError(null);
        setLastSavedAt(Date.now());
        setSaveState("saved");
      } catch (err) {
        console.error("Cloud load failed:", err);
      }
    },
    [
      user,
      loadLayerSet,
      setPanels,
      applyCanvasSize,
      markCleanFrom,
      layers,
      bgColor,
    ]
  );

  return {
    currentDesignId,
    setCurrentDesignId,
    handleSaveToCloud,
    handleLoadCloudDesign,
    saveState,
    saveError,
    lastSavedAt,
    designName,
    setDesignName,
  };
}
