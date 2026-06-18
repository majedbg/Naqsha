import { useState, useCallback } from "react";

// useCanvasView — minimal pan + zoom state the pro shell's Hand / Zoom tools
// drive (Lane B / B6, GitHub issue #9).
//
// The legacy RightPanel owns its own local zoom (wheel + buttons) and must stay
// a true no-op on the flag-OFF path, so this state is NOT lifted out of it.
// Instead the shell owns this small, separate view state; wiring the live p5
// canvas to read it is a later concern (the p5 surface is not drivable under
// jsdom). Issue #9's Hand/Zoom acceptance is asserted at this state level.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export default function useCanvasView() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z * ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z / ZOOM_STEP)), []);
  // Accepts a value or a functional updater (so it can be passed straight to a
  // controlled child as `onZoomChange`), and clamps the result either way.
  const setZoomClamped = useCallback(
    (next) =>
      setZoom((z) => clampZoom(typeof next === "function" ? next(z) : next)),
    []
  );

  const panBy = useCallback(
    (dx, dy) => setPan((p) => ({ x: p.x + dx, y: p.y + dy })),
    []
  );

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return { zoom, pan, zoomIn, zoomOut, setZoom: setZoomClamped, panBy, reset };
}
