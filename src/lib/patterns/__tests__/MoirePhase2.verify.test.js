import { describe, it, expect } from 'vitest';
import { writeFileSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Moire from '../Moire.js';
import { RecordingContext } from '../drawingContext.js';
import { resolveMoireSource } from '../../moirePair.js';
import { buildLayerSVG, buildAllLayersSVG } from '../../svgExport.js';

// PHASE 2 ACCEPTANCE GATE — proves the LAYER INFRASTRUCTURE end-to-end:
//   1. Build a real Moiré PAIR as two LAYER objects (A holds params; B reads A).
//   2. Resolve B → A via resolveMoireSource (the single-source-of-truth helper).
//   3. Render BOTH layers' fields through the same render-param path useCanvas
//      uses ({...resolved.params, moireRole}), cache the instances.
//   4. Composite both into ONE standalone SVG via buildAllLayersSVG (the SAME
//      builder the app's "export all" uses) → fringes must appear.
//   5. Emit each layer's OWN SVG via buildLayerSVG (separate per-layer export) →
//      each is a single uniform field.
//   6. Rasterize all three to /tmp/moire-verify so a human can eyeball them.
//
// GATED behind MOIRE_VERIFY=1 (like Phase 1) so the qlmanage subprocesses don't
// flake the parallel suite. Run explicitly with:
//   MOIRE_VERIFY=1 npx vitest run src/lib/patterns/__tests__/MoirePhase2.verify.test.js
const RUN = process.env.MOIRE_VERIFY === '1';
const maybe = RUN ? describe : describe.skip;

const OUT = '/tmp/moire-verify';
const W = 800;
const H = 800;
const SEED = 7;
const RASTER_PX = 1600;
const SW = 1.0; // verify-only stroke bump for raster contrast

// --- Build the pair as LAYER OBJECTS (what useLayers.changeLayerPattern makes).
const GROUP = 'verify-group-1';
const layerA = {
  id: 'A',
  name: 'Moiré A',
  color: '#1a1a2e', // dark navy
  opacity: 100,
  visible: true,
  bgColor: '#ffffff',
  bgOpacity: 0,
  patternType: 'moire',
  moireRole: 'A',
  moireGroupId: GROUP,
  params: {
    fieldType: 'parallelLines',
    density: 120,
    moireRotation: 5,     // B-relative transform — lives on A, applied to B only
    moireOffsetX: 0,
    moireOffsetY: 0,
    moireScale: 1,
    strokeWeight: SW,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
};
const layerB = {
  id: 'B',
  name: 'Moiré B',
  color: '#b3000c', // crimson — overlap reads where the two cross
  opacity: 100,
  visible: true,
  bgColor: '#ffffff',
  bgOpacity: 0,
  patternType: 'moire',
  moireRole: 'B',
  moireGroupId: GROUP,
  // B's OWN params are deliberately garbage — they must be IGNORED (B reads A).
  params: { fieldType: 'concentricRings', density: 5, strokeWeight: 9 },
};

const ALL = [layerA, layerB];

// Render a single layer the SAME way useCanvas does: resolve, then generate with
// {...resolved.params, moireRole}. Returns the cached instance.
function renderLayer(layer) {
  const resolved = resolveMoireSource(layer, ALL);
  expect(resolved).not.toBeNull(); // neither is an orphan here
  const params = { ...resolved.params, moireRole: resolved.moireRole, strokeWeight: SW };
  const inst = new Moire();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, layer.color, layer.opacity);
  return inst;
}

function rasterize(svgPath, pngDir) {
  execFileSync('qlmanage', ['-t', '-s', String(RASTER_PX), '-o', pngDir, svgPath], {
    stdio: 'ignore',
  });
}

maybe('Moiré Phase 2 — pair render + composite + separate export', () => {
  it('composites a resolved A+B pair AND emits each layer separately', () => {
    mkdirSync(OUT, { recursive: true });

    // 1+2+3: resolve B→A and render BOTH (instances cached per layer id).
    const instA = renderLayer(layerA);
    const instB = renderLayer(layerB);
    const instances = { A: instA, B: instB };

    // Each field is a non-trivial mesh (~density elements).
    expect(instA.svgElements.length).toBeGreaterThan(40);
    expect(instB.svgElements.length).toBeGreaterThan(40);
    // PROOF B read A: B has parallelLines (A's field), NOT its own garbage rings.
    expect(instB.svgElements.every((el) => el.startsWith('<line'))).toBe(true);
    // PROOF B differs from A (the role-B transform was applied).
    expect(instB.svgElements).not.toEqual(instA.svgElements);

    // 4: COMPOSITE — both layers in one SVG (the app's "export all" builder).
    const compositeSVG = buildAllLayersSVG(ALL, instances, W, H, false);
    const compPath = `${OUT}/phase2-composite.svg`;
    writeFileSync(compPath, compositeSVG);
    rasterize(compPath, OUT);
    // The composite contains BOTH layers' group ids and stroked geometry.
    expect(compositeSVG).toContain('layer-A');
    expect(compositeSVG).toContain('layer-B');
    expect(compositeSVG).toContain('stroke');

    // 5: SEPARATE EXPORT — each layer's OWN single-field SVG.
    const svgA = buildLayerSVG(layerA, instA, W, H);
    const svgB = buildLayerSVG(layerB, instB, W, H);
    const pathA = `${OUT}/phase2-layerA.svg`;
    const pathB = `${OUT}/phase2-layerB.svg`;
    writeFileSync(pathA, svgA);
    writeFileSync(pathB, svgB);
    rasterize(pathA, OUT);
    rasterize(pathB, OUT);

    // 6: confirm all three PNGs exist and are non-trivial. qlmanage emits
    // `<name>.svg.png`; ALSO emit the EXACT spec-required `<name>.png` names so a
    // fresh run on a clean /tmp regenerates the deliverable paths.
    for (const name of ['phase2-composite', 'phase2-layerA', 'phase2-layerB']) {
      const ql = `${OUT}/${name}.svg.png`;
      expect(existsSync(ql)).toBe(true);
      expect(statSync(ql).size).toBeGreaterThan(2000);
      copyFileSync(ql, `${OUT}/${name}.png`);
      expect(existsSync(`${OUT}/${name}.png`)).toBe(true);
    }

    // The per-layer SVGs are each a SINGLE field (one color); the composite has
    // both inks.
    expect(svgA).toContain('#1a1a2e');
    expect(svgA).not.toContain('#b3000c');
    expect(svgB).toContain('#b3000c');
    expect(svgB).not.toContain('#1a1a2e');
    expect(compositeSVG).toContain('#1a1a2e');
    expect(compositeSVG).toContain('#b3000c');
  });

  it('an ORPHAN B composites without throwing (renders nothing for the orphan)', () => {
    const orphanB = { ...layerB, moireGroupId: 'no-partner' };
    const onlyOrphan = [orphanB];
    // useCanvas would skip it (no instance cached) — buildAllLayersSVG handles a
    // missing instance with `if(!instance) return ''`.
    expect(() => buildAllLayersSVG(onlyOrphan, {}, W, H, false)).not.toThrow();
  });
});
