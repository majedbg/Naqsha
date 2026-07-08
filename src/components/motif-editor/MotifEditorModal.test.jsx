// @vitest-environment jsdom
// MotifEditorModal shell + useMotifEditor working-copy hook (WI-P2-2).
// Read-only render slice: the FIDELITY contract (verbatim `d` round-trip), the
// working-copy shape, viewRadius recompute, the used-by-N badge, the path/root
// render, the Save/Cancel/Save-as-copy commit seam, header rename, and the
// Escape-cancel + keydown-scoping trap.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import MotifEditorModal from './MotifEditorModal';
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
