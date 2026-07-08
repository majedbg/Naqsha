// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useOptimizations, {
  serializeApplied,
  hydrateApplied,
} from "./useOptimizations";

// Run Plan — applied-Optimization persistence (PRD #73, ADR 0002).
//
// Per ADR 0002 the plan's Optimize section is the one preview→apply→revert
// surface: applied optimize values stay OUTSIDE the ⌘Z snapshot (their way back
// is the plan's own Revert) but must PERSIST WITH THE DOCUMENT so they no longer
// silently vanish on reload and change what export produces. These tests pin the
// two halves that make that possible: a serializable APPLIED-ONLY snapshot (the
// preview `tolerance` must never ride along) and a hydrate that migrates an old
// blob with no field to "none applied" (INITIAL) without throwing.

describe("useOptimizations — applied-optimization persistence", () => {
  it("serializedOptimizations carries only APPLIED values (enabled + appliedTolerance), never the preview tolerance", () => {
    const { result } = renderHook(() => useOptimizations());

    // Move the slider (preview only) then Apply a DIFFERENT step so we can see
    // both: the applied one persists, the preview-only drift does not.
    act(() => result.current.updateOptimization("merge", { tolerance: 0.9 }));
    act(() => result.current.updateOptimization("simplify", { tolerance: 0.42 }));
    act(() => result.current.applyOptimization("simplify"));

    const snap = result.current.serializedOptimizations;
    // Applied step round-trips its enabled + appliedTolerance.
    expect(snap.simplify).toEqual({ enabled: true, appliedTolerance: 0.42 });
    // The preview-only `tolerance` key is absent from the whole snapshot.
    expect(snap.simplify).not.toHaveProperty("tolerance");
    expect(snap.merge).toEqual({ enabled: false, appliedTolerance: null });
    expect(snap.merge).not.toHaveProperty("tolerance");
    expect(snap.reorder).toEqual({ enabled: false });
  });

  it("a preview-only change (slider moved, not applied) does NOT appear in the serialized snapshot", () => {
    const { result } = renderHook(() => useOptimizations());
    act(() => result.current.updateOptimization("simplify", { tolerance: 0.77 }));

    // Serialize (what the persistence layer would save).
    const json = JSON.stringify(result.current.serializedOptimizations);
    // The preview value 0.77 is nowhere in the persisted blob.
    expect(json).not.toContain("0.77");
    expect(result.current.serializedOptimizations.simplify).toEqual({
      enabled: false,
      appliedTolerance: null,
    });
  });

  it("apply → serialize → deserialize (simulate reload) → applied values survive and the export/appliedOptimizations derivation reflects them", () => {
    // Author a doc: apply simplify @0.6 and reorder.
    const authoring = renderHook(() => useOptimizations());
    act(() =>
      authoring.result.current.updateOptimization("simplify", { tolerance: 0.6 })
    );
    act(() => authoring.result.current.applyOptimization("simplify"));
    act(() => authoring.result.current.applyOptimization("reorder"));

    // Serialize → through storage (JSON) → deserialize, exactly like a reload.
    const persisted = JSON.parse(
      JSON.stringify(authoring.result.current.serializedOptimizations)
    );

    // Reopen the doc: a fresh hook hydrated from the persisted blob.
    const reopened = renderHook(() => useOptimizations());
    act(() => reopened.result.current.hydrateOptimizations(persisted));

    // Export reads appliedOptimizations — it reflects the persisted applied vals.
    expect(reopened.result.current.appliedOptimizations.simplify).toEqual({
      enabled: true,
      tolerance: 0.6,
    });
    expect(reopened.result.current.appliedOptimizations.reorder).toEqual({
      enabled: true,
    });
    expect(reopened.result.current.appliedOpsList).toContain("simplify(0.6mm)");
    expect(reopened.result.current.appliedOpsList).toContain("reorder");
  });

  it("hydrating an OLD blob with no optimizations field yields 'none applied' (INITIAL) without throwing", () => {
    const { result } = renderHook(() => useOptimizations());
    // Apply something first so we can prove the old-blob load RESETS it.
    act(() => result.current.applyOptimization("reorder"));
    expect(result.current.appliedOptimizations.reorder.enabled).toBe(true);

    // Load a legacy document whose config had no `optimizations` field.
    expect(() =>
      act(() => result.current.hydrateOptimizations(undefined))
    ).not.toThrow();

    // Back to "none applied": no step enabled, no applied tolerances.
    expect(result.current.appliedOptimizations).toEqual({
      simplify: { enabled: false, tolerance: 0 },
      merge: { enabled: false, tolerance: 0 },
      reorder: { enabled: false },
    });
    expect(result.current.appliedOpsList).toEqual([]);
  });

  it("cross-document load: hydrating a doc-with-opts then a doc-WITHOUT the field resets to INITIAL (no leak across documents)", () => {
    const { result } = renderHook(() => useOptimizations());
    // Doc A carried an applied merge.
    act(() =>
      result.current.hydrateOptimizations({
        merge: { enabled: true, appliedTolerance: 0.8 },
      })
    );
    expect(result.current.appliedOptimizations.merge).toEqual({
      enabled: true,
      tolerance: 0.8,
    });
    // Doc B is old (no field) → the prior doc's applied merge must NOT leak.
    act(() => result.current.hydrateOptimizations(undefined));
    expect(result.current.appliedOptimizations.merge).toEqual({
      enabled: false,
      tolerance: 0,
    });
  });
});

// Pure serialize/hydrate contract — the persistence layer imports these to embed
// the applied subset in the document blob and to migrate old blobs on load.
describe("serializeApplied / hydrateApplied (migration default)", () => {
  it("serializeApplied strips the preview tolerance and keeps only applied fields", () => {
    const snap = serializeApplied({
      simplify: { enabled: true, tolerance: 0.9, appliedTolerance: 0.3 },
      merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
      reorder: { enabled: true },
    });
    expect(snap).toEqual({
      simplify: { enabled: true, appliedTolerance: 0.3 },
      merge: { enabled: false, appliedTolerance: null },
      reorder: { enabled: true },
    });
  });

  it("hydrateApplied(undefined) returns the INITIAL 'none applied' state (migration default)", () => {
    expect(hydrateApplied(undefined)).toEqual({
      simplify: { enabled: false, tolerance: 0.3, appliedTolerance: null },
      merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
      reorder: { enabled: false },
    });
  });

  it("hydrateApplied tolerates a malformed/partial blob and fills missing steps from INITIAL", () => {
    // Only simplify present; merge/reorder must fall back to INITIAL.
    const state = hydrateApplied({ simplify: { enabled: true, appliedTolerance: 0.2 } });
    expect(state.simplify.enabled).toBe(true);
    expect(state.simplify.appliedTolerance).toBe(0.2);
    // Preview tolerance is restored from INITIAL (it never persists).
    expect(state.simplify.tolerance).toBe(0.3);
    expect(state.merge).toEqual({ enabled: false, tolerance: 0.5, appliedTolerance: null });
    expect(state.reorder).toEqual({ enabled: false });
    // Garbage in → INITIAL out, no throw.
    expect(() => hydrateApplied("not-an-object")).not.toThrow();
    expect(hydrateApplied(42).reorder).toEqual({ enabled: false });
  });

  it("hydrateApplied returns a fresh clone (never a shared INITIAL reference)", () => {
    const a = hydrateApplied(undefined);
    const b = hydrateApplied(undefined);
    expect(a).not.toBe(b);
    a.simplify.enabled = true;
    expect(b.simplify.enabled).toBe(false);
  });
});
