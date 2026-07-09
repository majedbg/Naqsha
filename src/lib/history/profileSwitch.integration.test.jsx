// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useHistory from "./useHistory";
import { createDocumentIO } from "./documentSnapshot";
import { seedOperations } from "../operations";
import {
  DEFAULT_PROFILE_ID,
  defaultBedSize,
  remapOperationsToProfile,
} from "../machineProfiles";

// P0-3 (Run Plan, PRD #73) — a Machine Profile switch is a RECORDED, undoable
// batch, NOT a history.clear(). This drives the real async path exactly as
// Studio wires it: the Operation library + active Machine Profile slices feed
// createDocumentIO's capture/restore, and a profile switch rides recordBatch
// (beginCoalesce/endCoalesce) as ONE entry. The killer property the isolated
// documentSnapshot unit test cannot reach: capture must read the LIVE profile,
// so this mirror threads activeProfileId through a ref-backed getter (the same
// idiom every sibling getter uses) instead of a stale render-closure — and the
// two-switch test below is what actually proves it.
//
// CONTEXT.md vocabulary: Run Plan, Machine Profile, Operation.

function useProfileWired() {
  const historyRef = useRef(null);
  const restoringRef = useRef(false);

  // recordBatch (mirrors Studio ~260): fold a multi-slice user action into ONE
  // undo entry. beginCoalesce captures the pre-action snapshot; endCoalesce
  // commits it unconditionally — so a profile switch is exactly one entry.
  const recordBatch = useCallback((fn) => {
    const api = historyRef.current;
    if (!api || restoringRef.current) {
      fn();
      return;
    }
    api.beginCoalesce();
    try {
      fn();
    } finally {
      api.endCoalesce();
    }
  }, []);
  const recordStructural = useCallback(() => {
    if (restoringRef.current) return;
    historyRef.current?.record();
  }, []);

  // Operation library slice (plain Studio state, mirrors S5). commitOperations
  // records one discrete entry then applies the library mapper.
  const [operations, setOperations] = useState(() => seedOperations());
  const operationsRef = useRef(operations);
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);
  const commitOperations = useCallback(
    (mapper) => {
      recordStructural();
      setOperations((ops) => mapper(ops));
    },
    [recordStructural]
  );

  // Active Machine Profile slice — the single source of truth for the target
  // machine. Read LIVE by capture via activeProfileIdRef (see getActiveProfileId).
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
  const activeProfileIdRef = useRef(activeProfileId);
  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  // bedSize is TRANSIENT — deliberately NOT in the snapshot; it is re-derived
  // from the restored profile's default bed (the bedSize seam) so the bed overlay
  // follows the machine on undo.
  const [bedSize, setBedSize] = useState(() => defaultBedSize(DEFAULT_PROFILE_ID));

  // handleProfileChange — a PURE mutation (mirrors the P0-3 fix): it sets the
  // profile, re-derives the default bed, and remaps the Operation library. It no
  // longer clears history and it does NOT record — recording is the caller's job.
  const handleProfileChange = useCallback((id) => {
    setActiveProfileId(id);
    setBedSize(defaultBedSize(id));
    setOperations((ops) => remapOperationsToProfile(ops, id));
  }, []);
  // The recorded call site: fold the whole switch into ONE undo entry.
  const recordedProfileChange = useCallback(
    (id) => recordBatch(() => handleProfileChange(id)),
    [recordBatch, handleProfileChange]
  );

  // Ref-backed getters so capture reads the LIVE slice values from a memo-stable
  // createDocumentIO (matching Studio's getLayers/getOperations idiom).
  const getOperations = useCallback(() => operationsRef.current, []);
  const getActiveProfileId = useCallback(() => activeProfileIdRef.current, []);

  const { capture, restore: restoreBase } = useMemo(
    () =>
      createDocumentIO({
        // Only the two slices this lane owns are live; the rest are benign stubs
        // so the other capture/restore params stay satisfied.
        getLayers: () => [],
        getPanels: () => [],
        getBgColor: () => "#000000",
        captureAssignments: () => ({}),
        captureCanvas: () => ({ w: 0, h: 0 }),
        loadLayerSet: () => {},
        setPanels: () => {},
        setBgColor: () => {},
        restoreAssignments: () => {},
        restoreCanvas: () => {},
        // The active-Machine-Profile slice under test.
        getOperations,
        getActiveProfileId,
        restoreOperations: setOperations,
        // Wired bulk setter re-derives the transient bed on restore (bedSize seam).
        setActiveProfileId: (id) => {
          setActiveProfileId(id);
          setBedSize(defaultBedSize(id));
        },
      }),
    [getOperations, getActiveProfileId]
  );
  // Suppress self-recording for the whole synchronous restore span.
  const restore = useCallback(
    (s) => {
      restoringRef.current = true;
      try {
        restoreBase(s);
      } finally {
        restoringRef.current = false;
      }
    },
    [restoreBase]
  );

  const history = useHistory({ capture, restore });
  useEffect(() => {
    historyRef.current = history;
  });

  return {
    operations,
    activeProfileId,
    bedSize,
    commitOperations,
    recordedProfileChange,
    history,
  };
}

const processesOf = (result) =>
  result.current.operations.map((o) => o.process);

describe("Run Plan P0-3 — Machine Profile switch is a recorded, undoable batch", () => {
  it("undo restores BOTH the prior Machine Profile and its remapped Operation library (through two switches, proving capture reads the LIVE profile)", () => {
    const { result } = renderHook(() => useProfileWired());
    // Laser seed: Cut / Score / Engrave keep their processes.
    expect(result.current.activeProfileId).toBe("laser");
    expect(processesOf(result)).toEqual(["cut", "score", "engrave"]);

    // Switch #1: laser → plotter. Plotter supports only `pen`, so every Operation
    // remaps to `pen`.
    act(() => result.current.recordedProfileChange("plotter"));
    expect(result.current.activeProfileId).toBe("plotter");
    expect(result.current.operations.every((o) => o.process === "pen")).toBe(true);

    // Switch #2: plotter → dragCutter (only `cut`).
    act(() => result.current.recordedProfileChange("dragCutter"));
    expect(result.current.activeProfileId).toBe("dragCutter");
    expect(result.current.operations.every((o) => o.process === "cut")).toBe(true);

    // ONE undo reverts the SECOND switch → the INTERMEDIATE plotter state. If
    // capture had frozen on the mount-time profile (laser) this would restore the
    // wrong profile; landing on plotter proves capture read the live value.
    act(() => result.current.history.undo());
    expect(result.current.activeProfileId).toBe("plotter");
    expect(result.current.operations.every((o) => o.process === "pen")).toBe(true);
    // bedSize (transient, re-derived on restore) follows the restored profile.
    expect(result.current.bedSize).toEqual(defaultBedSize("plotter"));

    // A second undo reverts the first switch → the original laser library.
    act(() => result.current.history.undo());
    expect(result.current.activeProfileId).toBe("laser");
    expect(processesOf(result)).toEqual(["cut", "score", "engrave"]);
    expect(result.current.bedSize).toEqual(defaultBedSize("laser"));

    // Redo replays the switch forward again.
    act(() => result.current.history.redo());
    expect(result.current.activeProfileId).toBe("plotter");
    expect(result.current.operations.every((o) => o.process === "pen")).toBe(true);
  });

  it("a Machine Profile switch NEVER clears history: an unrelated pre-switch Operation edit stays undoable after the switch is undone", () => {
    const { result } = renderHook(() => useProfileWired());

    // An unrelated pre-switch edit: recolor the Cut Operation.
    act(() =>
      result.current.commitOperations((ops) =>
        ops.map((o) => (o.id === "op-cut" ? { ...o, color: "#123456" } : o))
      )
    );
    expect(
      result.current.operations.find((o) => o.id === "op-cut").color
    ).toBe("#123456");

    // Switch the Machine Profile (this path used to call history.clear()).
    act(() => result.current.recordedProfileChange("plotter"));
    expect(result.current.activeProfileId).toBe("plotter");
    expect(result.current.history.canUndo).toBe(true);

    // Undo the switch → back to laser. Crucially, history was NOT cleared, so the
    // pre-switch recolor is STILL undoable.
    act(() => result.current.history.undo());
    expect(result.current.activeProfileId).toBe("laser");
    expect(result.current.history.canUndo).toBe(true);

    // Undo again → the recolor reverts to the original seed color.
    act(() => result.current.history.undo());
    expect(
      result.current.operations.find((o) => o.id === "op-cut").color
    ).toBe("#FF0000");
    expect(result.current.history.canUndo).toBe(false);
  });
});
