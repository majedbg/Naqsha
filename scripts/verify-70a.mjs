// #70a adaptive-threshold honesty proof — does the preprocessing chain
// MEASURABLY clean a hard real input (the S13 stone jali screen), or not?
//
// It runs the REAL binarize + vectorize (the worker's code path) on the jali
// source, headless. sips (macOS) central-crops ~1400px and downscales to 760px
// into a BMP we parse to ImageData (no jpeg decoder in node here). Then:
//   BASELINE  — global threshold 128, no preprocessing (today's behavior)
//   TUNED     — blur + Sauvola adaptive + min-area
//   GLOBAL+PP — global threshold WITH the same blur + min-area (isolates what
//               ADAPTIVE specifically contributes — the real go/no-go for #70)
// All with invert:true (light stone members on dark openings, #69).
//
// Metrics are computed IDENTICALLY for every run and paired so the win can't be
// faked: small-component count (noise blobs) and fragment count are the "less
// noise / better connectivity" numbers; total centerline length + ink fraction
// are FIDELITY anchors that over-blur/over-suppress would wreck — a real clean
// drops fragments while holding centerline length, mush collapses both.
//
//   npx vitest run scripts/verify-70a.mjs   (node loader → potrace deep import)

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { binarize, connectedComponents } from '../src/lib/extraction/preprocess.js';
import { vectorize } from '../src/lib/extraction/vectorizer.js';

const SRC = '/Users/jadembg/Documents/Sonoform_all/Naqsha/s13-laser-prototype/jali-source.jpg';
const OUT = new URL('../scripts-out/', import.meta.url).pathname;
const CROP = 1400;
const DIM = 760;
const SMALL_AREA = 12; // ink component ≤ this (px) counts as a noise blob

// --- sips crop+resize → BMP → ImageData ------------------------------------

function loadJaliImageData() {
  mkdirSync(OUT, { recursive: true });
  const bmp = `${OUT}jali-760.bmp`;
  if (!existsSync(bmp)) {
    const crop = `${OUT}jali-crop.png`;
    execSync(`sips -c ${CROP} ${CROP} "${SRC}" -o "${crop}"`, { stdio: 'ignore' });
    execSync(`sips -Z ${DIM} "${crop}" -s format bmp -o "${bmp}"`, { stdio: 'ignore' });
  }
  return parseBMP(readFileSync(bmp));
}

function parseBMP(buf) {
  const dataOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  let height = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24) throw new Error(`expected 24bpp BMP, got ${bpp}`);
  const topDown = height < 0;
  height = Math.abs(height);
  const stride = ((width * 3 + 3) >> 2) << 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    let p = dataOffset + srcRow * stride;
    for (let x = 0; x < width; x++) {
      const b = buf[p++];
      const g = buf[p++];
      const r = buf[p++];
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// --- minimal BMP writer (24bpp) so sips can transcode to PNG ---------------

function writeBinaryPNG(image, path) {
  const { data, width, height } = image;
  const stride = ((width * 3 + 3) >> 2) << 2;
  const size = 54 + stride * height;
  const buf = Buffer.alloc(size);
  buf.write('BM', 0);
  buf.writeUInt32LE(size, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // top-down
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) {
    let p = 54 + y * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[p++] = data[i + 2];
      buf[p++] = data[i + 1];
      buf[p++] = data[i];
    }
  }
  const bmpPath = path.replace(/\.png$/, '.bmp');
  writeFileSync(bmpPath, buf);
  execSync(`sips -s format png "${bmpPath}" -o "${path}"`, { stdio: 'ignore' });
}

// --- trace rasterizer (draw contour polygons as thin strokes → PNG) --------

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
      case 'H': x = num(); break;
      case 'h': x += num(); break;
      case 'V': y = num(); break;
      case 'v': y += num(); break;
      case 'C': i += 4; x = num(); y = num(); break;
      case 'c': i += 4; x += num(); y += num(); break;
      case 'Z': case 'z': break;
      default: throw new Error(`unexpected command ${cmd}`);
    }
    if (cmd !== 'Z' && cmd !== 'z') pts.push([x, y]);
  }
  return pts;
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return len;
}

function renderTracePNG(vec, w, h, path) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const plot = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    const i = (yi * w + xi) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  };
  const line = (a, b) => {
    let [x0, y0] = a, [x1, y1] = b;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const strokePath = (d) => {
    for (const sub of d.split(/(?=[Mm])/)) {
      const pts = absolutePointsIn(sub.trim());
      for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i]);
    }
  };
  for (const c of vec.components) {
    strokePath(c.contour.d);
    if (c.centerline) strokePath(c.centerline.d);
  }
  writeBinaryPNG({ data, width: w, height: h }, path);
}

// --- metrics (identical for every run) -------------------------------------

function metrics(binary, vec) {
  const cc = connectedComponents(binary);
  let small = 0;
  for (let l = 1; l <= cc.count; l++) if (cc.sizes[l] <= SMALL_AREA) small++;
  let ink = 0;
  for (let j = 0; j < binary.width * binary.height; j++) {
    if (binary.data[j * 4] < 128) ink++;
  }
  let centerlineLen = 0;
  for (const c of vec.components) {
    if (c.centerline) {
      for (const sub of c.centerline.d.split(/(?=[Mm])/)) {
        centerlineLen += polylineLength(absolutePointsIn(sub.trim()));
      }
    }
  }
  return {
    inkPct: (100 * ink) / (binary.width * binary.height),
    ccTotal: cc.count,
    ccSmall: small,
    fragTotal: vec.components.length,
    strokeFrag: vec.strokes.length,
    centerlineLen,
  };
}

const TUNED = { invert: true, blur: 1.2, adaptive: true, window: 41, k: 0.28, minArea: 16 };
const GLOBAL_PP = { invert: true, blur: 1.2, minArea: 16 }; // isolates adaptive

describe('#70a — adaptive threshold on the S13 jali (honest metrics)', () => {
  it('reports baseline vs tuned and renders both binaries + traces', async () => {
    const img = loadJaliImageData();

    const runs = {
      baseline: { invert: true },
      tuned: TUNED,
      globalPP: GLOBAL_PP,
    };
    const results = {};
    for (const [name, opts] of Object.entries(runs)) {
      const binary = binarize(img, opts);
      const vec = await vectorize(img, opts);
      results[name] = { binary, vec, m: metrics(binary, vec) };
    }

    writeBinaryPNG(results.baseline.binary, `${OUT}verify-70a-baseline-binary.png`);
    writeBinaryPNG(results.tuned.binary, `${OUT}verify-70a-tuned-binary.png`);
    renderTracePNG(results.baseline.vec, img.width, img.height, `${OUT}verify-70a-baseline-trace.png`);
    renderTracePNG(results.tuned.vec, img.width, img.height, `${OUT}verify-70a-tuned-trace.png`);

    const b = results.baseline.m;
    const t = results.tuned.m;
    const g = results.globalPP.m;
    const pct = (from, to) => (from === 0 ? 'n/a' : `${(((to - from) / from) * 100).toFixed(1)}%`);
    const row = (label, m) =>
      `  ${label.padEnd(10)} ink%=${m.inkPct.toFixed(2)}  cc=${String(m.ccTotal).padStart(5)}  small(≤${SMALL_AREA}px)=${String(m.ccSmall).padStart(5)}  frag=${String(m.fragTotal).padStart(5)}  strokeFrag=${String(m.strokeFrag).padStart(4)}  clLen=${m.centerlineLen.toFixed(0)}`;

    // eslint-disable-next-line no-console
    console.log(
      `\n[verify-70a] jali ${img.width}×${img.height}, invert:true, SMALL≤${SMALL_AREA}px\n` +
      `  TUNED params: ${JSON.stringify(TUNED)}\n` +
      row('BASELINE', b) + '\n' +
      row('GLOBAL+PP', g) + '\n' +
      row('TUNED', t) + '\n' +
      `\n  BASELINE→TUNED:  small-blobs ${b.ccSmall}→${t.ccSmall} (${pct(b.ccSmall, t.ccSmall)}), ` +
      `fragments ${b.fragTotal}→${t.fragTotal} (${pct(b.fragTotal, t.fragTotal)}), ` +
      `centerlineLen ${b.centerlineLen.toFixed(0)}→${t.centerlineLen.toFixed(0)} (${pct(b.centerlineLen, t.centerlineLen)})\n` +
      `  ADAPTIVE isolate (GLOBAL+PP→TUNED): small ${g.ccSmall}→${t.ccSmall}, frag ${g.fragTotal}→${t.fragTotal}, clLen ${g.centerlineLen.toFixed(0)}→${t.centerlineLen.toFixed(0)}\n` +
      `  renders → scripts-out/verify-70a-{baseline,tuned}-{binary,trace}.png\n`
    );

    // Guard the driver itself ran the real pipeline (not an honesty assertion).
    expect(b.ccTotal).toBeGreaterThan(0);
    expect(t.ccTotal).toBeGreaterThan(0);
  }, 120000);
});
