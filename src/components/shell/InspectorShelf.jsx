// InspectorShelf — WI-3. PURE LAYOUT over whatever children it is given.
//
// When the Inspector docks to the bottom shelf (portrait / iPad), its parameter
// groups should flow into a responsive multi-column grid instead of one tall
// vertical scroll. This component takes its DIRECT children (ParamGroups, or
// group-level blocks) and columnizes them.
//
// DESIGN: the column count is computed in JS from a width, NOT delegated to CSS
// `auto-fill`. jsdom does no CSS layout — it cannot resolve
// `repeat(auto-fill, minmax(256px, 1fr))` into real tracks, and
// getBoundingClientRect() returns zeros — so an auto-fill approach could not be
// asserted deterministically. Computing `columnCount(width)` in JS makes the
// "2–3 columns at 768px" gate a real, passing jsdom test.
//
// PURE: this component does not restructure children. Each child keeps its own
// internal vertical stack; we only place it as one atomic grid item so a group
// never splits across columns.

import { useEffect, useRef, useState, Children } from "react";

// px floor so a column never drops below ~240px. The widest composite controls
// (Pad2D / AngleDial ≈ 104px) fit comfortably inside a 256px column.
export const MIN_COLUMN = 256;

// Pure: how many columns fit in `width`. Always >= 1; never 0; never NaN.
export function columnCount(width) {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.floor(width / MIN_COLUMN));
}

export default function InspectorShelf({ children, width }) {
  const ref = useRef(null);

  // Production measurement seam: when `width` is not passed, measure the
  // container's own width with a ResizeObserver. Tests pass `width` directly and
  // bypass this entirely. Guarded so jsdom (no ResizeObserver) never crashes.
  const [measured, setMeasured] = useState(null);
  useEffect(() => {
    if (width != null) return; // explicit width wins; no observer needed
    if (typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (Number.isFinite(w) && w > 0) setMeasured(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // Effective width: explicit prop → measured → sane fallback (1 column).
  const effectiveWidth = width != null ? width : measured != null ? measured : MIN_COLUMN;
  const n = columnCount(effectiveWidth);

  // toArray drops null/false/undefined children and gives each a stable key, so
  // empty children produce zero grid items (no empty columns).
  const items = Children.toArray(children);

  return (
    <div
      ref={ref}
      data-testid="inspector-shelf-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        gap: "0.75rem",
      }}
    >
      {items.map((child, i) => (
        // min-w-0 lets a fixed-width composite (e.g. a 104px Pad2D) sit inside a
        // grid track without forcing the track wider or overflowing.
        <div key={i} className="min-w-0">
          {child}
        </div>
      ))}
    </div>
  );
}
