// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useColorView, { COLOR_VIEW_STORAGE_KEY } from "./useColorView";
import { DEFAULT_PREVIEW_MATERIALS } from "../materialPreview";

beforeEach(() => {
  localStorage.clear();
});

describe("useColorView — defaults", () => {
  it("fresh load defaults to Operation with no material", () => {
    const { result } = renderHook(() => useColorView());
    expect(result.current.mode).toBe("operation");
    expect(result.current.material).toBeNull();
    expect(result.current.colorView).toEqual({ mode: "operation", material: null, markContrast: 0 });
  });

  it("defaults the material list to DEFAULT_PREVIEW_MATERIALS", () => {
    const { result } = renderHook(() => useColorView());
    expect(result.current.materials).toBe(DEFAULT_PREVIEW_MATERIALS);
  });
});

describe("useColorView — selection + resolution", () => {
  it("selectMaterial switches to material mode and resolves the object", () => {
    const { result } = renderHook(() => useColorView());
    act(() => result.current.selectMaterial("green-fluorescent"));
    expect(result.current.mode).toBe("material");
    expect(result.current.material).toMatchObject({ id: "green-fluorescent", hex: "#E6E954" });
    expect(result.current.colorView.material.id).toBe("green-fluorescent");
  });

  it("material mode with no valid id flags needsMaterialChoice", () => {
    const { result } = renderHook(() => useColorView());
    act(() => result.current.setMode("material"));
    expect(result.current.material).toBeNull();
    expect(result.current.needsMaterialChoice).toBe(true);
  });

  it("an id absent from the list resolves to null without losing the id", () => {
    const { result } = renderHook(() => useColorView({ materials: [] }));
    act(() => result.current.selectMaterial("green-fluorescent"));
    expect(result.current.materialId).toBe("green-fluorescent");
    expect(result.current.material).toBeNull();
  });
});

describe("useColorView — persistence", () => {
  it("persists mode + materialId to its own key", () => {
    const { result } = renderHook(() => useColorView());
    act(() => result.current.selectMaterial("clear"));
    const saved = JSON.parse(localStorage.getItem(COLOR_VIEW_STORAGE_KEY));
    expect(saved).toEqual({ mode: "material", materialId: "clear", markContrast: 0 });
  });

  it("restores the persisted choice on remount", () => {
    localStorage.setItem(
      COLOR_VIEW_STORAGE_KEY,
      JSON.stringify({ mode: "material", materialId: "walnut-plywood" }),
    );
    const { result } = renderHook(() => useColorView());
    expect(result.current.mode).toBe("material");
    expect(result.current.material).toMatchObject({ id: "walnut-plywood" });
  });

  it("ignores a corrupt blob and falls back to Operation", () => {
    localStorage.setItem(COLOR_VIEW_STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useColorView());
    expect(result.current.mode).toBe("operation");
  });
});

describe("useColorView — cut/score visibility bias (markContrast)", () => {
  it("defaults to 0 (accurate) and rides the colorView object", () => {
    const { result } = renderHook(() => useColorView());
    expect(result.current.markContrast).toBe(0);
    expect(result.current.colorView.markContrast).toBe(0);
  });

  it("setMarkContrast clamps into [-1, 1] and rejects non-finite values", () => {
    const { result } = renderHook(() => useColorView());
    act(() => result.current.setMarkContrast(0.4));
    expect(result.current.markContrast).toBe(0.4);
    act(() => result.current.setMarkContrast(5));
    expect(result.current.markContrast).toBe(1);
    act(() => result.current.setMarkContrast(-5));
    expect(result.current.markContrast).toBe(-1);
    act(() => result.current.setMarkContrast(NaN));
    expect(result.current.markContrast).toBe(0);
  });

  it("persists with the lens and restores on a fresh mount", () => {
    const first = renderHook(() => useColorView());
    act(() => first.result.current.setMarkContrast(-0.35));
    first.unmount();
    const saved = JSON.parse(localStorage.getItem(COLOR_VIEW_STORAGE_KEY));
    expect(saved.markContrast).toBe(-0.35);
    const second = renderHook(() => useColorView());
    expect(second.result.current.markContrast).toBe(-0.35);
  });

  it("a corrupt persisted markContrast degrades to 0", () => {
    localStorage.setItem(COLOR_VIEW_STORAGE_KEY, JSON.stringify({ mode: "material", materialId: null, markContrast: "boom" }));
    const { result } = renderHook(() => useColorView());
    expect(result.current.markContrast).toBe(0);
  });
});
