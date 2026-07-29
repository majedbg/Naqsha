// Add `footprintCenter` / `footprintRadius` to the 58 vector built-ins in
// src/lib/motif/vectorMotifsGlyphs.js — the enrichment pass ruled by §5b of
// docs/motif-footprint-fix-decisions.md.
//
// Usage:  node scripts/enrichVectorMotifFootprints.mjs [--check]
//
// WHY THIS EXISTS AND NOT A REGENERATOR. The header of the data file names
// `scratchpad/genVectorMotifs.mjs` as its generator, and that file was never
// committed — `scratchpad/` is not in the tree and `git log --all` has never
// seen it. §5b rules between reconstructing it and enriching in place, and
// picks enrichment: it is the smaller job, and it keeps the emitted `d` strings
// byte-identical, which re-flattening the source SVGs does not guarantee.
//
// WHY IT IS COMMITTED. §7 names a one-shot pass over a 997-line committed data
// file as a single point of failure for the whole glyph library: a mistake in
// it is a silent geometry change across 58 built-ins rather than a crash. A
// script in the tree can be read, re-run and argued with; a hand-edit cannot.
//
// THE ENRICHMENT IS IDEMPOTENT. Re-running it on an already-enriched file
// reproduces the file byte for byte (gate B below is what proves that), so the
// script doubles as its own regression check via `--check`.
//
// ⚠️ PINNING. §7's third risk: `slice18` and `slice91` report `A = |fc|² − fr²`
// marginally POSITIVE, at |A|/fr² ≈ 1e-16 — noise, since a root cannot lie
// outside its own minimal enclosing circle. A different flattening tolerance or
// a different Welzl shuffle can flip that sign, which is invisible to the eye
// and fatal to a deep-equal golden. The committed numbers are the pinned ones.
// Do not regenerate them casually; `src/lib/motif/glyphFootprint.test.js` is
// what will tell you if you did.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VECTOR_MOTIF_GLYPHS } from '../src/lib/motif/vectorMotifsGlyphs.js';
import { minEnclosingCircle } from '../src/lib/motif/minEnclosingCircle.js';
import { flattenPathD } from '../src/lib/plotter/pathOps.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, '../src/lib/motif/vectorMotifsGlyphs.js');
const MARKER = 'export const VECTOR_MOTIF_GLYPHS = ';

// The file as committed at a11bd65, before this script first ran. Same digest
// the test pins, computed the same way.
const PRE_ENRICHMENT_DIGEST = 'a1ce1a454fd4e3e89548504aa5f180c8d0f7e04fbad9da4bebbf728f5b8eaa33';

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// `JSON.stringify`, indent 2 — verified to reproduce the committed body byte for
// byte (gate B). Number formatting is the shortest round-tripping decimal for
// the double, so nothing is lost through the trip.
const serialise = (obj) => `${JSON.stringify(obj, null, 2)};\n`;

const digestOf = (records) => {
  const h = createHash('sha256');
  for (const [id, g] of Object.entries(records)) {
    h.update(`${id}\n${JSON.stringify(g.paths)}\n${JSON.stringify(g.viewRadius)}\n${JSON.stringify(g.root)}\n`);
  }
  return h.digest('hex');
};

const stripFootprint = (records) =>
  Object.fromEntries(
    Object.entries(records).map(([id, g]) => {
      const { footprintCenter, footprintRadius, ...rest } = g;
      return [id, rest];
    })
  );

// ---------------------------------------------------------------------------
// THE SAFETY GATE — both halves run before a single footprint is computed.
// ---------------------------------------------------------------------------
const text = readFileSync(TARGET, 'utf8');
const markerAt = text.indexOf(MARKER);
if (markerAt < 0) die(`could not find "${MARKER}" in ${TARGET}`);
const header = text.slice(0, markerAt);
const body = text.slice(markerAt + MARKER.length);

// Gate A — `paths`, `viewRadius` and `root` are what they were before the first
// enrichment. This is the "unchanged byte-for-byte" assertion the ticket asks
// for, and it is checked BEFORE the two new keys are looked at at all.
const digest = digestOf(VECTOR_MOTIF_GLYPHS);
if (digest !== PRE_ENRICHMENT_DIGEST) {
  die(
    `paths/viewRadius/root have MOVED.\n  expected ${PRE_ENRICHMENT_DIGEST}\n  actual   ${digest}\n` +
      '  This script only adds two keys. If the art genuinely changed, that is a\n' +
      '  different commit, and the pinned digest here and in glyphFootprint.test.js\n' +
      '  must be updated deliberately with the reason written down.'
  );
}

// Gate B — the serialiser reproduces the committed formatting exactly. On a
// fresh file this proves the round trip loses nothing; on an already-enriched
// file it proves the pass is idempotent.
if (serialise(VECTOR_MOTIF_GLYPHS) !== body) {
  die('round-tripping the committed records through JSON.stringify does not reproduce the file body');
}

const count = Object.keys(VECTOR_MOTIF_GLYPHS).length;
if (count !== 58) die(`expected 58 vector built-ins, found ${count}`);

// ---------------------------------------------------------------------------
// THE MEASUREMENT
// ---------------------------------------------------------------------------
// The point set is built exactly as scripts/measureGlyphFootprints.mjs:6-13
// builds it — `flattenPathD` at tol 0.05, paths concatenated in record order,
// no dedup, no filtering. Not incidental: Welzl's shuffle is a function of the
// array's length and index order, so any reordering permutes it differently and
// can move the circle at 1e-16, i.e. flip the slice18/slice91 sign the risk
// register names above.
const FLATTEN_TOL = 0.05;

function cloudOf(glyph) {
  const out = [];
  for (const p of glyph.paths || []) {
    const { points } = flattenPathD(p.d, FLATTEN_TOL);
    for (const q of points) out.push({ x: q[0], y: q[1] });
  }
  return out;
}

const enriched = {};
for (const [id, glyph] of Object.entries(stripFootprint(VECTOR_MOTIF_GLYPHS))) {
  const cloud = cloudOf(glyph);
  if (cloud.length < 1) die(`${id}: flattened to an empty point cloud`);

  // ⚠️ #198's trap: Welzl swallows an interior NaN silently and hands back a
  // plausible-looking circle rather than throwing, so bad input does NOT fail
  // loudly here. Validate on both sides of the call, explicitly.
  for (const p of cloud) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) die(`${id}: non-finite point in the flattened cloud`);
  }

  const mec = minEnclosingCircle(cloud);
  if (!mec) die(`${id}: minEnclosingCircle returned null`);
  if (!Number.isFinite(mec.x) || !Number.isFinite(mec.y) || !Number.isFinite(mec.r)) {
    die(`${id}: minEnclosingCircle returned a non-finite circle`);
  }
  if (!(mec.r > 0)) die(`${id}: minEnclosingCircle returned a non-positive radius`);

  // Stored RELATIVE TO ROOT, so the values land in the frame placementMatrix's
  // trailing R(−root.angle)·T(−root) leaves the glyph in (instancing.js:96-105)
  // — the same frame the reserve is computed in. Same local units as
  // `viewRadius`, which stays the scale divisor and is never substituted for
  // `footprintRadius` (decision 2b).
  const root = glyph.root || { x: 0, y: 0 };
  enriched[id] = {
    ...glyph,
    footprintCenter: { x: mec.x - root.x, y: mec.y - root.y },
    footprintRadius: mec.r,
  };
}

// A last self-check: the enrichment must not have disturbed what gate A pinned.
const after = digestOf(enriched);
if (after !== PRE_ENRICHMENT_DIGEST) die(`the enrichment moved paths/viewRadius/root — ${after}`);

const output = header + MARKER + serialise(enriched);

if (process.argv.includes('--check')) {
  if (output !== text) die('vectorMotifsGlyphs.js is not what this script would emit — re-run without --check');
  console.log(`✓ ${count} records already carry the footprint this script derives`);
  process.exit(0);
}

writeFileSync(TARGET, output);
console.log(`✓ wrote footprintCenter/footprintRadius for ${count} vector built-ins`);
