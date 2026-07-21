// @vitest-environment jsdom
//
// useTraceSweep — per-motif toolpath rehearsal state (issue #91 "Trace"). The
// hook owns {activeMotifId, progressIndex, playing, mode} and advances the lit
// prefix at a CONSTANT mechanical rate (~15/sec, with a min-total floor for tiny
// counts) via rAF. These tests drive rAF + performance.now under fake control so
// the accumulator's step boundaries are asserted deterministically — the one
// fiddly piece worth nailing red first.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTraceSweep, { stepDurationMs } from "./useTraceSweep";

describe("stepDurationMs (constant rate + min-total floor)", () => {
  it("holds ~15/sec for large counts", () => {
    // 100 instances → 1000/15 dominates (6.67s total), NOT the 1.5s floor.
    expect(stepDurationMs(100)).toBeCloseTo(1000 / 15, 5);
  });
  it("stretches to a ~1.5s total floor for tiny counts", () => {
    // 5 instances at 15/sec would be 333ms — too quick to read; floor to 1.5s.
    expect(stepDurationMs(5)).toBeCloseTo(1500 / 5, 5); // 300ms/step → 1.5s total
    expect(stepDurationMs(2)).toBeCloseTo(1500 / 2, 5); // 750ms/step → 1.5s total
  });
  it("is safe for zero / empty counts", () => {
    expect(stepDurationMs(0)).toBeCloseTo(1000 / 15, 5);
  });
});

describe("useTraceSweep", () => {
  let now;
  let rafCbs;

  beforeEach(() => {
    now = 0;
    rafCbs = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Advance the fake clock by `ms` then flush the pending rAF frame(s). Each tick
  // reschedules itself, so we snapshot-and-clear before running so a single
  // advance runs exactly one frame's worth of callbacks.
  const advance = (ms) => {
    now += ms;
    act(() => {
      const cbs = rafCbs;
      rafCbs = [];
      cbs.forEach((cb) => cb(now));
    });
  };

  const setup = (counts = { m1: 10 }, prefersReducedMotion = false) => {
    const getCount = (id) => counts[id] ?? 0;
    return renderHook(
      ({ reduced }) => useTraceSweep({ getCount, prefersReducedMotion: reduced }),
      { initialProps: { reduced: prefersReducedMotion } }
    );
  };

  it("defaults to idle (no active motif, nothing lit)", () => {
    const { result } = setup();
    expect(result.current.activeMotifId).toBe(null);
    expect(result.current.progressIndex).toBe(0);
    expect(result.current.playing).toBe(false);
    expect(result.current.mode).toBe("idle");
    expect(result.current.frac).toBe(0);
  });

  it("toggling a motif starts an auto sweep at index 0", () => {
    const { result } = setup({ m1: 10 });
    act(() => result.current.toggle("m1"));
    expect(result.current.activeMotifId).toBe("m1");
    expect(result.current.playing).toBe(true);
    expect(result.current.mode).toBe("auto");
    expect(result.current.progressIndex).toBe(0);
  });

  it("advances the lit prefix one instance per step (constant rate)", () => {
    const { result } = setup({ m1: 10 }); // step = max(66.7, 150) = 150ms
    act(() => result.current.toggle("m1"));
    advance(150);
    expect(result.current.progressIndex).toBe(1);
    advance(150);
    expect(result.current.progressIndex).toBe(2);
    advance(300); // two steps at once (dropped frames) → jumps by 2
    expect(result.current.progressIndex).toBe(4);
  });

  it("does NOT advance the index on sub-step frames (15Hz, not 60Hz)", () => {
    const { result } = setup({ m1: 10 }); // 150ms/step
    act(() => result.current.toggle("m1"));
    advance(50);
    expect(result.current.progressIndex).toBe(0);
    advance(50);
    expect(result.current.progressIndex).toBe(0);
    advance(50); // now at 150ms → first step
    expect(result.current.progressIndex).toBe(1);
  });

  it("completes at the cap, stops playing, and STAYS lit (accumulated ink)", () => {
    const { result } = setup({ m1: 4 }); // step = 1500/4 = 375ms, total 1500
    act(() => result.current.toggle("m1"));
    advance(1500);
    expect(result.current.progressIndex).toBe(4);
    expect(result.current.playing).toBe(false);
    // Still the active motif — the marks remain on canvas until the next press.
    expect(result.current.activeMotifId).toBe("m1");
    expect(result.current.frac).toBe(1);
  });

  it("a second press on the active motif stops and clears", () => {
    const { result } = setup({ m1: 10 });
    act(() => result.current.toggle("m1"));
    advance(300);
    expect(result.current.progressIndex).toBe(2);
    act(() => result.current.toggle("m1"));
    expect(result.current.activeMotifId).toBe(null);
    expect(result.current.progressIndex).toBe(0);
    expect(result.current.playing).toBe(false);
  });

  it("starting another trace stops the first (one at a time)", () => {
    const { result } = setup({ m1: 10, m2: 20 });
    act(() => result.current.toggle("m1"));
    advance(300);
    act(() => result.current.toggle("m2"));
    expect(result.current.activeMotifId).toBe("m2");
    expect(result.current.progressIndex).toBe(0);
    expect(result.current.playing).toBe(true);
    expect(result.current.activeCount).toBe(20);
  });

  it("toggling a motif with no placements is a no-op", () => {
    const { result } = setup({ empty: 0 });
    act(() => result.current.toggle("empty"));
    expect(result.current.activeMotifId).toBe(null);
    expect(result.current.playing).toBe(false);
  });

  it("frac tracks progress as a 0→1 fraction", () => {
    const { result } = setup({ m1: 10 });
    act(() => result.current.toggle("m1"));
    advance(150 * 5); // 5 of 10
    expect(result.current.progressIndex).toBe(5);
    expect(result.current.frac).toBeCloseTo(0.5, 5);
  });

  describe("prefers-reduced-motion", () => {
    it("does NOT autoplay — reveals a manual scrubber instead", () => {
      const { result } = setup({ m1: 10 }, true);
      act(() => result.current.toggle("m1"));
      expect(result.current.activeMotifId).toBe("m1");
      expect(result.current.mode).toBe("manual");
      expect(result.current.playing).toBe(false);
      expect(result.current.progressIndex).toBe(0);
      // No rAF was scheduled — nothing advances on its own.
      advance(5000);
      expect(result.current.progressIndex).toBe(0);
    });

    it("scrub sets the lit prefix and clamps to [0, count]", () => {
      const { result } = setup({ m1: 10 }, true);
      act(() => result.current.toggle("m1"));
      act(() => result.current.scrub(3));
      expect(result.current.progressIndex).toBe(3);
      expect(result.current.frac).toBeCloseTo(0.3, 5);
      act(() => result.current.scrub(999));
      expect(result.current.progressIndex).toBe(10);
      act(() => result.current.scrub(-4));
      expect(result.current.progressIndex).toBe(0);
    });
  });
});
