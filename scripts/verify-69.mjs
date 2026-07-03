// #69 invert/polarity self-verification — exercises the REAL vectorize pipeline
// (thresholdImage → potrace) headless, the same code path the worker runs, on a
// synthetic light-on-dark ornament (a light "pierced-medallion" motif on a dark
// ground — the jali case that motivated the ticket).
//
// It proves the GEOMETRY FLIP, not merely that the option is accepted:
//   - invert OFF (DARK = ink): the trace hugs the image frame — it traced the
//     dark GROUND (the negative space), leaving the light motif as a hole.
//   - invert ON  (LIGHT = ink): the trace is COMPACT and inset — it traced the
//     light MEMBERS of the ornament.
// Renders both traces to scripts-out/verify-69.svg as visual evidence.
//
// Runs under vitest's node loader so the @realness.online/potrace deep import
// resolves exactly as in the app:  npx vitest run scripts/verify-69.mjs

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { vectorize } from '../src/lib/extraction/vectorizer.js';

const SIZE = 96;

// Light ornament on a DARK ground: opaque dark field (luma 28) with a light
// (luma 232) ring + central bar — a compact "pierced medallion" inset from the
// edges. Opaque ground is load-bearing: a transparent ground would read as
// paper under either polarity, making invert a silent no-op.
function jaliLikeImage() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = Math.hypot(x - cx, y - cy);
      const ring = r >= 22 && r <= 30; // annulus
      const bar = Math.abs(x - cx) <= 4 && r <= 30; // vertical bar across it
      const light = ring || bar;
      const v = light ? 232 : 28;
      const i = (y * SIZE + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE };
}

// Absolute on-path points from a `d` string (relative deltas handled).
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

function bbox(res) {
  const pts = res.components.flatMap((c) => absolutePointsIn(c.contour.d));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    span: (Math.max(...xs) - Math.min(...xs)) / SIZE,
  };
}

describe('#69 invert/polarity — real vectorize geometry flip', () => {
  it('OFF traces the dark ground; ON traces the light members', async () => {
    const img = jaliLikeImage;
    const off = await vectorize(img());
    const on = await vectorize(img(), { invert: true });

    const bOff = bbox(off);
    const bOn = bbox(on);

    // OFF (DARK = ink): the ground reaches the frame — negative-space trace.
    expect(bOff.minX).toBeLessThanOrEqual(2);
    expect(bOff.maxX).toBeGreaterThanOrEqual(SIZE - 2);
    expect(bOff.span).toBeGreaterThan(0.9);

    // ON (LIGHT = ink): the medallion members — compact and inset off the edges.
    expect(bOn.minX).toBeGreaterThan(10);
    expect(bOn.maxX).toBeLessThan(SIZE - 10);
    expect(bOn.span).toBeLessThan(0.75);

    // Render side-by-side evidence.
    const paths = (res, stroke) =>
      res.components
        .map((c) => `<path d="${c.contour.d}" fill="none" stroke="${stroke}" stroke-width="0.8"/>`)
        .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * 2 + 30}" height="${SIZE + 40}" viewBox="0 0 ${SIZE * 2 + 30} ${SIZE + 40}">
  <rect width="100%" height="100%" fill="#faf7f2"/>
  <text x="6" y="14" font-family="sans-serif" font-size="10" fill="#333">invert OFF — traces GROUND (frame)</text>
  <g transform="translate(6 22)"><rect width="${SIZE}" height="${SIZE}" fill="#1e1e1e"/>${paths(off, '#ff5555')}</g>
  <text x="${SIZE + 24}" y="14" font-family="sans-serif" font-size="10" fill="#333">invert ON — traces MEMBERS</text>
  <g transform="translate(${SIZE + 24} 22)"><rect width="${SIZE}" height="${SIZE}" fill="#1e1e1e"/>${paths(on, '#33cc66')}</g>
</svg>`;
    const outDir = new URL('../scripts-out/', import.meta.url).pathname;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outDir + 'verify-69.svg', svg);

    // eslint-disable-next-line no-console
    console.log(
      `[verify-69] OFF bbox x[${bOff.minX.toFixed(1)}..${bOff.maxX.toFixed(1)}] span=${bOff.span.toFixed(2)} (ground)\n` +
      `[verify-69] ON  bbox x[${bOn.minX.toFixed(1)}..${bOn.maxX.toFixed(1)}] span=${bOn.span.toFixed(2)} (members)\n` +
      `[verify-69] evidence → scripts-out/verify-69.svg`
    );
  });
});
