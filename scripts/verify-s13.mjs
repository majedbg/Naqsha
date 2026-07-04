// S13 (#62) laser-deliverable driver — regenerates the CLEAN, one-load-cuttable
// SVG from the SAME real jali photo, now that #69 (invert/polarity) and #68
// (role-separated laser export) are merged. Runs the GENUINE pipeline functions
// in node under the vitest loader (same loader verify-69 uses so the potrace
// deep import resolves as in the app):
//
//   npx vitest run --config scripts/verify-s13.vitest.config.mjs
//
// Route (mirrors ExtractStepper's free "keep the traced tile" path, now with the
// #70 Auto-clean preset applied):
//   PIL-decoded raster (central crop, 760px)  [decode divergence: PIL not the
//     app's browser Image — the CV pipeline downstream is genuine app code]
//   → runExtraction({image, options:{trace:{invert:true, adaptive:true,
//                    window:25, k:0.2, blur:1, minArea:5}}})   pipeline.js
//        (== ExtractStepper AUTO_CLEAN_PRESET serialized through buildTraceOptions)
//   → shapesFromResult + buildTile   (replicated verbatim from ExtractStepper)
//   → makeExtractedPattern(...)      extractedPattern.js
//   → makeExtractedPatternClass(entity) → instance   ExtractedPatternGenerator.js
//   → buildAllLayersSVG([layer],[instance],378,378,false,{profileId:'laser'})
//        svgExport.js — #68 role colors: engrave #000 / score #00F / cut #F00
//   → ADD a 100mm perimeter as a data-role="cut" red path (fabrication boundary)
//   → write s13-laser-prototype/pattern.svg
//
// Also runs the pipeline WITHOUT invert on the SAME decoded buffer as a
// controlled A/B, to prove the #69 flip changed the trace (members vs. the
// negative-space gap-web) rather than merely being accepted.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { runExtraction } from '../src/lib/extraction/pipeline.js';
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

// Absolute on-path points from a `d` string (relative deltas handled) — bbox
// evidence for the invert A/B.
function absolutePointsIn(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  const pts = [];
  let x = 0, y = 0, cmd = null, i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'L': x = num(); y = num(); break;
      case 'm': case 'l': x += num(); y += num(); break;
      case 'H': x = num(); break; case 'h': x += num(); break;
      case 'V': y = num(); break; case 'v': y += num(); break;
      case 'C': i += 4; x = num(); y = num(); break;
      case 'c': i += 4; x += num(); y += num(); break;
      case 'Z': case 'z': break;
      default: throw new Error(`unexpected command ${cmd}`);
    }
    if (cmd !== 'Z' && cmd !== 'z') pts.push([x, y]);
  }
  return pts;
}
function traceBBox(res) {
  const pts = res.components.flatMap((c) => absolutePointsIn(c.contour.d));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = res.tile.width;
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    spanX: (Math.max(...xs) - Math.min(...xs)) / w,
    spanY: (Math.max(...ys) - Math.min(...ys)) / w,
    n: res.components.length,
  };
}

function loadImage() {
  const hdr = JSON.parse(readFileSync(`${SCRATCH}/jali.json`, 'utf8'));
  const buf = readFileSync(`${SCRATCH}/jali.rgba`);
  return { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), width: hdr.width, height: hdr.height };
}

describe('S13 laser deliverable — genuine pipeline, invert=true, laser export', () => {
  it('regenerates the role-separated, invert-traced, perimeter-cut SVG', async () => {
    const image = loadImage();

    // The #70 Auto-clean preset (verbatim from ExtractStepper AUTO_CLEAN_PRESET,
    // as buildTraceOptions() would serialize it): invert + Sauvola adaptive local
    // threshold (window 25, k 0.2) + light Gaussian blur (sigma 1) to bridge
    // shadow-broken members + min-area 5 to drop speckle.
    const TUNED = { invert: true, adaptive: true, window: 25, k: 0.2, blur: 1, minArea: 5 };

    // --- #69 + #70 controlled A/B/C on the SAME decoded buffer ----------------
    const off = await runExtraction({ image });                                 // no invert (negative-space web)
    const invOnly = await runExtraction({ image, options: { trace: { invert: true } } }); // members, pre-#70 (noisy)
    const on = await runExtraction({ image, options: { trace: TUNED } });       // members + Auto-clean (adopted)
    const bOff = traceBBox(off);
    const bOn = traceBBox(on);
    const bInv = traceBBox(invOnly);

    // #69 VISUAL evidence: render each polarity's raw traced tile (engrave fills
    // black, score strokes red) so OFF (negative-space gap-web) vs ON (stone
    // members) can be eyeballed side by side. Written to scratch, not shipped.
    const tileSVG = (res) => {
      const w = res.tile.width, h = res.tile.height;
      const fills = res.tile.fills.map((f) => `<path d="${f.d}" fill="#000" fill-rule="evenodd" stroke="none"/>`).join('');
      const strokes = res.tile.strokes.map((s) => `<path d="${s.d}" fill="none" stroke="#e00" stroke-width="1"/>`).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/>${fills}${strokes}</svg>`;
    };
    writeFileSync(`${SCRATCH}/evidence-off.svg`, tileSVG(off));       // no invert (web)
    writeFileSync(`${SCRATCH}/evidence-invonly.svg`, tileSVG(invOnly)); // members, pre-#70 (noisy 90 frags)
    writeFileSync(`${SCRATCH}/evidence-on.svg`, tileSVG(on));         // members + Auto-clean (clean, adopted)

    // --- adopt the invert+Auto-clean run (free path: keep the traced tile) ---
    const result = on;
    const shapes = shapesFromResult(result);
    const tile = buildTile(result, shapes, shapes); // no Review edits
    const entity = makeExtractedPattern({
      patternId: 'jali-s13',
      title: 'Mughal jali (S13 laser)',
      tile,
      lattice: result.lattice,
      symmetry: result.symmetry,
    });
    const Cls = makeExtractedPatternClass(entity);
    const inst = new Cls();

    // 100 mm tile @ 96 PPI: 100/25.4*96 = 377.95 → 378 px canvas. Prime the
    // symmetry context generateWithContext would record (all toSVGGroup reads).
    const CANVAS = 378;
    inst._lastCx = CANVAS / 2;
    inst._lastCy = CANVAS / 2;

    const layer = { id: 'jali', visible: true, color: '#000000', opacity: 100 };
    let svg = buildAllLayersSVG([layer], { jali: inst }, CANVAS, CANVAS, false, { profileId: 'laser' });

    // --- fabrication-prep edit 1: strip the presentation white background rect --
    // buildAllLayersSVG emits `<rect ... fill="white"/>` with NO data-role — it is
    // a preview backdrop, not geometry. Laser software (LightBurn/Glowforge/xTool)
    // would import it as a full-tile filled white shape the operator must hunt down
    // and delete, breaking the "one-load-cuttable" property. It carries no role, so
    // it is unambiguously safe to remove. Do it here so the shipped file is truly
    // load-and-cut (preview is re-rendered from THIS file, so preview == deliverable).
    const beforeRect = svg;
    svg = svg.replace(/\s*<rect [^>]*fill="white"[^>]*\/>/, '');
    if (svg === beforeRect) throw new Error('white background rect not found to strip — check buildAllLayersSVG output');

    // --- fabrication-prep edit 2: ADD the 100 mm boundary as a data-role="cut" path -
    // NOT pipeline output: the traced tile is engrave+score only, nothing
    // releases the piece. Inset 0.5px so the stroke centerline (what the laser
    // follows) sits inside the sheet and doesn't half-clip in the preview.
    const m = 0.5, M = CANVAS - 0.5;
    const perimeter = `  <path data-role="cut" d="M${m} ${m} H${M} V${M} H${m} Z" fill="none" stroke="#FF0000" stroke-width="1"/>`;
    svg = svg.replace('\n</svg>', `\n${perimeter}\n</svg>`);

    writeFileSync(`${DEST}/pattern.svg`, svg);

    // --- diagnostics --------------------------------------------------------
    const roleCount = (r) => (svg.match(new RegExp(`data-role="${r}"`, 'g')) || []).length;
    const counts = { engrave: roleCount('engrave'), score: roleCount('score'), cut: roleCount('cut') };
    // colors actually present per role (first path element carrying that role;
    // attribute order-independent — pull the whole tag then read the attr).
    const colorFor = (r, kind) => {
      const tag = (svg.match(new RegExp(`<path[^>]*data-role="${r}"[^>]*/>|<path[^>]*/>(?=[^<]*data-role="${r}")`)) || [])[0]
        || (svg.match(new RegExp(`<path[^>]*/>`, 'g')) || []).find((t) => t.includes(`data-role="${r}"`));
      if (!tag) return null;
      const am = tag.match(new RegExp(`${kind}="([^"]+)"`));
      return am ? am[1] : null;
    };
    const engraveFill = colorFor('engrave', 'fill');
    const scoreStroke = colorFor('score', 'stroke');
    const cutStroke = colorFor('cut', 'stroke');
    // single-pass centerline: every score path must be OPEN (no Z).
    const scorePaths = [...svg.matchAll(/<path d="([^"]+)"[^>]*data-role="score"/g)].map((x) => x[1]);
    const scoreHasZ = scorePaths.filter((d) => /[zZ]/.test(d)).length;
    const dims = svg.match(/width="([^"]+)" height="([^"]+)" viewBox="([^"]+)"/);

    // eslint-disable-next-line no-console
    console.log(`\n===== S13 verify =====
[decode]  ${image.width}x${image.height} (PIL central crop, downscaled)
[tuned]   ${JSON.stringify(TUNED)}
[#69 A/B] invert OFF     : n=${bOff.n} bbox x[${bOff.minX.toFixed(1)}..${bOff.maxX.toFixed(1)}] spanX=${bOff.spanX.toFixed(2)} spanY=${bOff.spanY.toFixed(2)} (tile ${off.tile.width}x${off.tile.height})
[#69 A/B] invert ON (raw): n=${bInv.n} bbox x[${bInv.minX.toFixed(1)}..${bInv.maxX.toFixed(1)}] spanX=${bInv.spanX.toFixed(2)} spanY=${bInv.spanY.toFixed(2)} (tile ${invOnly.tile.width}x${invOnly.tile.height})
[#70 clean] invert+Auto-clean: n=${bOn.n} bbox x[${bOn.minX.toFixed(1)}..${bOn.maxX.toFixed(1)}] spanX=${bOn.spanX.toFixed(2)} spanY=${bOn.spanY.toFixed(2)} (tile ${on.tile.width}x${on.tile.height})  [frags ${bInv.n}->${bOn.n}]
[lattice] ${JSON.stringify(result.lattice)}
[symmetry]${JSON.stringify(result.symmetry)} conf=${result.confidence?.symmetry}
[tile]    ${tile.width}x${tile.height}  fills=${tile.fills.length} strokes=${tile.strokes.length}
[roles in tile] fills:${[...new Set(tile.fills.map((f) => f.role))].join(',')} strokes:${[...new Set(tile.strokes.map((s) => s.role))].join(',')}
[export]  ${dims ? `width=${dims[1]} height=${dims[2]} viewBox="${dims[3]}"` : 'DIMS NOT FOUND'}
[#68 role separation] engrave=${counts.engrave} (fill ${engraveFill}) | score=${counts.score} (stroke ${scoreStroke}) | cut=${counts.cut} (stroke ${cutStroke})
[single-pass] score paths=${scorePaths.length}, of which have Z (closed)=${scoreHasZ}  -> ${scoreHasZ === 0 ? 'OPEN centerlines OK' : 'DOUBLED?'}
[svg bytes] ${svg.length}
======================\n`);

    // Guards (fail loud if the milestone claims don't hold on THIS decode).
    expect(counts.engrave).toBeGreaterThan(0);
    expect(counts.cut).toBe(1); // exactly the one perimeter we added
    expect(engraveFill).toBe('#000000');
    if (counts.score > 0) expect(scoreStroke).toBe('#0000FF');
    expect(cutStroke).toBe('#FF0000');
    expect(scoreHasZ).toBe(0);
    expect(dims[1]).toMatch(/mm$/);
  });
});
