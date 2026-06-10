import { supabase } from './supabase';
import { registerPattern } from './patternRegistry';
import { applySymmetryDraw, wrapSVGSymmetry } from './patterns/symmetryUtils';
import { CREDIT_COST_NEW, CREDIT_COST_REVISION } from './creditModel';

export { CREDIT_COST_NEW, CREDIT_COST_REVISION };

/**
 * Generate a new pattern or revise an existing one via Claude API.
 * Calls the Supabase Edge Function 'generate-pattern' which proxies to Claude.
 *
 * @param {string} prompt - User's description of the pattern
 * @param {object} options
 * @param {string} options.mode - 'create' | 'revise'
 * @param {string} [options.existingSource] - source code of pattern being revised
 * @param {string} [options.existingName] - name of pattern being revised
 * @param {object[]} [options.chatHistory] - prior messages in this conversation
 * @returns {{ patternId, name, sourceCode, paramDefs, defaultParams, creditsRemaining }}
 */
export async function generatePattern(prompt, { mode = 'create', existingSource, existingName, chatHistory = [] } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cost = mode === 'revise' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;

  // Deduct credits atomically first
  const { data: remaining, error: creditErr } = await supabase.rpc('deduct_ai_credits', { amount: cost });
  if (creditErr) throw new Error('Failed to check credits: ' + creditErr.message);
  if (remaining === -1) throw new Error('Insufficient credits');

  // Helper: refund credits on any subsequent failure.
  // Uses deduct_ai_credits with a negative amount rather than add_ai_credits,
  // because add_ai_credits also increments ai_credits_purchased (migration 002)
  // which would record a phantom purchase on every failed generation.
  // deduct_ai_credits(-cost) simply restores ai_credits without side effects.
  // TODO(backend): Add a dedicated refund_ai_credits RPC to remove this subtle
  // dependency on deduct_ai_credits accepting negative amounts.
  async function refund() {
    try {
      await supabase.rpc('deduct_ai_credits', { amount: -cost });
    } catch (refundErr) {
      console.warn('Credit refund failed:', refundErr);
    }
  }

  // Call edge function
  const { data, error } = await supabase.functions.invoke('generate-pattern', {
    body: { prompt, mode, existingSource, existingName, chatHistory },
  });

  if (error) {
    await refund();
    throw new Error('Generation failed: ' + error.message);
  }
  if (!data?.sourceCode) {
    await refund();
    throw new Error('Invalid response from AI');
  }

  // Compile the pattern — throws typed PatternCompileError if invalid
  let PatternClass;
  try {
    PatternClass = compilePatternClass(data.sourceCode);
  } catch (compileErr) {
    await refund();
    throw compileErr;
  }

  const patternId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Resolve the auth'd user id (already authenticated if deduct succeeded)
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;

  // Save to database
  const { error: saveErr } = await supabase.from('ai_patterns').insert({
    user_id: userId,
    pattern_id: patternId,
    name: data.name || 'AI Pattern',
    description: prompt,
    source_code: data.sourceCode,
    param_defs: data.paramDefs,
    default_params: data.defaultParams,
    credits_used: cost,
  });
  if (saveErr) console.warn('Failed to save pattern record:', saveErr);

  // Register the pattern dynamically
  registerPattern(patternId, PatternClass, data.name || 'AI Pattern', data.defaultParams, data.paramDefs);

  return {
    patternId,
    name: data.name,
    sourceCode: data.sourceCode,
    paramDefs: data.paramDefs,
    defaultParams: data.defaultParams,
    creditsRemaining: remaining,
  };
}

/**
 * Load user's previously generated AI patterns from the database
 * and register them in the dynamic registry.
 */
export async function loadUserAIPatterns(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('ai_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('Failed to load AI patterns:', error); return []; }

  for (const record of data || []) {
    try {
      const PatternClass = compilePatternClass(record.source_code);
      registerPattern(record.pattern_id, PatternClass, record.name, record.default_params, record.param_defs);
    } catch (err) {
      console.warn(`Failed to compile AI pattern ${record.pattern_id}:`, err);
    }
  }
  return data || [];
}

/**
 * Typed error class for pattern compilation failures.
 */
export class PatternCompileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PatternCompileError';
    this.code = 'PATTERN_COMPILE_ERROR';
  }
}

/**
 * Compile a pattern class from source code string.
 * The source is expected to be a self-contained class body that uses
 * the applySymmetryDraw and wrapSVGSymmetry helpers passed as arguments.
 *
 * @throws {PatternCompileError} when the source does not yield a valid PatternClass
 */
function compilePatternClass(sourceCode) {
  // The edge function returns code that expects symmetry utilities as injected arguments.
  // We wrap it in a Function constructor and pass the utilities at call time.
  let PatternClass;
  try {
    const fn = new Function(
      'applySymmetryDraw',
      'wrapSVGSymmetry',
      sourceCode + '\nreturn PatternClass;'
    );
    PatternClass = fn(applySymmetryDraw, wrapSVGSymmetry);
  } catch (err) {
    throw new PatternCompileError(
      `Failed to compile PatternClass: ${err.message}`
    );
  }

  if (PatternClass == null) {
    throw new PatternCompileError(
      'Generated source did not define PatternClass'
    );
  }

  return PatternClass;
}
