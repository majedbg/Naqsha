import { useCallback, useEffect, useRef, useState } from "react";

// useMeasuredWidth — measure an element's content-box width with a
// ResizeObserver, guarded so jsdom (no RO) and SSR never crash. Mirrors the
// InspectorShelf pattern: width stays `null` until measured, so every CALLER
// MUST supply a sensible unmeasured fallback (do NOT treat null as 0 — the
// comparison `null < N` coerces to `0 < N` and lies).
//
// Returns `[ref, width]`. `ref` is a callback ref: attach it to the element to
// measure. The width tracks that element across layout changes (a resized
// panel, a stacked→side-by-side reflow) and drives width-based layout choices
// that a viewport media query can't see (the element lives in a resizable
// sub-column, not at a fixed breakpoint).
export function useMeasuredWidth() {
  const [width, setWidth] = useState(null);
  const roRef = useRef(null);

  const ref = useCallback((node) => {
    // Detach any prior observer before (re)binding — a callback ref fires with
    // null on unmount and with the node on mount.
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!node || typeof ResizeObserver === "undefined") return;

    // Seed synchronously so the first committed paint already has a width
    // (avoids a one-frame flash of the unmeasured fallback layout).
    const seed = node.getBoundingClientRect().width;
    if (seed > 0) setWidth(seed);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect?.width;
        if (typeof w === "number") setWidth(w);
      }
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);

  useEffect(
    () => () => {
      if (roRef.current) roRef.current.disconnect();
    },
    []
  );

  return [ref, width];
}

export default useMeasuredWidth;
