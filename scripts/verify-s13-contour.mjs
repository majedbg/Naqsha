// S13 (#62) laser-deliverable driver — FILLED-CONTOUR variant. Same real jali
// photo, same tuned #70 Auto-clean preprocessing as verify-s13.mjs (the
// centerline-default variant), but every traced component is emitted as its
// FILLED closed contour (engrave), NOT a thinned centerline (score).
//
//   npx vitest run --config scripts/verify-s13-contour.vitest.config.mjs
//
// THE CENTERLINE-VS-CONTOUR MECHANISM (locked decision 9):
//   `vectorize()` returns per-motif `components`, each carrying BOTH a closed
//   `contour` (the guaranteed floor — always present) AND a `centerline`
//   (skeleton, null when degenerate). It CLASSIFIES each: long-thin line-work
//   defaults to kind:'stroke'/role:'score' (a centerline), solid blobs default
//   to kind:'fill'/role:'engrave' (a filled contour). The Review step then lets
//   the user flip any component centerline<->contour: ExtractStepper's
//   toggleShapeKind maps centerline -> {kind:'fill', role:'engrave'}.
//   `buildTile` honours that edit: kind==='fill' emits `shape.contour.d` as a
//   filled evenodd path; kind==='stroke' emits `shape.centerline.d` as an open
//   stroke. Since EVERY component always has a contour, forcing every shape's
//   edit to {kind:'fill', role:'engrave'} yields ALL FILLED closed contours and
//   ZERO score strokes — the genuine product mechanism (decision 9's toggle),
//   applied to every member. That is the only change vs. verify-s13.mjs.
//
// Also dumps the tuned BINARY (binarize(image, TUNED)) as raw RGBA so the honest
// read can compare the filled-contour preview against the actual binary the
// task names as the target look.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { runExtraction } from '../src/lib/extraction/pipeline.js';
import { binarize } from '../src/lib/extraction/preprocess.js';
import { makeExtractedPattern } from '../src/lib/extraction/extractedPattern.js';
import { makeExtractedPatternClass } from '../src/lib/patterns/ExtractedPatternGenerator.js';
import { buildAllLayersSVG } from '../src/lib/svgExport.js';

const SCRATCH = '/private/tmp/claude-501/-Users-jadembg-Documents-Sonoform-all-Sonoform-generativeArt/2ca06aa3-5f0a-4e1d-927d-05ee80013419/scratchpad';
const DEST = '/Users/jadembg/Documents/Sonoform_all/Naqsha-extraction/s13-laser-prototype';

// --- verbatim from ExtractStepper.jsx (private helpers, not exported) --------
function shapesFromResult(result) {
  if (result.components?.length) {
    return result.components.map((c) => ({
      contour: c.contour ?? null,
      centerline: c.centerline ?? null,
      kind: c.kind,
      role: c.role,
    }));
  }
  return [
    ...result.tile.fills.map((f) => ({ contour: { d: f.d }, centerline: null, kind: 'fill', role: f.role })),
    ...result.tile.strokes.map((s) => ({ contour: null, centerline: { d: s.d }, kind: 'stroke', role: s.role })),
  ];
}
function buildTile(result, shapes, edits) {
  const fills = [];
  const strokes = [];
  shapes.forEach((shape, i) => {
    const { kind, role } = edits[i] ?? shape;
    if (kind === 'stroke') strokes.push({ d: shape.centerline.d, role });
    else fills.push({ d: shape.contour.d, role });
  });
  return { width: result.tile.width, height: result.tile.height, fills, strokes };
}

function loadImage() {
  const hdr = JSON.parse(readFileSync(`${SCRATCH}/jali.json`, 'utf8'));
  const buf = readFileSync(`${SCRATCH}/jali.rgba`);
  return { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), width: hdr.width, height: hdr.height };
}

// bbox aspect of a `d` string — evidence that engrave fills are compact filled
// regions, not long slivers (an accidental doubled outline of a line).
function bboxOf(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  let x = 0, y = 0, cmd = null, i = 0;
  const num = () => Number(tokens[i++]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rec = () => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'L': x = num(); y = num(); rec(); break;
      case 'm': case 'l': x += num(); y += num(); rec(); break;
      case 'H': x = num(); rec(); break; case 'h': x += num(); rec(); break;
      case 'V': y = num(); rec(); break; case 'v': y += num(); rec(); break;
      case 'C': i += 4; x = num(); y = num(); rec(); break;
      case 'c': i += 4; x += num(); y += num(); rec(); break;
      case 'Z': case 'z': break;
      default: throw new Error(`unexpected command ${cmd}`);
    }
  }
  const w = maxX - minX, h = maxY - minY;
  return { w, h, aspect: Math.max(w, h) / Math.max(1e-6, Math.min(w, h)) };
}

describe('S13 laser deliverable — FILLED CONTOUR variant', () => {
  it('regenerates the filled-contour, invert+auto-clean, role-separated, perimeter-cut SVG', async () => {
    const image = loadImage();

    // Same tuned #70 Auto-clean preset as the centerline variant.
    const TUNED = { invert: true, adaptive: true, window: 25, k: 0.2, blur: 1, minArea: 5 };

    const result = await runExtraction({ image, options: { trace: TUNED } });

    // --- dump the tuned BINARY for the honest side-by-side (target look) ------
    const bw = binarize(image, TUNED);
    writeFileSync(`${SCRATCH}/binary-tuned.rgba`, Buffer.from(bw.data.buffer, bw.data.byteOffset, bw.data.length));
    writeFileSync(`${SCRATCH}/binary-tuned.json`, JSON.stringify({ width: bw.width, height: bw.height }));

    const shapes = shapesFromResult(result);

    // --- THE MECHANISM: force every component to its FILLED contour (engrave) -
    // Exactly ExtractStepper.toggleShapeKind's centerline->{kind:'fill',
    // role:'engrave'} edit, applied to every shape. Filled closed contours,
    // zero centerline strokes. (Contrast verify-s13.mjs, which passes the raw
    // classification edits and keeps the centerline-default strokes.)
    const defaultKinds = shapes.map((s) => s.kind);
    const edits = shapes.map(() => ({ kind: 'fill', role: 'engrave' }));
    const tile = buildTile(result, shapes, edits);

    const entity = makeExtractedPattern({
      patternId: 'jali-s13-contour',
      title: 'Mughal jali (S13 laser, filled contour)',
      tile,
      lattice: result.lattice,
      symmetry: result.symmetry,
    });
    const Cls = makeExtractedPatternClass(entity);
    const inst = new Cls();

    const CANVAS = 378; // 100 mm @ 96 PPI
    inst._lastCx = CANVAS / 2;
    inst._lastCy = CANVAS / 2;

    const layer = { id: 'jali', visible: true, color: '#000000', opacity: 100 };
    let svg = buildAllLayersSVG([layer], { jali: inst }, CANVAS, CANVAS, false, { profileId: 'laser' });

    // --- fabrication-prep edit 1: strip the presentation white background rect --
    const beforeRect = svg;
    svg = svg.replace(/\s*<rect [^>]*fill="white"[^>]*\/>/, '');
    if (svg === beforeRect) throw new Error('white background rect not found to strip');

    // --- fabrication-prep edit 2: add the 100 mm boundary as data-role="cut" ---
    const m = 0.5, M = CANVAS - 0.5;
    const perimeter = `  <path data-role="cut" d="M${m} ${m} H${M} V${M} H${m} Z" fill="none" stroke="#FF0000" stroke-width="1"/>`;
    svg = svg.replace('\n</svg>', `\n${perimeter}\n</svg>`);

    writeFileSync(`${DEST}/pattern.svg`, svg);

    // --- diagnostics --------------------------------------------------------
    const roleCount = (r) => (svg.match(new RegExp(`data-role="${r}"`, 'g')) || []).length;
    const counts = { engrave: roleCount('engrave'), score: roleCount('score'), cut: roleCount('cut') };
    const engravePaths = [...svg.matchAll(/<path d="([^"]+)"[^>]*data-role="engrave"/g)].map((x) => x[1]);
    // every engrave fill must be a CLOSED contour (has Z) drawn as a fill.
    const engraveOpen = engravePaths.filter((d) => !/[zZ]/.test(d)).length;
    const engraveIsFill = /data-role="engrave"[^>]*fill-rule="evenodd"/.test(svg)
      || /<path[^>]*fill-rule="evenodd"[^>]*data-role="engrave"/.test(svg);
    const engraveFill = (svg.match(/<path[^>]*data-role="engrave"[^>]*/) || [''])[0].match(/fill="([^"]+)"/)?.[1];
    const aspects = engravePaths.map(bboxOf).map((b) => b.aspect);
    const dims = svg.match(/width="([^"]+)" height="([^"]+)" viewBox="([^"]+)"/);
    const scorePaths = [...svg.matchAll(/<path d="([^"]+)"[^>]*data-role="score"/g)].map((x) => x[1]);
    const scoreHasZ = scorePaths.filter((d) => /[zZ]/.test(d)).length;

    // eslint-disable-next-line no-console
    console.log(`\n===== S13 FILLED-CONTOUR verify =====
[decode]   ${image.width}x${image.height} (PIL central crop, downscaled)
[tuned]    ${JSON.stringify(TUNED)}
[binary]   ${bw.width}x${bw.height}  (dumped -> ${SCRATCH}/binary-tuned.rgba)
[lattice]  ${JSON.stringify(result.lattice)}
[symmetry] ${JSON.stringify(result.symmetry)} conf=${result.confidence?.symmetry}
[components] n=${result.components?.length}  default kinds: ${JSON.stringify(defaultKinds)}
[forced]   every shape -> {kind:'fill', role:'engrave'}
[tile]     ${tile.width}x${tile.height}  fills=${tile.fills.length} strokes=${tile.strokes.length}
[export]   ${dims ? `width=${dims[1]} height=${dims[2]} viewBox="${dims[3]}"` : 'DIMS NOT FOUND'}
[roles]    engrave=${counts.engrave} (fill ${engraveFill}, evenodd=${engraveIsFill}) | score=${counts.score} | cut=${counts.cut}
[engrave closed?] ${engravePaths.length} engrave paths, of which OPEN (no Z)=${engraveOpen}  -> ${engraveOpen === 0 ? 'ALL CLOSED CONTOURS' : 'SOME OPEN!'}
[engrave aspect] min=${Math.min(...aspects).toFixed(2)} max=${Math.max(...aspects).toFixed(2)} median=${aspects.slice().sort((a,b)=>a-b)[Math.floor(aspects.length/2)]?.toFixed(2)}
[score closed?] ${scorePaths.length} score paths, Z=${scoreHasZ}
[svg bytes] ${svg.length}
=====================================\n`);

    // Guards.
    expect(counts.engrave).toBeGreaterThan(0);
    expect(counts.score).toBe(0);            // filled-contour: no centerlines
    expect(counts.cut).toBe(1);              // exactly the one perimeter
    expect(engraveFill).toBe('#000000');
    expect(engraveIsFill).toBe(true);
    expect(engraveOpen).toBe(0);             // all engrave paths are closed contours
    expect(dims[1]).toMatch(/mm$/);
  });
});
