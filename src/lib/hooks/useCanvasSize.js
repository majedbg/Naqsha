import { useState, useEffect, useCallback } from "react";
import { PRESET_SIZES, PPI } from "../../constants";
import { DEFAULT_UNIT, pxToUnit } from "../units";

// Canvas-sizing concern extracted from Studio (AR-3A).
// Owns preset/dimensions/unit/margin/outputMode and the single `sonoform-canvas`
// localStorage blob. That blob also persists the active tab, so this hook is the
// SOLE writer of the key and takes `activeTab` as an input to fold into the same
// JSON shape — splitting the blob would break round-tripping for existing users.

export const CANVAS_STORAGE_KEY = "sonoform-canvas";
export const VALID_TABS = ["design", "prepare", "export"];
export const VALID_UNITS = ["mm", "in", "px"];

export function loadCanvasState() {
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

// `activeTab` is owned by the UI-state concern but co-persisted in this blob, so
// it is threaded in as a param. `savedCanvas` is read once at mount and returned
// so the caller can seed activeTab from the same blob this hook persists.
export default function useCanvasSize({ savedCanvas, activeTab } = {}) {
  const [presetIndex, setPresetIndex] = useState(savedCanvas?.presetIndex ?? 1);
  const [canvasW, setCanvasW] = useState(
    savedCanvas?.canvasW ?? PRESET_SIZES[1].width * PPI
  );
  const [canvasH, setCanvasH] = useState(
    savedCanvas?.canvasH ?? PRESET_SIZES[1].height * PPI
  );
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
    return saved === "laser" || saved === "plotter" ? saved : "plotter";
  });

  // Prepare tab is "configured" once the user has picked a non-default
  // preset, custom size, or margin — controls whether the stale yellow-dot
  // indicator appears when Design edits happen after Prepare is set.
  const prepareConfigured =
    presetIndex !== 1 || margin > 0 || unit !== DEFAULT_UNIT;

  useEffect(() => {
    try {
      localStorage.setItem(
        CANVAS_STORAGE_KEY,
        JSON.stringify({
          presetIndex,
          canvasW,
          canvasH,
          activeTab,
          unit,
          margin,
          outputMode,
        })
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [presetIndex, canvasW, canvasH, activeTab, unit, margin, outputMode]);

  const handlePresetChange = useCallback((index) => {
    setPresetIndex(index);
    const preset = PRESET_SIZES[index];
    if (preset.width !== null) {
      setCanvasW(preset.width * PPI);
      setCanvasH(preset.height * PPI);
    }
  }, []);

  const handleCustomChange = useCallback((w, h) => {
    setCanvasW(Math.round(w));
    setCanvasH(Math.round(h));
  }, []);

  // Shared loader seam: set dimensions and recompute presetIndex from them
  // (the cloud/group/example/share loaders all did this identically). When the
  // dims match a known preset's px size, snap to it; otherwise fall to Custom.
  const applyCanvasSize = useCallback((w, h) => {
    if (!w || !h) return;
    setCanvasW(w);
    setCanvasH(h);
    const matchIdx = PRESET_SIZES.findIndex(
      (p) => p.width !== null && p.width * PPI === w && p.height * PPI === h
    );
    setPresetIndex(matchIdx >= 0 ? matchIdx : PRESET_SIZES.length - 1);
  }, []);

  // === Unified history seam (undo-history-plan §3.2) ===
  // captureCanvas/restoreCanvas are the bulk get/set the document snapshot uses
  // for the canvas slice. Capture reads the LIVE values (recreated when they
  // change); restore writes every field through the existing setters in one
  // synchronous pass. Symmetric by construction — every field captured is
  // restored — so the round-trip is a no-op (invariant I1).
  const captureCanvas = useCallback(
    () => ({ w: canvasW, h: canvasH, unit, margin, presetIndex, outputMode }),
    [canvasW, canvasH, unit, margin, presetIndex, outputMode]
  );
  const restoreCanvas = useCallback((c) => {
    if (!c) return;
    setCanvasW(c.w);
    setCanvasH(c.h);
    setUnit(c.unit);
    setMargin(c.margin);
    setPresetIndex(c.presetIndex);
    setOutputMode(c.outputMode);
  }, []);

  // Work-piece (design canvas) dimensions in mm for the export manifest — the
  // size the exported SVG/manifest use; NOT the machine bed. Single-sourced via
  // PX_PER_MM (pxToUnit) instead of the old inline `canvasW / 96 * 25.4` magic
  // numbers.
  const workPieceWmm = pxToUnit(canvasW, "mm").toFixed(1);
  const workPieceHmm = pxToUnit(canvasH, "mm").toFixed(1);

  return {
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
    captureCanvas,
    restoreCanvas,
    workPieceWmm,
    workPieceHmm,
  };
}
