// Legacy-selection → Block-chain COMPILER — the motif migration safety net.
//
// WHY THIS EXISTS (D9 — lazy compile, no migration pass, no version stamp):
// Every motif layer authored before the Block chain landed stores its selection
// as a flat `binding.selection` object — `{roles, rate:{n,offset}, skip, density,
// seed, field, fieldThreshold, fieldInvert, overrides}` — consumed by the fixed
// hard-coded pipeline in `placementEngine.selectAnchors`. The new engine runs a
// REORDERABLE array of Blocks (`runSelectionChain`, ADR-0004). Rather than a
// one-shot DB migration, the engine LAZILY compiles legacy selections at read
// time: run `binding.chain` when present, else `compileSelectionToChain(
// binding.selection)` and run that. A document is only rewritten to chain form
// on the user's FIRST block edit, as one undo entry (that rewrite is C1 — this
// module just produces the equivalent chain).
//
// THE CONTRACT — BYTE-IDENTICAL (the golden fuzz sweep is the whole point):
//   runSelectionChain(anchors, compiled.chain, {...opts, overrides: compiled.overrides})
// must return survivors AND orphans identical to
//   selectAnchors(anchors, legacySelection, opts)
// for ALL inputs. If this ever diverges, existing documents silently re-render
// differently on load — the one outcome D9 forbids.
//
// TWO LOAD-BEARING FLAGS make that hold on MULTI-PATH hosts (single-path never
// exposes them, which is exactly why they're easy to drop):
//   • `continuous:true` on everyN + skip. selectAnchors' rate/skip index
//     CONTINUOUSLY over the whole post-role stage (a global counter). The chain
//     DEFAULTS to per-path restart (D4) — each host path restarts its rhythm at
//     index 0. On >1 path those disagree, which feeds `density` a DIFFERENT
//     survivor set and desyncs its sequential mulberry32 stream. `continuous`
//     restores the legacy global counter.
//   • `rngMode:'sequential'` on density. density is the ONLY RNG-consuming legacy
//     selection stage: one `mulberry32(seed)` drawn once per candidate in stage
//     order, keep if `rand() < density`; density>=1 draws NOTHING. New density
//     blocks added via the UI default to `rngMode:'hash'` (ADR-0005, survivor-
//     stable), but the compiled block MUST reproduce the legacy stream byte-for-
//     byte, so it pins `'sequential'` and carries the seed explicitly.
//
// Defaults mirror `selectAnchors`' DEFAULTS EXACTLY (rate {n:1,offset:0}, seed 1,
// density 1, fieldThreshold 0.5, fieldInvert false); when a field is absent or
// degenerate to a pure no-op we OMIT the block rather than emit a harmless one,
// keeping the compiled chain minimal — the byte-identity test is the arbiter.
//
// Overrides are NOT a Block (ADR-0004): they are the fixed post-chain include/
// exclude step. We return `legacy.overrides` VERBATIM as `compiled.overrides`;
// the caller threads it via `opts.overrides` (shared `overrides.js` semantics on
// both paths, so identity is automatic — including the `tolerance` default read
// inside `applyOverrides`).

import { runSelectionChain } from './chain.js';

// ASSUMPTION — stored legacy selections carry NUMBERS-OR-ABSENT, never `null`,
// for density/seed/fieldThreshold. selectAnchors defaults those three via
// DESTRUCTURING (fires only on `undefined`), whereas we default with `!= null`
// (fires on null too); the two disagree on a literal `null` (e.g. selectAnchors
// reads `rand() < null` ⇒ keep-none). That divergence is UNREACHABLE: the only
// code paths that ever write a motif `binding.selection` set `roles`, `rate.n`,
// and `overrides` — density/seed/field come solely from these DEFAULTS or a
// numeric programmatic literal, never `null`. (rate.n/rate.offset are safe
// regardless: selectAnchors reads THOSE with `!= null` too, matching us.) Keep
// selections numbers-or-absent; if a future UI adds a "clear to null" control,
// this asymmetry — which the chain cannot cleanly reproduce — must be revisited.
// The correct fix site is then the WRITER, or `selectAnchors` itself (make it
// read `density`/`seed`/`fieldThreshold` with `!= null` so both sides default
// identically) — NOT a compile-side coercion, which already coerces and IS the
// divergence source (independent A3 review, 2026-07-11).
//
// Mirror of placementEngine.selectAnchors' DEFAULTS (that const is not exported;
// these values are pinned byte-for-byte by the parity fuzz sweep).
const DEFAULT_RATE_N = 1;
const DEFAULT_RATE_OFFSET = 0;
const DEFAULT_DENSITY = 1;
const DEFAULT_SEED = 1;
const DEFAULT_FIELD_THRESHOLD = 0.5;

/**
 * @typedef {string | {id?:string, x?:number, y?:number, role?:string}} OverrideRef
 * @typedef {{
 *   roles?: string[]|null,
 *   rate?: {n?:number, offset?:number},
 *   skip?: boolean[]|null,
 *   density?: number,
 *   seed?: number,
 *   field?: null | {sampleNorm:(u:number,v:number)=>number},
 *   fieldThreshold?: number,
 *   fieldInvert?: boolean,
 *   overrides?: {include?: OverrideRef[], exclude?: OverrideRef[], tolerance?: number},
 * }} LegacySelection
 */

/**
 * Compile a legacy `binding.selection` into the canonical Block chain plus the
 * extracted overrides. See the module header for the byte-identity contract.
 *
 * Canonical order (fixed): route → everyN → skip → density → field.
 *
 * @param {LegacySelection} [legacySelection]
 * @returns {{chain: Array<object>, overrides: object|undefined}}
 *   `chain` — selection Blocks in canonical order.
 *   `overrides` — `legacySelection.overrides` verbatim (pass via opts.overrides
 *   to runSelectionChain; NOT a chain block).
 */
export function compileSelectionToChain(legacySelection) {
  const legacy = legacySelection || {};
  const chain = [];

  // 1. route — role filter. Legacy had no path scoping, so pathScope is always
  //    'all' (a no-op). Always emitted for a uniform canonical shape:
  //    roles:null (or empty []) is a byte-identical no-op / filter-all mirror of
  //    selectAnchors' role stage.
  chain.push({
    type: 'route',
    roles: legacy.roles != null ? legacy.roles : null,
    pathScope: 'all',
  });

  // 2. everyN — every-Nth. Read rate.n / rate.offset with selectAnchors'
  //    defaults (n:1, offset:0). Pass the RAW n through: applyEveryN applies the
  //    identical `n>=1 ? floor(n) : 1` clamp selectAnchors does, so a degenerate
  //    n (0/negative/NaN) resolves the same on both sides. continuous:true is
  //    MANDATORY (see header). Always emitted; n:1/offset:0 is the keep-all
  //    fast-path in applyEveryN.
  const rate = legacy.rate;
  chain.push({
    type: 'everyN',
    n: rate && rate.n != null ? rate.n : DEFAULT_RATE_N,
    offset: rate && rate.offset != null ? rate.offset : DEFAULT_RATE_OFFSET,
    continuous: true,
  });

  // 3. skip — cycled boolean mask. Emit ONLY for a non-empty array: selectAnchors
  //    no-ops when skip is null/absent/empty, so omitting is byte-identical.
  //    continuous:true MANDATORY (same reason as everyN).
  if (Array.isArray(legacy.skip) && legacy.skip.length > 0) {
    chain.push({ type: 'skip', mask: legacy.skip, continuous: true });
  }

  // 4. density — seeded keep. rngMode:'sequential' MANDATORY; seed carried
  //    (default 1). Always emitted; density>=1 draws nothing (matches
  //    selectAnchors' `if (density < 1)` guard).
  chain.push({
    type: 'density',
    density: legacy.density != null ? legacy.density : DEFAULT_DENSITY,
    seed: legacy.seed != null ? legacy.seed : DEFAULT_SEED,
    rngMode: 'sequential',
  });

  // 5. field — scalar-field mask. Emit ONLY when a field is present (null/absent
  //    is a no-op in selectAnchors). threshold/invert default to 0.5/false. Note
  //    the block is emitted even if the render lacks canvas dims: applyField and
  //    selectAnchors BOTH no-op without canvasW/canvasH, so identity holds.
  if (legacy.field != null) {
    chain.push({
      type: 'field',
      field: legacy.field,
      threshold: legacy.fieldThreshold != null ? legacy.fieldThreshold : DEFAULT_FIELD_THRESHOLD,
      invert: !!legacy.fieldInvert,
    });
  }

  // Overrides ride OUTSIDE the chain (ADR-0004), returned verbatim.
  return { chain, overrides: legacy.overrides };
}

/**
 * Acceptance seam for BOTH binding shapes — the single entry callers (A4/B3/C1)
 * use so they never branch on shape themselves:
 *   • `binding.chain` present ⇒ run it directly; `opts.overrides` is passed
 *     straight through (WHERE chain-mode overrides are stored on the binding is a
 *     B3 decision — this helper does NOT invent it).
 *   • else ⇒ compile `binding.selection` and inject the compiled overrides
 *     (which came from `selection.overrides`, where legacy stores them).
 *
 * Returns the full `runSelectionChain` result `{survivors, orphans, sequence}`
 * so A4 gets the terminal `sequence` block untouched.
 *
 * @param {{chain?: Array<object>, selection?: LegacySelection}} binding
 * @param {import('./chain.js').Anchor[]} anchors
 * @param {{canvasW?:number, canvasH?:number, overrides?:object}} [opts]
 * @returns {{survivors: object[], orphans: OverrideRef[], sequence: object|null}}
 */
export function resolveSelection(binding, anchors, opts = {}) {
  const b = binding || {};
  if (Array.isArray(b.chain)) {
    return runSelectionChain(anchors, b.chain, opts);
  }
  const { chain, overrides } = compileSelectionToChain(b.selection || {});
  return runSelectionChain(anchors, chain, { ...opts, overrides });
}
