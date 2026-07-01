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
