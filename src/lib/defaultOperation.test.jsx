// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import useLayers from "./useLayers.js";

// Issue #11 (Lane C / C2), edge case (d): with NOTHING selected, the operation
// picker sets the document default operation for the NEXT added layer. useLayers
// accepts a `getDefaultOperationId` getter; addLayer applies it to the new layer.
// When omitted (legacy), the new layer defaults to Cut (op-cut) — byte-stable.

describe("useLayers — addLayer honors the document default operation", () => {
  beforeEach(() => localStorage.clear());

  it("a new layer gets the document default operationId", () => {
    let defaultOpId = "op-cut";
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: false, getDefaultOperationId: () => defaultOpId })
    );
    defaultOpId = "op-engrave";
    act(() => result.current.addLayer());
    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.operationId).toBe("op-engrave");
  });

  it("without a getter (legacy), a new layer defaults to op-cut", () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => result.current.addLayer());
    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.operationId).toBe("op-cut");
  });

  it("the default getter does not retroactively change existing layers", () => {
    let defaultOpId = "op-score";
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: false, getDefaultOperationId: () => defaultOpId })
    );
    const firstId = result.current.layers[0].id;
    const firstOp = result.current.layers[0].operationId;
    act(() => result.current.addLayer());
    expect(result.current.layers.find((l) => l.id === firstId).operationId).toBe(firstOp);
    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.operationId).toBe("op-score");
  });
});
