import { supabase } from './supabase';
import { registerPattern } from './patternRegistry';
import { applySymmetryDraw, wrapSVGSymmetry } from './patterns/symmetryUtils';
import { CREDIT_COST_NEW, CREDIT_COST_REVISION } from './creditModel';

export { CREDIT_COST_NEW, CREDIT_COST_REVISION };

/**
 * Read the structured error code out of a failed `functions.invoke` result.
 *
 * supabase-js signals a non-2xx edge response with a FunctionsHttpError whose
 * `message` is the generic "Edge Function returned a non-2xx status code" and
 * whose `context` is the untouched Response. The distinguishing code lives in
 * the body, so read it there. Relay/network errors carry no `context` at all;
 * they fall through to null and the caller reports a generic failure.
 *
 * @returns {Promise<string|null>}
 */
async function readEdgeErrorCode(error) {
  try {
    const ctx = error?.context;
    if (!ctx || typeof ctx.json !== 'function') return null;
    // Clone where possible so the body stays readable for anything downstream.
    const source = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
    const body = await source.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null; // unreadable or already-consumed body — not a code we can use
  }
}

/**
 * Generate a new pattern or revise an existing one via Claude API.
 * Calls the Supabase Edge Function 'generate-pattern' which proxies to Claude.
 *
 * CREDITS ARE SERVER-SIDE (issue #216, adversarial review §B1). The edge
 * function resolves the caller, prices the request from `mode`, deducts before
 * generating, and refunds itself if generation fails — this module no longer
 * calls deduct_ai_credits / add_ai_credits, and migration 016 revokes the
 * EXECUTE privilege that made those calls possible. `creditsRemaining` is
 * whatever the server reports.
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

  // Local price, used only to record credits_used if the server omits it.
  // The server's price is authoritative for what is actually charged.
  const cost = mode === 'revise' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;

  // Call edge function — it charges before it generates.
  const { data, error } = await supabase.functions.invoke('generate-pattern', {
    body: { prompt, mode, existingSource, existingName, chatHistory },
  });

  if (error) {
    // Same user-facing string as the pre-#216 client-side balance check, which
    // AIPatternChat renders straight into the chat bubble.
    if ((await readEdgeErrorCode(error)) === 'insufficient_credits') {
      throw new Error('Insufficient credits');
    }
    throw new Error('Generation failed: ' + error.message);
  }
  if (data?.error === 'insufficient_credits') throw new Error('Insufficient credits');
  if (!data?.sourceCode) throw new Error('Invalid response from AI');

  // Compile the pattern — throws typed PatternCompileError if invalid.
  // No refund here: the server already refunds every failure it can see, and a
  // client-side refund would require exactly the mint primitive #216 removed.
  const PatternClass = compilePatternClass(data.sourceCode);

  const patternId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Resolve the auth'd user id (already authenticated — the edge function
  // rejects callers it cannot resolve to a user before charging them)
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
    credits_used: data.creditsUsed ?? cost,
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
    creditsRemaining: data.creditsRemaining,
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
