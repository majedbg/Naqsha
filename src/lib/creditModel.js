// creditModel.js — AR-1E
// Single source of truth for AI-credit costs, starting allowance, and
// eligibility logic. All magic numbers previously scattered across
// aiPatternService.js, AIPatternChat.jsx, and AuthButton.jsx live here.

export const CREDIT_COST_NEW = 12;
export const CREDIT_COST_REVISION = 4;

/** Starting credit allowance per account (matches supabase/003_free_ai_allowance.sql). */
export const STARTING_CREDITS = 24;

/**
 * Return the credit cost for the given generation mode.
 * @param {'new'|'revision'|'create'|'revise'} mode
 */
export function creditCost(mode) {
  return mode === 'revision' || mode === 'revise' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;
}

/**
 * Return whether the user has enough credits to generate in the given mode.
 * Boundary: exactly equal to cost → allowed.
 * @param {number} credits
 * @param {'new'|'revision'|'create'|'revise'} mode
 */
export function canGenerate(credits, mode) {
  return credits >= creditCost(mode);
}

/**
 * Format the credit balance for display.
 * Matches the existing UI pattern: "12 / 24".
 * @param {number} credits
 * @returns {string}
 */
export function displayBalance(credits) {
  return `${credits} / ${STARTING_CREDITS}`;
}
