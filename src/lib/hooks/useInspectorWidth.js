import { useState, useRef, useCallback, useEffect } from "react";

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

function clampWidth(w) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

// Parse + clamp the stored width. Garbage/NaN -> DEFAULT; a finite value is
// clamped into range (so 999 -> 560, 50 -> 288).
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
  return clampWidth(n);
}

function persist(w) {
  try {
    localStorage.setItem(STORAGE_KEY, String(w));
  } catch {
    /* storage unavailable — width still works in-session */
  }
}

export default function useInspectorWidth() {
  const [width, setWidth] = useState(loadWidth);
  const [isDragging, setIsDragging] = useState(false);

  // Captured at mousedown so the window mousemove handler never reads stale
  // state. latestWidth mirrors `width` for the mouseup persist (avoids a stale
  // closure on the value we save).
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(width);
  latestWidth.current = width;

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
        const next = clampWidth(startWidth.current - (ev.clientX - startX.current));
        setWidth(next);
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
    setWidth(DEFAULT_WIDTH);
    persist(DEFAULT_WIDTH);
  }, []);

  // Tear down listeners + body affordances if we unmount mid-drag (no leaks).
  useEffect(() => endDrag, [endDrag]);

  return { width, isDragging, onMouseDown, onDoubleClick };
}
