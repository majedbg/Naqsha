// materialEvaluationEntitlement.js — material-evaluation slice 1
//
// PREMIUM-GATING SCAFFOLD for submitting a material evaluation (photo of the
// maker's Sheet next to a render screenshot — docs/material-evaluation-VISION.md).
// It ships OFF — everyone is entitled now, so submitting is FREE. The seam
// exists so it can be flipped to a real premium gate later with a ONE-LINE
// change, mirroring motifLibraryEntitlement.js exactly.
//
// ⚠️ This is NOT the login gate. Evaluation submission "requires sign-in" is a
// SEPARATE, real gate that ships ON and is enforced in the UI (logged-out →
// submit disabled / prompt to sign in), mirroring the motif-library precedent.
// This module answers only "is this user ENTITLED to the premium feature" and
// must never encode the login requirement — keeping the two gates distinct is
// what makes flipping premium a one-liner that leaves login behavior untouched.
//
// ── HOW TO FLIP TO PREMIUM (one line) ────────────────────────────────────────
// Replace the `return true;` in canSubmitEvaluation with a tier check, e.g.:
//
//     import { checkGate } from './tierLimits';
//     return checkGate(tier, 'materialEvaluation').allowed;
//
// (add a 'materialEvaluation' case to tierLimits.checkGate that permits the
// desired tiers). Nothing else changes — the login gate and all call sites
// stay as-is.

/**
 * Is the user ENTITLED to submit a material evaluation (premium scaffold)?
 * Ships OFF → always true (free for everyone). See the flip note above.
 *
 * @param {{ user?: object|null, tier?: string }} [ctx] auth context from useAuth()
 * @returns {boolean}
 */
export function canSubmitEvaluation({ user, tier } = {}) {
  // Args are LIVE (matching the real gate's shape) so the flip is genuinely one
  // line — `tier`/`user` are already in scope. `void` keeps them referenced
  // while the scaffold ignores them (no-unused-vars) without changing behavior.
  void user;
  void tier;
  // SCAFFOLD OFF (free for all). One-line flip → tier check (see header):
  //   return checkGate(tier, 'materialEvaluation').allowed;
  return true;
}
