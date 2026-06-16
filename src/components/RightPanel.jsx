import { useRef, useState, useEffect, useCallback } from "react";
import useCanvas from "../lib/useCanvas";
import BedOverlay from "./canvas/BedOverlay";
import CanvasToolbar from "./canvas/CanvasToolbar";
import { screenToCanvas } from "../lib/canvas/coords";
import { applyMoveDelta } from "../lib/tools/moveTransform";
import { classifyPointer, rotateTransform, scaleTransform } from "../lib/tools/transformGestures";
import { ROTATE_OFFSET } from "../lib/transform/handles";
import { buildSelectables, pickTopmost } from "../lib/scene/selectables";
import { fitDraggedBox } from "../lib/text/fitText";
import { TextNode } from "../lib/scene/TextNode";
import TextEditOverlay from "./canvas/TextEditOverlay";

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

const BG_PRESETS = [
  { color: "#0a1628", label: "Dark Blue" },
  { color: "#ffffff", label: "White" },
  { color: "#000000", label: "Black" },
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export default function RightPanel({
  layers,
  canvasW,
  canvasH,
  patternInstancesRef,
  canvasContainerRef,
  onPatternInstancesChange,
  bgColor,
  onBgColorChange,
  displayMode = 'design',
  unit = 'mm',
  marginPx = 0,
  // Select/Move tool wiring (move slice).
  activeTool = 'select',
  setActiveTool = () => {},
  transforms = {},
  selectedNodeId = null,
  onSelect = () => {},
  onMove = () => {},
  onCommit = () => {},
  // Text render slice: plain text-node data + the resolved default font.
  textNodes = [],
  font = null,
  // Live text editing slice.
  editingNodeId = null,
  onCreateText = () => {},
  onEditText = () => {},
  onBeginEdit = () => {},
  onExitEdit = () => {},
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  // Drag session state (refs so handlers don't re-bind / re-render per move).
  const dragRef = useRef(null); // { id, startPoint, startTransform, moved }
  // Live rubber-band rectangle while creating with the Text tool (canvas coords).
  // null when not drawing. Drives the visible overlay rect.
  const [createRect, setCreateRect] = useState(null);
  const createRef = useRef(null); // { start: {x,y} } during a text-create drag
  // Latest transforms readable inside pointer handlers without stale closures.
  const transformsLiveRef = useRef(transforms);
  useEffect(() => {
    transformsLiveRef.current = transforms;
  }, [transforms]);

  const { patternInstances } = useCanvas(
    containerRef,
    layers,
    canvasW,
    canvasH,
    bgColor,
    transforms,
    selectedNodeId,
    textNodes,
    font,
    editingNodeId
  );

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

  // Scroll wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }, []);

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

  const isPrepare = displayMode === 'prepare';
  const selectActive = activeTool === 'select' && !isPrepare;
  const textActive = activeTool === 'text' && !isPrepare;
  // The overlay must intercept pointer events for select (move/rotate/resize),
  // text-create, AND while editing (so a pointer-down OUTSIDE the editing node
  // commits the edit). Otherwise it stays transparent to wheel-zoom / picker.
  const overlayActive = selectActive || textActive || editingNodeId != null;

  // Threshold (canvas px) separating a "click → point text" from a real drag.
  const DRAG_THRESHOLD = 4;

  // --- Select/Move pointer handlers (only active for the select tool) ---
  const toCanvasPoint = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return screenToCanvas(clientX, clientY, rect, finalScale);
    },
    [finalScale]
  );

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;

      const capture = () => {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* setPointerCapture can throw if pointer already released */
        }
      };

      // --- While editing, editing takes PRECEDENCE over every other gesture
      //     (you can't be mid-edit and starting a new box). A pointer-down
      //     OUTSIDE the editing node commits the edit; INSIDE is ignored (keeps
      //     editing / keeps textarea focus). Hit-test the editing node's WORLD
      //     bbox. This MUST come before the text-create branch, since a freshly
      //     created node is edited while the Text tool is still active.
      if (editingNodeId != null) {
        const editSel = buildSelectables({ layers: [], textNodes, font, canvasW, canvasH })
          .find((s) => s.id === editingNodeId);
        const t = transformsLiveRef.current[editingNodeId] || IDENTITY;
        const insideNode =
          editSel &&
          pickTopmost(pt, [editSel], { [editingNodeId]: t }) === editingNodeId;
        if (!insideNode) {
          // Commit the edit; do NOT also start a new gesture from this same
          // pointer-down (avoids surprise create/select).
          onExitEdit();
        }
        return; // editing owns this pointer-down either way
      }

      // --- Text tool: begin a create drag (rubber band). The actual node is
      //     created on pointer-up (so we know whether it's a click or a drag).
      if (textActive) {
        createRef.current = { start: pt };
        setCreateRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
        capture();
        return;
      }

      if (!selectActive) return;

      // Unified selectables (TEXT first / on top, then patterns front-to-back).
      // Each carries its WORLD bbox + pivot: full-canvas/canvas-center for a
      // pattern, the tight glyph box + its center for text. The same bbox/pivot
      // drives handle hit-testing AND the rotate/scale gesture, so the gesture
      // pivots about the node's own center (text) or the canvas center (pattern).
      const selectables = buildSelectables({
        layers,
        textNodes,
        font,
        canvasW,
        canvasH,
      });

      // 1) If a node is already selected, give its rotate/resize handles
      //    priority over re-selecting/moving. Handles are hit-tested in the
      //    node's LOCAL space (classifyPointer inverse-maps the pointer about
      //    the node's OWN pivot). A handle hit starts a rotate/resize drag
      //    WITHOUT changing selection.
      if (selectedNodeId) {
        const selDef = selectables.find((s) => s.id === selectedNodeId);
        if (selDef) {
          const startTransform = transformsLiveRef.current[selectedNodeId] || IDENTITY;
          const selected = { transform: startTransform, localBBox: selDef.localBBox };
          const hit = classifyPointer(pt, selected, canvasW, canvasH);
          if (hit.kind === "rotate" || hit.kind === "resize") {
            dragRef.current = {
              id: selectedNodeId,
              kind: hit.kind,
              handleId: hit.handleId,
              startPoint: pt,
              startTransform,
              center: selDef.pivot,
              moved: false,
            };
            capture();
            return;
          }
        }
      }

      // 2) Otherwise fall through to select/move (text wins over patterns since
      //    it is first in the selectables list).
      const id = pickTopmost(pt, selectables, transformsLiveRef.current);
      if (!id) {
        // Empty-space click → clear selection, no history commit.
        onSelect(null);
        return;
      }
      onSelect(id);
      const picked = selectables.find((s) => s.id === id);
      const startTransform = transformsLiveRef.current[id] || IDENTITY;
      dragRef.current = {
        id,
        kind: "move",
        startPoint: pt,
        startTransform,
        center: picked ? picked.pivot : { x: canvasW / 2, y: canvasH / 2 },
        moved: false,
      };
      capture();
    },
    [selectActive, textActive, editingNodeId, onExitEdit, toCanvasPoint, layers, patternInstances, canvasW, canvasH, onSelect, selectedNodeId, textNodes, font]
  );

  const handlePointerMove = useCallback(
    (e) => {
      // Text-create drag: grow the rubber-band rectangle.
      const create = createRef.current;
      if (create) {
        const pt = toCanvasPoint(e.clientX, e.clientY);
        if (!pt) return;
        const x = Math.min(create.start.x, pt.x);
        const y = Math.min(create.start.y, pt.y);
        const w = Math.abs(pt.x - create.start.x);
        const h = Math.abs(pt.y - create.start.y);
        setCreateRect({ x, y, w, h });
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
    [toCanvasPoint, onMove]
  );

  const endDrag = useCallback(
    (e) => {
      // Finish a text-create gesture. A real drag (> threshold in either axis)
      // → fitDraggedBox the rect into a node at its top-left. A near-zero drag
      // (a click) → a default single-line "point text" node at the click point.
      const create = createRef.current;
      if (create) {
        createRef.current = null;
        setCreateRect(null);
        try {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        } catch {
          /* no-op */
        }
        const pt = toCanvasPoint(e.clientX, e.clientY);
        const start = create.start;
        const dragW = pt ? Math.abs(pt.x - start.x) : 0;
        const dragH = pt ? Math.abs(pt.y - start.y) : 0;
        if (dragW > DRAG_THRESHOLD || dragH > DRAG_THRESHOLD) {
          const x = Math.min(start.x, pt.x);
          const y = Math.min(start.y, pt.y);
          const fit = fitDraggedBox({ w: dragW, h: dragH });
          onCreateText({ x, y, box: { w: dragW, h: dragH }, fit });
        } else {
          // Point text: default single-line node at the click point.
          onCreateText({
            x: start.x,
            y: start.y,
            box: { w: 0, h: 0 },
            fit: { lineMode: "single", fontSize: 48, wrapWidth: null },
          });
        }
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {
        /* no-op */
      }
      // Only commit a history entry if the layer actually moved — a plain
      // selecting click must not push a no-op undo state.
      if (drag.moved) onCommit();
    },
    [onCommit, toCanvasPoint, onCreateText]
  );

  // Double-click a text node with the Select tool → re-enter edit on it.
  const handleDoubleClick = useCallback(
    (e) => {
      if (!selectActive || editingNodeId != null) return;
      const pt = toCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      // Only text nodes are editable; build text-only selectables and hit-test.
      const textSel = buildSelectables({ layers: [], textNodes, font, canvasW, canvasH });
      const id = pickTopmost(pt, textSel, transformsLiveRef.current);
      if (id) onBeginEdit(id);
    },
    [selectActive, editingNodeId, toCanvasPoint, textNodes, font, canvasW, canvasH, onBeginEdit]
  );

  // Geometry for the editing node's textarea: its WORLD top-left (x,y) + the
  // node transform's translation, scaled to screen pixels via finalScale, plus
  // the node's screen-space font size. The textarea is positioned (within the
  // unscaled wrapper coordinate space, since it lives OUTSIDE the scaled box) so
  // it overlaps the glyphs. We compute it from the node datum + live transform.
  const editingNode = editingNodeId != null
    ? textNodes.find((n) => n.id === editingNodeId)
    : null;

  return (
    <div
      ref={wrapperRef}
      className={`h-full bg-surface flex flex-col items-center justify-center relative ${zoom > 1.25 ? "overflow-auto" : "overflow-hidden"}`}
    >
      {isPrepare && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-paper/90 border border-violet/40 text-accent/90 text-[10px] uppercase tracking-wider font-semibold rounded-md px-2.5 py-1 z-10 pointer-events-none">
          Prepare · Bed view
        </div>
      )}
      <div
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${finalScale})`,
          transformOrigin: "center center",
          boxShadow: isPrepare
            ? "0 0 0 1px rgba(0,201,177,0.35), 7px 7px 25px 2px rgba(0,0,0, 0.5)"
            : "7px 7px 25px 2px rgba(0,0,0, 0.5)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div ref={containerRef} />
        {/* Live rubber-band rectangle while creating text. Sits INSIDE the
            scaled box so it uses canvas coords directly. Non-interactive. */}
        {createRect && (
          <div
            className="absolute pointer-events-none border border-dashed border-violet bg-violet/10"
            style={{
              left: createRect.x,
              top: createRect.y,
              width: createRect.w,
              height: createRect.h,
            }}
          />
        )}
        {/* Hidden/minimal textarea that OWNS keystrokes while editing. It lives
            INSIDE the scaled box so its canvas-coord position/size inherit the
            same scale as the glyphs. The canvas draws the live glyphs + caret;
            the textarea is near-transparent but focusable. */}
        {editingNode && (
          <TextEditOverlay
            node={editingNode}
            font={font}
            onEditText={onEditText}
            onExitEdit={onExitEdit}
          />
        )}
        {/* Pointer overlay for canvas tools — sits over the canvas inside the
            scaled wrapper. Intercepts events for select (move/rotate/resize),
            text-create, and while editing (outside-click commit); otherwise
            pointer-events:none lets wheel-zoom / picker pass through. */}
        <div
          className="absolute"
          style={{
            // Extend ABOVE the canvas top so the rotate handle (which floats at
            // local y = -ROTATE_OFFSET, i.e. above the top edge) is inside the
            // overlay box and can receive its initiating pointerdown. Resize
            // handles already sit within [0, canvasH].
            top: -(ROTATE_OFFSET + 8),
            right: 0,
            bottom: 0,
            left: 0,
            pointerEvents: overlayActive ? "auto" : "none",
            cursor: textActive ? "text" : selectActive ? "default" : "auto",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={handleDoubleClick}
        />
        {isPrepare && (
          <BedOverlay
            canvasW={canvasW}
            canvasH={canvasH}
            marginPx={marginPx}
            unit={unit}
          />
        )}
      </div>

      {/* Canvas tool toolbar (Select active, Text disabled). Hidden in Prepare. */}
      {!isPrepare && (
        <CanvasToolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
        />
      )}

      {/* Background color button — bottom left, aligned with zoom controls */}
      <div className="absolute bottom-4 left-4">
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
