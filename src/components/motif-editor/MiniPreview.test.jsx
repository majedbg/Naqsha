// @vitest-environment jsdom
// MiniPreview — the throttled mini full-canvas (WI-P2-5, D5). We do NOT exercise
// the real p5 canvas (impractical in jsdom); useCanvas is mocked so the two real
// risks are isolated: (a) the customGlyphs OVERRIDE injects the working glyph
// under its id, and (b) the rAF throttle COALESCES dense updates into ≤1 restamp.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// Capture every useCanvas call so we can inspect the positional args (the last
// one is the customGlyphs override map — the whole point of the component).
const canvasCalls = [];
vi.mock('../../lib/useCanvas', () => ({
  default: (...args) => {
    canvasCalls.push(args);
    return { patternInstances: {} };
  },
}));

import MiniPreview from './MiniPreview';

// Manual rAF stub: collect callbacks so tests can flush + count what survived
// cancellation (the coalescing signal).
let rafQueue = [];
let rafSeq = 0;
beforeEach(() => {
  canvasCalls.length = 0;
  rafQueue = [];
  rafSeq = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    rafSeq += 1;
    rafQueue.push({ id: rafSeq, cb, canceled: false });
    return rafSeq;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    const e = rafQueue.find((x) => x.id === id);
    if (e) e.canceled = true;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const flushRaf = () => {
  act(() => {
    rafQueue.filter((e) => !e.canceled).forEach((e) => e.cb());
  });
};
const pendingRaf = () => rafQueue.filter((e) => !e.canceled).length;

const ctx = {
  layers: [{ id: 'L1', params: { glyphRef: 'cg-1' } }],
  canvasW: 400,
  canvasH: 300,
  bgColor: '#fff',
  operations: [{ id: 'op' }],
  machineProfile: 'laser',
  colorView: 'material',
  panels: [{ id: 'p1' }],
  customGlyphs: { 'cg-2': { name: 'other' } },
  textFont: { family: 'x' },
};

const OVERRIDE_ARG = 12; // 13th positional arg of useCanvas is customGlyphs

describe('MiniPreview — customGlyphs override', () => {
  it('injects the working glyph under glyphId, merged over the document glyphs', () => {
    const workingGlyph = { name: 'wc', paths: [{ d: 'M0,0 L1,1', closed: false }] };
    render(<MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={workingGlyph} />);
    const last = canvasCalls[canvasCalls.length - 1];
    const override = last[OVERRIDE_ARG];
    expect(override['cg-1']).toBe(workingGlyph); // working copy under its id
    expect(override['cg-2']).toEqual({ name: 'other' }); // doc glyphs preserved
  });

  it('threads the same positional render inputs as RightPanel (transforms={}, no selection)', () => {
    render(<MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={{ name: 'wc' }} />);
    const a = canvasCalls[canvasCalls.length - 1];
    expect(a[1]).toBe(ctx.layers); // layers
    expect(a[2]).toBe(400); // canvasW
    expect(a[3]).toBe(300); // canvasH
    expect(a[4]).toBe('#fff'); // bgColor
    expect(a[5]).toEqual({}); // transforms
    expect(a[6]).toBeNull(); // selectedNodeId
    expect(a[7]).toBe(ctx.textFont); // font
    expect(a[8]).toBe(ctx.operations); // operations
    expect(a[9]).toBe('laser'); // machineProfile / outputMode
    expect(a[10]).toBe('material'); // colorView
    expect(a[11]).toBe(ctx.panels); // panels
  });
});

describe('MiniPreview — create-session layer rebind', () => {
  it('transiently rebinds targetLayer.glyphRef to glyphId so a not-yet-bound draft previews on its host', () => {
    // A CREATE session: the document layer L1 still points at its OLD glyph
    // ('cg-1'); the draft lives under MOTIF_DRAFT_ID and isn't bound in the doc.
    const draftCtx = {
      ...ctx,
      layers: [
        { id: 'L1', params: { glyphRef: 'cg-1' } },
        { id: 'L2', params: { glyphRef: 'cg-9' } },
      ],
    };
    render(
      <MiniPreview
        previewContext={draftCtx}
        glyphId="__motif_draft__"
        workingGlyph={{ name: 'draft' }}
        targetLayerId="L1"
      />
    );
    const previewLayers = canvasCalls[canvasCalls.length - 1][1];
    // L1 rebound to the draft id for the preview only...
    expect(previewLayers.find((l) => l.id === 'L1').params.glyphRef).toBe(
      '__motif_draft__'
    );
    // ...other layers untouched, and the REAL doc layers are not mutated.
    expect(previewLayers.find((l) => l.id === 'L2').params.glyphRef).toBe('cg-9');
    expect(draftCtx.layers[0].params.glyphRef).toBe('cg-1');
  });

  it('is an identity no-op on layers when no targetLayerId (edit session)', () => {
    render(
      <MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={{ name: 'wc' }} />
    );
    expect(canvasCalls[canvasCalls.length - 1][1]).toBe(ctx.layers);
  });
});

describe('MiniPreview — rAF throttle', () => {
  it('coalesces N rapid workingGlyph updates into ONE throttled restamp', () => {
    const g0 = { name: 'g0' };
    const { rerender } = render(
      <MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={g0} />
    );
    // First paint used g0 immediately (seed state), no wait for rAF.
    expect(canvasCalls[canvasCalls.length - 1][OVERRIDE_ARG]['cg-1']).toBe(g0);

    // Three rapid updates BEFORE any frame fires: each cancels the previous rAF.
    const g1 = { name: 'g1' };
    const g2 = { name: 'g2' };
    const g3 = { name: 'g3' };
    rerender(<MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={g1} />);
    rerender(<MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={g2} />);
    rerender(<MiniPreview previewContext={ctx} glyphId="cg-1" workingGlyph={g3} />);

    // Exactly one rAF survives cancellation → the drag coalesced to one frame.
    expect(pendingRaf()).toBe(1);

    // Flush: throttledGlyph advances to the LATEST (g3), skipping g1/g2 entirely.
    flushRaf();
    expect(canvasCalls[canvasCalls.length - 1][OVERRIDE_ARG]['cg-1']).toBe(g3);
  });
});
