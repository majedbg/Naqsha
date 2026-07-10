import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import useCanvas from "../lib/useCanvas";
import CanvasChrome from "./canvas/CanvasChrome";
import PlotOverlay from "./canvas/PlotOverlay";
import AnchorGhostOverlay from "./canvas/AnchorGhostOverlay";
import FieldOverlay from "./FieldOverlay";
import { chladniField } from "../lib/fields/chladniField";
import { fieldForLayer } from "../lib/fields/fieldRegistry";
import { cursorToUnit } from "../lib/canvasChrome";
import { screenToCanvas } from "../lib/canvas/coords";
import { pxToUnit } from "../lib/units";
import { buildSelectables, pickTopmost } from "../lib/scene/selectables";
import { textCreateFromDrag, isTextLayer, textNodeFromLayer } from "../lib/text/textLayer";
import TextEditOverlay from "./canvas/TextEditOverlay";
import { applyMoveDelta } from "../lib/tools/moveTransform";
import {
  classifyPointer,
  rotateTransform,
  scaleTransform,
} from "../lib/tools/transformGestures";
import { ROTATE_OFFSET } from "../lib/transform/handles";
import { ghostSvg } from "../lib/scene/placement";
import { useFont } from "../lib/text/fontRegistry";
// Three-free lazy host for the 3D preview (S1). Canvas3DHost itself imports no
// three.js — it React.lazy-loads the inner Scene3D, so importing it here never
// pulls three into the 2D bundle.
import Canvas3DHost from "./canvas3d/Canvas3DHost";
// Three-free pure builder (S5): per-panel, per-process emissive mark SVGs for the
// 3D Surface-A texture path. Imports only 2D-side modules (svgExport/operations/
// panels), so referencing it here keeps three.js out of the 2D bundle.
import { buildPanelMarkSVGs } from "../lib/three3d/markTexture";
// Three-free pure resolver (S9): the guide's ACTIVE modulation-target descriptors
// for the Surface-B drape. Imports only 2D-side field libs, so it keeps three.js
// out of the 2D bundle.
import { resolveActiveTargets } from "../lib/three3d/drape";

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

const BG_PRESETS = [
  { color: "#0a1628", label: "Dark Blue" },
  { color: "#ffffff", label: "White" },
  { color: "#000000", label: "Black" },
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
// One wheel step multiplies zoom by this. Deliberately shallow (~1.1^(1/3), a
// third of the old 1.1-per-step rate) so scroll/trackpad zooming stays
// controllable.
const WHEEL_ZOOM_FACTOR = 1.033;
// Duration of the pan-recenter glide after a zoom-out leaves the whole work
// piece visible.
const GLIDE_MS = 200;

export default function RightPanel({
  layers,
  // The operation library + active machine profile, forwarded to useCanvas so
  // each layer's canvas stroke matches its export color (operation color on a
  // laser profile, the layer's own color otherwise). Default to a no-op so any
  // caller that doesn't wire them renders exactly as before.
  operations = [],
  machineProfile = null,
  // Color-view lens (spec: docs/material-preview-plan.md). Forwarded to useCanvas;
  // null → operation lens (canvas byte-identical to before). Preview-only.
  colorView = null,
  // Naqsha Panels (WI-6). Forwarded to useCanvas as its 12th/last positional arg
  // so per-panel visibility folds into the canvas render. DEFAULTS to [] so every
  // other caller (ShareView, mobile, tests) is unaffected — empty → behaves
  // exactly as before. Studio laser-gates this: it passes the real panels only in
  // laser mode and [] otherwise.
  panels = [],
  // Custom-glyph store (WI-3). Forwarded to useCanvas as its 13th/last positional
  // arg so a motif layer's glyphRef resolves against the document's imported
  // glyphs at the render seam. DEFAULTS to {} so every other caller (ShareView,
  // mobile, tests) resolves built-ins only — byte-identical to before.
  customGlyphs = {},
  // 3D preview (S1, PRD D1). `threeDMode` ∈ {'off','panel-stack','height-surface'}.
  // When != 'off' the lazy <Canvas3DHost> mounts over the canvas region and the
  // p5 surface is HIDDEN (visibility, NOT unmounted — p5 state is preserved).
  // Defaults to 'off' so every other caller (Studio plotter mode, MobileStudio,
  // ShareView, tests) renders byte-identically to before. `focusFieldLayerId`
  // is the Surface-B source guide layer (null for Surface A).
  threeDMode = "off",
  focusFieldLayerId = null,
  // Close the 3D preview overlay (the in-canvas "✕"). Routes to lensEntry.exit3D
  // in Studio, closing BOTH Surface A and Surface B back to the prior 2D view.
  // Defaults to a no-op so non-3D callers (mobile / ShareView / tests) are
  // unaffected.
  onClose3D = () => {},
  // Frozen design snapshot for the 3D scene (S3, PRD D14). Plumbed through to the
  // lazy host so Surface A geometry (later slices) reads from a point-in-time copy
  // rather than the live design. Defaults to null — every non-3D caller unaffected.
  threeDSnapshot = null,
  // Material→3D appearance (S3, spec §3.5). The LIVE selected material (already
  // mode-gated by Studio: non-null only in the Material lens), forwarded straight
  // to the 3D host — a sibling to the live spacing/exaggeration props, NOT folded
  // into threeDSnapshot, so switching material re-tints the scene without a
  // Rebuild. null (default) → Operation lens / no material → today's substrate
  // fallback, so every non-3D caller is unaffected.
  selectedMaterial = null,
  canvasW,
  canvasH,
  patternInstancesRef,
  canvasContainerRef,
  onPatternInstancesChange,
  bgColor,
  onBgColorChange,
  unit = 'mm',
  // Optional controlled view (pro shell's Hand/Zoom tools — B6 / #9). When
  // `externalZoom` is provided the canvas zoom is controlled by the shell and
  // `setZoom` updates flow through `onZoomChange`; when absent (legacy / flag-OFF
  // path) the panel keeps its own internal zoom state — byte-identical behavior.
  // `externalPan` similarly translates the artboard when the shell drives pan.
  externalZoom,
  onZoomChange,
  externalPan,
  // Canvas chrome (pro shell only — B4 / #7). When `bedSize` is supplied the
  // panel renders the mm rulers + machine-bed artboard over the canvas and
  // reports the live cursor position (in the active unit) via `onCursorMove`.
  // All three are wired ONLY on the flag-ON path, so legacy/flag-OFF stays a
  // byte-identical no-op (no chrome, no cursor tracking).
  bedSize,
  onCursorMove,
  // Machine-bed overlay toggle (reference-overlay reframe), forwarded straight
  // to CanvasChrome. Defaults to true so every existing caller renders exactly
  // as before; the work piece (artboard + rulers) is unaffected either way.
  showBed = true,
  // Plot preview + overlap overlay (pro shell only — C7 / #15). When
  // `showPlotOverlay` is true the panel renders <PlotOverlay/> as a sibling of
  // the p5 surface INSIDE the scaled wrapper, so it auto-aligns with the live
  // design and scales with the canvas transform. OFF by default (the parent
  // simply doesn't pass it / passes false) → a true no-op clean canvas, matching
  // the legacy/flag-OFF path byte-for-byte. `appliedOptimizations` selects the
  // route-preview basis (post-optimize, like the legacy PlotPreviewSection).
  showPlotOverlay = false,
  appliedOptimizations = null,
  // Run Plan machine view (issue #73 / Wave-3 Lane G). When Lane I drives the plan
  // canvas state it supplies the runPlanModel slices below; PlotOverlay switches
  // from the legacy compute-from-layers preview to the machine view (draw tinted by
  // Operation, travel dashed, crops ghosted, Sheet + Bed, animated run-through).
  // ALL default so the panel renders (and the app builds) before Lane I wires them:
  // absent `plotRoute` → PlotOverlay keeps its legacy behaviour, byte-identical.
  plotRoute = null, // route:[{type:'travel'|'draw',from,to,color}] in execution order
  plotCrops = null, // crops:[{points,closed,color,layerId}] px
  plotOpRows = null, // [{opId,color}] tint→Operation lookup for the two-way highlight
  sheetRect = null, // { x, y, width, height } px — the Sheet work-piece
  plotPlaying = false, // run the animated head
  plotLocate = null, // the shared locate target (panel row → canvas ring), PRD story 25
  onPlotLocate = () => {}, // canvas click → { opId? | layerId? } so the plan highlights the row
  onPlotPlayingChange = null, // Play/Pause toggled on canvas → Lane I observes
  prefersReducedMotion, // bool; PlotOverlay falls back to the CSS query when undefined
  // Canvas interaction (Select/Move/Resize/Rotate + Hand-pan). The shell owns
  // the active tool + selection + per-layer transforms; this panel turns raw
  // pointer events over the canvas into select/transform/pan callbacks. All
  // default to no-ops so the panel renders unchanged when the parent doesn't
  // wire interaction (mobile / legacy path / tests). `activeTool` defaults to
  // null (not "select") so the pointer overlay stays inert — a true no-op —
  // until the desktop shell explicitly drives a tool.
  activeTool = null,
  transforms = {},
  selectedNodeId = null,
  // Motif anchor-ghost overlay (click-to-override). When the selected layer is a
  // motif over a semantic host (grid/recursive/spiral), an <AnchorGhostOverlay>
  // draws candidate/placed anchor dots inside the scaled box; clicking one writes
  // a force-include/exclude override up via onUpdateLayer. No-op default so
  // callers that don't wire it (mobile / ShareView / tests) render unchanged —
  // the overlay renders (ghosts show) but a dot click is inert.
  onUpdateLayer = () => {},
  onSelect = () => {},
  onMove = () => {},
  onCommit = () => {},
  onPanBy = () => {},
  // Click-to-place mode (kit / imported assets). When `placement` is set
  // ({ svg, paths, bbox }) the overlay shows a cursor-following ghost and a
  // click commits it via `onPlaceAsset(canvasPoint)`. Null → inert (no-op).
  placement = null,
  onPlaceAsset = () => {},
  onCancelPlacement = () => {},
  // Text tool: a click/drag over the canvas creates a text layer. The geometry
  // (origin + box + lineMode) is computed by textCreateFromDrag and handed up.
  onCreateText = () => {},
  // Text edit lifecycle (phase 5). When `editingNodeId` names a text layer, the
  // on-canvas TextEditOverlay renders over it (inside the scaled box, so it
  // inherits the zoom transform). `onEditText(id, value)` writes keystrokes up;
  // `onExitEdit()` commits + closes; `onRequestEdit(id)` re-enters edit (used by
  // double-click). All default to no-ops so the panel renders unchanged without
  // the lifecycle wired (mobile / legacy / tests).
  editingNodeId = null,
  onEditText = () => {},
  onExitEdit = () => {},
  onRequestEdit = () => {},
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [internalZoom, setInternalZoom] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  // Click-to-place ghost. `ghostPoint` is the live cursor in canvas units; seeded
  // to the canvas centre so the ghost is visible the instant placement arms (the
  // cursor isn't over the canvas yet, before the first pointer move).
  const placing = !!placement;
  const [ghostPoint, setGhostPoint] = useState({ x: canvasW / 2, y: canvasH / 2 });
  // Re-seed the ghost to the canvas centre whenever a NEW placement arms (the
  // cursor isn't over the canvas yet). React's "adjust state on prop change"
  // pattern: compare against the previous prop held in state and set during
  // render (no effect, no ref write) — React re-renders immediately.
  const [armedPlacement, setArmedPlacement] = useState(placement);
  if (placement !== armedPlacement) {
    setArmedPlacement(placement);
    if (placement) setGhostPoint({ x: canvasW / 2, y: canvasH / 2 });
  }
  const ghostMarkup = useMemo(
    () => (placement ? ghostSvg(placement.paths, placement.bbox) : null),
    [placement]
  );

  // Controlled when the shell supplies a zoom value + setter; otherwise internal.
  const isControlledZoom = externalZoom != null && typeof onZoomChange === "function";
  const zoom = isControlledZoom ? externalZoom : internalZoom;
  const setZoom = useCallback(
    (next) => {
      if (isControlledZoom) {
        onZoomChange((prev) => (typeof next === "function" ? next(prev) : next));
      } else {
        setInternalZoom(next);
      }
    },
    [isControlledZoom, onZoomChange]
  );
  const pan = externalPan ?? { x: 0, y: 0 };
  // Only prepend a translate when the shell actually drives pan, so the legacy
  // (flag-OFF) transform string stays byte-identical.
  const panTransform = externalPan ? `translate(${pan.x}px, ${pan.y}px) ` : "";

  // Resolve the default text font (async; null until loaded). Threaded into
  // useCanvas so text layers can render their outlines.
  const { font: textFont } = useFont();

  const { patternInstances } = useCanvas(
    containerRef,
    layers,
    canvasW,
    canvasH,
    bgColor,
    transforms,
    selectedNodeId,
    textFont,
    operations,
    machineProfile,
    colorView,
    panels,
    customGlyphs
  );

  // Surface-A texture-mode marks (S5, PRD D3/D6). Built 2D-side here — where the
  // live pattern instances are available — then handed to the 3D scene to
  // rasterize onto each sheet. Returns null unless 3D is open (threeDSnapshot set),
  // so the 2D path pays nothing. Panel SELECTION uses the PINNED snapshot
  // (panels/layers/operations), so the mark set always matches the snapshot-pinned
  // sheets; only the groove GEOMETRY tracks `patternInstances` (useState-backed —
  // changes only on real edits, never per-render, so no texture thrash). The mild
  // consequence: editing a pattern's params WHILE 3D is open re-derives that
  // groove live rather than staying strictly frozen (D14) — an acceptable, honest
  // deviation since the geometry/sheet structure stays pinned and "↻ Rebuild"
  // remains the explicit resync.
  const threeDMarks = useMemo(() => {
    if (!threeDSnapshot) return null;
    return buildPanelMarkSVGs({
      panels: threeDSnapshot.panels,
      layers: threeDSnapshot.layers,
      operations: threeDSnapshot.operations,
      patternInstances,
      canvasW,
      canvasH,
      svgOpts: { font: textFont },
    });
  }, [threeDSnapshot, patternInstances, canvasW, canvasH, textFont]);

  // Surface B (S8): the relief source field. Resolved 2D-side from the focus
  // guide layer via fieldForLayer (three-free; LRU-cached internally so this is
  // cheap), then passed across the boundary to the relief mesh. Reads the LIVE
  // guide layer rather than a frozen snapshot — snapshot-consistency for B is a
  // later refinement (D14's snapshot concern is Surface A). null unless B is open.
  const reliefField = useMemo(() => {
    if (threeDMode !== "height-surface" || !focusFieldLayerId) return null;
    const guide = (layers || []).find((l) => l.id === focusFieldLayerId);
    return guide ? fieldForLayer(guide) : null;
  }, [threeDMode, focusFieldLayerId, layers]);

  // Surface B (S9, §3.4): the guide's ACTIVE modulation targets to drape on the
  // relief, resolved 2D-side (pure, three-free) and passed across the boundary as
  // plain descriptors. Honors the modulation graph's "first incoming edge wins";
  // empty when the guide has no active warp/density targets. null unless B is open.
  const drapeTargets = useMemo(() => {
    if (threeDMode !== "height-surface" || !focusFieldLayerId) return [];
    const guide = (layers || []).find((l) => l.id === focusFieldLayerId);
    return guide ? resolveActiveTargets(guide, layers) : [];
  }, [threeDMode, focusFieldLayerId, layers]);

  // --- Field overlay (read-only modulation-field preview) -------------------
  // First slice of pattern modulation: visualize a guide pattern's underlying
  // scalar field as a heatmap. Currently sources from a selected Chladni layer.
  // Local UI state — this is a preview lens, not document data; never exported.
  const [showField, setShowField] = useState(false);
  const selField = layers.find(
    (l) => l.id === selectedNodeId && l.visible !== false
  );
  const fieldEligible = selField?.patternType === "chladni";
  // chladniField() memoizes internally by the field-shaping param VALUES, so
  // recomputing this each render is cheap: the same grid instance is returned
  // unless m/n/blend/m2/n2 actually change (no rebuild on drags or unrelated
  // edits). React Compiler handles component-level memoization.
  const previewField =
    showField && fieldEligible
      ? chladniField(selField.params, { resolution: 128 })
      : null;

  // Latest transforms readable inside pointer handlers without stale closures
  // (the map identity changes on every drag frame; handlers stay stable).
  const transformsLiveRef = useRef(transforms);
  useEffect(() => {
    transformsLiveRef.current = transforms;
  }, [transforms]);

  // Drag/pan session state (refs so handlers don't re-bind / re-render per move).
  const dragRef = useRef(null); // { id, kind, startPoint, startTransform, center, moved }
  const panRef = useRef(null); // { lastX, lastY } during a Hand-tool pan
  const createRef = useRef(null); // { start } during a Text-tool create drag

  // Expose pattern instances to parent for SVG export and optimization stats.
  useEffect(() => {
    if (patternInstancesRef) {
      patternInstancesRef.current = patternInstances;
    }
    if (onPatternInstancesChange) {
      onPatternInstancesChange(patternInstances);
    }
  }, [patternInstances, patternInstancesRef, onPatternInstancesChange]);

  // Expose canvas container so parent can grab thumbnails
  useEffect(() => {
    if (canvasContainerRef) {
      canvasContainerRef.current = containerRef.current;
    }
  }, [canvasContainerRef]);

  // Calculate fit scale
  useEffect(() => {
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const padding = 48;
      const availW = wrapperRef.current.clientWidth - padding * 2;
      const availH = wrapperRef.current.clientHeight - padding * 2;
      const scaleX = availW / canvasW;
      const scaleY = availH / canvasH;
      setFitScale(Math.min(scaleX, scaleY, 1));
    };

    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [canvasW, canvasH]);

  // --- Pan-recenter glide (shell-pan path only) ----------------------------
  // Live pan readable inside rAF frames / wheel events without stale closures.
  const panLiveRef = useRef(pan);
  useEffect(() => {
    panLiveRef.current = pan;
  });
  const glideRafRef = useRef(null);
  const stopGlide = useCallback(() => {
    if (glideRafRef.current != null) {
      cancelAnimationFrame(glideRafRef.current);
      glideRafRef.current = null;
    }
  }, []);
  useEffect(() => stopGlide, [stopGlide]); // cancel any in-flight glide on unmount

  // Scroll wheel zoom — anchored at the pointer, so the canvas point under the
  // cursor stays put while the scale changes. Zoom + scale are re-derived from
  // the rendered rect (not props) so back-to-back wheel events between renders
  // compute against a consistent base.
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const surface = containerRef.current;
      const wrap = wrapperRef.current;
      // Legacy/uncontrolled path (no shell pan) or unmeasurable: plain center
      // zoom, exactly as before (just the shallower step).
      if (!externalPan || !surface || !wrap || !fitScale) {
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
        return;
      }
      stopGlide();
      const rect = surface.getBoundingClientRect();
      const curScale = rect.width / canvasW; // finalScale as actually rendered
      const curZoom = curScale / fitScale;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, curZoom * factor));
      const nextScale = fitScale * nextZoom;
      setZoom(nextZoom);
      // Zooming out to where the whole work piece fits: skip the pointer
      // anchor — the recenter effect below glides the pan home instead, so the
      // canvas never ends up needlessly offset.
      const fits =
        canvasW * nextScale <= wrap.clientWidth &&
        canvasH * nextScale <= wrap.clientHeight;
      if (factor < 1 && fits) return;
      // Keep the canvas point under the pointer fixed: the transform origin is
      // the canvas center, whose screen position O only the pan moves; scaling
      // by r about O requires pan += (M − O)(1 − r) for pointer M.
      const ox = rect.left + curScale * (canvasW / 2);
      const oy = rect.top + curScale * (canvasH / 2);
      const r = nextZoom / curZoom;
      const dx = (e.clientX - ox) * (1 - r);
      const dy = (e.clientY - oy) * (1 - r);
      if (dx || dy) onPanBy(dx, dy);
    },
    [externalPan, setZoom, fitScale, canvasW, canvasH, onPanBy, stopGlide]
  );

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25));
  const resetZoom = () => setZoom(1);

  const finalScale = fitScale * zoom;
  const zoomPercent = Math.round(zoom * 100);

  // Any zoom OUT that leaves the whole work piece visible glides the pan back
  // to center (ease-out over GLIDE_MS), so the canvas never sits offset for no
  // reason. Watching finalScale here catches EVERY zoom-out path — wheel,
  // canvas −/reset buttons, shell ControlBar — not just the wheel handler.
  // Shell-pan path only; the glide itself moves pan, not scale, so it never
  // re-triggers this effect.
  const prevScaleRef = useRef(finalScale);
  useEffect(() => {
    const prevScale = prevScaleRef.current;
    prevScaleRef.current = finalScale;
    if (!externalPan || finalScale >= prevScale) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    if (
      canvasW * finalScale > wrap.clientWidth ||
      canvasH * finalScale > wrap.clientHeight
    )
      return;
    const from = panLiveRef.current;
    if (!from.x && !from.y) return;
    stopGlide();
    const start = performance.now();
    const step = (now) => {
      glideRafRef.current = null;
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const ease = 1 - (1 - t) ** 3; // cubic ease-out
      const cur = panLiveRef.current;
      const dx = from.x * (1 - ease) - cur.x;
      const dy = from.y * (1 - ease) - cur.y;
      if (dx || dy) onPanBy(dx, dy);
      if (t < 1) glideRafRef.current = requestAnimationFrame(step);
    };
    glideRafRef.current = requestAnimationFrame(step);
  }, [finalScale, externalPan, canvasW, canvasH, onPanBy, stopGlide]);

  // Pro-shell canvas chrome (B4 / #7): only active when the shell supplies a
  // bed size. Reporting the cursor uses the SAME on-screen scale (finalScale)
  // the rulers use, so the status-bar readout reads correctly against them.
  const showChrome = bedSize != null;

  // Chrome alignment (B4 / #7 fix): the canvas surface is flex-CENTERED in the
  // wrapper (and pan/zoom-transformed), but CanvasChrome is `absolute inset-0`
  // of the wrapper — so without this it pins the rulers + bed to the wrapper's
  // top-left while the artwork sits centered elsewhere. Measure the live canvas
  // rect (the SAME element the cursor readout measures, so ticks ↔ cursor agree
  // by construction) relative to the wrapper, and feed CanvasChrome that origin
  // so ruler 0,0 tracks the canvas corner under centering, pan, zoom AND the
  // overflow-auto scroll that kicks in past 1.25x.
  const [chromeOrigin, setChromeOrigin] = useState(null);
  useLayoutEffect(() => {
    if (!showChrome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot reset when chrome turns off; no cascading loop
      setChromeOrigin(null);
      return undefined;
    }
    const measure = () => {
      const surface = containerRef.current;
      const wrap = wrapperRef.current;
      if (!surface || !wrap) return;
      const sRect = surface.getBoundingClientRect();
      const wRect = wrap.getBoundingClientRect();
      setChromeOrigin({ x: sRect.left - wRect.left, y: sRect.top - wRect.top });
    };
    measure();
    const wrap = wrapperRef.current;
    window.addEventListener("resize", measure);
    wrap?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      wrap?.removeEventListener("scroll", measure);
    };
  }, [showChrome, finalScale, pan.x, pan.y, canvasW, canvasH, bedSize]);

  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (!onCursorMove) return;
      const surface = containerRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      // Offset from the artboard origin in screen px, then back-projected to the
      // active unit through the shared scale.
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      onCursorMove({
        x: cursorToUnit(sx, unit, finalScale),
        y: cursorToUnit(sy, unit, finalScale),
      });
    },
    [onCursorMove, unit, finalScale]
  );
  const handleCanvasMouseLeave = useCallback(() => {
    if (onCursorMove) onCursorMove(null);
  }, [onCursorMove]);

  // --- Canvas interaction: Hand-pan + Select/Move/Resize/Rotate ------------
  const handActive = activeTool === "hand";
  const selectActive = activeTool === "select";
  const textActive = activeTool === "text";

  // Map a browser pointer position to canvas-internal coordinates. Uses the live
  // canvas-surface rect, so it's correct under centering, pan AND zoom.
  const toCanvasPoint = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return screenToCanvas(clientX, clientY, rect, finalScale);
    },
    [finalScale]
  );

  const capturePointer = (e) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer was already released */
    }
  };
  const releasePointer = (e) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;

      // Click-to-place: a click commits the armed asset at the cursor (canvas
      // space). Takes precedence over select/hand; no drag session is started.
      if (placing) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (pt) onPlaceAsset(pt);
        return;
      }

      // Hand tool (or held Space): start a screen-space pan drag. Cancels any
      // in-flight recenter glide so it can't fight the user's drag.
      if (handActive) {
        stopGlide();
        panRef.current = { lastX: e.clientX, lastY: e.clientY };
        capturePointer(e);
        return;
      }

      // Text tool: begin a create gesture (click or drag). Resolved on pointer-up
      // into a new text layer via textCreateFromDrag + onCreateText.
      if (textActive) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (!pt) return;
        createRef.current = { start: pt };
        capturePointer(e);
        return;
      }
      if (!selectActive) return;

      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const liveTransforms = transformsLiveRef.current || {};
      const selectables = buildSelectables({ layers, canvasW, canvasH, font: textFont });

      // 1) If a layer is selected, its rotate/resize handles take priority over
      //    re-selecting/moving — a handle hit starts a transform WITHOUT changing
      //    selection. Handles are hit-tested in the node's LOCAL space.
      if (selectedNodeId) {
        const selDef = selectables.find((s) => s.id === selectedNodeId);
        if (selDef) {
          const startTransform = liveTransforms[selectedNodeId] || IDENTITY;
          const hit = classifyPointer(
            pt,
            { transform: startTransform, localBBox: selDef.localBBox },
            canvasW,
            canvasH
          );
          if (hit.kind === "rotate" || hit.kind === "resize") {
            dragRef.current = {
              id: selectedNodeId,
              kind: hit.kind,
              startPoint: pt,
              startTransform,
              center: selDef.pivot,
              moved: false,
            };
            capturePointer(e);
            return;
          }
        }
      }

      // 2) Otherwise pick the topmost layer under the pointer → select + move.
      const id = pickTopmost(pt, selectables, liveTransforms);
      if (!id) {
        onSelect(null); // empty-space click clears selection (no history commit)
        return;
      }
      onSelect(id);
      const picked = selectables.find((s) => s.id === id);
      dragRef.current = {
        id,
        kind: "move",
        startPoint: pt,
        startTransform: liveTransforms[id] || IDENTITY,
        center: picked ? picked.pivot : { x: canvasW / 2, y: canvasH / 2 },
        moved: false,
      };
      capturePointer(e);
    },
    [placing, onPlaceAsset, handActive, selectActive, textActive, toCanvasPoint, layers, canvasW, canvasH, selectedNodeId, onSelect, textFont, stopGlide]
  );

  const handlePointerMove = useCallback(
    (e) => {
      // Click-to-place: track the cursor so the ghost preview follows it.
      if (placing) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (pt) setGhostPoint(pt);
        return;
      }

      // Hand-pan: translate the artboard by the screen-space pointer delta.
      const pan = panRef.current;
      if (pan) {
        const dx = e.clientX - pan.lastX;
        const dy = e.clientY - pan.lastY;
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
        if (dx || dy) onPanBy(dx, dy);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const dx = pt.x - drag.startPoint.x;
      const dy = pt.y - drag.startPoint.y;
      if (!drag.moved && (dx !== 0 || dy !== 0)) drag.moved = true;

      let next;
      if (drag.kind === "rotate") {
        next = rotateTransform(drag.startTransform, drag.center, drag.startPoint, pt, e.shiftKey);
      } else if (drag.kind === "resize") {
        next = scaleTransform(drag.startTransform, drag.center, drag.startPoint, pt);
      } else {
        next = applyMoveDelta(drag.startTransform, dx, dy);
      }
      onMove(drag.id, next);
    },
    [placing, toCanvasPoint, onMove, onPanBy]
  );

  const handlePointerUp = useCallback(
    (e) => {
      if (panRef.current) {
        panRef.current = null;
        releasePointer(e);
        return;
      }
      // Text tool: resolve the create gesture into a new text layer. A tiny delta
      // is a click (single-line); a real drag is a box (multi-line).
      if (createRef.current) {
        const start = createRef.current.start;
        createRef.current = null;
        releasePointer(e);
        const end = toCanvasPoint(e.clientX, e.clientY) || start;
        onCreateText(textCreateFromDrag(start, end));
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      releasePointer(e);
      // Only commit (persist to the layer) if the node actually moved — a plain
      // selecting click must not write a no-op transform.
      if (drag.moved) onCommit();
    },
    [onCommit, toCanvasPoint, onCreateText]
  );

  // Double-click a TEXT object → enter edit. The preceding pointerdown may have
  // armed a move (dragRef set, but with moved=false since a dblclick doesn't
  // drag); we null dragRef so the trailing pointerup commits NOTHING — no
  // phantom no-op transform. Non-text layers ignore the dblclick.
  const handleDoubleClick = useCallback(
    (e) => {
      if (!selectActive && !textActive) return;
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const liveTransforms = transformsLiveRef.current || {};
      const selectables = buildSelectables({ layers, canvasW, canvasH, font: textFont });
      const id = pickTopmost(pt, selectables, liveTransforms);
      if (!id) return;
      const sel = selectables.find((s) => s.id === id);
      if (sel?.kind !== "text") return; // only text enters edit
      dragRef.current = null; // cancel any move armed by the preceding pointerdown — NO commit
      onRequestEdit(id);
    },
    [selectActive, textActive, toCanvasPoint, layers, canvasW, canvasH, textFont, onRequestEdit]
  );

  return (
    <div
      ref={wrapperRef}
      className={`h-full bg-surface flex flex-col items-center justify-center relative ${zoom > 1.25 ? "overflow-auto" : "overflow-hidden"}`}
      onMouseMove={showChrome ? handleCanvasMouseMove : undefined}
      onMouseLeave={showChrome ? handleCanvasMouseLeave : undefined}
    >
      {/* Pro-shell fabrication chrome (B4 / #7): mm rulers + bed artboard.
          Sits OUTSIDE the canvas transform and consumes the full on-screen
          scale (finalScale) as its zoom, so its ticks align with the scaled
          canvas and with the cursor readout (which divides by the same scale).
          Null bedSize (legacy / flag-OFF) → not rendered, a true no-op. */}
      {showChrome && (
        <CanvasChrome
          canvasWidthPx={canvasW}
          canvasHeightPx={canvasH}
          bedWidthMm={bedSize.width}
          bedHeightMm={bedSize.height}
          unit={unit}
          zoom={finalScale}
          pan={pan}
          origin={chromeOrigin}
          // Forwarded showBed toggle — bed overlay is reference-only; the
          // artboard + rulers keep rendering inside CanvasChrome regardless.
          showBed={showBed}
        />
      )}
      <div
        data-testid="canvas-scaled-box"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `${panTransform}scale(${finalScale})`,
          transformOrigin: "center center",
          boxShadow: "7px 7px 25px 2px rgba(0,0,0, 0.5)",
          flexShrink: 0,
          position: "relative",
          // 3D active → hide the p5 surface without unmounting it (state kept).
          // 'off' → undefined, so the rendered style is byte-identical to before.
          visibility: threeDMode !== "off" ? "hidden" : undefined,
        }}
      >
        <div ref={containerRef} />
        {/* Field overlay — modulation-field heatmap (read-only preview). Sibling
            of the p5 surface inside the scaled wrapper, so it shares the artwork
            coordinate space + canvas transform. Null when off or no eligible
            layer is selected → clean canvas, never exported. */}
        {previewField && (
          <FieldOverlay
            field={previewField}
            canvasW={canvasW}
            canvasH={canvasH}
          />
        )}
        {/* Text edit overlay (phase 5). Lives INSIDE the scaled canvas box so its
            canvas-coord left/top/size inherit scale(finalScale) and stay aligned
            with the drawn glyphs at any zoom. Rendered only when an edit is open,
            the editing layer still exists + is a text layer, and the font is
            loaded (it sizes the textarea from the laid-out glyph box). */}
        {editingNodeId && textFont && (() => {
          const eLayer = layers.find((l) => l.id === editingNodeId);
          if (!eLayer || !isTextLayer(eLayer)) return null;
          return (
            <TextEditOverlay
              node={textNodeFromLayer(eLayer)}
              font={textFont}
              onEditText={onEditText}
              onExitEdit={onExitEdit}
            />
          );
        })()}
        {/* Run Plan machine view / plot overlay. Sibling of the p5 surface inside
            the scaled wrapper, so it shares the artwork's coordinate space and the
            canvas transform. The legacy View▸Overlays toggle is retiring into the
            plan (issue #73): Lane I drives this mount from the plan's canvas state
            and passes the runPlanModel slices, at which point PlotOverlay renders
            the machine view (draw tinted by Operation, travel dashed, crops
            ghosted, Sheet + Bed, animated run-through). Until Lane I wires them the
            slices are absent → PlotOverlay's legacy plot preview, unchanged. */}
        {showPlotOverlay && (
          <PlotOverlay
            layers={layers}
            patternInstances={patternInstances}
            canvasW={canvasW}
            canvasH={canvasH}
            appliedOptimizations={appliedOptimizations}
            route={plotRoute}
            crops={plotCrops}
            opRows={plotOpRows}
            bedSize={bedSize}
            sheetRect={sheetRect}
            playing={plotPlaying}
            locate={plotLocate}
            onLocate={onPlotLocate}
            onPlayingChange={onPlotPlayingChange}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
        {/* Select overlay. Sits inside the scaled box so pointer coords map
            through finalScale (move/rotate/resize need canvas-space). Active only
            for the Select tool; transparent otherwise so wheel-zoom and the
            background picker pass through. Hand-pan is handled by the full-viewport
            overlay below — it needs no canvas mapping (pure screen deltas) and so
            can start a drag from anywhere in the viewport. The top is extended
            above the canvas so the rotate handle (which floats at local
            y = -ROTATE_OFFSET) can receive its initiating pointerdown. */}
        {/* Click-to-place ghost — a to-scale preview that follows the cursor in
            canvas space, so the user sees exactly where/how big the asset lands.
            Centred on the cursor (its bbox centre = content centre = commit point).
            Pointer-transparent; the overlay below owns the events. */}
        {placing && ghostMarkup && (
          <div
            data-testid="placement-ghost"
            className="absolute"
            style={{
              left: ghostPoint.x,
              top: ghostPoint.y,
              width: placement.bbox.w,
              height: placement.bbox.h,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              opacity: 0.7,
            }}
            dangerouslySetInnerHTML={{ __html: ghostMarkup }}
          />
        )}
        <div
          data-testid="select-overlay"
          className="absolute"
          style={{
            top: -(ROTATE_OFFSET + 8),
            right: 0,
            bottom: 0,
            left: 0,
            pointerEvents: selectActive || placing || textActive ? "auto" : "none",
            cursor: placing || textActive ? "crosshair" : "default",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
        {/* Motif anchor-ghost overlay (click-to-override). LAST child in the
            scaled box so its dots sit on top (top z) and capture their own
            pointerdowns; the SVG itself is pointer-events:none so clicks in empty
            canvas fall through to the select-overlay above. Renders only when the
            selected layer is a motif over a semantic host — otherwise null. */}
        <AnchorGhostOverlay
          layers={layers}
          selectedLayerId={selectedNodeId}
          canvasW={canvasW}
          canvasH={canvasH}
          onUpdateLayer={onUpdateLayer}
          patternInstances={patternInstances}
        />
      </div>

      {/* 3D preview host (S1, PRD D1). Mounts ONLY when a sub-mode is active;
          covers the whole canvas region (the p5 surface above is visibility-
          hidden, not unmounted). Canvas3DHost lazy-loads the three.js scene
          behind a "Building preview…" Suspense fallback. 'off' → not rendered,
          a true no-op so the 2D path is byte-identical and three never loads. */}
      {threeDMode !== "off" && (
        <div data-testid="canvas3d-host" className="absolute inset-0 z-30">
          <Canvas3DHost
            mode={threeDMode}
            focusFieldLayerId={focusFieldLayerId}
            snapshot={threeDSnapshot}
            boundsMm={{ width: pxToUnit(canvasW, "mm"), height: pxToUnit(canvasH, "mm") }}
            marksByPanel={threeDMarks}
            reliefField={reliefField}
            drapeTargets={drapeTargets}
            selectedMaterial={selectedMaterial}
            onClose={onClose3D}
          />
        </div>
      )}

      {/* Hand-pan overlay — full viewport, OUTSIDE the canvas transform. Hand-pan
          works from screen-space deltas alone, so it needn't sit on the artboard:
          this lets a pan drag start anywhere in the canvas region (incl. the empty
          surface around the artboard), not just on top of the artwork. Active only
          in Hand mode; transparent otherwise so the canvas, select overlay and
          wheel-zoom keep working. Placed AFTER the scaled box so it sits above the
          canvas, but BEFORE the zoom/background buttons so those stay clickable. */}
      <div
        data-testid="pan-overlay"
        className="absolute inset-0"
        style={{
          // Suppressed during placement so the canvas-space select overlay
          // receives the placing click even when the Hand tool is active.
          pointerEvents: handActive && !placing ? "auto" : "none",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Click-to-place prompt — a popper pinned to the top of the canvas telling
          the user the mode is armed. Cancel button + Esc both abort. */}
      {placing && (
        <div
          data-testid="placement-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-3.5 py-2 rounded-full bg-ink text-paper text-xs font-medium shadow-xl"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-violet opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet" />
          </span>
          Click to place object on canvas
          <button
            type="button"
            onClick={onCancelPlacement}
            className="ml-1 text-paper/70 hover:text-paper transition-colors"
          >
            Cancel <span className="opacity-60">(Esc)</span>
          </button>
        </div>
      )}

      {/* Field overlay toggle — shown only when a Chladni layer is selected
          (the one eligible field source in this first slice). Stacked above the
          Background button. Preview lens only; resets nothing on the document. */}
      {fieldEligible && (
        <div className="absolute bottom-28 left-4">
          <button
            type="button"
            onClick={() => setShowField((v) => !v)}
            aria-pressed={showField}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors shadow-lg ${
              showField
                ? "bg-violet text-paper border-violet"
                : "bg-paper-warm text-ink-soft border-hairline hover:border-ink-soft"
            }`}
          >
            <div
              className="w-4 h-4 rounded border border-hairline"
              style={{
                background:
                  "linear-gradient(90deg, #116d8a 0%, #f4eee0 50%, #b22a5c 100%)",
              }}
            />
            <span className="text-xs">Field</span>
          </button>
        </div>
      )}

      {/* Background color button — bottom left. Stacked ABOVE the canvas's
          Operation/Material/3D lens control (ColorViewControl, a Studio sibling
          pinned to bottom-4 left-4), with the Field toggle above this in turn, so
          the three bottom-left controls form a clean vertical stack instead of
          overlapping in the corner. */}
      <div className="absolute bottom-16 left-4">
        <button
          onClick={() => setBgPickerOpen(!bgPickerOpen)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-paper-warm border border-hairline hover:border-ink-soft transition-colors shadow-lg"
        >
          <div
            className="w-4 h-4 rounded border border-hairline"
            style={{ backgroundColor: bgColor }}
          />
          <span className="text-xs text-ink-soft">Background</span>
        </button>
        {bgPickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-paper-warm border border-hairline rounded-lg shadow-xl p-2.5 z-50">
            <div className="flex gap-1.5 mb-2">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => {
                    onBgColorChange(preset.color);
                    setBgPickerOpen(false);
                  }}
                  className={`w-7 h-7 rounded border-2 transition-colors ${
                    bgColor === preset.color
                      ? "border-violet"
                      : "border-hairline hover:border-ink-soft"
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.label}
                />
              ))}
            </div>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="w-full h-7 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1.5">
        {zoomPercent > 120 && (
          <div className="text-[9px] text-ink-soft bg-paper-warm/90 border border-hairline rounded px-2 py-1 max-w-[180px] text-right leading-snug">
            Preview may appear pixelated, but exported vector file will not be
          </div>
        )}
        <div className="flex items-center gap-1 bg-paper-warm border border-hairline rounded-lg px-1.5 py-1 shadow-lg">
          <button
            onClick={zoomOut}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-soft hover:text-ink hover:bg-muted transition-colors text-sm font-medium"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-1.5 min-w-[40px] text-center text-[10px] text-ink-soft hover:text-saffron transition-colors font-medium"
            title="Reset zoom"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={zoomIn}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-soft hover:text-ink hover:bg-muted transition-colors text-sm font-medium"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
