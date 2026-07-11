import { useState, useEffect, useMemo, useCallback } from "react";
import { DEFAULT_PREVIEW_MATERIALS } from "../materialPreview";

// useColorView — the "Color View" lens state (spec: docs/material-preview-plan.md).
//
// Owns whether the canvas shows the Operation lens (today's cut=red/score=blue
// technical view) or the Material lens (a preview on a real sheet), plus which
// material is previewed. Persisted in its OWN localStorage key — NOT the document
// — so saved/shared/exported docs carry no view state. Fresh load defaults to
// Operation.
//
// `materials` is injected so the source can change without touching this hook:
// Phase 1 passes DEFAULT_PREVIEW_MATERIALS; Phase 2 can pass a logged-in member's
// org materials. The selected id is resolved against that list each render, so a
// material that disappears from the list simply resolves to null (the control
// then re-prompts) without losing the persisted choice.

export const COLOR_VIEW_STORAGE_KEY = "sonoform-colorview";

// Clamp a persisted/raw mark-visibility bias into [-1, 1]; anything non-finite
// (absent, corrupt) → 0 = accurate.
function clampMarkContrast(v) {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}

export function loadColorViewState() {
  try {
    const raw = localStorage.getItem(COLOR_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.mode === "operation" || parsed.mode === "material")) {
      return {
        mode: parsed.mode,
        materialId: parsed.materialId ?? null,
        markContrast: clampMarkContrast(parsed.markContrast),
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return null;
}

export default function useColorView({ materials = DEFAULT_PREVIEW_MATERIALS } = {}) {
  const saved = useMemo(() => loadColorViewState(), []);
  const [mode, setMode] = useState(saved?.mode ?? "operation");
  const [materialId, setMaterialId] = useState(saved?.materialId ?? null);
  // Cut/score visibility bias (materialPreview.applyMarkVisibility), [-1, 1],
  // 0 = accurate. Preview-only view state like the rest of the lens; the control
  // shows its "Not an accurate representation" warning whenever ≠ 0, so a
  // persisted bias can't silently masquerade as the honest render.
  const [markContrast, setMarkContrastRaw] = useState(saved?.markContrast ?? 0);
  const setMarkContrast = useCallback((v) => setMarkContrastRaw(clampMarkContrast(v)), []);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLOR_VIEW_STORAGE_KEY,
        JSON.stringify({ mode, materialId, markContrast }),
      );
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [mode, materialId, markContrast]);

  // Resolve the persisted id against the live material list (null if absent).
  const material = useMemo(
    () => materials.find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );

  // The object the canvas consumes. In material mode WITHOUT a resolved material
  // it stays mode:'material' but material:null — resolveCanvasColor treats that
  // as operation (no recolor) so the canvas never blanks while the user picks.
  // (Per-panel materials can still shade their own layers in that state.)
  const colorView = useMemo(
    () => ({ mode, material, markContrast }),
    [mode, material, markContrast],
  );

  // Switching to Material with nothing valid chosen → signal the control to
  // auto-open its picker (the "what material should we preview?" moment).
  const needsMaterialChoice = mode === "material" && material === null;

  const selectMaterial = useCallback((id) => {
    setMaterialId(id);
    setMode("material");
  }, []);

  return {
    mode,
    setMode,
    materialId,
    setMaterialId,
    selectMaterial,
    material,
    materials,
    markContrast,
    setMarkContrast,
    colorView,
    needsMaterialChoice,
  };
}
