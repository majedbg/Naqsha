import { useRef, useEffect, useCallback } from "react";
import {
  decodeShare,
  readShareTokenFromUrl,
  clearShareTokenFromUrl,
} from "../shareLink";
import { VALID_UNITS } from "./useCanvasSize";

// Unsaved-work tracking + share-link hydration extracted from Studio (AR-3A).
//
// The baseline is a *known-clean* state: a freshly loaded example/design/group,
// a successful save, or — on first run only — the pristine defaults. Work
// restored from localStorage is treated as dirty (its provenance is unknown),
// so loading an example over it prompts rather than silently discarding it.
// `null` means "unknown" → dirty.
//
// Canvas setters and layer loaders are injected so the two run-once mount
// effects (first-run baseline + share hydration) can live here unchanged.
export default function useDesignPersistence({
  layers,
  bgColor,
  loadLayerSet,
  setBgColor,
  setCanvasW,
  setCanvasH,
  setPresetIndex,
  setUnit,
  setMargin,
  persistToLocal,
  // Run Plan applied Optimizations (PRD #73, ADR 0002). The applied-only snapshot
  // (useOptimizations.serializedOptimizations) is now part of the DIRTY SIGNAL:
  // applying / reverting an Optimization changes what export produces, so it must
  // schedule an autosave the same way a layer edit does. Optional + defaulted, so
  // callers/tests that don't wire it hash exactly as before (opts → null).
  optimizations,
}) {
  const cleanRef = useRef(null);

  // Serialize the canvas for comparison. paramsCache is excluded: it's derived
  // cache that mutates on pattern-type switches without a user-visible change.
  // `opts` folds the applied Optimizations into the signal; absent → null, so the
  // hash is byte-stable for callers that never pass it.
  const serializeState = useCallback(
    (lyrs, bg, opts) =>
      JSON.stringify({
        bg,
        opts: opts ?? null,
        // eslint-disable-next-line no-unused-vars
        layers: lyrs.map(({ paramsCache, ...rest }) => rest),
      }),
    []
  );

  // Snapshot an explicit just-loaded/just-saved state as the clean baseline.
  // Takes the values directly (not React state) so it's correct even when
  // called in the same tick as the setState that applied them. `opts` defaults to
  // the current applied Optimizations so existing 2-arg call sites keep working.
  const markCleanFrom = useCallback(
    (lyrs, bg, opts = optimizations) => {
      cleanRef.current = serializeState(lyrs, bg, opts);
    },
    [serializeState, optimizations]
  );

  const isDirty = useCallback(() => {
    if (cleanRef.current === null) return true;
    return serializeState(layers, bgColor, optimizations) !== cleanRef.current;
  }, [serializeState, layers, bgColor, optimizations]);

  // First-run baseline: only when there's no share token and no stored work do
  // the pristine defaults count as clean. Otherwise cleanRef stays null (dirty)
  // until an explicit load/save sets it. Runs once.
  useEffect(() => {
    const token = readShareTokenFromUrl();
    // Only persisted work counts as restored: guests don't write localStorage
    // (persistToLocal === limits.localStorage), so any stale value there isn't
    // the current canvas and shouldn't trigger a false "unsaved" prompt.
    let hadStored = false;
    if (persistToLocal) {
      try {
        hadStored = !!localStorage.getItem("sonoform-layers");
      } catch {
        /* storage unavailable */
      }
    }
    if (!token && !hadStored) markCleanFrom(layers, bgColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount, if the URL carries a ?s=<share-token>, hydrate state from it.
  // Intentionally runs once; strips the param so refresh doesn't re-apply.
  useEffect(() => {
    const token = readShareTokenFromUrl();
    if (!token) return;
    const state = decodeShare(token);
    if (!state) return;
    if (Array.isArray(state.layers) && state.layers.length > 0)
      // WI-3: hand the shared doc's custom-glyph store to the document-load seam
      // (loadLayerSet's 2nd arg). Default `{}` so an OLD share with no field
      // RESETS the store rather than leaking the prior document's glyphs.
      loadLayerSet(state.layers, state.customGlyphs ?? {});
    if (typeof state.canvasW === "number") setCanvasW(state.canvasW);
    if (typeof state.canvasH === "number") setCanvasH(state.canvasH);
    if (typeof state.presetIndex === "number") setPresetIndex(state.presetIndex);
    if (typeof state.unit === "string" && VALID_UNITS.includes(state.unit))
      setUnit(state.unit);
    if (typeof state.margin === "number") setMargin(state.margin);
    if (typeof state.bgColor === "string") setBgColor(state.bgColor);
    // The shared design is the clean baseline once hydrated.
    markCleanFrom(
      Array.isArray(state.layers) ? state.layers : layers,
      typeof state.bgColor === "string" ? state.bgColor : bgColor
    );
    clearShareTokenFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { serializeState, markCleanFrom, isDirty };
}
