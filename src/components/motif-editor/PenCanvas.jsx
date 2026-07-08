// PenCanvas — the interactive SVG editing surface for the pen editor's
// DIRECT-SELECTION (A) tool (WI-P2-3).
//
// Owns the modal's editing <svg> (keeps the `motif-editor-canvas` testid, the
// cream paper + graticule, the violet path stroke, and the jewel-madder root ⊕).
// On top it renders the Illustrator-faithful direct-select furniture and drives
// drag/marquee/delete through penMachine (pure) — this file only maps screen↔
// model coords and wires pointer events to the machine + edit callbacks.
//
// Appearance (per docs/svg-motif-editor-P2-PLAN "Appearance"):
//   • Path   — thin violet non-scaling stroke, fill:none.
//   • Anchors— small squares: hollow (paper fill + violet stroke) when unselected,
//              filled violet when selected.
//   • Handles— round violet dots joined to their anchor by thin direction lines;
//              shown for SELECTED anchors and SMOOTH anchors.
//   • Root   — distinct jewel-madder ⊕ crosshair (read-only this WI; drag lands
//              in WI-P2-5).
// All markers use non-scaling strokes so they read at any zoom.

import { useEffect, useRef, useState } from 'react';
import {
  hitTest,
  moveAnchor,
  moveHandle,
  marqueeSelect,
  toggleSelect,
  isSelected,
  hitTestSegment,
  addAnchorOnSegment,
  convertAnchor,
  setSmoothHandle,
  moveWholePath,
  appendAnchor,
  closeSubpath,
  deleteAnchors,
  hitTestRoot,
  constrainTo45,
  angleFromArm,
} from './penMachine.js';

// Map a client (screen) point to MODEL coords via the SVG CTM. Falls back to an
// IDENTITY mapping (client px == model units, offset by the element's box) when
// getScreenCTM is unavailable — notably jsdom, where CTM math isn't implemented.
// That fallback is what lets the callback-wiring smoke test drive a real drag.
function clientToModel(svg, clientX, clientY) {
  if (svg && typeof svg.getScreenCTM === 'function') {
    const ctm = svg.getScreenCTM();
    if (ctm && typeof ctm.inverse === 'function') {
      const pt =
        typeof svg.createSVGPoint === 'function'
          ? svg.createSVGPoint()
          : { x: 0, y: 0, matrixTransform: null };
      pt.x = clientX;
      pt.y = clientY;
      if (typeof pt.matrixTransform === 'function') {
        const m = pt.matrixTransform(ctm.inverse());
        return { x: m.x, y: m.y };
      }
    }
  }
  const rect =
    svg && typeof svg.getBoundingClientRect === 'function'
      ? svg.getBoundingClientRect()
      : { left: 0, top: 0 };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Resolve the anchor a hit target points at (or null if stale).
function anchorFromHit(paths, hit) {
  return (
    paths?.[hit.pathIndex]?.model?.subpaths?.[hit.subpathIndex]?.anchors?.[
      hit.anchorIndex
    ] ?? null
  );
}

export default function PenCanvas({
  working,
  box,
  span,
  gridStep,
  selection = [],
  tool = 'direct-select',
  penDraft = null, // { pathIndex, subpathIndex } of the active pen subpath, or null
  anchorsToD,
  onPreview,
  onCommit,
  onSelectionChange,
  onPenDraftChange,
  onRootPreview,
  onRootCommit,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null); // { kind, target, basePaths, latest, moved }
  const [marquee, setMarquee] = useState(null); // { x0,y0,x1,y1 } in model coords

  // View transform (pan/zoom). Applied as a <g transform> AND inverted in
  // clientToModel-derived `toModel` so hit-testing stays correct at any pan/zoom.
  // Default {0,0,1} is a no-op → all pre-P2-5 behaviour is byte-identical.
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });

  // Space-held → pan mode. Tracked on WINDOW (focus-independent, jsdom-drivable)
  // via a ref so the live pointer handlers read the current value without a
  // re-render dependency.
  const spaceRef = useRef(false);
  useEffect(() => {
    const isSpace = (e) => e.key === ' ' || e.code === 'Space';
    const down = (e) => {
      if (isSpace(e)) spaceRef.current = true;
    };
    const up = (e) => {
      if (isSpace(e)) spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const paths = working?.paths || [];
  const root = working?.root || { x: 0, y: 0, angle: 0 };
  const rx = root.x ?? 0;
  const ry = root.y ?? 0;
  const rootAngle = root.angle ?? 0;

  // Marker geometry sized off the view span so it reads consistently whatever the
  // glyph's coordinate scale. Hit tolerance is generous (fat-finger anchors).
  const anchorHalf = span * 0.014 || 1;
  const handleR = span * 0.013 || 1;
  const rootR = span * 0.045 || 1;
  const rootArmLen = span * 0.12 || 4; // growth-arm reach (model units)
  const tol = span * 0.03 || 4;

  // Arm endpoint in MODEL coords (also the arm's grab point).
  const armX = rx + rootArmLen * Math.cos(rootAngle);
  const armY = ry + rootArmLen * Math.sin(rootAngle);

  // Screen(user-space) → MODEL: undo the SVG CTM (clientToModel), then undo the
  // view transform. The <g> applies `translate(tx,ty) scale(s)`, so a model point
  // maps to view point (s·m + t); the inverse divides out t then s.
  const toModel = (e) => {
    const v = clientToModel(svgRef.current, e.clientX, e.clientY);
    return { x: (v.x - view.tx) / view.scale, y: (v.y - view.ty) / view.scale };
  };
  // Raw view-space point (pre-inverse) — for pan deltas + zoom-about-cursor.
  const toView = (e) => clientToModel(svgRef.current, e.clientX, e.clientY);
  const capture = (e) => {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom / unsupported — capture is a nicety, not required */
    }
  };

  // ── Direct-Selection (A) — the WI-P2-3 gesture, unchanged. Also the target of
  //    the ⌘/Ctrl temp-switch while the Pen tool is active. ────────────────────
  function directSelectDown(e, pt) {
    const target = hitTest(paths, pt, tol);
    capture(e);
    if (target && (target.part === 'in' || target.part === 'out')) {
      // Shift-constrain origin for a handle = its anchor (handles pivot there).
      const anc = anchorFromHit(paths, target);
      dragRef.current = {
        kind: 'handle',
        target,
        basePaths: paths,
        origin: anc ? { x: anc.x, y: anc.y } : pt,
        latest: null,
        moved: false,
      };
      return;
    }
    if (target && target.part === 'anchor') {
      const already = isSelected(
        selection,
        target.pathIndex,
        target.subpathIndex,
        target.anchorIndex
      );
      // Plain click of an unselected anchor selects just it; shift toggles; an
      // already-selected anchor keeps the (possibly multi-) selection so a drag
      // moves the whole set. (Multi-drag itself lands with the group WI; here the
      // grabbed anchor drives the preview.)
      if (e.shiftKey) {
        onSelectionChange?.(toggleSelect(selection, target, { additive: true }));
      } else if (!already) {
        onSelectionChange?.(toggleSelect(selection, target, { additive: false }));
      }
      // Shift-constrain origin for an anchor = its ORIGINAL position (the drag
      // travels along a 45° ray from where the anchor started).
      const anc = anchorFromHit(paths, target);
      dragRef.current = {
        kind: 'anchor',
        target,
        basePaths: paths,
        origin: anc ? { x: anc.x, y: anc.y } : pt,
        latest: null,
        moved: false,
      };
      return;
    }
    // Empty space: begin a marquee; a mere click (no drag) clears selection on up.
    dragRef.current = { kind: 'marquee', basePaths: paths, moved: false };
    setMarquee({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
  }

  // ⌥-click a SMOOTH anchor → retract its handles to a corner (Illustrator). A
  // one-shot commit; returns true when it fired so callers stop there.
  function tryAltRetract(e, hit) {
    if (!e.altKey || hit?.part !== 'anchor') return false;
    const a = anchorFromHit(paths, hit);
    if (a?.type !== 'smooth') return false;
    onCommit?.(convertAnchor(paths, hit, 'corner'));
    return true;
  }

  // ── Pen (P) — draw + structural edits. ────────────────────────────────────
  function penDown(e, pt) {
    const hit = hitTest(paths, pt, tol);
    if (tryAltRetract(e, hit)) return;
    // Click the FIRST anchor of the active draft subpath → CLOSE the path.
    if (
      penDraft &&
      hit?.part === 'anchor' &&
      hit.pathIndex === penDraft.pathIndex &&
      hit.subpathIndex === penDraft.subpathIndex &&
      hit.anchorIndex === 0
    ) {
      onCommit?.(closeSubpath(paths, penDraft.pathIndex, penDraft.subpathIndex));
      onPenDraftChange?.(null);
      return;
    }
    // IDLE (not mid-draw): edit EXISTING geometry — pen over an anchor deletes it
    // (−), pen over a segment adds an anchor on it (+). Gated on no active draft so
    // mid-draw clicks always extend rather than mis-fire.
    if (!penDraft) {
      if (hit?.part === 'anchor') {
        onCommit?.(deleteAnchors(paths, [hit]));
        return;
      }
      const seg = hitTestSegment(paths, pt, tol);
      if (seg) {
        const { paths: np, target } = addAnchorOnSegment(paths, seg);
        onCommit?.(np);
        if (target) {
          onSelectionChange?.([
            { pathIndex: target.pathIndex, subpathIndex: target.subpathIndex, anchorIndex: target.anchorIndex },
          ]);
        }
        return;
      }
    }
    // APPEND: place a corner now; a DRAG turns it smooth (out follows the cursor,
    // in mirrors). Preview from the pre-append baseline so the whole gesture = one
    // undo step; the next draft loc is derived from the COMMITTED result on up.
    const loc = penDraft || null;
    const base = paths;
    const preview = appendAnchor(base, loc, pt);
    onPreview?.(preview);
    dragRef.current = { kind: 'pen-append', base, loc, point: pt, latest: preview, moved: false };
    capture(e);
  }

  // ── Move (V) — translate the whole path under the pointer. ─────────────────
  function moveDown(e, pt) {
    const hit = hitTest(paths, pt, tol) || hitTestSegment(paths, pt, tol);
    if (!hit) return;
    dragRef.current = {
      kind: 'move-path',
      pathIndex: hit.pathIndex,
      start: pt,
      base: paths,
      latest: null,
      moved: false,
    };
    capture(e);
  }

  // ── Convert (Shift+C) — drag a corner to pull symmetric handles; click a
  //    smooth anchor to retract to a corner. Click-on-corner is a no-op (the
  //    spec pins only drag-corner→smooth and click-smooth→corner). ────────────
  function convertDown(e, pt) {
    const hit = hitTest(paths, pt, tol);
    if (hit?.part !== 'anchor') return;
    if (tryAltRetract(e, hit)) return;
    const a = anchorFromHit(paths, hit);
    dragRef.current = {
      kind: 'convert',
      target: hit,
      base: paths,
      wasSmooth: a?.type === 'smooth',
      latest: null,
      moved: false,
    };
    capture(e);
  }

  // ── Root handle (WI-P2-5) — drag the point to move, the arm end to re-aim.
  //    Checked BEFORE tool dispatch so it works under EVERY tool (it's not an
  //    anchor). previewRoot on move, one commit on up = one modal-local undo. ──
  function rootDown(e, pt, zone) {
    capture(e);
    dragRef.current = {
      kind: zone === 'arm' ? 'root-arm' : 'root-point',
      baseRoot: root,
      latest: null,
      moved: false,
    };
  }

  function onPointerDown(e) {
    // Space held → PAN this gesture (swallow: never draws/selects). Tracked in
    // VIEW space so the delta is independent of the current zoom.
    if (spaceRef.current) {
      capture(e);
      const v = toView(e);
      dragRef.current = { kind: 'pan', startView: v, base: view, moved: false };
      return;
    }
    const pt = toModel(e);
    // Root beats the tools: hit-test its point + growth-arm endpoint first.
    const rootZone = hitTestRoot(root, pt, tol, rootArmLen);
    if (rootZone) return rootDown(e, pt, rootZone);
    const cmd = e.metaKey || e.ctrlKey;
    // ⌘/Ctrl held while Pen is active → behave as Direct-Selection for this
    // gesture (Illustrator convention); release restores Pen automatically.
    if (tool === 'direct-select' || (tool === 'pen' && cmd)) {
      return directSelectDown(e, pt);
    }
    if (tool === 'pen') return penDown(e, pt);
    if (tool === 'move') return moveDown(e, pt);
    if (tool === 'convert') return convertDown(e, pt);
  }

  // Wheel → zoom ABOUT THE CURSOR: keep the model point under the pointer fixed
  // while scaling. Clamped so the view can't invert or run away.
  function onWheel(e) {
    e.preventDefault?.();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((prev) => {
      const scale = Math.min(40, Math.max(0.05, prev.scale * factor));
      const p = toView(e); // cursor in view space (constant across the zoom)
      const mx = (p.x - prev.tx) / prev.scale;
      const my = (p.y - prev.ty) / prev.scale;
      return { scale, tx: p.x - scale * mx, ty: p.y - scale * my };
    });
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    // Pan runs in VIEW space (no model inverse): shift the transform by the raw
    // screen delta so the content follows the cursor at any zoom.
    if (drag.kind === 'pan') {
      drag.moved = true;
      const v = toView(e);
      setView({
        tx: drag.base.tx + (v.x - drag.startView.x),
        ty: drag.base.ty + (v.y - drag.startView.y),
        scale: drag.base.scale,
      });
      return;
    }
    const pt = toModel(e);
    drag.moved = true;
    // Shift = constrain to 45° increments from the drag origin (anchor/handle).
    const cpt =
      e.shiftKey && drag.origin ? constrainTo45(drag.origin, pt) : pt;
    if (drag.kind === 'root-point') {
      const next = { ...drag.baseRoot, x: pt.x, y: pt.y };
      drag.latest = next;
      onRootPreview?.(next);
    } else if (drag.kind === 'root-arm') {
      let angle = angleFromArm(drag.baseRoot, pt);
      if (e.shiftKey) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const next = { ...drag.baseRoot, angle };
      drag.latest = next;
      onRootPreview?.(next);
    } else if (drag.kind === 'anchor') {
      const next = moveAnchor(drag.basePaths, drag.target, cpt);
      drag.latest = next;
      onPreview?.(next);
    } else if (drag.kind === 'handle') {
      const next = moveHandle(drag.basePaths, drag.target, cpt, { alt: e.altKey });
      drag.latest = next;
      onPreview?.(next);
    } else if (drag.kind === 'pen-append') {
      // Dragging turns the just-placed anchor SMOOTH: out follows the cursor.
      const next = appendAnchor(drag.base, drag.loc, drag.point, { outHandle: pt });
      drag.latest = next;
      onPreview?.(next);
    } else if (drag.kind === 'move-path') {
      const delta = { x: pt.x - drag.start.x, y: pt.y - drag.start.y };
      const next = moveWholePath(drag.base, drag.pathIndex, delta);
      drag.latest = next;
      onPreview?.(next);
    } else if (drag.kind === 'convert') {
      const next = setSmoothHandle(drag.base, drag.target, pt);
      drag.latest = next;
      onPreview?.(next);
    } else if (drag.kind === 'marquee') {
      setMarquee((m) => (m ? { ...m, x1: pt.x, y1: pt.y } : m));
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      // release captured pointer if any (guarded for jsdom)
      svgRef.current?.releasePointerCapture?.(0);
    } catch {
      /* noop */
    }
    if (!drag) return;
    if (drag.kind === 'pan') {
      return; // pan is view-only — no geometry commit, no undo step
    }
    if (drag.kind === 'root-point' || drag.kind === 'root-arm') {
      if (drag.moved && drag.latest) onRootCommit?.(drag.latest);
      return;
    }
    if (drag.kind === 'anchor' || drag.kind === 'handle' || drag.kind === 'move-path') {
      if (drag.moved && drag.latest) onCommit?.(drag.latest);
    } else if (drag.kind === 'pen-append') {
      if (drag.latest) {
        onCommit?.(drag.latest);
        // Next draft loc: an existing subpath keeps its loc; a freshly-created
        // path is the LAST entry of the committed result.
        const newLoc = drag.loc || {
          pathIndex: drag.latest.length - 1,
          subpathIndex: 0,
        };
        onPenDraftChange?.(newLoc);
      }
    } else if (drag.kind === 'convert') {
      if (drag.moved && drag.latest) {
        onCommit?.(drag.latest); // drag pulled symmetric handles → smooth
      } else if (drag.wasSmooth) {
        onCommit?.(convertAnchor(drag.base, drag.target, 'corner')); // click retract
      }
    } else if (drag.kind === 'marquee') {
      if (drag.moved && marquee) {
        onSelectionChange?.(marqueeSelect(paths, marquee));
      } else {
        onSelectionChange?.([]); // bare click on empty space clears selection
      }
      setMarquee(null);
    }
  }

  // Double-click an anchor → toggle corner↔smooth (Figma-ism, one commit).
  function onDoubleClick(e) {
    const pt = toModel(e);
    const hit = hitTest(paths, pt, tol);
    if (hit?.part !== 'anchor') return;
    const a = anchorFromHit(paths, hit);
    if (!a) return;
    onCommit?.(convertAnchor(paths, hit, a.type === 'smooth' ? 'corner' : 'smooth'));
  }

  return (
    <svg
      ref={svgRef}
      data-testid="motif-editor-canvas"
      viewBox={box}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none"
      style={{ minHeight: '360px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    >
      <defs>
        <pattern
          id="motif-editor-grid"
          width={gridStep}
          height={gridStep}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      {/* Pan/zoom view transform — everything (content + furniture + root) rides
          it so the whole scene translates/scales together. Default is identity. */}
      <g
        data-testid="motif-editor-view"
        transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
      >
      <rect
        x="-100000"
        y="-100000"
        width="200000"
        height="200000"
        fill="url(#motif-editor-grid)"
      />

      {/* Path stroke(s): verbatim `d` until edited, then re-emitted from the
          model so the live drag redraws. One element per working-copy path. */}
      <g style={{ color: 'var(--violet)' }}>
        {paths.map((p, i) => (
          <path
            key={i}
            data-testid="motif-editor-path"
            d={p.dirty && anchorsToD ? anchorsToD(p.model) : p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Handles first (under the anchor squares), then anchors on top. */}
      <g style={{ color: 'var(--violet)' }}>
        {paths.map((p, pi) =>
          (p.model?.subpaths || []).map((sp, si) =>
            (sp.anchors || []).map((a, ai) => {
              const selected = isSelected(selection, pi, si, ai);
              const showHandles = selected || a.type === 'smooth';
              if (!showHandles) return null;
              return ['in', 'out'].map((part) => {
                const h = a[part];
                if (!h) return null;
                return (
                  <g key={`${pi}-${si}-${ai}-${part}`} data-testid="motif-editor-handle">
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={h.x}
                      y2={h.y}
                      stroke="currentColor"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={h.x}
                      cy={h.y}
                      r={handleR}
                      fill="currentColor"
                      stroke="none"
                    />
                  </g>
                );
              });
            })
          )
        )}
      </g>

      <g style={{ color: 'var(--violet)' }}>
        {paths.map((p, pi) =>
          (p.model?.subpaths || []).map((sp, si) =>
            (sp.anchors || []).map((a, ai) => {
              const selected = isSelected(selection, pi, si, ai);
              return (
                <rect
                  key={`${pi}-${si}-${ai}`}
                  data-testid="motif-editor-anchor"
                  data-selected={selected ? 'true' : 'false'}
                  x={a.x - anchorHalf}
                  y={a.y - anchorHalf}
                  width={anchorHalf * 2}
                  height={anchorHalf * 2}
                  fill={selected ? 'currentColor' : 'var(--paper)'}
                  stroke="currentColor"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          )
        )}
      </g>

      {/* Marquee rubber-band (transient). */}
      {marquee && (
        <rect
          data-testid="motif-editor-marquee"
          x={Math.min(marquee.x0, marquee.x1)}
          y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)}
          height={Math.abs(marquee.y1 - marquee.y0)}
          fill="var(--violet)"
          fillOpacity="0.08"
          stroke="var(--violet)"
          strokeWidth="1"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Growth-direction arm — a line from the root point out along `angle`,
          tipped by a small jewel-madder handle. Drag the tip to re-aim the
          sprout. Rendered UNDER the ⊕ so the point stays grabbable at short arms. */}
      <g data-testid="motif-editor-root-arm" style={{ color: 'var(--jewel-madder)' }}>
        <line
          x1={rx}
          y1={ry}
          x2={armX}
          y2={armY}
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={armX}
          cy={armY}
          r={handleR * 1.2}
          fill="currentColor"
          stroke="none"
        />
      </g>

      {/* Root marker — distinct jewel-madder ⊕ crosshair (the sprout POINT). */}
      <g data-testid="motif-editor-root" style={{ color: 'var(--jewel-madder)' }}>
        <circle
          cx={rx}
          cy={ry}
          r={rootR}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={rx - rootR * 1.6}
          y1={ry}
          x2={rx + rootR * 1.6}
          y2={ry}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={rx}
          y1={ry - rootR * 1.6}
          x2={rx}
          y2={ry + rootR * 1.6}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      </g>
    </svg>
  );
}
