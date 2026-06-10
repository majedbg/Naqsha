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

  return {
    optimizations,
    updateOptimization,
    applyOptimization,
    revertOptimization,
    appliedOptimizations,
    appliedOpsList,
  };
}
