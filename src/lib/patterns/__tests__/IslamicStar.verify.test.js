import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import IslamicStar from '../IslamicStar.js';
import { RecordingContext } from '../drawingContext.js';

// VISUAL-VERIFICATION ARTIFACT GENERATOR (STEP 6).
// This is not a logic test — it renders COMPLETE, browser-openable SVG
// documents to /tmp/girih-verify/ so a human can eyeball the geometry. Tests
// passing is necessary-but-not-sufficient; these files are the real acceptance
// gate. We assemble each standalone <svg> the way svgExport.js does (xmlns,
// viewBox, width/height, a paper-coloured background <rect>, then the pattern's
// stroke group), at a fixed seed ~800x800.

const OUT = '/tmp/girih-verify';
const W = 800;
const H = 800;
const SEED = 7;
const PAPER = '#f4ecd8';
const INK = '#1a1a2e';

function render(params) {
  const inst = new IslamicStar();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, INK, 100);
  return inst;
}

function wrapSVG(inst) {
  const group = inst.toSVGGroup('verify', INK, 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  ${group}
</svg>`;
}

const base = {
  contactAngle: 60, density: 4, bandWidth: 4, irregularity: 0,
  strokeWeight: 0.8, startAngle: 0, offsetX: 0, offsetY: 0,
};

// Shipped tilings only: square8 (4.8.8 → 8★) and hex12 (3.12.12 → 12★).
// hex4_6_12 and decagonal10 were excluded (broken filler tiling) — see report.
const samples = [
  ['square8-skeleton.svg', { ...base, tiling: 'square8', render: 'skeleton' }],
  ['square8-interlaced.svg', { ...base, tiling: 'square8', render: 'interlaced' }],
  ['hex12-skeleton.svg', { ...base, tiling: 'hex12', render: 'skeleton' }],
  ['hex12-interlaced.svg', { ...base, tiling: 'hex12', render: 'interlaced' }],
];

describe('IslamicStar visual-verification artifacts', () => {
  it('writes standalone SVG samples to /tmp/girih-verify', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, params] of samples) {
      const inst = render(params);
      const svg = wrapSVG(inst);
      writeFileSync(`${OUT}/${name}`, svg);
      // Non-trivial: each sample should have many stroke elements.
      expect(inst.svgElements.length).toBeGreaterThan(20);
    }
  });
});
