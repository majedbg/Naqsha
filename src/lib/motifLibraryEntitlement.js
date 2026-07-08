// motifLibraryEntitlement.js — P4-1 (svg-motif-editor DECISIONS D1)
//
// PREMIUM-GATING SCAFFOLD for promoting a custom motif to the user's global
// library ("Save to my library"). It ships OFF — everyone is entitled now, so
// the global library is FREE. The seam exists so it can be flipped to a real
// premium gate later with a ONE-LINE change (see below).
//
// ⚠️ This is NOT the login gate. D1's "requires login" is a SEPARATE, real gate
// that ships ON and is enforced in the UI (logged-out → button disabled /
// prompt to sign in). This module answers only "is this user ENTITLED to the
// premium feature" and must never encode the login requirement — keeping the
// two gates distinct is what makes flipping premium on a one-liner that leaves
// the login behavior untouched.
//
// ── HOW TO FLIP TO PREMIUM (one line) ────────────────────────────────────────
// Replace the `return true;` in canUseGlobalLibrary with a tier check, e.g.:
//
//     import { checkGate } from './tierLimits';
//     return checkGate(tier, 'globalLibrary').allowed;
//
// (add a 'globalLibrary' case to tierLimits.checkGate that permits the desired
// tiers). Nothing else changes — the login gate and all call sites stay as-is.

/**
 * Is the user ENTITLED to use the global motif library (premium scaffold)?
 * Ships OFF → always true (free for everyone). See the flip note above.
 *
 * @param {{ user?: object|null, tier?: string }} [ctx] auth context from useAuth()
 * @returns {boolean}
 */
export function canUseGlobalLibrary({ user, tier } = {}) {
  // Args are LIVE (matching the real gate's shape) so the flip is genuinely one
  // line — `tier`/`user` are already in scope. `void` keeps them referenced
  // while the scaffold ignores them (no-unused-vars) without changing behavior.
  void user;
  void tier;
  // SCAFFOLD OFF (free for all). One-line flip → tier check (see header):
  //   return checkGate(tier, 'globalLibrary').allowed;
  return true;
}
