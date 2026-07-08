// @vitest-environment jsdom
// useGlobalMotifLibrary.test.jsx — P4-3
//
// The hook that loads a signed-in user's global motif library and promotes a
// glyph into it. Mocks the service seam (characterizes wiring, not Supabase).
// Logged-out / offline must be GRACEFUL: empty list, promote resolves to null,
// never throws to the caller.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const loadUserMotifs = vi.fn();
const saveUserMotif = vi.fn();
const deleteUserMotif = vi.fn();
vi.mock("../userMotifService", () => ({
  loadUserMotifs: (...a) => loadUserMotifs(...a),
  saveUserMotif: (...a) => saveUserMotif(...a),
  deleteUserMotif: (...a) => deleteUserMotif(...a),
}));

import useGlobalMotifLibrary from "./useGlobalMotifLibrary";

const GLYPH = { id: "local-1", name: "Flower", paths: [], viewRadius: 5 };

beforeEach(() => {
  loadUserMotifs.mockReset();
  saveUserMotif.mockReset();
  deleteUserMotif.mockReset();
  loadUserMotifs.mockResolvedValue([]);
});

describe("useGlobalMotifLibrary", () => {
  it("logged-out: no fetch, empty library, promote resolves null (no throw)", async () => {
    const { result } = renderHook(() => useGlobalMotifLibrary(null));
    expect(result.current.motifs).toEqual([]);
    expect(loadUserMotifs).not.toHaveBeenCalled();
    let out;
    await act(async () => {
      out = await result.current.promote(GLYPH);
    });
    expect(out).toBeNull();
    expect(saveUserMotif).not.toHaveBeenCalled();
  });

  it("signed-in: loads the user library on mount", async () => {
    loadUserMotifs.mockResolvedValue([{ id: "a", name: "A", glyph: GLYPH }]);
    const { result } = renderHook(() => useGlobalMotifLibrary({ id: "u1" }));
    await waitFor(() => expect(result.current.motifs).toHaveLength(1));
    expect(loadUserMotifs).toHaveBeenCalledWith("u1");
    expect(result.current.motifs[0].id).toBe("a");
  });

  it("promote: saves and prepends the new library motif", async () => {
    loadUserMotifs.mockResolvedValue([]);
    saveUserMotif.mockResolvedValue({ id: "new", name: "Flower", glyph: GLYPH });
    const { result } = renderHook(() => useGlobalMotifLibrary({ id: "u1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let out;
    await act(async () => {
      out = await result.current.promote(GLYPH);
    });
    expect(saveUserMotif).toHaveBeenCalledWith("u1", GLYPH);
    expect(out.id).toBe("new");
    expect(result.current.motifs[0].id).toBe("new");
  });

  it("promote failure surfaces error but does not throw to the caller", async () => {
    saveUserMotif.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useGlobalMotifLibrary({ id: "u1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let out;
    await act(async () => {
      out = await result.current.promote(GLYPH);
    });
    expect(out).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("load failure is graceful: empty library, error set, no throw", async () => {
    loadUserMotifs.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useGlobalMotifLibrary({ id: "u1" }));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.motifs).toEqual([]);
  });
});
