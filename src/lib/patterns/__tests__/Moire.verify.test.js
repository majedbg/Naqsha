import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Moire from '../Moire.js';
import { RecordingContext } from '../drawingContext.js';

// VISUAL-FRINGE PROOF (Phase 1 acceptance gate). Not a logic test — it
// composites TWO Moire fields (role A + role B with a small transform) into one
// standalone ~800×800 SVG, then rasterizes to PNG via macOS `qlmanage` (Quick
// Look — no extra deps) so a human can eyeball whether large-scale moiré FRINGES
// appear vs a uniform mesh. The two fields share IDENTICAL field params; only
// the role-B transform differs. A is drawn in one ink, B in a second so overlap
// reads. A-ONLY CONTROLS prove the bands come from the overlay (real moiré),
// not rasterizer aliasing — emitted for the two "is it real?" cases (parallel
// and radial, both same-frequency overlays).
//
// GATED: this spawns ~8 synchronous `qlmanage` subprocesses, whose CPU
// contention can flake out the parallel suite. It is SKIPPED by default so
// `vitest run` stays reliably green; run the proof explicitly with:
//   MOIRE_VERIFY=1 npx vitest run src/lib/patterns/__tests__/Moire.verify.test.js
const RUN = process.env.MOIRE_VERIFY === '1';
const maybe = RUN ? describe : describe.skip;

const OUT = '/tmp/moire-verify';
const W = 800;
const H = 800;
const SEED = 7;
const PAPER = '#f4ecd8';
const INK_A = '#1a1a2e'; // dark navy
const INK_B = '#b3000c'; // crimson — overlap reads where the two cross
const RASTER_PX = 1600;  // 2× the 800 viewBox so 0.5–1.2px strokes aren't sub-pixel

// strokeWeight is a VERIFY-ONLY knob bumped above the class default (0.5) for
// fringe contrast in the raster; the class default stays 0.5 per spec.
const SW = 1.0;

function genField(params) {
  const inst = new Moire();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, params.color, 100);
  return inst;
}

// Composite one or two Moire instances into a standalone SVG document.
function compositeSVG(instances) {
  const groups = instances
    .map((inst, i) => inst.toSVGGroup(`f${i}`, inst._ink, 100))
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${PAPER}"/>
${groups}
</svg>`;
}

// fieldParams: the SHARED field params (same for A and B). bTransform: the
// role-B-only transform. Returns [instA, instB] each tagged with _ink.
function pair(fieldParams, bTransform) {
  const a = genField({ ...fieldParams, moireRole: 'A', color: INK_A, strokeWeight: SW });
  a._ink = INK_A;
  const b = genField({ ...fieldParams, moireRole: 'B', color: INK_B, strokeWeight: SW, ...bTransform });
  b._ink = INK_B;
  return [a, b];
}

function rasterize(svgPath, pngDir) {
  // qlmanage -t -s <px> -o <dir> <file>  → writes <file>.png into <dir>.
  execFileSync('qlmanage', ['-t', '-s', String(RASTER_PX), '-o', pngDir, svgPath], {
    stdio: 'ignore',
  });
}

const CASES = [
  {
    name: 'parallel-rot5',
    field: { fieldType: 'parallelLines', density: 120 },
    b: { moireRotation: 5 },
  },
  {
    name: 'parallel-rot2',
    field: { fieldType: 'parallelLines', density: 160 },
    b: { moireRotation: 2 },
  },
  {
    name: 'rings-scale',
    field: { fieldType: 'concentricRings', density: 90 },
    b: { moireScale: 1.04, moireRotation: 0 },
  },
  {
    name: 'rings-offset',
    field: { fieldType: 'concentricRings', density: 90 },
    b: { moireOffsetX: 40, moireOffsetY: 0, moireRotation: 0, moireScale: 1 },
  },
  {
    name: 'radial-rot',
    field: { fieldType: 'radialLines', density: 144 },
    b: { moireRotation: 3 },
  },
];

maybe('Moire visual-fringe proof', () => {
  it('writes composited moiré PNGs (+ an A-only control) to /tmp/moire-verify', () => {
    mkdirSync(OUT, { recursive: true });

    for (const c of CASES) {
      const [a, b] = pair(c.field, c.b);
      const svg = compositeSVG([a, b]);
      const svgPath = `${OUT}/${c.name}.svg`;
      writeFileSync(svgPath, svg);
      rasterize(svgPath, OUT);

      // Each field is non-trivial (≈ density elements; ~2× for the pair).
      expect(a.svgElements.length).toBeGreaterThan(20);
      expect(b.svgElements.length).toBeGreaterThan(20);

      const png = `${OUT}/${c.name}.svg.png`;
      expect(existsSync(png)).toBe(true);
      expect(statSync(png).size).toBeGreaterThan(2000);
    }

    // A-ONLY CONTROLS: one field alone MUST look like a uniform mesh (no
    // large-scale bands). If a control shows bands, any bands in the matching
    // overlay are rasterizer aliasing, not moiré. We emit controls for the two
    // same-frequency cases where the "is it real moiré or just denser mesh?"
    // question actually bites:
    //   parallel — straight gratings, A-alone must be flat horizontal lines.
    //   radial   — equal-count fans about a SHARED center share frequency 144
    //              with no beat term; the overlay risks being merely a denser
    //              fan. The control discriminates real rosette vs crowding.
    const controls = [
      ['parallel-rot5-control-Aonly', { fieldType: 'parallelLines', density: 120 }],
      ['radial-rot-control-Aonly', { fieldType: 'radialLines', density: 144 }],
    ];
    for (const [name, field] of controls) {
      const aOnly = genField({ ...field, moireRole: 'A', color: INK_A, strokeWeight: SW });
      aOnly._ink = INK_A;
      const ctrlPath = `${OUT}/${name}.svg`;
      writeFileSync(ctrlPath, compositeSVG([aOnly]));
      rasterize(ctrlPath, OUT);
      expect(existsSync(`${OUT}/${name}.svg.png`)).toBe(true);
    }
  });
});
