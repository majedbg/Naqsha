import { useState, useCallback } from "react";
import { saveDesign, loadDesign, saveHistorySnapshot } from "../designService";
import { normalizePanels } from "../panels";
import { draftKey, saveDraft, loadDraft, clearDraft } from "../localDraft";

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
  const [designName, setDesignNameState] = useState("Untitled");
  // Name-dirty (Rec 2). Renaming didn't previously mark the doc unsaved, so a new
  // name never autosaved. The public `setDesignName` flips this true; a
  // successful save/load clears it. Studio ORs it into the autosave dirty trigger
  // and the status indicator so renames both persist and read as "Unsaved".
  const [nameDirty, setNameDirty] = useState(false);
  const setDesignName = useCallback((name) => {
    setDesignNameState(name);
    setNameDirty(true);
  }, []);

  // Recovery (Capability B). On mount, read any draft stashed by a prior failed
  // save under THIS session's mount key (id is null at mount → the 'new'
  // namespace). The mount key is frozen via useState so recover/discard clear
  // the exact key the draft was read from, regardless of any later id change.
  const [mountKey] = useState(() => draftKey(currentDesignId));
  const [pendingDraft, setPendingDraft] = useState(() => loadDraft(mountKey));

  const discardDraft = useCallback(() => {
    clearDraft(mountKey);
    setPendingDraft(null);
  }, [mountKey]);

  const recoverDraft = useCallback(() => {
    setPendingDraft((draft) => {
      if (draft) {
        const cfg = draft.config || {};
        if (cfg.layers) loadLayerSet(cfg.layers);
        if (cfg.canvasW && cfg.canvasH)
          applyCanvasSize(cfg.canvasW, cfg.canvasH);
        if (draft.name) setDesignName(draft.name);
        clearDraft(mountKey);
      }
      return null;
    });
  }, [mountKey, loadLayerSet, applyCanvasSize, setDesignName]);

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
    // Capture the draft key ONCE from the id at call time, so a failed-then-
    // succeeded NEW save clears the same ('new') key it wrote — not the
    // post-success id (Capability B).
    const key = draftKey(currentDesignId);
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
      // The persisted name is now the saved baseline. Cleared only on success so
      // a failed save keeps the rename pending for the next attempt.
      setNameDirty(false);
      setSaveState("saved");
      // Cloud is now the source of truth → drop the local safety-net draft.
      clearDraft(key);
    } catch (err) {
      // Surface the failure as observable state instead of swallowing it to the
      // console — the indicator renders "Couldn't save" + a Retry affordance.
      console.error("Cloud save failed:", err);
      // Safety net: stash the in-memory doc so the work survives a reload/crash
      // and can be recovered. Namespaced key — never `sonoform-layers`.
      saveDraft(key, { config, name: designName, savedAt: Date.now() });
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
        // Use the raw setter so adopting the loaded name doesn't mark it dirty;
        // the loaded design IS the clean baseline.
        if (design.name) setDesignNameState(design.name);
        setNameDirty(false);
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
    nameDirty,
    pendingDraft,
    recoverDraft,
    discardDraft,
  };
}
