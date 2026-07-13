// P0-B — dev-only frame-time / FPS readout (D19).
//
// D19 targets 60fps desktop / >=30fps workshop-iPad for guest live-drag, and
// explicitly allows shipping a readout instead of an on-device measurement
// when no iPad is available ("wire a frame-time readout... flag iPad as
// unverified"). This is that readout. It is NEVER shown by default — see
// FrameStatsOverlay.jsx for the `?fps=1` opt-in gate. The hook itself takes
// `enabled` as a plain boolean so its rAF loop and math are independently
// testable without touching location/query-string parsing.
//
// `computeFrameStats` is a pure function (no DOM, no timers) so the FPS math
// itself is unit-testable without mocking rAF at all; `useFrameStats` is the
// thin stateful wrapper that feeds it real frame deltas.

import { useEffect, useRef, useState } from "react";

// How often the on-screen readout updates, in ms of *measured* frame time
// (not wall-clock — a stalled tab simply delays the next update, it never
// divides by a stale window).
export const FRAME_STATS_SAMPLE_WINDOW_MS = 500;

export const EMPTY_FRAME_STATS = Object.freeze({ fps: 0, avgFrameMs: 0, maxFrameMs: 0, samples: 0 });

// Pure: turn a list of consecutive frame deltas (ms) into fps/avg/max. Never
// throws on empty input (first frame of a fresh window has no prior delta).
export function computeFrameStats(deltasMs) {
  if (!deltasMs || deltasMs.length === 0) return EMPTY_FRAME_STATS;
  let sum = 0;
  let max = 0;
  for (const d of deltasMs) {
    sum += d;
    if (d > max) max = d;
  }
  const avgFrameMs = sum / deltasMs.length;
  const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
  return { fps, avgFrameMs, maxFrameMs: max, samples: deltasMs.length };
}

// Runs a requestAnimationFrame loop while `enabled` is true, accumulating
// frame deltas and publishing a windowed { fps, avgFrameMs, maxFrameMs }
// snapshot roughly every FRAME_STATS_SAMPLE_WINDOW_MS. Does nothing (no rAF
// scheduled at all) while disabled, so this can be mounted unconditionally
// with `enabled={false}` at zero ongoing cost.
export function useFrameStats(enabled) {
  const [stats, setStats] = useState(EMPTY_FRAME_STATS);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setStats(EMPTY_FRAME_STATS);
      return undefined;
    }
    if (typeof requestAnimationFrame === "undefined") return undefined;

    let lastTs = null;
    let windowStart = null;
    let deltas = [];

    const tick = (ts) => {
      if (lastTs != null) {
        const delta = ts - lastTs;
        // Guard against a zero/negative delta (duplicate timestamp, clock
        // weirdness in some test/jsdom environments) skewing the average.
        if (delta > 0) deltas.push(delta);
      }
      lastTs = ts;
      if (windowStart == null) windowStart = ts;

      if (ts - windowStart >= FRAME_STATS_SAMPLE_WINDOW_MS && deltas.length > 0) {
        setStats(computeFrameStats(deltas));
        deltas = [];
        windowStart = ts;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled]);

  return stats;
}

export default useFrameStats;
