import { useState, useRef, useCallback, useEffect } from "react";

// usePanelHeight — resizable + persisted height for the inspector dock's bottom
// shelf (WI-2, inspector-dock spec Q6). Y-axis twin of usePanelWidth.
//
// The hook owns the height state and the drag / double-click handlers. Two rules
// are load-bearing:
//   1. Persistence is IMPERATIVE — localStorage is written only on drag-END and
//      on double-click reset, never via a reactive effect. A mid-drag move
//      updates state but must not touch storage.
//   2. Load clamps to [MIN, MAX]; garbage/NaN falls back to DEFAULT (note: a
//      finite-but-out-of-range value clamps, it does NOT fall back to default).
//
// Drag-direction nuance: the resize handle sits on the shelf's TOP edge, so
// dragging UP (clientY decreases) INCREASES height:
//   next = clamp(startHeight - (clientY - startY)).
//
// Drag math reads startY / startHeight from refs (captured at mousedown) so the
// window mousemove handler can't go stale. Window listeners + the <body> drag
// affordances are torn down in an effect cleanup so an unmount mid-drag never
// leaks.

export const STORAGE_KEY = "ui.inspectorDockHeight";
export const DEFAULT_HEIGHT = 280;
export const MIN_HEIGHT = 160;
export const MAX_HEIGHT = 520;

function clampHeight(h) {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));
}

// Parse + clamp the stored height. Garbage/NaN -> DEFAULT; a finite value is
// clamped into range (so 999 -> 520, 50 -> 160).
function loadHeight() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_HEIGHT;
  }
  if (raw == null) return DEFAULT_HEIGHT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HEIGHT;
  return clampHeight(n);
}

function persist(h) {
  try {
    localStorage.setItem(STORAGE_KEY, String(h));
  } catch {
    /* storage unavailable — height still works in-session */
  }
}

export default function usePanelHeight() {
  const [height, setHeight] = useState(loadHeight);
  const [isDragging, setIsDragging] = useState(false);

  // Captured at mousedown so the window mousemove handler never reads stale
  // state. latestHeight mirrors `height` for the mouseup persist (avoids a stale
  // closure on the value we save).
  const startY = useRef(0);
  const startHeight = useRef(0);
  const latestHeight = useRef(height);
  latestHeight.current = height;

  // Toggle the <body> drag affordances (text-select off + row-resize cursor)
  // for the drag duration only.
  const setBodyDragging = useCallback((on) => {
    document.body.classList.toggle("select-none", on);
    document.body.style.cursor = on ? "row-resize" : "";
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
      startY.current = e.clientY;
      startHeight.current = latestHeight.current;

      const onMove = (ev) => {
        // Top-edge handle: dragging up (clientY decreases) grows the shelf.
        const next = clampHeight(startHeight.current - (ev.clientY - startY.current));
        setHeight(next);
      };
      const onUp = () => {
        endDrag();
        persist(latestHeight.current);
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
    setHeight(DEFAULT_HEIGHT);
    persist(DEFAULT_HEIGHT);
  }, []);

  // Tear down listeners + body affordances if we unmount mid-drag (no leaks).
  useEffect(() => endDrag, [endDrag]);

  return { height, isDragging, onMouseDown, onDoubleClick };
}
