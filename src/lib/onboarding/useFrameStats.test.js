// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  computeFrameStats,
  useFrameStats,
  EMPTY_FRAME_STATS,
  FRAME_STATS_SAMPLE_WINDOW_MS,
} from "./useFrameStats";

describe("computeFrameStats (pure fps math)", () => {
  it("returns the empty snapshot for no deltas", () => {
    expect(computeFrameStats([])).toEqual(EMPTY_FRAME_STATS);
    expect(computeFrameStats(null)).toEqual(EMPTY_FRAME_STATS);
    expect(computeFrameStats(undefined)).toEqual(EMPTY_FRAME_STATS);
  });

  it("computes 60fps from a steady 16.667ms cadence", () => {
    const deltas = new Array(30).fill(1000 / 60);
    const stats = computeFrameStats(deltas);
    expect(stats.fps).toBeCloseTo(60, 0);
    expect(stats.avgFrameMs).toBeCloseTo(16.667, 1);
    expect(stats.maxFrameMs).toBeCloseTo(16.667, 1);
    expect(stats.samples).toBe(30);
  });

  it("computes ~30fps from a steady 33.33ms cadence", () => {
    const stats = computeFrameStats(new Array(15).fill(1000 / 30));
    expect(stats.fps).toBeCloseTo(30, 0);
  });

  it("uses the average, not the max, for the fps figure — one dropped frame among many good ones shouldn't crater the reading", () => {
    const deltas = [...new Array(9).fill(16.67), 100]; // one long stall
    const stats = computeFrameStats(deltas);
    expect(stats.maxFrameMs).toBeCloseTo(100, 0);
    // avg = (9*16.67 + 100) / 10 = ~25 -> fps ~40, well below 60 but not near 10
    expect(stats.fps).toBeGreaterThan(35);
    expect(stats.fps).toBeLessThan(45);
  });

  it("never divides by zero when a delta is exactly 0", () => {
    const stats = computeFrameStats([0, 0]);
    expect(stats.fps).toBe(0);
    expect(Number.isFinite(stats.fps)).toBe(true);
  });
});

describe("useFrameStats (rAF-driven hook)", () => {
  let rafCallbacks;
  let now;
  let rafHandle;

  beforeEach(() => {
    rafCallbacks = new Map();
    rafHandle = 0;
    now = 0;
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      rafHandle += 1;
      rafCallbacks.set(rafHandle, cb);
      return rafHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle) => {
      rafCallbacks.delete(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Manually drive the mocked rAF queue forward by one simulated frame at a
  // fixed cadence, the way a real browser would call back with a timestamp.
  function flushFrame(deltaMs) {
    now += deltaMs;
    const pending = Array.from(rafCallbacks.entries());
    rafCallbacks.clear();
    act(() => {
      for (const [, cb] of pending) cb(now);
    });
  }

  it("schedules no rAF at all while disabled", () => {
    renderHook(() => useFrameStats(false));
    expect(rafCallbacks.size).toBe(0);
  });

  it("returns the empty snapshot before any full sample window has elapsed", () => {
    const { result } = renderHook(() => useFrameStats(true));
    flushFrame(0); // first tick just seeds lastTs, no delta yet
    flushFrame(16.67);
    expect(result.current).toEqual(EMPTY_FRAME_STATS);
  });

  it("publishes a ~60fps snapshot once a full sample window of steady 16.67ms frames elapses", () => {
    const { result } = renderHook(() => useFrameStats(true));
    flushFrame(0);
    const frameCount = Math.ceil(FRAME_STATS_SAMPLE_WINDOW_MS / 16.67) + 1;
    for (let i = 0; i < frameCount; i += 1) flushFrame(16.67);
    expect(result.current.fps).toBeCloseTo(60, 0);
    expect(result.current.samples).toBeGreaterThan(0);
  });

  it("stops scheduling rAF once disabled and resets to the empty snapshot", () => {
    const { result, rerender } = renderHook(({ enabled }) => useFrameStats(enabled), {
      initialProps: { enabled: true },
    });
    flushFrame(0);
    flushFrame(16.67);
    rerender({ enabled: false });
    expect(result.current).toEqual(EMPTY_FRAME_STATS);
    expect(rafCallbacks.size).toBe(0);
  });
});
