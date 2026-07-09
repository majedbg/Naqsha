import { useState, useCallback } from "react";

// Optimization preview-vs-applied state machine extracted from Studio (AR-3A).
//
// Each pipeline step tracks its preview value (what the slider shows) vs. its
// appliedTolerance (what export uses). Export only reads `enabled &&
// appliedTolerance`, so slider drift never silently changes the exported file.
// The preview tolerance must NOT leak into the applied value until Apply.

const INITIAL = {
  simplify: { enabled: false, tolerance: 0.3, appliedTolerance: null },
  merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
  reorder: { enabled: false },
};

// Run Plan persistence (PRD #73, ADR 0002). Applied optimize values stay OUTSIDE
// the ⌘Z snapshot (their way back is the plan's own Revert) but must PERSIST WITH
// THE DOCUMENT — previously bare useState, they silently vanished on reload and
// changed what export produced. These two pure helpers are the document blob's
// serialize/deserialize contract; the persistence layer embeds the snapshot as a
// sibling of layers/panels and forwards the stored field back on load/recover.

// The APPLIED-ONLY subset that persists. The preview `tolerance` (what the slider
// shows) is deliberately dropped — only Apply commits it into `appliedTolerance`,
// and export reads only `enabled && appliedTolerance`, so preview drift must
// never ride into the saved document.
export function serializeApplied(opt) {
  return {
    simplify: {
      enabled: opt.simplify.enabled,
      appliedTolerance: opt.simplify.appliedTolerance,
    },
    merge: {
      enabled: opt.merge.enabled,
      appliedTolerance: opt.merge.appliedTolerance,
    },
    reorder: { enabled: opt.reorder.enabled },
  };
}

// Build a full optimizations state from a persisted applied-only blob. Missing/
// malformed input (an OLD document with no `optimizations` field) migrates to
// "none applied" (INITIAL) without throwing — the required safe failure mode.
// A partial blob fills absent steps from INITIAL. Preview `tolerance` is always
// restored from INITIAL because it never persists. Returns a FRESH clone so
// hydrating never mutates INITIAL or leaks state across documents.
export function hydrateApplied(persisted) {
  const src = persisted && typeof persisted === "object" ? persisted : {};
  const step = (key) => ({
    enabled: src[key]?.enabled ?? false,
    tolerance: INITIAL[key].tolerance,
    appliedTolerance: src[key]?.appliedTolerance ?? null,
  });
  return {
    simplify: step("simplify"),
    merge: step("merge"),
    reorder: { enabled: src.reorder?.enabled ?? false },
  };
}

export default function useOptimizations() {
  const [optimizations, setOptimizations] = useState(INITIAL);

  const updateOptimization = useCallback((key, patch) => {
    setOptimizations((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const applyOptimization = useCallback((key) => {
    setOptimizations((prev) => {
      const cur = prev[key];
      if (key === "reorder") return { ...prev, reorder: { enabled: true } };
      return {
        ...prev,
        [key]: { ...cur, enabled: true, appliedTolerance: cur.tolerance },
      };
    });
  }, []);

  // Runtime hydration seam (ADR 0002). Called AFTER a cloud load / draft recover
  // with the document's persisted applied-optimizations field (undefined for an
  // old blob → migrates to "none applied"). A plain setState, so it never enters
  // the ⌘Z history and matches the "applied opts live outside undo" boundary.
  const hydrateOptimizations = useCallback((persisted) => {
    setOptimizations(hydrateApplied(persisted));
  }, []);

  const revertOptimization = useCallback((key) => {
    setOptimizations((prev) => {
      if (key === "reorder") return { ...prev, reorder: { enabled: false } };
      return {
        ...prev,
        [key]: { ...prev[key], enabled: false, appliedTolerance: null },
      };
    });
  }, []);

  // Build the pipeline opts used by export — only "applied" tolerances flow through.
  const appliedOptimizations = {
    simplify: {
      enabled: optimizations.simplify.enabled,
      tolerance: optimizations.simplify.appliedTolerance ?? 0,
    },
    merge: {
      enabled: optimizations.merge.enabled,
      tolerance: optimizations.merge.appliedTolerance ?? 0,
    },
    reorder: { enabled: optimizations.reorder.enabled },
  };

  const appliedOpsList = [
    appliedOptimizations.simplify.enabled
      ? `simplify(${appliedOptimizations.simplify.tolerance}mm)`
      : null,
    appliedOptimizations.merge.enabled
      ? `merge(${appliedOptimizations.merge.tolerance}mm)`
      : null,
    appliedOptimizations.reorder.enabled ? "reorder" : null,
  ].filter(Boolean);

  // Applied-only snapshot for the document-persistence layer to save (sibling of
  // layers/panels in the blob). Derived from live state so it always reflects the
  // latest Apply/Revert; the preview `tolerance` is stripped by serializeApplied.
  const serializedOptimizations = serializeApplied(optimizations);

  return {
    optimizations,
    updateOptimization,
    applyOptimization,
    revertOptimization,
    hydrateOptimizations,
    appliedOptimizations,
    appliedOpsList,
    serializedOptimizations,
  };
}
