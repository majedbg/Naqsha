import { useState, useRef, useCallback, useEffect } from "react";
import {
  STORAGE_KEY as LEFT_STORAGE_KEY,
  DEFAULT_WIDTH as LEFT_DEFAULT_WIDTH,
  MIN_WIDTH as LEFT_MIN_WIDTH,
  MAX_WIDTH as LEFT_MAX_WIDTH,
} from "./usePanelWidth";

// useInspectorWidth — resizable + persisted width for the pro shell's right-hand
// Inspector column. X-axis mirror of usePanelWidth (the left panel).
//
// The hook owns the width state and the drag / double-click handlers. Two rules
// are load-bearing:
//   1. Persistence is IMPERATIVE — localStorage is written only on drag-END and
//      on double-click reset, never via a reactive effect. A mid-drag move
//      updates state but must not touch storage.
//   2. Load clamps to [MIN, MAX]; garbage/NaN falls back to DEFAULT (note: a
//      finite-but-out-of-range value clamps, it does NOT fall back to default).
//
// Drag-direction nuance: the resize handle sits on the column's LEFT edge (the
// inspector is the rightmost column), so dragging LEFT (clientX decreases)
// INCREASES width — the inverse of usePanelWidth:
//   next = clamp(startWidth - (clientX - startX)).
//
// MIN === DEFAULT === 288 is deliberate, and diverges from the left panel (where
// reset lands mid-range). 288px is the historical `w-72` rail: the inspector is
// already tight at that size, so the feature only ever grows it. A double-click
// therefore reads as "back to the compact rail", not "back to the middle".
//
// Drag math reads startX / startWidth from refs (captured at mousedown) so the
// window mousemove handler can't go stale. Window listeners + the <body> drag
// affordances are torn down in an effect cleanup so an unmount mid-drag never
// leaks.

export const STORAGE_KEY = "ui.inspectorWidth";
export const DEFAULT_WIDTH = 288;
export const MIN_WIDTH = 288;
export const MAX_WIDTH = 560;

// Viewport guard. Unlike the left panel, this rail is wide enough to erase the
// canvas: the shell renders down to 768px (SHELL_MIN_WIDTH in StudioRoute), and
// a 560 rail persisted on a large monitor would reopen on a laptop with the
// canvas collapsed — both side columns are `shrink-0`, so the `flex-1` canvas is
// what yields. Measured, not theoretical: a 768px viewport with 560 stored gave
// a 2px canvas.
//
// So MAX is a ceiling, not a promise: the effective max also leaves room for the
// tool strip, the left rail at ITS current width, and a canvas floor. MIN always
// wins — the rail never drops below today's 288 no matter how tight it gets
// (that case is the pre-existing status quo, unchanged by this feature).
export const TOOL_STRIP_WIDTH = 48;
export const CANVAS_FLOOR = 320;

// The left rail's live width, read from ITS storage (not a duplicated constant)
// so a user who widened the left panel doesn't get to double-book the same px.
function leftRailWidth() {
  let raw = null;
  try {
    raw = localStorage.getItem(LEFT_STORAGE_KEY);
  } catch {
    return LEFT_DEFAULT_WIDTH;
  }
  if (raw == null) return LEFT_DEFAULT_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return LEFT_DEFAULT_WIDTH;
  return Math.min(LEFT_MAX_WIDTH, Math.max(LEFT_MIN_WIDTH, n));
}

// The widest the rail may render at this viewport. Never below MIN_WIDTH, never
// above MAX_WIDTH. An unknown/absurd viewport yields the full range.
export function maxWidthForViewport(viewportWidth) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return MAX_WIDTH;
  const room = viewportWidth - TOOL_STRIP_WIDTH - leftRailWidth() - CANVAS_FLOOR;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, room));
}

function clampWidth(w, viewportWidth) {
  return Math.min(maxWidthForViewport(viewportWidth), Math.max(MIN_WIDTH, w));
}

// Parse + clamp the stored width to the STATIC range only — the viewport clamp
// is applied at render, so a width stored on a big monitor survives a stint on a
// small one instead of being permanently ratcheted down.
function loadWidth() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_WIDTH;
  }
  if (raw == null) return DEFAULT_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

function persist(w) {
  try {
    localStorage.setItem(STORAGE_KEY, String(w));
  } catch {
    /* storage unavailable — width still works in-session */
  }
}

export default function useInspectorWidth() {
  // `preferred` is what the user chose and what we persist; `width` (below) is
  // that intent clamped to the CURRENT viewport. Keeping them separate means
  // shrinking the window narrows the rail without forgetting the preference —
  // widen the window again and the chosen width comes back.
  const [preferred, setPreferred] = useState(loadWidth);
  const [isDragging, setIsDragging] = useState(false);

  // Viewport width, tracked so the render clamp re-runs on window resize.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = clampWidth(preferred, viewportWidth);

  // Captured at mousedown so the window mousemove handler never reads stale
  // state. latestWidth mirrors `width` for the mouseup persist (avoids a stale
  // closure on the value we save).
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(width);
  latestWidth.current = width;
  // Mirrored for the same reason: the mousemove handler must clamp against the
  // CURRENT viewport, not the one captured when the drag started.
  const latestViewport = useRef(viewportWidth);
  latestViewport.current = viewportWidth;

  // Toggle the <body> drag affordances (text-select off + col-resize cursor)
  // for the drag duration only.
  const setBodyDragging = useCallback((on) => {
    document.body.classList.toggle("select-none", on);
    document.body.style.cursor = on ? "col-resize" : "";
  }, []);

  // The active mouse handlers live in refs so the unmount cleanup can detach the
  // exact functions that were attached, even if the component re-rendered.
  const moveHandlerRef = useRef(null);
  const upHandlerRef = useRef(null);

  const endDrag = useCallback(() => {
    if (moveHandlerRef.current) {
      window.removeEventListener("mousemove", moveHandlerRef.current);
      moveHandlerRef.current = null;
    }
    if (upHandlerRef.current) {
      window.removeEventListener("mouseup", upHandlerRef.current);
      upHandlerRef.current = null;
    }
    setBodyDragging(false);
    setIsDragging(false);
  }, [setBodyDragging]);

  const onMouseDown = useCallback(
    (e) => {
      e?.preventDefault?.();
      startX.current = e.clientX;
      startWidth.current = latestWidth.current;

      const onMove = (ev) => {
        // Left-edge handle: dragging left (clientX decreases) grows the column.
        const next = clampWidth(
          startWidth.current - (ev.clientX - startX.current),
          latestViewport.current
        );
        setPreferred(next);
      };
      const onUp = () => {
        endDrag();
        persist(latestWidth.current);
      };

      moveHandlerRef.current = onMove;
      upHandlerRef.current = onUp;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      setBodyDragging(true);
      setIsDragging(true);
    },
    [endDrag, setBodyDragging]
  );

  const onDoubleClick = useCallback(() => {
    setPreferred(DEFAULT_WIDTH);
    persist(DEFAULT_WIDTH);
  }, []);

  // Tear down listeners + body affordances if we unmount mid-drag (no leaks).
  useEffect(() => endDrag, [endDrag]);

  return { width, isDragging, onMouseDown, onDoubleClick };
}
