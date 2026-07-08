// @vitest-environment jsdom
// PenCanvas render + callback-wiring smoke, and the useMotifEditor edit/undo
// slice (applyEdit / previewPaths / undo / redo + the discriminating drag
// sequence that proves undo returns to the PRE-drag state, not the last preview
// frame). CTM math is impractical in jsdom, so pointer drags run through
// PenCanvas's IDENTITY fallback (client px == model units); the geometry itself
// is TDD'd exhaustively in penMachine.test.js.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';

// MotifEditorModal (imported below) transitively pulls in MiniPreview → useCanvas
// → p5, which can't load headless. Mock the render seam; these tests exercise
// PenCanvas + the hook, never the mini full-canvas.
vi.mock('../../lib/useCanvas', () => ({
  default: () => ({ patternInstances: {} }),
}));
import { renderHook, act } from '@testing-library/react';
import PenCanvas from './PenCanvas';
import MotifEditorModal from './MotifEditorModal';
import useMotifEditor, { makeWorkingCopy } from './useMotifEditor';
import { parseDToAnchors, anchorsToD } from '../../lib/motif/pathModel.js';

// ── useMotifEditor — edit-commit + modal-local undo ─────────────────────────
describe('useMotifEditor — applyEdit / preview / undo / redo', () => {
  // A fake parseD giving controllable anchors so recomputeViewRadius is exact.
  const glyph = {
    name: 'G',
    tradition: 'custom',
    viewRadius: 5,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: 'M0,0 L3,4', closed: false }],
  };
  const parseD = () => ({ subpaths: [{ anchors: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }] });
  // A far-flung edited paths array (farthest anchor 10 from root → viewRadius 10).
  const edited = [
    {
      d: 'M6,8',
      closed: false,
      dirty: true,
      model: { subpaths: [{ anchors: [{ x: 6, y: 8 }] }] },
    },
  ];

  it('applyEdit swaps paths, recomputes viewRadius, and pushes one undo step', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    expect(result.current.working.viewRadius).toBe(5);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.applyEdit(edited));
    expect(result.current.working.paths).toBe(edited);
    expect(result.current.working.viewRadius).toBe(10); // dist root→(6,8)
    expect(result.current.canUndo).toBe(true);
  });

  it('undo restores prior paths + viewRadius; redo re-applies', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    const before = result.current.working.paths;
    act(() => result.current.applyEdit(edited));
    act(() => result.current.undo());
    expect(result.current.working.paths).toBe(before);
    expect(result.current.working.viewRadius).toBe(5);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.working.paths).toBe(edited);
    expect(result.current.working.viewRadius).toBe(10);
  });

  it('previewPaths swaps paths transiently WITHOUT snapshotting (no undo step)', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    act(() => result.current.previewPaths(edited));
    expect(result.current.working.paths).toBe(edited);
    expect(result.current.canUndo).toBe(false); // no snapshot from a preview
  });

  it('DRAG SEQUENCE: many previews + one applyEdit = ONE undo step back to PRE-drag', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    const p0 = result.current.working.paths; // pre-drag committed
    const p1 = [{ ...glyph.paths[0], dirty: true, model: { subpaths: [{ anchors: [{ x: 1, y: 0 }] }] } }];
    const p2 = [{ ...glyph.paths[0], dirty: true, model: { subpaths: [{ anchors: [{ x: 6, y: 8 }] }] } }];
    act(() => result.current.previewPaths(p1));
    act(() => result.current.previewPaths(p2));
    act(() => result.current.applyEdit(p2));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    // Back to the PRE-drag state — NOT p2/p1 (the buggy last-preview snapshot).
    expect(result.current.working.paths).toBe(p0);
    act(() => result.current.redo());
    expect(result.current.working.paths).toBe(p2);
  });
});

// ── useMotifEditor — root commit (WI-P2-5, undoable + viewRadius-aware) ──────
describe('useMotifEditor — previewRoot / applyRoot', () => {
  // Farthest anchor is (3,4). Moving the root away from origin grows viewRadius.
  const glyph = {
    name: 'R',
    tradition: 'custom',
    viewRadius: 5,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: 'M0,0 L3,4', closed: false }],
  };
  const parseD = () => ({ subpaths: [{ anchors: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }] });

  it('previewRoot swaps root transiently WITHOUT snapshotting (no undo step)', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    act(() => result.current.previewRoot({ x: 3, y: 4, angle: 0 }));
    expect(result.current.working.root).toEqual({ x: 3, y: 4, angle: 0 });
    expect(result.current.canUndo).toBe(false);
  });

  it('applyRoot recomputes viewRadius from paths+newRoot and is ONE undo step', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    expect(result.current.working.viewRadius).toBe(5); // dist (0,0)→(3,4)
    // Move root to (-3,-4): farthest anchor (3,4) is now 10 away.
    act(() => result.current.applyRoot({ x: -3, y: -4, angle: 1 }));
    expect(result.current.working.root).toEqual({ x: -3, y: -4, angle: 1 });
    expect(result.current.working.viewRadius).toBe(10);
    expect(result.current.canUndo).toBe(true);
  });

  it('undo restores the prior root + viewRadius; redo re-applies', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    act(() => result.current.applyRoot({ x: -3, y: -4, angle: 1 }));
    act(() => result.current.undo());
    expect(result.current.working.root).toEqual({ x: 0, y: 0, angle: 0 });
    expect(result.current.working.viewRadius).toBe(5);
    act(() => result.current.redo());
    expect(result.current.working.root).toEqual({ x: -3, y: -4, angle: 1 });
    expect(result.current.working.viewRadius).toBe(10);
  });

  it('DRAG SEQUENCE: many previewRoot + one applyRoot = ONE undo step to PRE-drag', () => {
    const { result } = renderHook(() => useMotifEditor(glyph, { parseD }));
    act(() => result.current.previewRoot({ x: 1, y: 1, angle: 0 }));
    act(() => result.current.previewRoot({ x: -3, y: -4, angle: 0 }));
    act(() => result.current.applyRoot({ x: -3, y: -4, angle: 0 }));
    act(() => result.current.undo());
    expect(result.current.working.root).toEqual({ x: 0, y: 0, angle: 0 });
  });
});

// ── useMotifEditor — serialize fidelity after an edit ───────────────────────
describe('useMotifEditor — serialize dirty vs verbatim', () => {
  const glyph = {
    name: 'Two',
    tradition: 'custom',
    viewRadius: 10,
    root: { x: 0, y: 0, angle: 0 },
    paths: [
      { d: 'M0,0 C1,1 2,2 3,3', closed: false },
      { d: 'M4,4 L5,5', closed: false },
    ],
  };

  it('emits anchorsToD(model) for an edited (dirty) path, verbatim d for untouched', () => {
    const { result } = renderHook(() =>
      useMotifEditor(glyph, { parseD: parseDToAnchors, anchorsToD })
    );
    // Dirty only the FIRST path via a commit; the model round-trips its shape.
    const paths = result.current.working.paths;
    const next = [{ ...paths[0], dirty: true }, paths[1]];
    act(() => result.current.applyEdit(next));
    const out = result.current.serialize();
    // Edited path re-emitted from the model (starts with an M, is a valid d)…
    expect(out.paths[0].d).toMatch(/^M/);
    expect(out.paths[0].d).not.toBe(glyph.paths[0].d); // normalized, not verbatim
    // …untouched path stays byte-for-byte verbatim.
    expect(out.paths[1].d).toBe(glyph.paths[1].d);
  });
});

// ── PenCanvas — render ──────────────────────────────────────────────────────
describe('PenCanvas — render', () => {
  const glyph = {
    name: 'Curve',
    tradition: 'custom',
    viewRadius: 10,
    root: { x: 2, y: 2, angle: 0 },
    paths: [{ d: 'M0,0 C2,2 8,2 10,0', closed: false }],
  };

  function renderCanvas(props = {}) {
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    return {
      working,
      ...render(
        <PenCanvas
          working={working}
          box="-4 -4 18 18"
          span={18}
          gridStep={1.5}
          selection={props.selection ?? []}
          anchorsToD={anchorsToD}
          onPreview={props.onPreview ?? vi.fn()}
          onCommit={props.onCommit ?? vi.fn()}
          onSelectionChange={props.onSelectionChange ?? vi.fn()}
        />
      ),
    };
  }

  it('renders the canvas svg, one path per subpath-bearing path, anchors and root', () => {
    const { working } = renderCanvas();
    expect(screen.getByTestId('motif-editor-canvas')).toBeInTheDocument();
    expect(screen.getAllByTestId('motif-editor-path')).toHaveLength(working.paths.length);
    const totalAnchors = working.paths.reduce(
      (n, p) => n + p.model.subpaths.reduce((m, sp) => m + sp.anchors.length, 0),
      0
    );
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(totalAnchors);
    expect(screen.getByTestId('motif-editor-root')).toBeInTheDocument();
  });

  it('keeps an un-dirtied path stroke verbatim (dirty:false → p.d, not anchorsToD)', () => {
    renderCanvas();
    expect(screen.getAllByTestId('motif-editor-path')[0]).toHaveAttribute(
      'd',
      glyph.paths[0].d
    );
  });

  it('shows handles for a selected anchor', () => {
    // Select anchor 0 of path 0 subpath 0 (a cubic endpoint → has an out handle).
    renderCanvas({
      selection: [{ pathIndex: 0, subpathIndex: 0, anchorIndex: 0 }],
    });
    expect(screen.getAllByTestId('motif-editor-handle').length).toBeGreaterThan(0);
  });
});

// ── PenCanvas — drag wiring smoke (identity CTM fallback) ────────────────────
describe('PenCanvas — drag wiring', () => {
  // A straight two-anchor path so the grabbed anchor has no handles to confuse
  // hit-testing. Anchor 0 sits at model (10,10).
  const glyph = {
    name: 'Line',
    tradition: 'custom',
    viewRadius: 30,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: 'M10,10 L30,10', closed: false }],
  };

  it('pointerdown+move+up on an anchor fires onPreview then onCommit with moved coords', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        anchorsToD={anchorsToD}
        onPreview={onPreview}
        onCommit={onCommit}
        onSelectionChange={vi.fn()}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    // Identity fallback: clientX/clientY == model coords. tol = span*0.03 = 3.
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 20, clientY: 20, pointerId: 1 });

    expect(onPreview).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    const a0 = committed[0].model.subpaths[0].anchors[0];
    expect(a0.x).toBeCloseTo(20, 3);
    expect(a0.y).toBeCloseTo(20, 3);
    expect(committed[0].dirty).toBe(true);
  });

  it('a bare click on empty space clears the selection', () => {
    const onSelectionChange = vi.fn();
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[{ pathIndex: 0, subpathIndex: 0, anchorIndex: 0 }]}
        anchorsToD={anchorsToD}
        onPreview={vi.fn()}
        onCommit={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    // Far from any anchor → empty; down+up with no move = click.
    fireEvent.pointerDown(svg, { clientX: 90, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 90, pointerId: 1 });
    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });
});

// ── PenCanvas — root handle + pan/zoom + Shift-constrain (WI-P2-5) ───────────
describe('PenCanvas — root handle', () => {
  // Root sits well away from the two anchors so root hit-tests never collide.
  const glyph = {
    name: 'Root',
    tradition: 'custom',
    viewRadius: 60,
    root: { x: 50, y: 10, angle: 0 }, // arm points +x; end = (50+armLen, 10)
    paths: [{ d: 'M0,0 L4,0', closed: false }],
  };
  // span=100 → armLen = span*0.12 = 12 → arm end at (62,10). tol = span*0.03 = 3.
  function renderRoot(props = {}) {
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    return render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        anchorsToD={anchorsToD}
        onPreview={vi.fn()}
        onCommit={vi.fn()}
        onSelectionChange={vi.fn()}
        onRootPreview={props.onRootPreview ?? vi.fn()}
        onRootCommit={props.onRootCommit ?? vi.fn()}
      />
    );
  }

  it('renders a distinct root ⊕ and a growth arm handle', () => {
    renderRoot();
    expect(screen.getByTestId('motif-editor-root')).toBeInTheDocument();
    expect(screen.getByTestId('motif-editor-root-arm')).toBeInTheDocument();
  });

  it('dragging the root POINT fires onRootPreview then onRootCommit with new xy', () => {
    const onRootPreview = vi.fn();
    const onRootCommit = vi.fn();
    renderRoot({ onRootPreview, onRootCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    fireEvent.pointerDown(svg, { clientX: 50, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 15, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 15, pointerId: 1 });
    expect(onRootPreview).toHaveBeenCalled();
    expect(onRootCommit).toHaveBeenCalledTimes(1);
    const r = onRootCommit.mock.calls[0][0];
    expect(r.x).toBeCloseTo(60, 3);
    expect(r.y).toBeCloseTo(15, 3);
    expect(r.angle).toBeCloseTo(0, 6); // point drag leaves the angle alone
  });

  it('dragging the ARM end sets a new growth angle (commit)', () => {
    const onRootCommit = vi.fn();
    renderRoot({ onRootCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    // Arm end at (62,10); drag to straight-up from the root → angle = +π/2.
    fireEvent.pointerDown(svg, { clientX: 62, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 50, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 50, clientY: 30, pointerId: 1 });
    expect(onRootCommit).toHaveBeenCalledTimes(1);
    const r = onRootCommit.mock.calls[0][0];
    expect(r.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(r.x).toBeCloseTo(50, 6); // arm drag leaves the point alone
  });

  it('Shift while dragging the arm snaps the angle to a 45° increment', () => {
    const onRootCommit = vi.fn();
    renderRoot({ onRootCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    // Raw angle atan2(11,10) ≈ 47.7° snaps to 45°.
    fireEvent.pointerDown(svg, { clientX: 62, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 21, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 21, shiftKey: true, pointerId: 1 });
    const r = onRootCommit.mock.calls[0][0];
    expect(r.angle).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe('PenCanvas — pan / zoom / Shift-constrain', () => {
  const glyph = {
    name: 'Line',
    tradition: 'custom',
    viewRadius: 30,
    root: { x: 80, y: 80, angle: 0 },
    paths: [{ d: 'M10,10 L30,10', closed: false }],
  };
  function renderPan(props = {}) {
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    return render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        anchorsToD={anchorsToD}
        onPreview={props.onPreview ?? vi.fn()}
        onCommit={props.onCommit ?? vi.fn()}
        onSelectionChange={vi.fn()}
        onRootPreview={vi.fn()}
        onRootCommit={vi.fn()}
      />
    );
  }

  it('a wheel scroll zooms the view (scale changes)', () => {
    renderPan();
    const svg = screen.getByTestId('motif-editor-canvas');
    const view = screen.getByTestId('motif-editor-view');
    expect(view.getAttribute('transform')).toMatch(/scale\(1\)/);
    fireEvent.wheel(svg, { deltaY: -100, clientX: 0, clientY: 0 });
    const t = view.getAttribute('transform');
    const m = /scale\(([\d.]+)\)/.exec(t);
    expect(Number(m[1])).toBeGreaterThan(1);
  });

  it('Space + drag pans the view (translate changes) and does NOT draw', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    renderPan({ onPreview, onCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    const view = screen.getByTestId('motif-editor-view');
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    // Start the drag over empty space; with space held it pans, not marquee/draw.
    fireEvent.pointerDown(svg, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 25, clientY: 15, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 25, clientY: 15, pointerId: 1 });
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    const t = view.getAttribute('transform');
    expect(t).toMatch(/translate\(20\s+10\)/); // screen delta (20,10)
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('hit-testing still resolves an anchor AFTER a pan', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    renderPan({ onPreview, onCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    // Pan by (20,10): the anchor at model (10,10) now lives at screen (30,20).
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    // Grab the anchor at its NEW screen position and drag it.
    fireEvent.pointerDown(svg, { clientX: 30, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 20, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    const a0 = committed[0].model.subpaths[0].anchors[0];
    // screen (40,20) un-pans to model (20,10).
    expect(a0.x).toBeCloseTo(20, 3);
    expect(a0.y).toBeCloseTo(10, 3);
  });

  it('Shift while dragging an anchor constrains it to a 45° ray from its start', () => {
    const onCommit = vi.fn();
    renderPan({ onCommit });
    const svg = screen.getByTestId('motif-editor-canvas');
    // Grab anchor0 at (10,10); drag with Shift toward (20,21): the vector
    // (10,11) snaps to the 45° diagonal → equal x/y offset from the start.
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 20, clientY: 21, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 20, clientY: 21, shiftKey: true, pointerId: 1 });
    const committed = onCommit.mock.calls[0][0];
    const a0 = committed[0].model.subpaths[0].anchors[0];
    // On the 45° ray from (10,10): dx === dy.
    expect(a0.x - 10).toBeCloseTo(a0.y - 10, 6);
    expect(a0.x).toBeGreaterThan(10);
  });
});

// ── PenCanvas — Space mid-pen-append repositions the anchor (Illustrator) ────
// Phase 5 Slice 1 gap-close: "Space while PLACING a pen anchor = reposition
// that anchor" (docs/svg-motif-editor-P2-PLAN.md hotkey table). Reuses the SAME
// spaceRef pan flag; only the pen-append branch of onPointerMove changes.
describe('PenCanvas — pen-append + Space reposition', () => {
  const blank = {
    name: 'New',
    tradition: 'custom',
    viewRadius: 0,
    root: { x: 0, y: 0, angle: 0 },
    paths: [],
  };

  it('holding Space mid-drag moves the anchor POINT (corner, no handle); releasing resumes the handle-pull from THAT point', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const working = makeWorkingCopy(blank, parseDToAnchors);
    render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        tool="pen"
        penDraft={null}
        anchorsToD={anchorsToD}
        onPreview={onPreview}
        onCommit={onCommit}
        onSelectionChange={vi.fn()}
        onPenDraftChange={vi.fn()}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    const lastPreview = () => {
      const paths = onPreview.mock.calls[onPreview.mock.calls.length - 1][0];
      return paths[paths.length - 1].model.subpaths[0].anchors[0];
    };

    // Place the anchor at (20,20), then drag WITHOUT space: normal behavior —
    // the out handle follows the cursor, point stays put.
    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 20, pointerId: 1 });
    let a = lastPreview();
    expect(a.type).toBe('smooth');
    expect(a.x).toBeCloseTo(20, 3);

    // Hold Space: further move REPOSITIONS the point instead (corner, no handle).
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 25, pointerId: 1 });
    a = lastPreview();
    expect(a.type).toBe('corner');
    expect(a.x).toBeCloseTo(40, 3);
    expect(a.y).toBeCloseTo(25, 3);

    // Release Space: dragging resumes pulling a SMOOTH handle, from the
    // REPOSITIONED point (40,25) — not the original down-point (20,20).
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    fireEvent.pointerMove(svg, { clientX: 55, clientY: 25, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 55, clientY: 25, pointerId: 1 });

    // One undo step for the whole gesture.
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    const final = committed[committed.length - 1].model.subpaths[0].anchors[0];
    expect(final.type).toBe('smooth');
    expect(final.x).toBeCloseTo(40, 3);
    expect(final.y).toBeCloseTo(25, 3);
    expect(final.out.x).toBeCloseTo(55, 3);
  });
});

// ── PenCanvas — Shift 45°-constrain also covers pen-DRAW + whole-path MOVE ───
// Table row "Shift (while dragging/drawing) — Constrain to 45° increments" was
// only wired for anchor/handle/root drags; the pen tool's click-drag (placing a
// smooth handle) and the V/Move-path drag never read shiftKey. Closed alongside
// Gap A/B as a genuine LOCKED-table gap found on re-scan (small, same pattern).
describe('PenCanvas — Shift constrains pen-draw and whole-path move', () => {
  const blank = {
    name: 'New',
    tradition: 'custom',
    viewRadius: 0,
    root: { x: 0, y: 0, angle: 0 },
    paths: [],
  };

  it('Shift during a pen click-drag snaps the out-handle to a 45° ray from the anchor', () => {
    const onPreview = vi.fn();
    const working = makeWorkingCopy(blank, parseDToAnchors);
    render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        tool="pen"
        penDraft={null}
        anchorsToD={anchorsToD}
        onPreview={onPreview}
        onCommit={vi.fn()}
        onSelectionChange={vi.fn()}
        onPenDraftChange={vi.fn()}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    // Anchor placed at (20,20); drag with Shift toward (30,31) — a (10,11) raw
    // delta, ~47.7° — snaps to the nearest 45° ray (equal x/y offset).
    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 31, shiftKey: true, pointerId: 1 });
    const paths = onPreview.mock.calls[onPreview.mock.calls.length - 1][0];
    const a = paths[paths.length - 1].model.subpaths[0].anchors[0];
    expect(a.type).toBe('smooth');
    expect(a.out.x - 20).toBeCloseTo(a.out.y - 20, 6);
  });

  it('Shift while dragging the whole path (V) constrains the move to a 45° ray', () => {
    const glyph = {
      name: 'Line',
      tradition: 'custom',
      viewRadius: 30,
      root: { x: 0, y: 0, angle: 0 },
      paths: [{ d: 'M10,10 L30,10', closed: false }],
    };
    const onCommit = vi.fn();
    const working = makeWorkingCopy(glyph, parseDToAnchors);
    render(
      <PenCanvas
        working={working}
        box="0 0 100 100"
        span={100}
        gridStep={8}
        selection={[]}
        tool="move"
        anchorsToD={anchorsToD}
        onPreview={vi.fn()}
        onCommit={onCommit}
        onSelectionChange={vi.fn()}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    // Grab the path on its segment (model x=20,y=10 is on M10,10 L30,10); drag
    // with Shift toward (30,21) — a slightly-off-diagonal (10,11) raw delta —
    // and it should snap the MOVE to the 45° diagonal (equal x/y offset).
    fireEvent.pointerDown(svg, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 21, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 21, shiftKey: true, pointerId: 1 });
    const committed = onCommit.mock.calls[0][0];
    const a0 = committed[0].model.subpaths[0].anchors[0];
    // Started at (10,10); a 45° move keeps dx === dy.
    expect(a0.x - 10).toBeCloseTo(a0.y - 10, 6);
    expect(a0.x).toBeGreaterThan(10);
  });
});

// ── MotifEditorModal — editor hotkey scoping (guard + canvas delete) ─────────
describe('MotifEditorModal — key scoping', () => {
  // Three collinear corner anchors: deleting the middle one leaves 2 → the
  // subpath survives so the anchor count drops by exactly one.
  const glyph = {
    name: 'Row',
    tradition: 'custom',
    viewRadius: 20,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: 'M0,0 L10,0 L20,0', closed: false }],
  };

  it('does NOT hijack Backspace inside the name input (native char-delete survives)', () => {
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={glyph}
        layers={[]}
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
      />
    );
    const input = screen.getByTestId('motif-editor-name');
    const ev = createEvent.keyDown(input, { key: 'Backspace' });
    fireEvent(input, ev);
    expect(ev.defaultPrevented).toBe(false); // field keeps its default
  });

  it('Delete on the canvas removes the selected anchor (commit → one fewer anchor)', () => {
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={glyph}
        layers={[]}
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
      />
    );
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(3);
    const svg = screen.getByTestId('motif-editor-canvas');
    // Select the middle anchor (model x=10) via the identity CTM fallback.
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 0, pointerId: 1 });
    // Delete lands on the dialog (target is the div, not an input) → not guarded.
    fireEvent.keyDown(screen.getByTestId('motif-editor-dialog'), { key: 'Delete' });
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(2);
  });
});
