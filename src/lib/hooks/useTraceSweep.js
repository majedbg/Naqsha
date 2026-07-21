// useTraceSweep — per-motif toolpath rehearsal (issue #91 "Trace"). Pressing
// Trace on a motif row lights that motif's placed instances ON THE REAL CANVAS in
// placement order at a CONSTANT mechanical rate, each instance STAYING lit
// (accumulates like ink laid down). A second press stops and clears. Only one
// trace runs document-wide (starting another stops the first). The lit prefix is
// exposed as `progressIndex`; the TraceOverlay renders placements[0..progressIndex)
// and the lit mode row's RhythmStrip scrubs its marker to `frac`.
//
// CONSTANT RATE — deliberately the ONE place patient motion is refused: the sweep
// steps at ~15 instances/sec (a mechanical read, not an eased UI flourish), with a
// min-total floor so a handful of instances still take ~1.5s to read rather than
// flashing by. The index advances at the STEP rate (~15Hz), never per rAF frame
// (60Hz): the loop derives the lit count from wall-clock elapsed and only calls
// setProgressIndex when that count actually changes (perf: no 60Hz React churn).
//
// prefers-reduced-motion — no autoplay. A Trace press switches to `manual` mode:
// the row reveals a range scrubber whose value drives `progressIndex` directly
// (scrub), so the accumulation is hand-scrubbed instead of animated. The signal
// is INJECTED (a param, reused from Studio's existing prefersReducedMotion) so the
// hook stays a pure function of its inputs — no second matchMedia listener.
//
// TRUNCATION — when a motif is capped by MAX_PLACEMENTS the positions array (and
// thus `count`) is already the post-cap prefix, so the sweep naturally ends at the
// cap, making the truncation point visible with no extra UI.
import { useCallback, useEffect, useRef, useState } from "react";

// Constant mechanical sweep rate + the readability floor for tiny counts.
const RATE_HZ = 15;
const MS_PER_STEP = 1000 / RATE_HZ; // ~66.7ms — the fast, count-independent rate
const MIN_TOTAL_MS = 1500; // no sweep reads in under ~1.5s, however few instances

/**
 * Milliseconds each instance stays "the newest lit one" — the constant rate,
 * stretched only when the whole sweep would otherwise finish under MIN_TOTAL_MS.
 * @param {number} count post-cap placement count for the traced motif
 * @returns {number}
 */
export function stepDurationMs(count) {
  if (!count || count <= 0) return MS_PER_STEP;
  return Math.max(MS_PER_STEP, MIN_TOTAL_MS / count);
}

/**
 * @param {{ getCount:(motifId:string)=>number, prefersReducedMotion?:boolean }} args
 *   getCount — reads the traced motif's post-cap placement count at press time
 *   (closes over the render seam's positions map; captured into a ref so a fresh
 *   inline function each render never staleness-traps the loop).
 * @returns {{ activeMotifId:string|null, activeCount:number, progressIndex:number,
 *   playing:boolean, mode:'idle'|'auto'|'manual', frac:number,
 *   toggle:(motifId:string)=>void, scrub:(index:number)=>void, stop:()=>void }}
 */
export default function useTraceSweep({ getCount, prefersReducedMotion = false } = {}) {
  const [activeMotifId, setActiveMotifId] = useState(null);
  const [activeCount, setActiveCount] = useState(0);
  const [progressIndex, setProgressIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("idle"); // 'idle' | 'auto' | 'manual'

  // Live reads for callbacks so a fresh inline getCount / a changed reduced-motion
  // preference is honored without re-creating the stable toggle/scrub identities.
  const getCountRef = useRef(getCount);
  const reducedRef = useRef(prefersReducedMotion);
  const activeCountRef = useRef(0);
  useEffect(() => {
    getCountRef.current = getCount;
  });
  useEffect(() => {
    reducedRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);
  useEffect(() => {
    activeCountRef.current = activeCount;
  }, [activeCount]);

  const rafRef = useRef(null);
  // Stable (state setters + the raf ref are all stable), so the callbacks that
  // depend on them keep stable identities too — the toggle/stop the row binds
  // never churn.
  const clearRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearState = useCallback(() => {
    clearRaf();
    setActiveCount(0);
    setProgressIndex(0);
    setPlaying(false);
    setMode("idle");
  }, [clearRaf]);

  const stop = useCallback(() => {
    clearState();
    setActiveMotifId(null);
  }, [clearState]);

  const toggle = useCallback((motifId) => {
    setActiveMotifId((cur) => {
      // Second press on the SAME motif → stop + clear (marks come off canvas).
      if (cur === motifId) {
        clearState();
        return null;
      }
      // Start (or switch): reading count at press time. Empty motif → no-op, so a
      // motif that placed nothing never arms an invisible, un-clearable trace.
      const count = (getCountRef.current ? getCountRef.current(motifId) : 0) || 0;
      clearRaf();
      if (count <= 0) {
        clearState();
        return null;
      }
      setActiveCount(count);
      setProgressIndex(0);
      if (reducedRef.current) {
        // No autoplay — the row reveals a manual scrubber (mode 'manual').
        setPlaying(false);
        setMode("manual");
      } else {
        setPlaying(true);
        setMode("auto");
      }
      return motifId;
    });
  }, [clearRaf, clearState]);

  // Manual (reduced-motion) scrub — set the lit prefix directly, clamped.
  const scrub = useCallback((index) => {
    const max = activeCountRef.current;
    const clamped = Math.max(0, Math.min(max, Math.round(index)));
    setProgressIndex(clamped);
  }, []);

  // Auto sweep. Wall-clock derived so dropped frames never desync the rate: the
  // lit count is floor(elapsed / step), and we setProgressIndex ONLY when it
  // changes (≈15Hz), not on every 60Hz frame. Completion stops playing but keeps
  // activeMotifId (accumulated marks stay lit until the next press).
  useEffect(() => {
    if (mode !== "auto" || !playing || activeCount <= 0) return undefined;
    const step = stepDurationMs(activeCount);
    const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const origin = clock();
    const tick = () => {
      const elapsed = clock() - origin;
      const next = Math.min(activeCount, Math.floor(elapsed / step));
      setProgressIndex((prev) => (prev === next ? prev : next));
      if (next >= activeCount) {
        // Full sweep laid down — freeze lit, stop scheduling. activeMotifId stays.
        rafRef.current = null;
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => clearRaf();
  }, [mode, playing, activeCount, activeMotifId, clearRaf]);

  // Cancel any in-flight frame on unmount.
  useEffect(() => clearRaf, [clearRaf]);

  const frac = activeCount > 0 ? progressIndex / activeCount : 0;

  return {
    activeMotifId,
    activeCount,
    progressIndex,
    playing,
    mode,
    frac,
    toggle,
    scrub,
    stop,
  };
}
