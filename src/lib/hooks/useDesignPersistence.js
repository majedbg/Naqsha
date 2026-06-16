import { useRef, useEffect, useCallback } from "react";
import {
  decodeShare,
  readShareTokenFromUrl,
  clearShareTokenFromUrl,
} from "../shareLink";
import { VALID_UNITS } from "./useCanvasSize";
import { collectLiveIds, filterTransforms, parseTextNodes } from "../scene/designState";

// localStorage key for the interactive text/transform state (text nodes + the
// shared transform map). Layers + bg live under their own keys in useLayers;
// this is the parallel blob for the scene-graph interactive state.
export const TEXT_STORAGE_KEY = "sonoform-text";

function readLocalText() {
  try {
    const raw = localStorage.getItem(TEXT_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return {
      textNodes: parseTextNodes(obj.textNodes),
      transforms: obj.transforms && typeof obj.transforms === "object" ? obj.transforms : {},
    };
  } catch {
    return null;
  }
}

// Initial interactive text/transform state for `useHistory` — restored from the
// local backup so a reload keeps editable text WITHOUT a restore-effect race
// (the history present is already correct before any persist effect runs). A
// pending `?s=` share token wins, so we start empty and let share-hydration
// apply its own text. Guests (no localStorage) start empty. Use as a LAZY
// initializer (runs once) so it doesn't read storage every render.
export function loadInitialTextState({ persistToLocal } = {}) {
  const empty = { transforms: {}, textNodes: [] };
  try {
    if (readShareTokenFromUrl()) return empty;
  } catch {
    /* location unavailable */
  }
  if (!persistToLocal) return empty;
  const local = readLocalText();
  return local ? { transforms: local.transforms, textNodes: local.textNodes } : empty;
}

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
  textNodes,
  transforms,
  loadLayerSet,
  setBgColor,
  setCanvasW,
  setCanvasH,
  setPresetIndex,
  setUnit,
  setMargin,
  applyTextState,
  persistToLocal,
}) {
  const cleanRef = useRef(null);

  // Serialize the canvas for comparison. paramsCache is excluded: it's derived
  // cache that mutates on pattern-type switches without a user-visible change.
  // textNodes + the shared transforms map are included so text edits / moves
  // register as unsaved work (transforms filtered to live ids for stability).
  const serializeState = useCallback(
    (lyrs, bg, textState) => {
      const tn = parseTextNodes(textState?.textNodes);
      const liveIds = collectLiveIds(lyrs, tn);
      return JSON.stringify({
        bg,
        // eslint-disable-next-line no-unused-vars
        layers: lyrs.map(({ paramsCache, ...rest }) => rest),
        textNodes: tn,
        transforms: filterTransforms(textState?.transforms, liveIds),
      });
    },
    []
  );

  // Snapshot an explicit just-loaded/just-saved state as the clean baseline.
  // Takes the values directly (not React state) so it's correct even when
  // called in the same tick as the setState that applied them. `textState`
  // defaults to the live text state (correct for save-path callers); load-path
  // callers pass the just-loaded text explicitly since history.reset is async.
  const markCleanFrom = useCallback(
    (lyrs, bg, textState = { textNodes, transforms }) => {
      cleanRef.current = serializeState(lyrs, bg, textState);
    },
    [serializeState, textNodes, transforms]
  );

  const isDirty = useCallback(() => {
    if (cleanRef.current === null) return true;
    return serializeState(layers, bgColor, { textNodes, transforms }) !== cleanRef.current;
  }, [serializeState, layers, bgColor, textNodes, transforms]);

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
        hadStored =
          !!localStorage.getItem("sonoform-layers") ||
          !!localStorage.getItem(TEXT_STORAGE_KEY);
      } catch {
        /* storage unavailable */
      }
    }
    // (Local text/transform state is restored synchronously via the
    // `loadInitialTextState` history initializer in Studio — no effect needed
    // here, which avoids a clobber race with the persist effect.)
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
      loadLayerSet(state.layers);
    if (typeof state.canvasW === "number") setCanvasW(state.canvasW);
    if (typeof state.canvasH === "number") setCanvasH(state.canvasH);
    if (typeof state.presetIndex === "number") setPresetIndex(state.presetIndex);
    if (typeof state.unit === "string" && VALID_UNITS.includes(state.unit))
      setUnit(state.unit);
    if (typeof state.margin === "number") setMargin(state.margin);
    if (typeof state.bgColor === "string") setBgColor(state.bgColor);
    // Hydrate the interactive text/transform state (installs it as the fresh
    // history baseline). Old shares without these fields → empty (identity).
    const hydratedText = {
      textNodes: parseTextNodes(state.textNodes),
      transforms: state.transforms && typeof state.transforms === "object" ? state.transforms : {},
    };
    applyTextState?.(hydratedText.textNodes, hydratedText.transforms);
    // The shared design is the clean baseline once hydrated.
    markCleanFrom(
      Array.isArray(state.layers) ? state.layers : layers,
      typeof state.bgColor === "string" ? state.bgColor : bgColor,
      hydratedText
    );
    clearShareTokenFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { serializeState, markCleanFrom, isDirty };
}
