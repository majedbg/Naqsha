import { useState, useCallback } from "react";
import { saveDesign, loadDesign, saveHistorySnapshot } from "../designService";
import { collectLiveIds, filterTransforms, parseTextNodes } from "../scene/designState";

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
  textNodes,
  transforms,
  loadLayerSet,
  applyCanvasSize,
  applyTextState,
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
    const tn = parseTextNodes(textNodes);
    const config = {
      layers,
      canvasW,
      canvasH,
      presetIndex,
      bgColor,
      textNodes: tn,
      transforms: filterTransforms(transforms, collectLiveIds(layers, tn)),
    };
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
        markCleanFrom(layers, bgColor, { textNodes: tn, transforms: config.transforms });
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
    textNodes,
    transforms,
    limits.historySnapshots,
  ]);

  const handleLoadCloudDesign = useCallback(
    async (designId) => {
      if (!user) return;
      try {
        const design = await loadDesign(designId, user.id);
        if (!design?.config) return;
        const { layers: savedLayers, canvasW: cw, canvasH: ch } = design.config;
        if (savedLayers) loadLayerSet(savedLayers);
        if (cw && ch) applyCanvasSize(cw, ch);
        // Restore the interactive text/transform state as the fresh baseline.
        const loadedText = {
          textNodes: parseTextNodes(design.config.textNodes),
          transforms:
            design.config.transforms && typeof design.config.transforms === "object"
              ? design.config.transforms
              : {},
        };
        applyTextState?.(loadedText.textNodes, loadedText.transforms);
        setCurrentDesignId(design.id);
        markCleanFrom(savedLayers || layers, bgColor, loadedText);
      } catch (err) {
        console.error("Cloud load failed:", err);
      }
    },
    [user, loadLayerSet, applyCanvasSize, applyTextState, markCleanFrom, layers, bgColor]
  );

  return {
    currentDesignId,
    setCurrentDesignId,
    handleSaveToCloud,
    handleLoadCloudDesign,
  };
}
