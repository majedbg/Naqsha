import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import Rinceau from '../Rinceau.js';
import { RecordingContext } from '../drawingContext.js';
import { DEFAULT_PARAMS } from '../../../constants.js';

// VISUAL-VERIFICATION ARTIFACT GENERATOR (same shape as Dendrite.verify /
// IslamicStar.verify). NOT a logic test — Rinceau.test.js owns the contract.
// This renders standalone PNGs so a human can answer the one question tests
// cannot: does the spine read as an ORNAMENTAL RUNNING SCROLL, or as a sine
// wave with extra steps? `tension` is the knob that decides it.
//
// Gated so the normal suite stays fast. Run explicitly:
//   RINCEAU_VERIFY=1 npx vitest run src/lib/patterns/__tests__/Rinceau.verify.test.js
//
// Dependency-free rasterizer: replay the emitted polylines (with the real
// radial-symmetry rotation) onto an RGBA buffer and encode a PNG via zlib.

const OUT = '/tmp/rinceau-verify';
const W = 900;
const H = 900;
const SEED = 7;
const PAPER = [0xf4, 0xec, 0xd8];
const INK = [0x1a, 0x1a, 0x2e];
const INK_HEX = '#1a1a2e';

// ---- minimal PNG encoder (RGBA, 8-bit, no filter) --------------------------
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

// ---- tiny line rasterizer --------------------------------------------------
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
    // 2px nib so the scroll reads at a glance.
    plot(buf, w, h, x0 + 1, y0, c);
    plot(buf, w, h, x0, y0 + 1, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Parse the emitted <polyline> point lists (origin-centred coords). */
function polylinesFrom(inst) {
  return inst.svgElements.map((el) => {
    const m = el.match(/points="([^"]*)"/);
    return m[1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
  });
}

function renderPNG(params) {
  const inst = new Rinceau();
  const ctx = new RecordingContext({ seed: SEED });
  const t0 = Date.now();
  inst.generateWithContext(ctx, SEED, params, W, H, INK_HEX, 100);
  const ms = Date.now() - t0;

  const polys = polylinesFrom(inst);
  const sym = Math.max(1, Math.round(params.symmetry || 1));
  const cx = W / 2, cy = H / 2;
  const start = ((params.startAngle || 0) * Math.PI) / 180;

  const buf = makeCanvas(W, H, PAPER);
  for (let s = 0; s < sym; s++) {
    const a = ((Math.PI * 2) / sym) * s + start;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const pts of polys) {
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1];
        const [qx, qy] = pts[i];
        drawLine(
          buf, W, H,
          cx + (px * ca - py * sa), cy + (px * sa + py * ca),
          cx + (qx * ca - qy * sa), cy + (qx * sa + qy * ca),
          INK
        );
      }
    }
  }
  return { png: encodePNG(buf, W, H), rows: polys.length, ms };
}

const base = { ...DEFAULT_PARAMS.rinceau };

const RUN = process.env.RINCEAU_VERIFY === '1';
const maybe = RUN ? describe : describe.skip;

maybe('Rinceau visual-verification artifacts', () => {
  it('writes running-scroll PNGs to /tmp/rinceau-verify', { timeout: 30000 }, () => {
    mkdirSync(OUT, { recursive: true });
    const samples = [
      ['default.png',        { ...base }],
      ['sine.png',           { ...base, waveform: 'sine' }],
      ['tension-tight.png',  { ...base, rows: 1, tension: 0.1 }],
      ['tension-mid.png',    { ...base, rows: 1, tension: 0.55 }],
      ['tension-flat.png',   { ...base, rows: 1, tension: 1 }],
      ['border-band.png',    { ...base, rows: 2, rowSpread: 0.86, amplitude: 0.06, waveCount: 9 }],
      ['vertical.png',       { ...base, orientation: 'vertical' }],
      ['jitter.png',         { ...base, rows: 1, jitter: 0.7, amplitude: 0.12 }],
      ['symmetry4.png',      { ...base, rows: 1, symmetry: 4, stripOffset: 0.32, amplitude: 0.05, waveCount: 8 }],
    ];
    for (const [name, params] of samples) {
      const { png, rows, ms } = renderPNG(params);
      writeFileSync(`${OUT}/${name}`, png);
      expect(rows).toBeGreaterThan(0);
      expect(ms).toBeLessThan(2000);
    }
  });
});
