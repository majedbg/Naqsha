// @vitest-environment jsdom
// MotifEditorModal shell + useMotifEditor working-copy hook (WI-P2-2).
// Read-only render slice: the FIDELITY contract (verbatim `d` round-trip), the
// working-copy shape, viewRadius recompute, the used-by-N badge, the path/root
// render, the Save/Cancel/Save-as-copy commit seam, header rename, and the
// Escape-cancel + keydown-scoping trap.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The mini Preview renders through the real render pipeline (useCanvas → p5),
// impractical in jsdom — mock it so mounting/unmounting the preview is testable
// without a canvas. The modal itself never calls useCanvas directly.
vi.mock('../../lib/useCanvas', () => ({
  default: () => ({ patternInstances: {} }),
}));
import { renderHook, act } from '@testing-library/react';
import MotifEditorModal from './MotifEditorModal';
import { parseDToAnchors, anchorsToD } from '../../lib/motif/pathModel';
import useMotifEditor, {
  makeWorkingCopy,
  serializeWorkingCopy,
  recomputeViewRadius,
  usedByCount,
  boundsFromWorkingCopy,
  DEFAULT_ROOT,
} from './useMotifEditor';

// A realistic imported glyph: two verbatim subpaths (one with a cubic curve so a
// naive re-emit could NOT reproduce it byte-for-byte), off-origin coords, and a
// bbox-bottom-centre root (D7-reconcile) — NOT origin-centred like a built-in.
const importedGlyph = {
  name: 'Vine',
  tradition: 'imported',
  viewRadius: 14,
  root: { x: 6, y: 12, angle: 0 },
  paths: [
    { d: 'M2,2 C4,0 8,0 10,2 L10,10 L2,10 Z', closed: true },
    { d: 'M6,4 L6,8', closed: false },
  ],
};

// A built-in-shaped glyph: origin-centred, carries NO root.
const builtinGlyph = {
  id: 'diamond',
  name: 'Diamond',
  tradition: 'geometric',
  viewRadius: 8,
  paths: [{ d: 'M0,-8 L5,0 L0,8 L-5,0 Z', closed: true }],
};

// ── Slice 1: working copy + FIDELITY serialize ──────────────────────────────
describe('useMotifEditor — working copy', () => {
  it('exposes a parsed model per path (via injected parseD) while keeping verbatim d', () => {
    const parseD = vi.fn((d) => ({ from: d, subpaths: [{ anchors: [] }] }));
    const { result } = renderHook(() =>
      useMotifEditor(importedGlyph, { parseD })
    );
    const { working } = result.current;
    expect(working.name).toBe('Vine');
    expect(working.paths).toHaveLength(2);
    // Verbatim d preserved AND a model was parsed from it.
    expect(working.paths[0].d).toBe(importedGlyph.paths[0].d);
    expect(working.paths[0].model.from).toBe(importedGlyph.paths[0].d);
    expect(working.paths[0].dirty).toBe(false);
    expect(parseD).toHaveBeenCalledTimes(2);
  });

  it('FIDELITY: serialize() round-trips every d BYTE-IDENTICALLY when un-dirtied', () => {
    // No parseD/anchorsToD: proves serialize never needs them for a clean open.
    const wc = makeWorkingCopy(importedGlyph);
    const out = serializeWorkingCopy(wc);
    expect(out.paths.map((p) => p.d)).toEqual([
      importedGlyph.paths[0].d,
      importedGlyph.paths[1].d,
    ]);
    expect(out.paths.map((p) => p.closed)).toEqual([true, false]);
    expect(out.name).toBe('Vine');
    expect(out.tradition).toBe('imported');
    expect(out.viewRadius).toBe(14);
    expect(out.root).toEqual({ x: 6, y: 12, angle: 0 });
    // No `id` leaks into the serialized glyph (the store stamps it).
    expect(out).not.toHaveProperty('id');
  });

  it('defaults root to {0,0,0} for a built-in that carries none', () => {
    const wc = makeWorkingCopy(builtinGlyph);
    expect(wc.root).toEqual(DEFAULT_ROOT);
    expect(serializeWorkingCopy(wc).root).toEqual(DEFAULT_ROOT);
  });

  it('setName is a geometry-neutral edit: name changes, d stays verbatim', () => {
    const { result } = renderHook(() => useMotifEditor(importedGlyph));
    act(() => result.current.setName('Renamed Vine'));
    const out = result.current.serialize();
    expect(out.name).toBe('Renamed Vine');
    expect(out.paths[0].d).toBe(importedGlyph.paths[0].d);
  });
});

// ── Slice 2: recomputeViewRadius ────────────────────────────────────────────
describe('recomputeViewRadius', () => {
  it('is the max distance from root to any anchor across all subpaths', () => {
    const paths = [
      {
        model: {
          subpaths: [
            { anchors: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }, // dist 0, 5 from origin
          ],
        },
      },
      {
        model: {
          subpaths: [
            { anchors: [{ x: 6, y: 8 }] }, // dist 10 from origin
          ],
        },
      },
    ];
    // Root at origin → farthest anchor (6,8) is 10 away.
    expect(recomputeViewRadius(paths, { x: 0, y: 0 })).toBe(10);
    // Root at (6,8) → farthest anchor is (0,0), also 10 away.
    expect(recomputeViewRadius(paths, { x: 6, y: 8 })).toBe(10);
    // Root at (3,4) → (6,8) is 5 away, (0,0) is 5 away → 5.
    expect(recomputeViewRadius(paths, { x: 3, y: 4 })).toBe(5);
  });

  it('is 0 with no anchors / no models (nothing to measure)', () => {
    expect(recomputeViewRadius([], { x: 0, y: 0 })).toBe(0);
    expect(recomputeViewRadius([{ model: null }], { x: 1, y: 1 })).toBe(0);
  });

  it('includes bezier HANDLE points so a curve bulging past its anchors is not clipped', () => {
    // Anchors at radius 5 from origin, but an out-handle reaches to (0,20) → 20.
    // Anchors-only would return 5 and shrink the motif on the first edit; the
    // handle-aware bound returns 20 (a safe convex-hull over-estimate).
    const paths = [
      {
        model: {
          subpaths: [
            {
              anchors: [
                { x: 0, y: -5, in: null, out: { x: 0, y: 20 } },
                { x: 3, y: 4, in: null, out: null },
              ],
            },
          ],
        },
      },
    ];
    expect(recomputeViewRadius(paths, { x: 0, y: 0 })).toBe(20);
  });
});

// ── Slice 3: read-only render (path + root) ─────────────────────────────────
describe('MotifEditorModal — render', () => {
  it('draws each subpath as a fill:none path and renders the root marker', () => {
    render(
      <MotifEditorModal glyphId="cg-1" glyph={importedGlyph} layers={[]} />
    );
    const paths = screen.getAllByTestId('motif-editor-path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute('d', importedGlyph.paths[0].d);
    expect(paths[0]).toHaveAttribute('fill', 'none');
    expect(screen.getByTestId('motif-editor-root')).toBeInTheDocument();
    // The inert Preview checkbox is present + unchecked (layout settled).
    expect(screen.getByTestId('motif-editor-preview')).not.toBeChecked();
  });

  it('frames off-origin imported geometry (bounds scan includes coords + root)', () => {
    const b = boundsFromWorkingCopy(makeWorkingCopy(importedGlyph));
    // Path coords span x∈[2,10], y∈[0,10]; root (6,12) pushes maxY to 12.
    expect(b.minX).toBe(2);
    expect(b.maxX).toBe(10);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(12);
  });

  it('model-aware bounds frame an arc (H/V/A) correctly where a naive number-scan clips', () => {
    // A semicircular arc from (0,0) to (10,0). A naive `d` number-scan mis-pairs
    // the arc's rx/ry/flags and CLIPS the x=10 endpoint (maxX≈5); the parsed
    // cubic model captures the true extent (maxX≈10). This is the WI-P2-2
    // bounds-limitation fix (real bounds landed with the model in WI-P2-3).
    const arcGlyph = {
      name: 'Arc',
      tradition: 'imported',
      viewRadius: 5,
      root: { x: 5, y: 0, angle: 0 },
      paths: [{ d: 'M0,0 A5,5 0 0 1 10,0', closed: false }],
    };
    const naive = boundsFromWorkingCopy(makeWorkingCopy(arcGlyph)); // no model
    expect(naive.maxX).toBeLessThan(9); // number-scan clips the x=10 endpoint
    const exact = boundsFromWorkingCopy(makeWorkingCopy(arcGlyph, parseDToAnchors));
    expect(exact.maxX).toBeGreaterThan(9.5); // model reaches the true endpoint
    expect(exact.minX).toBeCloseTo(0, 1);
  });
});

// ── Slice 4: used-by-N badge ────────────────────────────────────────────────
describe('MotifEditorModal — used-by-N badge', () => {
  const layersFixture = [
    { id: 'a', params: { glyphRef: 'cg-1' } },
    { id: 'b', params: { glyphRef: 'cg-1' } },
    { id: 'c', params: { glyphRef: 'other' } },
    { id: 'd', params: {} },
  ];

  it('counts only layers referencing this glyphId', () => {
    expect(usedByCount(layersFixture, 'cg-1')).toBe(2);
    expect(usedByCount(layersFixture, 'other')).toBe(1);
    expect(usedByCount(layersFixture, 'none')).toBe(0);
  });

  it('shows the correct count + pluralization in the header', () => {
    const { rerender } = render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={layersFixture}
      />
    );
    expect(screen.getByTestId('motif-editor-usedby')).toHaveTextContent(
      'Used by 2 layers'
    );
    rerender(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[layersFixture[0]]}
      />
    );
    expect(screen.getByTestId('motif-editor-usedby')).toHaveTextContent(
      'Used by 1 layer'
    );
  });

  it('omits the badge when no layer uses the glyph', () => {
    render(<MotifEditorModal glyphId="cg-1" glyph={importedGlyph} layers={[]} />);
    expect(screen.queryByTestId('motif-editor-usedby')).toBeNull();
  });
});

// ── Slice 5: Save / Cancel / Save-as-copy commit seam ───────────────────────
describe('MotifEditorModal — commit seam', () => {
  it('Save calls onSave with the serialized glyph (verbatim d)', () => {
    const onSave = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByTestId('motif-editor-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const g = onSave.mock.calls[0][0];
    expect(g.paths[0].d).toBe(importedGlyph.paths[0].d);
    expect(g.name).toBe('Vine');
    expect(g).not.toHaveProperty('id');
  });

  it('Save as copy calls onSaveAsCopy with the serialized glyph', () => {
    const onSaveAsCopy = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        onSaveAsCopy={onSaveAsCopy}
      />
    );
    fireEvent.click(screen.getByTestId('motif-editor-save-copy'));
    expect(onSaveAsCopy).toHaveBeenCalledTimes(1);
    expect(onSaveAsCopy.mock.calls[0][0].paths).toHaveLength(2);
  });

  it('Cancel and the × / overlay call onCancel (discard)', () => {
    const onCancel = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByTestId('motif-editor-cancel'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

// ── Slice 6: header rename flows into the serialized glyph ───────────────────
describe('MotifEditorModal — rename', () => {
  it('typing a new name in the header updates the serialized name', () => {
    const onSave = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByTestId('motif-editor-name'), {
      target: { value: 'Trellis' },
    });
    fireEvent.click(screen.getByTestId('motif-editor-save'));
    expect(onSave.mock.calls[0][0].name).toBe('Trellis');
    // Geometry unchanged by the rename.
    expect(onSave.mock.calls[0][0].paths[0].d).toBe(importedGlyph.paths[0].d);
  });
});

// ── Slice 7: Escape → cancel; keydown is scoped to the editor ────────────────
describe('MotifEditorModal — keyboard trap', () => {
  it('Escape triggers cancel', () => {
    const onCancel = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(screen.getByTestId('motif-editor-dialog'), {
      key: 'Escape',
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('stops keydown from leaking to global app shortcuts', () => {
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <MotifEditorModal glyphId="cg-1" glyph={importedGlyph} layers={[]} />
      </div>
    );
    fireEvent.keyDown(screen.getByTestId('motif-editor-dialog'), { key: 'p' });
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});

// ── WI-P2-4: tool switching + Convert (double-click) ────────────────────────
describe('MotifEditorModal — tool switching', () => {
  // Three collinear corner anchors (deleting/converting the middle is clean).
  const rowGlyph = {
    name: 'Row',
    tradition: 'custom',
    viewRadius: 20,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: 'M0,0 L10,0 L20,0', closed: false }],
  };

  const renderModal = (props = {}) =>
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={rowGlyph}
        layers={[]}
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
        {...props}
      />
    );

  it('P / A / V / Shift+C keys switch the active tool (aria-pressed)', () => {
    renderModal();
    const dialog = screen.getByTestId('motif-editor-dialog');
    // Default: Direct-Select is active.
    expect(screen.getByTestId('motif-tool-select')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: 'p' });
    expect(screen.getByTestId('motif-tool-pen')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: 'v' });
    expect(screen.getByTestId('motif-tool-move')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: 'C', shiftKey: true });
    expect(screen.getByTestId('motif-tool-convert')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: 'a' });
    expect(screen.getByTestId('motif-tool-select')).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Phase 5 Slice 1 gap-close: `+`/`−` as dedicated KEY-bound tools ─────────
  // (Illustrator: `+` = Add-Anchor tool, `−` = Delete-Anchor tool), IN ADDITION
  // to the existing pen-hover add/delete behavior (unchanged, covered elsewhere).
  it('+ / = and - / _ keys switch to the Add-Anchor / Delete-Anchor tools (aria-pressed)', () => {
    renderModal();
    const dialog = screen.getByTestId('motif-editor-dialog');
    fireEvent.keyDown(dialog, { key: '+' });
    expect(screen.getByTestId('motif-tool-add-anchor')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: '-' });
    expect(screen.getByTestId('motif-tool-delete-anchor')).toHaveAttribute('aria-pressed', 'true');

    // The unshifted `=` and shifted `_` chords are accepted too (spec-choice).
    fireEvent.keyDown(dialog, { key: '=' });
    expect(screen.getByTestId('motif-tool-add-anchor')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(dialog, { key: '_' });
    expect(screen.getByTestId('motif-tool-delete-anchor')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Add-Anchor tool click on a segment adds an anchor; Delete-Anchor tool click on an anchor removes it', () => {
    renderModal();
    const dialog = screen.getByTestId('motif-editor-dialog');
    const svg = screen.getByTestId('motif-editor-canvas');
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(3);

    // Add-Anchor tool: click the midpoint of the (0,0)-(10,0) segment.
    fireEvent.keyDown(dialog, { key: '+' });
    fireEvent.pointerDown(svg, { clientX: 5, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 5, clientY: 0, pointerId: 1 });
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(4);

    // Delete-Anchor tool: click the anchor just added, back at (5,0).
    fireEvent.keyDown(dialog, { key: '-' });
    fireEvent.pointerDown(svg, { clientX: 5, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 5, clientY: 0, pointerId: 1 });
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(3);
  });

  it('opens with the initialTool when supplied (pen for "New motif…")', () => {
    renderModal({ initialTool: 'pen' });
    expect(screen.getByTestId('motif-tool-pen')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a toolbar button switches the tool', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('motif-tool-move'));
    expect(screen.getByTestId('motif-tool-move')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does NOT switch tools while typing in the name input', () => {
    renderModal();
    const input = screen.getByTestId('motif-editor-name');
    fireEvent.keyDown(input, { key: 'v' });
    // Still on the default Direct-Select tool (the guard swallowed the letter).
    expect(screen.getByTestId('motif-tool-select')).toHaveAttribute('aria-pressed', 'true');
  });

  it('double-clicking a corner anchor toggles it to smooth (handles appear)', () => {
    renderModal();
    // Corners: no handles rendered yet.
    expect(screen.queryAllByTestId('motif-editor-handle')).toHaveLength(0);
    const svg = screen.getByTestId('motif-editor-canvas');
    // Middle anchor sits at model (10,0) via the identity CTM fallback.
    fireEvent.doubleClick(svg, { clientX: 10, clientY: 0 });
    expect(screen.getAllByTestId('motif-editor-handle').length).toBeGreaterThan(0);
  });
});

// ── WI-P2-4: pen DRAW from scratch (blank glyph → closed subpath) ────────────
describe('MotifEditorModal — pen draw from scratch', () => {
  const blankGlyph = {
    name: 'New motif',
    tradition: 'custom',
    viewRadius: 0,
    root: { x: 0, y: 0, angle: 0 },
    paths: [],
  };

  it('drawing 3 anchors + closing the first yields a closed subpath; each step is one undo', () => {
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={blankGlyph}
        layers={[]}
        initialTool="pen"
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    const dialog = screen.getByTestId('motif-editor-dialog');
    const click = (x, y) => {
      fireEvent.pointerDown(svg, { clientX: x, clientY: y, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: x, clientY: y, pointerId: 1 });
    };

    // Three corner anchors on empty space (identity CTM: client == model).
    click(10, 10);
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(1);
    click(30, 10);
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(2);
    click(20, 30);
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(3);

    // Click the FIRST anchor (10,10) → close the subpath.
    click(10, 10);
    expect(screen.getAllByTestId('motif-editor-anchor')).toHaveLength(3);
    // The path re-emits from the model (dirty) and now carries a Z.
    expect(screen.getByTestId('motif-editor-path')).toHaveAttribute(
      'd',
      expect.stringMatching(/Z\s*$/)
    );

    // Each of the 4 gestures was ONE undo step → 4 undos empties the drawing.
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(dialog, { key: 'z', metaKey: true });
    }
    expect(screen.queryAllByTestId('motif-editor-anchor')).toHaveLength(0);
  });

  it('click-DRAG places a SMOOTH anchor (out at cursor, in mirrored)', () => {
    const onSave = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={blankGlyph}
        layers={[]}
        initialTool="pen"
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
        onSave={onSave}
      />
    );
    const svg = screen.getByTestId('motif-editor-canvas');
    // Down at (20,20), drag to (30,20), release: the placed anchor turns smooth.
    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 20, pointerId: 1 });
    // Handles now render (smooth anchor) — corners never do.
    expect(screen.getAllByTestId('motif-editor-handle').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('motif-editor-save'));
    const a = onSave.mock.calls[0][0];
    // Serialized d re-emits the smooth anchor from the model.
    expect(a.paths).toHaveLength(1);
    expect(a.paths[0].d).toMatch(/^M/);
  });
});

// ── WI-P2-5: Preview checkbox → mini full-canvas mount/unmount ───────────────
describe('MotifEditorModal — Preview toggle mounts the mini full-canvas', () => {
  const previewContext = {
    layers: [],
    canvasW: 400,
    canvasH: 300,
    bgColor: '#fff',
    operations: [],
    machineProfile: null,
    colorView: null,
    panels: [],
    customGlyphs: {},
    textFont: null,
  };

  it('checking Preview mounts MiniPreview; unchecking unmounts it', async () => {
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        parseD={parseDToAnchors}
        anchorsToD={anchorsToD}
        previewContext={previewContext}
      />
    );
    // Unchecked by default → no mini preview.
    expect(screen.queryByTestId('motif-editor-mini-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('motif-editor-preview'));
    // MiniPreview is React.lazy (its useCanvas import is kept off the static
    // graph) → the dynamic import resolves on a microtask, so await the mount.
    expect(
      await screen.findByTestId('motif-editor-mini-preview')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('motif-editor-preview'));
    expect(screen.queryByTestId('motif-editor-mini-preview')).toBeNull();
  });
});

// ── P4: "Save to my library" (promote) — login gate + premium scaffold ───────
describe('MotifEditorModal — Save to my library (P4)', () => {
  it('entitled + logged in: shows the promote button; click promotes the serialized glyph', () => {
    const onSaveToLibrary = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        canSaveToLibrary
        isLoggedIn
        onSaveToLibrary={onSaveToLibrary}
      />
    );
    const btn = screen.getByTestId('motif-editor-save-library');
    fireEvent.click(btn);
    expect(onSaveToLibrary).toHaveBeenCalledTimes(1);
    // Serialized working glyph (verbatim d), never the raw stored glyph.
    expect(onSaveToLibrary.mock.calls[0][0].paths[0].d).toBe(importedGlyph.paths[0].d);
  });

  it('logged OUT: the button prompts sign-in and does NOT promote', () => {
    const onSaveToLibrary = vi.fn();
    const onRequireSignIn = vi.fn();
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        canSaveToLibrary
        isLoggedIn={false}
        onSaveToLibrary={onSaveToLibrary}
        onRequireSignIn={onRequireSignIn}
      />
    );
    const btn = screen.getByTestId('motif-editor-save-library');
    fireEvent.click(btn);
    expect(onSaveToLibrary).not.toHaveBeenCalled();
    expect(onRequireSignIn).toHaveBeenCalledTimes(1);
  });

  it('NOT entitled (premium gate flipped on): the button is hidden entirely', () => {
    render(
      <MotifEditorModal
        glyphId="cg-1"
        glyph={importedGlyph}
        layers={[]}
        canSaveToLibrary={false}
        isLoggedIn
        onSaveToLibrary={vi.fn()}
      />
    );
    expect(screen.queryByTestId('motif-editor-save-library')).toBeNull();
  });
});
