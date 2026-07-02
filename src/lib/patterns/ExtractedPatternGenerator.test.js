// ExtractedPatternGenerator (S0, issue #49) — runtime Pattern subclass that
// faithfully renders a saved ExtractedPattern tile (static single-tile
// placement, centered). Tests exercise the Pattern interface externally:
// generate() through a RecordingContext (headless canvas), toSVGGroup()
// output (verbatim d + engrave/cut/score role mapping), and dynamic-registry
// + picker-catalog integration (custom family).

import { describe, it, expect, afterEach } from 'vitest';
import { RecordingContext } from './drawingContext.js';
import { makeExtractedPattern } from '../extraction/extractedPattern';
import {
  makeExtractedPatternClass,
  registerExtractedPattern,
} from './ExtractedPatternGenerator';
import {
  getDynamicPatternClass,
  getDynamicTypes,
  unregisterPattern,
} from '../patternRegistry';
import { getVisiblePatterns } from '../patternCatalog';

const entity = (over = {}) =>
  makeExtractedPattern({
    patternId: 'extracted-test-1',
    title: 'Test tile',
    tile: {
      width: 60,
      height: 40,
      fills: [
        { d: 'M20 10 L40 10 L40 30 L20 30 Z', role: 'engrave' },
        { d: 'M5 5 L9 5 L9 9 L5 9 Z', role: 'cut' },
      ],
      strokes: [],
    },
    ...over,
  });

afterEach(() => unregisterPattern('extracted-test-1'));

describe('makeExtractedPatternClass — generate()', () => {
  it('draws the tile centered on the canvas as shapes', () => {
    const Cls = makeExtractedPatternClass(entity());
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, {}, 200, 100, '#112233', 100);

    const verts = ctx.calls.filter((c) => c.op === 'vertex');
    expect(verts.length).toBeGreaterThan(0);
    // Tile 60×40 centered in 200×100 → offset (70, 30). First fill's square
    // spans x 20..40, y 10..30 → canvas x 90..110, y 40..60.
    const first4 = verts.slice(0, 4).map((c) => c.args);
    for (const [x, y] of first4) {
      expect(x).toBeGreaterThanOrEqual(89.9);
      expect(x).toBeLessThanOrEqual(110.1);
      expect(y).toBeGreaterThanOrEqual(39.9);
      expect(y).toBeLessThanOrEqual(60.1);
    }
    // Closed contours close their shapes.
    const ends = ctx.calls.filter((c) => c.op === 'endShape');
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(ends[0].args[0]).toBe(ctx.CLOSE);
  });

  it('flattens curve commands instead of dropping them', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'curvy',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M2 10 C2 5 18 5 18 10 c0 5 -16 5 -16 0Z', role: 'engrave' }],
        strokes: [],
      },
    });
    const Cls = makeExtractedPatternClass(e);
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, {}, 20, 20, '#000', 100);
    const verts = ctx.calls.filter((c) => c.op === 'vertex');
    // Bézier sampling yields many more vertices than the 2 anchor points.
    expect(verts.length).toBeGreaterThan(6);
  });
});

describe('makeExtractedPatternClass — toSVGGroup()', () => {
  it('emits verbatim d, centering transform, and fabrication role mapping', () => {
    const Cls = makeExtractedPatternClass(entity());
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 200, 100, '#112233', 80);
    const svg = inst.toSVGGroup('layer-7', '#445566', 80);

    expect(svg).toContain('id="layer-7"');
    expect(svg).toContain('opacity="0.8"');
    expect(svg).toContain('translate(70 30)'); // (200-60)/2, (100-40)/2
    // Verbatim geometry (faithful digitization — locked decision 1).
    expect(svg).toContain('d="M20 10 L40 10 L40 30 L20 30 Z"');
    // Fills render filled with evenodd (hole subpaths survive).
    expect(svg).toContain('fill="#445566"');
    expect(svg).toContain('fill-rule="evenodd"');
    // Engrave/cut/score mapping on the saved geometry.
    expect(svg).toContain('data-role="engrave"');
    expect(svg).toContain('data-role="cut"');
  });

  it('renders strokes as unfilled stroked paths with their role', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'stroked',
      tile: {
        width: 10,
        height: 10,
        fills: [],
        strokes: [{ d: 'M1 1 L9 9', role: 'score' }],
      },
    });
    const Cls = makeExtractedPatternClass(e);
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 10, 10, '#000', 100);
    const svg = inst.toSVGGroup('l', '#000000', 100);
    expect(svg).toContain('data-role="score"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#000000"');
  });

  // S6 (issue #55): a centerline exports as ONE single-path score — exactly
  // one <path> per stroke, its verbatim d, no fill and no fill-rule (a filled
  // outline would double the laser's travel).
  it('exports each centerline stroke exactly once with no fill attributes', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'mixed',
      tile: {
        width: 80,
        height: 60,
        fills: [{ d: 'M20 20 L40 20 L40 40 L20 40 Z', role: 'engrave' }],
        strokes: [
          { d: 'M10.5 30.5 L69.5 30.5', role: 'score' },
          { d: 'M40 10 L40 50', role: 'cut' },
        ],
      },
    });
    const Cls = makeExtractedPatternClass(e);
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 80, 60, '#000', 100);
    const svg = inst.toSVGGroup('layer-1', '#112233', 100);

    expect(svg.match(/<path /g)).toHaveLength(3); // 1 fill + 2 strokes, no doubles
    const strokeLines = svg.split('\n').filter((l) => l.includes('fill="none"'));
    expect(strokeLines).toHaveLength(2);
    expect(strokeLines[0]).toContain('d="M10.5 30.5 L69.5 30.5"'); // verbatim single path
    expect(strokeLines[0]).toContain('data-role="score"');
    expect(strokeLines[0]).not.toContain('fill-rule');
    expect(strokeLines[1]).toContain('data-role="cut"');
    expect(strokeLines[1]).toContain('stroke="#112233"');
  });

  it('draws strokes on canvas unfilled (stroke only)', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'line',
      tile: {
        width: 20,
        height: 20,
        fills: [],
        strokes: [{ d: 'M2 10 L18 10', role: 'score' }],
      },
    });
    const Cls = makeExtractedPatternClass(e);
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, {}, 20, 20, '#000', 100);
    const ops = ctx.calls.map((c) => c.op);
    expect(ops).toContain('noFill');
    expect(ops).toContain('stroke');
    // The open polyline is not closed on canvas either.
    const end = ctx.calls.find((c) => c.op === 'endShape');
    expect(end.args[0]).toBeUndefined();
  });
});

// Adversarial-review finding 1: toSVGGroup output is injected raw into the
// document (pattern-picker thumbnails via dangerouslySetInnerHTML) and into
// exported SVG files, so EVERY attribute interpolation must be escaped. The
// entity here is built directly (bypassing deserialize validation) to prove
// the generator is safe on its own layer too — defense in depth.
describe('makeExtractedPatternClass — toSVGGroup() escaping', () => {
  const craftedEntity = () => ({
    patternId: 'extracted-test-1',
    title: 'crafted',
    source: 'extracted',
    visibility: 'private',
    tile: {
      width: 10,
      height: 10,
      fills: [{ d: 'M0 0Z"><script>alert(1)</script>', role: 'engrave" onload="alert(1)' }],
      strokes: [{ d: 'M1 1 L2 2"><img src=x onerror=alert(2)>', role: 'score' }],
    },
    lattice: null,
    photoPath: null,
  });

  it('emits no executable content from crafted d / role values', () => {
    const Cls = makeExtractedPatternClass(craftedEntity());
    const inst = new Cls();
    const svg = inst.toSVGGroup('layer-1', '#000000', 100);
    // No raw markup can appear — every `<`, `>`, `"` is escaped, so the
    // payload can neither open a tag nor break out of its attribute.
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('onload="alert'); // a raw quote would be attribute breakout
    // The payloads survive only as inert escaped text inside quoted attributes.
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('2&quot;&gt;&lt;img'); // breakout quote neutralized
    // Only the four legitimate <path> / <g> tags exist in the markup.
    expect(svg.match(/<[a-zA-Z/]/g).sort()).toEqual(['</', '<g', '<p', '<p']);
  });

  it('escapes the layer id interpolation', () => {
    const Cls = makeExtractedPatternClass(craftedEntity());
    const inst = new Cls();
    const svg = inst.toSVGGroup('l"><script>alert(3)</script>', '#000000', 100);
    expect(svg).not.toContain('<script');
    expect(svg).toContain('id="l&quot;&gt;&lt;script&gt;');
  });
});

// --- S5 (issue #54): lattice tiling on both render surfaces -----------------
//
// One entity, one placement source (tileComposer), two surfaces: generate()
// stamps the tile at every lattice placement on canvas; toSVGGroup() emits a
// translate-group per placement with roles preserved per copy. No lattice →
// the pre-S5 centered single-tile output, byte-identical.
describe('makeExtractedPatternClass — lattice tiling (S5)', () => {
  const LATTICE = {
    t1: [20, 0],
    t2: [0, 20],
    cell: { width: 20, height: 20 },
    type: 'square',
    confidence: 0.9,
  };
  const tiledEntity = () =>
    makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'tiled',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M4 4 L16 4 L16 16 L4 16 Z', role: 'engrave' }],
        strokes: [{ d: 'M0 10 L20 10', role: 'score' }],
      },
      lattice: LATTICE,
    });

  it('generate() tiles the motif across the canvas (expected copy count + positions)', () => {
    const Cls = makeExtractedPatternClass(tiledEntity());
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, {}, 60, 40, '#000', 100);
    // 3 columns × 2 rows = 6 copies × (1 fill subpath + 1 stroke subpath).
    const begins = ctx.calls.filter((c) => c.op === 'beginShape');
    expect(begins).toHaveLength(12);
    // Copies land at lattice offsets, NOT centered: the fill's first vertex
    // (4,4) appears at x ∈ {4, 24, 44} and y ∈ {4, 24}.
    const verts = ctx.calls.filter((c) => c.op === 'vertex').map((c) => c.args);
    const xs = new Set(verts.map(([x]) => x));
    const ys = new Set(verts.map(([, y]) => y));
    for (const x of [4, 24, 44]) expect(xs).toContain(x);
    for (const y of [4, 24]) expect(ys).toContain(y);
    expect(Math.max(...verts.map(([x]) => x))).toBeLessThanOrEqual(60);
  });

  it('toSVGGroup() emits one translate-group per placement, roles preserved per copy', () => {
    const Cls = makeExtractedPatternClass(tiledEntity());
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 60, 40, '#000', 100);
    const svg = inst.toSVGGroup('layer-9', '#112233', 100);

    expect(svg).toContain('id="layer-9"');
    const copies = svg.match(/<g transform="translate\(/g);
    expect(copies).toHaveLength(6);
    expect(svg).toContain('translate(0 0)');
    expect(svg).toContain('translate(40 20)');
    // Every copy carries BOTH paths with their roles (fills AND strokes tile).
    expect(svg.match(/data-role="engrave"/g)).toHaveLength(6);
    expect(svg.match(/data-role="score"/g)).toHaveLength(6);
    expect(svg.match(/fill="none"/g)).toHaveLength(6);
    // Verbatim geometry inside each copy (faithful digitization).
    expect(svg.match(/d="M4 4 L16 4 L16 16 L4 16 Z"/g)).toHaveLength(6);
    // No centering translate on the outer group — the grid anchors at 0,0.
    expect(svg).not.toContain('translate(20 10)');
  });

  it('toSVGGroup() keeps escape-at-emit for every copy (crafted entity, lattice on)', () => {
    const Cls = makeExtractedPatternClass({
      patternId: 'extracted-test-1',
      title: 'crafted-tiled',
      source: 'extracted',
      visibility: 'private',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M0 0Z"><script>alert(1)</script>', role: 'engrave' }],
        strokes: [],
      },
      lattice: LATTICE,
      photoPath: null,
    });
    const inst = new Cls();
    // Crafted d can't flow through canvas flattening (throws on parse — same
    // as the pre-existing escaping tests); exercise the export layer directly
    // with recorded canvas dims for a 2×1 tiling.
    inst._lastCx = 20;
    inst._lastCy = 10;
    const svg = inst.toSVGGroup('l', '#000', 100);
    expect(svg).not.toContain('<script');
    expect(svg.match(/&lt;script&gt;/g)).toHaveLength(2); // escaped in EVERY copy
  });

  it('no lattice → byte-identical single centered tile (pre-S5 output)', () => {
    const plain = entity(); // lattice: null
    const Cls = makeExtractedPatternClass(plain);
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 200, 100, '#112233', 80);
    const svg = inst.toSVGGroup('layer-7', '#445566', 80);
    expect(svg).toBe(
      '<g id="layer-7" opacity="0.8" transform="translate(70 30)">\n' +
        '    <path d="M20 10 L40 10 L40 30 L20 30 Z" fill="#445566" fill-rule="evenodd" stroke="none" data-role="engrave"/>\n' +
        '    <path d="M5 5 L9 5 L9 9 L5 9 Z" fill="#445566" fill-rule="evenodd" stroke="none" data-role="cut"/>\n' +
        '  </g>'
    );
  });

  it('tiles an oblique lattice with fractional offsets formatted safely', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-test-1',
      title: 'oblique',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M4 4 L16 4 L16 16 Z', role: 'engrave' }],
        strokes: [],
      },
      lattice: {
        t1: [20, 0],
        t2: [10.5, 18.25],
        cell: { width: 30.5, height: 18.25 },
        type: 'oblique',
        confidence: 0.6,
      },
    });
    const Cls = makeExtractedPatternClass(e);
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, 60, 40, '#000', 100);
    const svg = inst.toSVGGroup('l', '#000', 100);
    expect(svg).toContain('translate(10.5 18.25)');
    // Only digits, dots, minus and spaces inside every transform.
    for (const m of svg.matchAll(/translate\(([^)]*)\)/g)) {
      expect(m[1]).toMatch(/^-?[\d.]+ -?[\d.]+$/);
    }
  });
});

describe('registerExtractedPattern', () => {
  it('registers into the dynamic registry as a non-AI extracted type', () => {
    registerExtractedPattern(entity());
    expect(getDynamicPatternClass('extracted-test-1')).toBeTruthy();
    const t = getDynamicTypes().find((x) => x.id === 'extracted-test-1');
    expect(t).toBeTruthy();
    expect(t.label).toBe('Test tile');
    expect(t.isAI).toBe(false);
    expect(t.origin).toBe('extracted');
  });

  it('appears in the picker catalog under the custom family', () => {
    registerExtractedPattern(entity());
    const visible = getVisiblePatterns(getDynamicTypes());
    const mine = visible.find((p) => p.id === 'extracted-test-1');
    expect(mine).toBeTruthy();
    expect(mine.familyKey).toBe('custom');
  });
});
