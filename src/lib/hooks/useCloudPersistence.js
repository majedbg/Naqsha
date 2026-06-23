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
        markCleanFrom(layers, bgColor);
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
  }, [
    user,
    captureThumbnail,
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
  };
}
