import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import Dendrite from '../Dendrite.js';
import { RecordingContext } from '../drawingContext.js';

// VISUAL-VERIFICATION ARTIFACT GENERATOR.
// This is NOT a logic test — it renders standalone PNGs to /tmp/dendrite-verify/
// so a human (and the building agent) can eyeball whether the DLA actually
// BRANCHES (dendritic tree) vs CLUMPS (solid disk). Tests passing is
// necessary-but-not-sufficient; these PNGs are the real acceptance gate.
//
// Gated behind DENDRITE_VERIFY=1 so the normal `npx vitest run` suite stays
// fast and can't flake on the rasterizer. Run explicitly:
//   DENDRITE_VERIFY=1 npx vitest run src/lib/patterns/__tests__/Dendrite.verify.test.js
//
// The rasterizer is dependency-free: we replay the cluster's bonds (with the
// real radial-symmetry rotation applied) onto an RGBA pixel buffer and encode a
// PNG via zlib (PNG = zlib-deflated scanlines + CRC chunks). No sharp/resvg/
// canvas needed — none are installed.

const OUT = '/tmp/dendrite-verify';
const W = 800;
const H = 800;
const SEED = 7;
const PAPER = [0xf4, 0xec, 0xd8]; // warm paper
const INK = [0x1a, 0x1a, 0x2e];   // near-black ink
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
    raw[o] = 0; // filter type 0
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiny line rasterizer (1px Bresenham, ink on paper) --------------------
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

// Parse the bonds out of svgElements (origin-centered coords).
function bondsFrom(inst) {
  const out = [];
  for (const el of inst.svgElements) {
    if (!el.startsWith('<line')) continue;
    const m = el.match(/x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/);
    if (m) out.push([+m[1], +m[2], +m[3], +m[4]]);
  }
  return out;
}

// Render the cluster to a PNG, applying the real radial symmetry (N rotated
// copies about canvas center) so symmetry=6 reads as a snowflake.
function renderPNG(params) {
  const inst = new Dendrite();
  const ctx = new RecordingContext({ seed: SEED });
  const t0 = Date.now();
  inst.generateWithContext(ctx, SEED, params, W, H, INK_HEX, 100);
  const ms = Date.now() - t0;

  const bonds = bondsFrom(inst);
  const sym = Math.max(1, Math.round(params.symmetry || 1));
  const cx = W / 2, cy = H / 2;
  const start = (params.startAngle || 0) * Math.PI / 180;

  const buf = makeCanvas(W, H, PAPER);
  for (let s = 0; s < sym; s++) {
    const a = (Math.PI * 2 / sym) * s + start;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const [x1, y1, x2, y2] of bonds) {
      const ax = cx + (x1 * ca - y1 * sa), ay = cy + (x1 * sa + y1 * ca);
      const bx = cx + (x2 * ca - y2 * sa), by = cy + (x2 * sa + y2 * ca);
      drawLine(buf, W, H, ax, ay, bx, by, INK);
    }
  }
  return { png: encodePNG(buf, W, H), bonds: bonds.length, ms };
}

const base = {
  seedMode: 'center', render: 'bonds', maxNodes: 1200, stickiness: 0.8,
  nodeSpacing: 6, strokeWeight: 0.7, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
};

const RUN = process.env.DENDRITE_VERIFY === '1';
const maybe = RUN ? describe : describe.skip;

maybe('Dendrite visual-verification artifacts', () => {
  it('writes branching PNGs to /tmp/dendrite-verify', { timeout: 30000 }, () => {
    mkdirSync(OUT, { recursive: true });
    const samples = [
      ['center.png',    { ...base, seedMode: 'center', symmetry: 1 }],
      ['ground.png',    { ...base, seedMode: 'ground', symmetry: 1 }],
      ['snowflake.png', { ...base, seedMode: 'center', symmetry: 6 }],
      ['ring.png',      { ...base, seedMode: 'ring',   symmetry: 1 }],
    ];
    for (const [name, params] of samples) {
      const { png, bonds, ms } = renderPNG(params);
      writeFileSync(`${OUT}/${name}`, png);
      // eslint-disable-next-line no-console
      console.log(`[verify] ${name}: ${bonds} bonds, generate=${ms}ms`);
      expect(bonds).toBeGreaterThan(50);
    }

    // Perf report at default + maxNodes=4000 (single-cluster generate time).
    for (const mn of [1200, 4000]) {
      const t0 = Date.now();
      const inst = new Dendrite();
      const ctx = new RecordingContext({ seed: SEED });
      inst.generateWithContext(ctx, SEED, { ...base, maxNodes: mn }, W, H, INK_HEX, 100);
      // eslint-disable-next-line no-console
      console.log(`[perf] maxNodes=${mn}: generate=${Date.now() - t0}ms, bonds=${bondsFrom(inst).length}`);
    }
  });
});
