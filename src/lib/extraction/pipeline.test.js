// ExtractionPipeline + WorkerBridge (S0 spine #49, S2 harness #51).
//
// The pipeline is the staged orchestration HARNESS every CV slice plugs into:
// stage registration (createPipeline), staged progress, cancellation
// (AbortSignal), per-stage confidence, lazy heavy deps, and fail-soft
// optional stages. The default stages preserve S0 behavior when no flatten
// quad is supplied: flatten reports 'skipped' (the "already flat" escape
// hatch, locked decision 2) and trace runs the contour Vectorizer; with
// options.flatten.quad the flatten stage rectifies first (S3, issue #52).
// The bridge is the worker seam (locked decision 11): tests cover the inline
// fallback (jsdom/node have no module Workers), the message protocol, failure
// containment, and the cancel/drain protocol against stub workers.

import { describe, it, expect, vi } from 'vitest';
import { runExtraction, createPipeline, listStages } from './pipeline';
import { WALLPAPER_GROUPS } from './symmetry';
import { runRectify, latticeStage } from './stages';
import { pointInCell } from './lattice';
import { createExtractionBridge } from './workerBridge';

function squareImage() {
  const w = 50;
  const h = 50;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x >= 15 && x < 35 && y >= 15 && y < 35 ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

// Collapse progress-only repeats so exact-sequence assertions stay pinned to
// the status contract without depending on how often a stage calls report().
function statusSequence(events) {
  return events
    .filter((e, i) => {
      const prev = events[i - 1];
      return !(prev && prev.stage === e.stage && prev.status === e.status);
    })
    .map((e) => `${e.stage}:${e.status}`);
}

describe('runExtraction', () => {
  it('produces a tile with traced contours and a null lattice (single-motif floor)', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.tile.width).toBe(50);
    expect(result.tile.height).toBe(50);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(result.tile.strokes).toEqual([]);
    expect(result.lattice).toBeNull();
  });

  it('emits staged progress: flatten skipped, lattice + trace running → done', async () => {
    const events = [];
    await runExtraction({ image: squareImage() }, (p) => events.push(p));
    expect(statusSequence(events)).toEqual([
      'flatten:skipped',
      'lattice:running',
      'lattice:done',
      'symmetry:skipped', // no repeat detected → no lattice → no wallpaper group
      'trace:running',
      'trace:done',
    ]);
  });

  it('reports a confidence signal for the trace stage', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.confidence.trace).toBeGreaterThan(0);
  });

  // S6 (issue #55): the vectorize stage payload carries per-motif components
  // (both representations) so Review can flip role / toggle centerline↔contour.
  it('carries per-motif components with both representations', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.components).toHaveLength(1);
    expect(result.components[0].kind).toBe('fill');
    expect(result.components[0].contour.d).toBe(result.tile.fills[0].d);
  });

  it('extracts line-work into tile.strokes (centerline-default)', async () => {
    const w = 80;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x >= 10 && x < 70 && y >= 19 && y <= 21 ? 0 : 255;
        const i = (y * w + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    const result = await runExtraction({ image: { data, width: w, height: h } });
    expect(result.tile.fills).toEqual([]);
    expect(result.tile.strokes).toHaveLength(1);
    expect(result.tile.strokes[0].role).toBe('score');
    expect(result.components[0].kind).toBe('stroke');
    expect(result.components[0].contour).toBeTruthy(); // flip target survives
    expect(result.confidence.trace).toBeGreaterThan(0);
  });
});

// --- S5 (issue #54): the lattice stage — repeat detection + cell crop -------

// A repeating tiling with a known 16×16 square lattice: an asymmetric motif
// (two discs) per cell, on an 80×80 field (5×5 repeats).
function tilingImage(period = 16, size = 80) {
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  };
  for (let cy = 0; cy < size + period; cy += period) {
    for (let cx = 0; cx < size + period; cx += period) {
      for (let y = -3; y <= 3; y++) {
        for (let x = -3; x <= 3; x++) {
          if (x * x + y * y <= 9) set(cx + 5 + x, cy + 5 + y, 0);
        }
      }
      set(cx + 11, cy + 9, 40);
      set(cx + 12, cy + 9, 40);
    }
  }
  return { data, width: size, height: size };
}

describe('runExtraction — symmetry stage (S7, issue #56)', () => {
  it('classifies a wallpaper group on the cropped cell when a lattice is found', async () => {
    const result = await runExtraction({ image: tilingImage() });
    expect(result.lattice).not.toBeNull(); // precondition: the cell was cropped
    expect(result.symmetry).toBeTruthy();
    expect(WALLPAPER_GROUPS).toContain(result.symmetry.group);
    expect(result.symmetry.source).toBe('auto');
    expect(typeof result.confidence.symmetry).toBe('number'); // rides confidence map
    // S12 seam: the group lands on the result payload for parameterize/EVAL.
    expect(result.symmetry).toBe(result.symmetry); // (documented entry point)
  });

  it('emits symmetry:running→done (not skipped) when a lattice is present', async () => {
    const events = [];
    await runExtraction({ image: tilingImage() }, (p) => events.push(p));
    const seq = statusSequence(events);
    expect(seq).toContain('symmetry:running');
    expect(seq).toContain('symmetry:done');
    expect(seq).not.toContain('symmetry:skipped');
  });

  it('skips symmetry (no wallpaper group) on the single-motif floor', async () => {
    const events = [];
    const result = await runExtraction({ image: squareImage() }, (p) => events.push(p));
    expect(result.lattice).toBeNull();
    expect(result.symmetry ?? null).toBeNull();
    expect(statusSequence(events)).toContain('symmetry:skipped');
  });
});

describe('runExtraction — lattice stage (S5)', () => {
  it('detects the repeat, crops the tile to ONE cell, and reports the lattice', async () => {
    const result = await runExtraction({ image: tilingImage() });
    expect(result.lattice).not.toBeNull();
    expect(result.lattice.type).toBe('square');
    // Axis-aligned 16×16 basis within a pixel of truth.
    expect(Math.abs(result.lattice.t1[0] - 16)).toBeLessThanOrEqual(1);
    expect(result.lattice.t1[1]).toBe(0);
    expect(result.lattice.t2[0]).toBe(0);
    expect(Math.abs(result.lattice.t2[1] - 16)).toBeLessThanOrEqual(1);
    // The traced tile IS the repeat cell.
    expect(result.tile.width).toBe(result.lattice.cell.width);
    expect(result.tile.height).toBe(result.lattice.cell.height);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    // Review-overlay cell in selection coords, anchored at the origin.
    expect(result.latticeCell).toEqual({
      x: 0,
      y: 0,
      width: result.lattice.cell.width,
      height: result.lattice.cell.height,
    });
    expect(result.confidence.lattice).toBeGreaterThan(0.4);
    expect(result.lattice.confidence).toBe(result.confidence.lattice);
  });

  it('non-repeating input → null lattice, full-selection floor, low confidence recorded', async () => {
    const result = await runExtraction({ image: squareImage() });
    expect(result.lattice).toBeNull();
    expect(result.tile.width).toBe(50); // the untouched single-motif floor
    expect(result.confidence.lattice).toBeLessThan(0.4);
  });

  it('options.lattice === false (user opt-out) skips the stage entirely', async () => {
    const events = [];
    const result = await runExtraction(
      { image: tilingImage(), options: { lattice: false } },
      (p) => events.push(p)
    );
    expect(events).toContainEqual({ stage: 'lattice', status: 'skipped' });
    expect(result.lattice).toBeNull();
    expect(result.tile.width).toBe(80); // floor: the whole selection
  });

  it('options.lattice.cell (user-corrected drag) crops that exact cell with confidence 1', async () => {
    const cell = { x: 8, y: 8, width: 16, height: 16 };
    const result = await runExtraction({
      image: tilingImage(),
      options: { lattice: { cell } },
    });
    expect(result.lattice).toEqual({
      t1: [16, 0],
      t2: [0, 16],
      cell: { width: 16, height: 16 },
      type: 'square',
      confidence: 1,
    });
    expect(result.latticeCell).toEqual(cell);
    expect(result.tile.width).toBe(16);
    expect(result.tile.height).toBe(16);
    expect(result.confidence.lattice).toBe(1);
  });

  it('clamps a user cell that overflows the image', async () => {
    const result = await runExtraction({
      image: tilingImage(),
      options: { lattice: { cell: { x: 70, y: 70, width: 40, height: 40 } } },
    });
    expect(result.latticeCell).toEqual({ x: 70, y: 70, width: 10, height: 10 });
    expect(result.tile.width).toBe(10);
  });

  it('S5b: an OBLIQUE user cell (origin + basis) crops the parallelogram at confidence 1 and round-trips', async () => {
    // The editor commits {x,y,t1,t2}; the stage must EXECUTE the oblique crop
    // (not the rectangular branch), tile at the given basis, and produce a
    // lattice that survives validateLattice unchanged.
    const t1 = [24, 0];
    const t2 = [8, 20];
    const result = await runExtraction({
      image: tilingImage(),
      options: { lattice: { cell: { x: 8, y: 8, t1, t2 } } },
    });
    expect(result.lattice.type).toBe('oblique');
    expect(result.lattice.t1).toEqual(t1);
    expect(result.lattice.t2).toEqual(t2);
    expect(result.lattice.confidence).toBe(1);
    expect(result.confidence.lattice).toBe(1);
    // The traced tile IS the parallelogram cell's bbox (width = ⌈t1x+t2x⌉ = 32).
    expect(result.lattice.cell.width).toBe(32);
    expect(result.lattice.cell.height).toBe(20);
    expect(result.tile.width).toBe(result.lattice.cell.width);
    expect(result.tile.height).toBe(result.lattice.cell.height);
    // The overlay descriptor carries the basis + origin for the sheared editor.
    expect(result.latticeCell.t1).toEqual(t1);
    expect(result.latticeCell.originX).toBeDefined();
    // Round-trip: makeExtractedPattern re-validates the lattice (unweakened).
    const { makeExtractedPattern } = await import('./extractedPattern');
    const entity = makeExtractedPattern({ title: 't', tile: result.tile, lattice: result.lattice });
    expect(entity.lattice).toEqual(result.lattice);
  });

  it('fails soft on an unusable user cell: failed event, confidence 0, floor trace', async () => {
    const events = [];
    const result = await runExtraction(
      { image: tilingImage(), options: { lattice: { cell: { x: 0, y: 0, width: NaN, height: 16 } } } },
      (p) => events.push(p)
    );
    expect(events).toContainEqual(
      expect.objectContaining({ stage: 'lattice', status: 'failed' })
    );
    expect(result.lattice).toBeNull();
    expect(result.confidence.lattice).toBe(0);
    expect(result.tile.width).toBe(80); // floor: the whole selection, flow continued
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
  });

  it('the pipeline result round-trips into a valid entity with the lattice attached', async () => {
    const result = await runExtraction({ image: tilingImage() });
    const { makeExtractedPattern } = await import('./extractedPattern');
    const entity = makeExtractedPattern({ title: 't', tile: result.tile, lattice: result.lattice });
    expect(entity.lattice).toEqual(result.lattice);
  });
});

// --- S5b (issue #66): oblique / hex auto-tiling + parallelogram cell clip ----

// A tiling with a known (possibly sheared) translation lattice: an asymmetric
// motif (two discs of different size) per lattice point, so the only exact
// self-overlaps are true lattice translations (same discipline as
// lattice.test.js's makeTiling).
function makeLatticeTiling(w, h, t1, t2) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  };
  const disc = (cx, cy, r, v) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, v);
  };
  const det = t1[0] * t2[1] - t1[1] * t2[0];
  let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const i = (x * t2[1] - y * t2[0]) / det;
    const j = (y * t1[0] - x * t1[1]) / det;
    iMin = Math.min(iMin, Math.floor(i) - 1);
    iMax = Math.max(iMax, Math.ceil(i) + 1);
    jMin = Math.min(jMin, Math.floor(j) - 1);
    jMax = Math.max(jMax, Math.ceil(j) + 1);
  }
  for (let j = jMin; j <= jMax; j++)
    for (let i = iMin; i <= iMax; i++) {
      const x = i * t1[0] + j * t2[0];
      const y = i * t1[1] + j * t2[1];
      disc(x + 5, y + 5, 3, 0);
      disc(x + 12, y + 9, 1.6, 60);
    }
  return { data, width: w, height: h };
}

describe('runExtraction — oblique / hex lattice auto-tiling (S5b, issue #66)', () => {
  it('auto-tiles an oblique lattice: sheared basis recovered, tile cropped to the parallelogram cell', async () => {
    const truth = { t1: [26, 0], t2: [9, 24] };
    const result = await runExtraction({
      image: makeLatticeTiling(156, 144, truth.t1, truth.t2),
    });
    expect(result.lattice).not.toBeNull();
    expect(result.lattice.type).toBe('oblique');
    expect(result.confidence.lattice).toBeGreaterThan(0.4);
    // Basis recovered within tolerance (NOT snapped to axis-aligned).
    expect(result.lattice.t2[0]).not.toBe(0); // genuinely sheared
    // The traced tile IS the parallelogram cell's bbox raster.
    expect(result.tile.width).toBe(result.lattice.cell.width);
    expect(result.tile.height).toBe(result.lattice.cell.height);
    expect(result.tile.fills.length + result.tile.strokes.length).toBeGreaterThanOrEqual(1);
    // The overlay descriptor carries the basis for the sheared editor.
    expect(result.latticeCell.t1).toBeTruthy();
    expect(result.latticeCell.t2).toBeTruthy();
  });

  it('crops the cell with NO neighbour bleed — every pixel is paper iff outside the parallelogram', async () => {
    const truth = { t1: [26, 0], t2: [9, 24] };
    const cell = await latticeStage.run(
      { image: makeLatticeTiling(156, 144, truth.t1, truth.t2), options: {} },
      {}
    );
    const { image, lattice, latticeCell } = cell.patch;
    expect(lattice.type).toBe('oblique');
    const { t1, t2 } = lattice;
    const ox = latticeCell.originX - latticeCell.x; // origin in local crop coords
    const oy = latticeCell.originY - latticeCell.y;
    let masked = 0;
    let kept = 0;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const inside = pointInCell(x - ox, y - oy, t1, t2);
        const alpha = image.data[(y * image.width + x) * 4 + 3];
        if (inside) {
          expect(alpha).toBe(255); // parallelogram interior kept opaque
          kept++;
        } else {
          expect(alpha).toBe(0); // everything outside blanked to paper — no bleed
          masked++;
        }
      }
    }
    expect(kept).toBeGreaterThan(0);
    expect(masked).toBeGreaterThan(0); // an oblique cell genuinely masks its bbox corners
  });

  it('auto-tiles a hex lattice', async () => {
    const truth = { t1: [24, 0], t2: [12, Math.round(12 * Math.sqrt(3))] };
    const result = await runExtraction({
      image: makeLatticeTiling(168, 156, truth.t1, truth.t2),
    });
    expect(result.lattice).not.toBeNull();
    expect(result.lattice.type).toBe('hex');
    expect(result.confidence.lattice).toBeGreaterThan(0.4);
    expect(result.tile.width).toBe(result.lattice.cell.width);
  });

  it('classifies symmetry on the oblique cell without throwing or over-claiming', async () => {
    const truth = { t1: [26, 0], t2: [9, 24] };
    const result = await runExtraction({
      image: makeLatticeTiling(156, 144, truth.t1, truth.t2),
    });
    expect(result.symmetry).toBeTruthy();
    // An oblique lattice can only host p1 or p2 (no axis mirror is a lattice
    // symmetry) — the classifier must not leak a reflective group.
    expect(['p1', 'p2']).toContain(result.symmetry.group);
    expect(result.symmetry.confidence).toBeGreaterThanOrEqual(0);
    expect(result.symmetry.confidence).toBeLessThanOrEqual(1);
  });

  it('the oblique result round-trips into a valid entity (validateLattice unweakened)', async () => {
    const truth = { t1: [26, 0], t2: [9, 24] };
    const result = await runExtraction({
      image: makeLatticeTiling(156, 144, truth.t1, truth.t2),
    });
    const { makeExtractedPattern } = await import('./extractedPattern');
    const entity = makeExtractedPattern({ title: 't', tile: result.tile, lattice: result.lattice });
    expect(entity.lattice).toEqual(result.lattice);
    expect(entity.lattice.type).toBe('oblique');
  });

  it('CONFIDENCE HONESTY: a 1D-periodic image with cross-axis variation floors, never a confident oblique tiling', async () => {
    // Strong horizontal period (columns repeat every 16px) but a non-repeating
    // vertical ramp — there is no true 2D repeat. The detector must NOT accept a
    // spurious sheared second basis at a confident score: fall to the floor,
    // same as any non-repeating input (the S4/S7 flatter-on-hard-input lesson).
    const w = 128, h = 128;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // periodic in x (period 16), monotone ramp in y (non-periodic)
        const stripe = x % 16 < 3 ? 0 : 255;
        const ramp = Math.round((y / h) * 120);
        const v = Math.max(0, Math.min(255, stripe === 0 ? ramp : 255 - Math.round(ramp / 4)));
        const i = (y * w + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      }
    }
    const result = await runExtraction({ image: { data, width: w, height: h } });
    // Honest outcome: either no lattice (floor) or, if a basis is proposed, its
    // confidence is below the gate so the stage floored it.
    if (result.lattice) {
      expect(result.confidence.lattice).toBeLessThan(0.4);
    } else {
      expect(result.lattice).toBeNull();
    }
  });
});

// --- S2 harness: the stage contract every CV slice implements ---------------

describe('createPipeline — stage harness', () => {
  it('runs registered stages in order, merges patches, and collects per-stage confidence', async () => {
    const calls = [];
    const run = createPipeline([
      {
        id: 'a',
        label: 'A',
        run: (ctx) => {
          calls.push(['a', ctx.image.width]);
          return { patch: { tile: { width: 9 } }, confidence: 0.7 };
        },
      },
      {
        id: 'b',
        label: 'B',
        run: (ctx) => {
          calls.push(['b', ctx.tile.width]); // sees a's patch in ctx
          return { patch: { lattice: { t1: [1, 0], t2: [0, 1] } }, confidence: 0.4 };
        },
      },
    ]);
    const result = await run({ image: squareImage() });
    expect(calls).toEqual([
      ['a', 50],
      ['b', 9],
    ]);
    expect(result.tile).toEqual({ width: 9 });
    expect(result.lattice).toEqual({ t1: [1, 0], t2: [0, 1] });
    expect(result.confidence).toEqual({ a: 0.7, b: 0.4 });
  });

  it('emits skipped for stages whose skip(ctx) is truthy, without running them', async () => {
    const runFn = vi.fn();
    const events = [];
    const run = createPipeline([
      { id: 'x', label: 'X', skip: (ctx) => ctx.options.skipX, run: runFn },
    ]);
    await run({ image: squareImage(), options: { skipX: true } }, (p) => events.push(p));
    expect(events).toEqual([{ stage: 'x', status: 'skipped' }]);
    expect(runFn).not.toHaveBeenCalled();
  });

  it('forwards fractional intra-stage progress via report()', async () => {
    const events = [];
    const run = createPipeline([
      {
        id: 's',
        label: 'S',
        run: (_ctx, { report }) => {
          report(0.25);
          report(0.75);
          return {};
        },
      },
    ]);
    await run({ image: squareImage() }, (p) => events.push(p));
    expect(events).toEqual([
      { stage: 's', status: 'running' },
      { stage: 's', status: 'running', progress: 0.25 },
      { stage: 's', status: 'running', progress: 0.75 },
      { stage: 's', status: 'done' },
    ]);
  });

  it('fails soft on an optional stage: failed event, confidence 0, flow continues', async () => {
    const events = [];
    const run = createPipeline([
      {
        id: 'shaky',
        label: 'Shaky',
        optional: true,
        run: () => {
          throw new Error('model exploded');
        },
      },
      { id: 'solid', label: 'Solid', run: () => ({ patch: { tile: { ok: true } }, confidence: 1 }) },
    ]);
    const result = await run({ image: squareImage() }, (p) => events.push(p));
    expect(events).toContainEqual({ stage: 'shaky', status: 'failed', error: 'model exploded' });
    expect(result.tile).toEqual({ ok: true });
    expect(result.confidence).toEqual({ shaky: 0, solid: 1 });
  });

  it('rejects on a required stage failure, after emitting the failed event', async () => {
    const events = [];
    const after = vi.fn();
    const run = createPipeline([
      {
        id: 'core',
        label: 'Core',
        run: () => {
          throw new Error('no geometry');
        },
      },
      { id: 'later', label: 'Later', run: after },
    ]);
    await expect(run({ image: squareImage() }, (p) => events.push(p))).rejects.toThrow(
      'no geometry'
    );
    expect(events).toContainEqual({ stage: 'core', status: 'failed', error: 'no geometry' });
    expect(after).not.toHaveBeenCalled();
  });

  it('lists serializable stage descriptors for the UI', () => {
    expect(listStages()).toEqual([
      { id: 'flatten', label: 'Flatten', optional: true },
      { id: 'lattice', label: 'Detect repeat', optional: true },
      { id: 'symmetry', label: 'Symmetry', optional: true },
      { id: 'trace', label: 'Trace', optional: false },
    ]);
    expect(
      listStages([{ id: 'z', label: 'Z', optional: true, run: () => {}, loadDeps: () => {} }])
    ).toEqual([{ id: 'z', label: 'Z', optional: true }]);
  });
});

describe('createPipeline — lazy heavy deps', () => {
  it('loads deps once per runtime with loading progress, and hands them to run()', async () => {
    const loadDeps = vi.fn(async (report) => {
      report(0.5);
      return { model: 'warm' };
    });
    const seen = [];
    const stage = {
      id: 'heavy',
      label: 'Heavy',
      loadDeps,
      run: (_ctx, { deps }) => {
        seen.push(deps);
        return {};
      },
    };
    const run = createPipeline([stage]);
    const events = [];
    await run({ image: squareImage() }, (p) => events.push(p));
    await run({ image: squareImage() }, (p) => events.push(p)); // second run: cache hit
    expect(loadDeps).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ model: 'warm' }, { model: 'warm' }]);
    expect(events.filter((e) => e.status === 'loading')).toEqual([
      { stage: 'heavy', status: 'loading' },
      { stage: 'heavy', status: 'loading', progress: 0.5 },
    ]);
  });

  it('re-attempts a failed dep load on the next run instead of caching the failure', async () => {
    let attempts = 0;
    const stage = {
      id: 'flaky',
      label: 'Flaky',
      loadDeps: async () => {
        attempts++;
        if (attempts === 1) throw new Error('CDN down');
        return { ok: true };
      },
      run: (_ctx, { deps }) => ({ confidence: deps.ok ? 1 : 0 }),
    };
    const run = createPipeline([stage]);
    await expect(run({ image: squareImage() })).rejects.toThrow('CDN down');
    const result = await run({ image: squareImage() });
    expect(attempts).toBe(2);
    expect(result.confidence.flaky).toBe(1);
  });
});

describe('createPipeline — cancellation', () => {
  it('rejects with AbortError between stages and never runs later stages', async () => {
    const controller = new AbortController();
    const later = vi.fn();
    const run = createPipeline([
      {
        id: 'first',
        label: 'First',
        run: () => {
          controller.abort(); // user cancels while the first stage crunches
          return {};
        },
      },
      { id: 'second', label: 'Second', run: later },
    ]);
    await expect(
      run({ image: squareImage() }, undefined, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(later).not.toHaveBeenCalled();
  });

  it('passes the signal into stages for cooperative intra-stage aborts', async () => {
    const controller = new AbortController();
    const run = createPipeline([
      {
        id: 'chunky',
        label: 'Chunky',
        run: (_ctx, { signal }) => {
          controller.abort();
          if (signal.aborted) {
            const err = new Error('extraction cancelled');
            err.name = 'AbortError';
            throw err;
          }
          return {};
        },
      },
    ]);
    await expect(
      run({ image: squareImage() }, undefined, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('treats an in-stage AbortError as cancellation, not a stage failure (even on optional stages)', async () => {
    const events = [];
    const run = createPipeline([
      {
        id: 'soft',
        label: 'Soft',
        optional: true,
        run: () => {
          const err = new Error('extraction cancelled');
          err.name = 'AbortError';
          throw err;
        },
      },
    ]);
    await expect(run({ image: squareImage() }, (p) => events.push(p))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(events.filter((e) => e.status === 'failed')).toEqual([]);
  });
});

describe('createExtractionBridge — inline fallback', () => {
  it('runs the pipeline inline when no Worker is available', async () => {
    const bridge = createExtractionBridge({ workerFactory: null });
    const progress = vi.fn();
    const result = await bridge.extract(squareImage(), {}, progress);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(progress).toHaveBeenCalledWith({ stage: 'flatten', status: 'skipped' });
    bridge.dispose();
  });
});

describe('createExtractionBridge — worker protocol', () => {
  // Stub worker that speaks the typed protocol without a real thread.
  function stubWorker({ fail = false } = {}) {
    const worker = {
      onmessage: null,
      terminated: false,
      postMessage(msg) {
        const { id } = msg;
        queueMicrotask(() => {
          worker.onmessage?.({ data: { type: 'progress', id, stage: 'trace', status: 'running' } });
          if (fail) {
            worker.onmessage?.({ data: { type: 'error', id, message: 'boom' } });
          } else {
            worker.onmessage?.({
              data: {
                type: 'result',
                id,
                result: { tile: { width: 1, height: 1, fills: [{ d: 'M0 0Z', role: 'engrave' }], strokes: [] }, lattice: null, confidence: { trace: 1 } },
              },
            });
          }
        });
      },
      terminate() { worker.terminated = true; },
    };
    return worker;
  }

  it('routes start → progress → result through the worker', async () => {
    const w = stubWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const progress = vi.fn();
    const result = await bridge.extract(squareImage(), {}, progress);
    expect(result.tile.fills).toHaveLength(1);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'trace', status: 'running' })
    );
  });

  it('rejects on a worker error message', async () => {
    const bridge = createExtractionBridge({ workerFactory: () => stubWorker({ fail: true }) });
    await expect(bridge.extract(squareImage(), {})).rejects.toThrow('boom');
  });

  it('terminates the worker on dispose', async () => {
    const w = stubWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    await bridge.extract(squareImage(), {});
    bridge.dispose();
    expect(w.terminated).toBe(true);
  });
});

// Adversarial-review finding 3: a worker that fails to LOAD or never answers
// must not hang extract() forever — the bridge retires the worker and falls
// back to the inline pipeline (same graceful-degradation contract as the
// no-Worker path). A protocol-level 'error' message stays a real rejection
// (covered above) — that's the pipeline failing, not the bridge.
describe('createExtractionBridge — worker failure fallback', () => {
  // Worker shell that accepts messages but never answers; failure modes are
  // triggered manually via its onerror/onmessageerror handlers.
  function deadWorker() {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      posted: 0,
      postMessage() { worker.posted++; },
      terminate() { worker.terminated = true; },
    };
    return worker;
  }

  it('falls back inline and resolves when the worker errors (onerror)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const p = bridge.extract(squareImage(), {});
    w.onerror({ message: 'worker script failed to load' });
    const result = await p;
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(w.terminated).toBe(true);
    bridge.dispose();
  });

  it('falls back inline on a message deserialization failure (onmessageerror)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const p = bridge.extract(squareImage(), {});
    w.onmessageerror({});
    const result = await p;
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    bridge.dispose();
  });

  it('falls back inline when the worker never responds (watchdog)', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w, watchdogMs: 20 });
    const result = await bridge.extract(squareImage(), {});
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(w.terminated).toBe(true);
    bridge.dispose();
  });

  it('stops using the retired worker: later extracts run inline directly', async () => {
    const w = deadWorker();
    let factoryCalls = 0;
    const bridge = createExtractionBridge({
      workerFactory: () => { factoryCalls++; return w; },
      watchdogMs: 20,
    });
    await bridge.extract(squareImage(), {});
    const again = await bridge.extract(squareImage(), {});
    expect(again.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(factoryCalls).toBe(1);
    expect(w.posted).toBe(1); // never posted to the dead worker again
    bridge.dispose();
  });

  it('rejects a second concurrent extract instead of clobbering handlers', async () => {
    const w = deadWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w, watchdogMs: 50 });
    const first = bridge.extract(squareImage(), {});
    await expect(bridge.extract(squareImage(), {})).rejects.toThrow(/in progress/i);
    await first; // settles via watchdog fallback
    bridge.dispose();
  });
});

// S2 cancellation: aborting the caller's signal releases the caller
// immediately (AbortError), sends a cooperative cancel to the worker, and
// DRAINS the ack — a responsive worker (and its warm lazy-loaded models)
// survives and is reused; a worker that ignores the cancel is replaced with a
// fresh one (NOT the broken-worker inline fallback).
describe('createExtractionBridge — cancellation', () => {
  const okResult = () => ({
    tile: { width: 1, height: 1, fills: [{ d: 'M0 0Z', role: 'engrave' }], strokes: [] },
    lattice: null,
    confidence: { trace: 1 },
  });

  // Speaks the full protocol: first start hangs (until cancelled), later
  // starts complete; cancel is acked with {type:'cancelled'}.
  function cancelAwareWorker() {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      starts: 0,
      cancels: 0,
      postMessage(msg) {
        if (msg.type === 'cancel') {
          worker.cancels++;
          queueMicrotask(() =>
            worker.onmessage?.({ data: { type: 'cancelled', id: msg.id } })
          );
          return;
        }
        if (msg.type !== 'start') return;
        worker.starts++;
        const { id } = msg;
        const hang = worker.starts === 1;
        queueMicrotask(() => {
          worker.onmessage?.({
            data: { type: 'progress', id, stage: 'trace', status: 'running', progress: 0.5 },
          });
          if (!hang) worker.onmessage?.({ data: { type: 'result', id, result: okResult() } });
        });
      },
      terminate() {
        worker.terminated = true;
      },
    };
    return worker;
  }

  // Accepts starts, emits one progress, then ignores everything — including
  // the cancel.
  function stubbornWorker() {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      starts: 0,
      postMessage(msg) {
        if (msg.type !== 'start') return;
        worker.starts++;
        const { id } = msg;
        queueMicrotask(() => {
          worker.onmessage?.({ data: { type: 'progress', id, stage: 'trace', status: 'running' } });
        });
      },
      terminate() {
        worker.terminated = true;
      },
    };
    return worker;
  }

  it('rejects with AbortError immediately when the signal is already aborted', async () => {
    const bridge = createExtractionBridge({ workerFactory: null });
    const controller = new AbortController();
    controller.abort();
    await expect(
      bridge.extract(squareImage(), {}, undefined, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    bridge.dispose();
  });

  it('cancels a worker extraction: AbortError to the caller, worker acked + reused', async () => {
    const w = cancelAwareWorker();
    let factoryCalls = 0;
    const bridge = createExtractionBridge({
      workerFactory: () => {
        factoryCalls++;
        return w;
      },
    });
    const controller = new AbortController();
    const sawProgress = new Promise((resolve) => {
      var progress = (p) => p.progress != null && resolve();
      bridge
        .extract(squareImage(), {}, progress, { signal: controller.signal })
        .catch((err) => {
          expect(err.name).toBe('AbortError');
        });
    });
    await sawProgress; // the run is genuinely in flight
    controller.abort();
    await Promise.resolve(); // let the cancel ack drain
    expect(w.cancels).toBe(1);
    expect(w.terminated).toBe(false); // warm worker survives a cancel

    const again = await bridge.extract(squareImage(), {});
    expect(again.tile.fills).toHaveLength(1);
    expect(factoryCalls).toBe(1); // SAME worker, not a fresh one
    expect(w.starts).toBe(2);
    bridge.dispose();
  });

  it('rejects a new extract while a cancelled run is still draining', async () => {
    const w = stubbornWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w, watchdogMs: 5000 });
    const controller = new AbortController();
    const p = bridge.extract(squareImage(), {}, undefined, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await expect(bridge.extract(squareImage(), {})).rejects.toThrow(/in progress/i);
    bridge.dispose();
  });

  it('replaces a worker that ignores the cancel: fresh worker on the next extract', async () => {
    const workers = [];
    const bridge = createExtractionBridge({
      workerFactory: () => {
        const w = workers.length === 0 ? stubbornWorker() : cancelAwareWorker();
        workers.push(w);
        return w;
      },
      watchdogMs: 20,
    });
    const controller = new AbortController();
    const p = bridge.extract(squareImage(), {}, undefined, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 40)); // drain watchdog elapses

    expect(workers[0].terminated).toBe(true); // the deaf worker was replaced
    // First start on the fresh cancelAwareWorker hangs by design; use its
    // second-start path by pre-warming: extract → cancel-free result comes
    // only on start 2, so drive one hanging call via a cancel first.
    const c2 = new AbortController();
    const p2 = bridge.extract(squareImage(), {}, undefined, { signal: c2.signal });
    c2.abort();
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    const result = await bridge.extract(squareImage(), {});
    expect(result.tile.fills).toHaveLength(1);
    expect(workers).toHaveLength(2);
    bridge.dispose();
  });

  it('forwards fractional stage progress from the worker protocol', async () => {
    const w = cancelAwareWorker();
    const bridge = createExtractionBridge({ workerFactory: () => w });
    const controller = new AbortController();
    const events = [];
    const done = new Promise((resolve) => {
      bridge
        .extract(squareImage(), {}, (p) => {
          events.push(p);
          resolve();
        }, { signal: controller.signal })
        .catch(() => {});
    });
    await done;
    controller.abort();
    expect(events).toContainEqual({ stage: 'trace', status: 'running', progress: 0.5 });
    bridge.dispose();
  });
});

// --- S3 (issue #52): the flatten stage + the Flatten step's rectify path ----

describe('runExtraction — flatten stage (S3)', () => {
  const cropQuad = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 },
  ];

  it('rectifies through options.flatten.quad and traces the rectified raster', async () => {
    const result = await runExtraction({
      image: squareImage(),
      options: { flatten: { quad: cropQuad } },
    });
    // Axis-aligned quad == crop: the tile is now 30×30 and the black square
    // (15..35 in source space) still traces inside it.
    expect(result.tile.width).toBe(30);
    expect(result.tile.height).toBe(30);
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
    expect(result.confidence.flatten).toBe(1);
  });

  it('emits staged progress: flatten running → done, then lattice, then trace', async () => {
    const events = [];
    await runExtraction(
      { image: squareImage(), options: { flatten: { quad: cropQuad } } },
      (p) => events.push(p)
    );
    expect(statusSequence(events)).toEqual([
      'flatten:running',
      'flatten:done',
      'lattice:running',
      'lattice:done',
      'symmetry:skipped',
      'trace:running',
      'trace:done',
    ]);
  });

  // Flatten is optional (fail-soft, locked decision 8): a quad that cannot
  // warp surfaces as {status:'failed'} + confidence 0 and the flow continues
  // on the UNRECTIFIED image — never a dead end. (The manual Flatten step's
  // runRectify path rejects loudly instead — covered below.)
  it('fails soft on a bad quad: failed event, confidence 0, unrectified trace', async () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 49, y: 0 },
      { x: 0, y: 49 },
      { x: 49, y: 49 },
    ];
    const events = [];
    const result = await runExtraction(
      { image: squareImage(), options: { flatten: { quad: bowtie } } },
      (p) => events.push(p)
    );
    expect(events).toContainEqual({
      stage: 'flatten',
      status: 'failed',
      error: expect.stringMatching(/cannot flatten/i),
    });
    expect(result.confidence.flatten).toBe(0);
    expect(result.tile.width).toBe(50); // traced the original, unrectified
    expect(result.tile.fills.length).toBeGreaterThanOrEqual(1);
  });
});

describe('runRectify (S3)', () => {
  const cropQuad = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 },
  ];

  it('returns the rectified raster + homography with flatten progress', async () => {
    const events = [];
    const { rectified, homography } = await runRectify(
      { image: squareImage(), quad: cropQuad },
      (p) => events.push(p)
    );
    expect(rectified.width).toBe(30);
    expect(rectified.height).toBe(30);
    expect(homography).toHaveLength(9);
    expect(events).toEqual([
      { stage: 'flatten', status: 'running' },
      { stage: 'flatten', status: 'done' },
    ]);
  });

  it('rejects loudly on a quad that cannot warp (apply-time contract)', async () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 49, y: 0 },
      { x: 0, y: 49 },
      { x: 49, y: 49 },
    ];
    await expect(runRectify({ image: squareImage(), quad: bowtie })).rejects.toThrow(
      /cannot flatten/i
    );
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runRectify({ image: squareImage(), quad: cropQuad }, undefined, {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createExtractionBridge — rectify (S3)', () => {
  const cropQuad = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 },
  ];

  it('runs rectify inline when no Worker is available', async () => {
    const bridge = createExtractionBridge({ workerFactory: null });
    const progress = vi.fn();
    const { rectified, homography } = await bridge.rectify(squareImage(), cropQuad, progress);
    expect(rectified.width).toBe(30);
    expect(homography).toHaveLength(9);
    expect(progress).toHaveBeenCalledWith({ stage: 'flatten', status: 'done' });
    bridge.dispose();
  });

  it('routes start-rectify → progress → result through the worker, quad included', async () => {
    const posted = [];
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(msg) {
        posted.push(msg);
        const { id } = msg;
        queueMicrotask(() => {
          worker.onmessage?.({
            data: { type: 'progress', id, stage: 'flatten', status: 'running' },
          });
          worker.onmessage?.({
            data: {
              type: 'result',
              id,
              result: {
                rectified: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
                homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              },
            },
          });
        });
      },
      terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => worker });
    const progress = vi.fn();
    const result = await bridge.rectify(squareImage(), cropQuad, progress);
    expect(posted[0].type).toBe('start-rectify');
    expect(posted[0].quad).toEqual(cropQuad);
    expect(result.homography).toHaveLength(9);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'flatten', status: 'running' })
    );
    bridge.dispose();
  });

  it('falls back inline when the worker never responds (watchdog)', async () => {
    const dead = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => dead, watchdogMs: 20 });
    const { rectified } = await bridge.rectify(squareImage(), cropQuad);
    expect(rectified.width).toBe(30);
    bridge.dispose();
  });

  it('shares the one-in-flight guard with extract()', async () => {
    const dead = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => dead, watchdogMs: 50 });
    const first = bridge.extract(squareImage(), {});
    await expect(bridge.rectify(squareImage(), cropQuad)).rejects.toThrow(/in progress/i);
    await first; // settles via watchdog fallback
    bridge.dispose();
  });

  it('supports cancellation with the cancel/drain protocol', async () => {
    // Hangs on start-rectify, acks cancels.
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      cancels: 0,
      postMessage(msg) {
        if (msg.type === 'cancel') {
          worker.cancels++;
          queueMicrotask(() =>
            worker.onmessage?.({ data: { type: 'cancelled', id: msg.id } })
          );
        }
        // start-rectify: never answers (until cancelled)
      },
      terminate() {},
    };
    const bridge = createExtractionBridge({ workerFactory: () => worker });
    const controller = new AbortController();
    const p = bridge.rectify(squareImage(), cropQuad, undefined, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.cancels).toBe(1);
    bridge.dispose();
  });
});
