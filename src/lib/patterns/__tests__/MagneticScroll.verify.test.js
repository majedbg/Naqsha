import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import MagneticScroll from '../MagneticScroll.js';
import { RecordingContext } from '../drawingContext.js';
import { DEFAULT_PARAMS } from '../../../constants.js';

// VISUAL-VERIFICATION ARTIFACT GENERATOR (same shape as Dendrite.verify).
// Not a logic test — it renders standalone PNGs to /tmp/magnetscroll-verify/ so
// a human (and the building agent) can eyeball whether the field actually reads
// as an ornamental scroll field: paired counter-rotating volutes, each winding
// into a visible eye. Tests passing is necessary-but-not-sufficient; these PNGs
// are what the DEFAULTS were tuned against.
//
// Gated behind MAGNETSCROLL_VERIFY=1 so the normal suite stays fast:
//   MAGNETSCROLL_VERIFY=1 npx vitest run src/lib/patterns/__tests__/MagneticScroll.verify.test.js
//
// The rasterizer is dependency-free (zlib-deflated PNG scanlines + Bresenham).

const OUT = '/tmp/magnetscroll-verify';
const W = 900;
const H = 700;
const SEED = 7;
const PAPER = [0xf4, 0xec, 0xd8];
const INK = [0x1a, 0x1a, 0x2e];
const INK_HEX = '#1a1a2e';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 4);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function makeCanvas(w, h, bg) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
}
function plot(buf, w, h, x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const p = (y * w + x) * 4;
  buf[p] = c[0]; buf[p + 1] = c[1]; buf[p + 2] = c[2]; buf[p + 3] = 255;
}
function drawLine(buf, w, h, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(buf, w, h, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Parse the polylines back out of svgElements (origin-centred coords). */
function tracesFrom(inst) {
  return inst.svgElements.map((el) => {
    const d = el.match(/ d="([^"]+)"/)[1];
    return d
      .slice(1)
      .split(/ L/)
      .map((p) => {
        const [x, y] = p.split(',').map(Number);
        return { x, y };
      });
  });
}

function renderPNG(params, w = W, h = H) {
  const inst = new MagneticScroll();
  const ctx = new RecordingContext({ seed: SEED });
  const t0 = Date.now();
  inst.generateWithContext(ctx, SEED, params, w, h, INK_HEX, 100);
  const ms = Date.now() - t0;

  const traces = tracesFrom(inst);
  const sym = Math.max(1, Math.round(params.symmetry || 1));
  const cx = w / 2, cy = h / 2;
  const start = ((params.startAngle || 0) * Math.PI) / 180;

  const buf = makeCanvas(w, h, PAPER);
  for (let s = 0; s < sym; s++) {
    const a = ((Math.PI * 2) / sym) * s + start;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const tr of traces) {
      for (let i = 1; i < tr.length; i++) {
        const p = tr[i - 1], q = tr[i];
        drawLine(
          buf, w, h,
          cx + (p.x * ca - p.y * sa), cy + (p.x * sa + p.y * ca),
          cx + (q.x * ca - q.y * sa), cy + (q.x * sa + q.y * ca),
          INK
        );
      }
    }
  }
  const pts = traces.reduce((n, t) => n + t.length, 0);
  return { png: encodePNG(buf, w, h), traces: traces.length, pts, ms };
}

const base = DEFAULT_PARAMS.magnetscroll;

const RUN = process.env.MAGNETSCROLL_VERIFY === '1';
const maybe = RUN ? describe : describe.skip;

maybe('MagneticScroll visual-verification artifacts', () => {
  it('writes scroll-field PNGs to /tmp/magnetscroll-verify', { timeout: 30000 }, () => {
    mkdirSync(OUT, { recursive: true });
    const samples = [
      ['default.png', { ...base }],
      ['sym6.png', { ...base, layout: 'scatter', scrollCount: 6, symmetry: 6 }],
      ['row-single.png', { ...base, branch: 'single' }],
      ['row-uniform.png', { ...base, rotation: 'uniform' }],
      ['grid.png', { ...base, layout: 'grid', scrollCount: 12, scrollRadius: 90 }],
      ['scatter.png', { ...base, layout: 'scatter', scrollCount: 18, scrollRadius: 70 }],
      ['taper-low.png', { ...base, taper: 0.5 }],
      ['taper-high.png', { ...base, taper: 0.85 }],
      ['turns-lo.png', { ...base, turns: 1 }],
      ['turns-hi.png', { ...base, turns: 5 }],
      ['one.png', { ...base, scrollCount: 1, scrollRadius: 200, jitter: 0 }],
    ];
    for (const [name, params] of samples) {
      const { png, traces, pts, ms } = renderPNG(params);
      writeFileSync(`${OUT}/${name}`, png);
      console.log(`[verify] ${name}: ${traces} traces, ${pts} pts, generate=${ms}ms`);
      expect(traces).toBeGreaterThan(0);
    }

    // The picker card: same defaults on the SQUARE 1000px generation canvas the
    // thumbnail renderer uses (patternThumbnail.js THUMB_GEN). Defaults have to
    // read on both frames, so this is part of the tuning gate, not an extra.
    const thumb = renderPNG({ ...base }, 1000, 1000);
    writeFileSync(`${OUT}/thumb-square.png`, thumb.png);
    console.log(`[verify] thumb-square.png: ${thumb.traces} traces, ${thumb.pts} pts, generate=${thumb.ms}ms`);
    expect(thumb.traces).toBeGreaterThan(0);
  });
});
