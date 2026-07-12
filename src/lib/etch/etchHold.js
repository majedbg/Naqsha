// etchHold — Highlight Hold, the mirror-acrylic safety GUARANTEE (Raster Etch S4,
// issue #83; CONTEXT.md → Highlight Hold, ADR-0006). "Err on the side of NOT
// etching" is a GUARANTEE here, not a bias: one stray dot scars a mirror
// irreversibly, so any pixel whose SOURCE luma ≥ a cutoff is forced to zero dots
// (paper) AFTER screening — no error-diffusion (Floyd–Steinberg included) can
// push a dot into a held highlight, because the clamp runs on the ORIGINAL luma
// and overrides whatever screening decided.
//
// This is a FIXED TERMINAL CLAMP, deliberately NOT a Stage (decision 5, ADR-0007
// vocabulary is LAW): it lives on the Etch layer's params (not in the Etch
// Stack), so it can never be dragged out of last position, reordered, or bypassed
// away like a Stage. It runs as the last step of producing the ONE `bits` buffer
// (in etchProcess, hence in the worker too), so preview == export holds for free.
//
// The clamp also returns a `held` mask — the exact set of pixels it forced to
// paper — so the preview can SHADE the guaranteed-safe band. That mask is
// preview-only metadata: export reads `.bits`, never `.held`, so the overlay can
// never leak into the exported bytes.
//
// PURE typed-array math, no DOM — runs identically on the main thread, inside
// etch.worker, and headless under vitest (matching etchProcess / etchDither).

/**
 * Near-white cutoff a fresh Etch holds at, in 0..255 SOURCE luma. High enough to
 * protect only genuine highlights (not midtones), low enough to catch the paper-
 * white band a laser must never touch on a mirror. User-adjustable thereafter.
 */
export const DEFAULT_HOLD_CUTOFF = 235;

/**
 * The catalog material ids that DEFAULT the Hold on — irreversible mirror stock.
 * A Set so future mirror finishes opt in with a one-line addition and every
 * downstream predicate keeps working unchanged (grilled decision 5). `gold-mirror`
 * is the only mirror in materialSwatches today.
 */
export const MIRROR_MATERIAL_IDS = new Set(['gold-mirror']);

/** True when a material id names an irreversible mirror surface. Safe on null. */
export function isMirrorMaterial(id) {
  return typeof id === 'string' && MIRROR_MATERIAL_IDS.has(id);
}

/**
 * The Hold params a NEW Etch carries. `enabled: null` means AUTO — defer to the
 * panel material (mirror → on, else off), resolved at use-time by resolveHold.
 * Keeping it null (not a concrete boolean) is what makes the material-aware
 * default correct across panel-assignment timing: a fresh Etch has no panel yet,
 * so the default cannot be baked at creation — it must be resolved once the panel
 * (hence its material) is known. An explicit user toggle later writes a concrete
 * boolean here, which then overrides the material default forever.
 */
export function createHoldParams() {
  return { enabled: null, cutoff: DEFAULT_HOLD_CUTOFF };
}

/**
 * Resolve the Hold params + the layer's panel material id into the CONCRETE
 * `{ enabled, cutoff }` the pipeline runs. AUTO (`enabled` null/absent) follows
 * the material; an explicit boolean overrides it. `cutoff` falls back to the
 * default when absent. The material lookup stays on the main thread (where panels
 * live); the worker only ever sees the resolved concrete values.
 *
 * @param {{enabled?:boolean|null, cutoff?:number}|null|undefined} hold
 * @param {string|null|undefined} materialId the layer's panel material id
 * @returns {{enabled:boolean, cutoff:number}}
 */
export function resolveHold(hold, materialId) {
  const cutoff = Number.isFinite(hold?.cutoff) ? hold.cutoff : DEFAULT_HOLD_CUTOFF;
  const enabled = hold == null || hold.enabled == null
    ? isMirrorMaterial(materialId) // AUTO → material-aware default
    : !!hold.enabled; // explicit user choice overrides
  return { enabled, cutoff };
}

/**
 * Apply the Highlight Hold clamp to a screened `bits` buffer, IN PLACE, using the
 * SOURCE luma field captured before any field Stages. Every pixel whose source
 * luma ≥ cutoff is forced to paper (bit 0) and recorded in the returned `held`
 * mask. Only ever clamps TOWARD paper — it never inks a pixel — so no dither
 * decision below the cutoff is disturbed. Disabled → bits untouched, empty mask.
 *
 * @param {Uint8Array} bits the freshly-screened single-source buffer (mutated)
 * @param {{gray:Float64Array}} sourceField toGrayField's result (source luma)
 * @param {{enabled?:boolean, cutoff?:number}} [hold] resolved concrete Hold
 * @returns {{bits:Uint8Array, held:Uint8Array}} the clamped bits + the held mask
 */
export function applyHighlightHold(bits, sourceField, hold = {}) {
  const held = new Uint8Array(bits.length);
  if (!hold.enabled) return { bits, held }; // off → nothing held, bits as screened
  const gray = sourceField?.gray;
  const cutoff = Number.isFinite(hold.cutoff) ? hold.cutoff : DEFAULT_HOLD_CUTOFF;
  for (let i = 0; i < bits.length; i++) {
    if (gray[i] >= cutoff) {
      held[i] = 1;
      bits[i] = 0; // guaranteed paper — no dot survives above the cutoff
    }
  }
  return { bits, held };
}
