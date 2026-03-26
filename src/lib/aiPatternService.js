import { supabase } from './supabase';
import { registerPattern } from './patternRegistry';
import { applySymmetryDraw, wrapSVGSymmetry } from './patterns/symmetryUtils';

const CREDIT_COST_NEW = 12;
const CREDIT_COST_REVISION = 4;

export { CREDIT_COST_NEW, CREDIT_COST_REVISION };

// Credit pack pricing
export const CREDIT_PACKS = [
  { credits: 12, price: 3, label: '12 credits — $3' },
  { credits: 24, price: 5, label: '24 credits — $5' },
  { credits: 48, price: 8, label: '48 credits — $8' },
];

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

  const creditCost = mode === 'revise' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;

  // Deduct credits atomically first
  const { data: remaining, error: creditErr } = await supabase.rpc('deduct_ai_credits', { amount: creditCost });
  if (creditErr) throw new Error('Failed to check credits: ' + creditErr.message);
  if (remaining === -1) throw new Error('Insufficient credits');

  // Call edge function
  const { data, error } = await supabase.functions.invoke('generate-pattern', {
    body: { prompt, mode, existingSource, existingName, chatHistory },
  });

  if (error) throw new Error('Generation failed: ' + error.message);
  if (!data?.sourceCode) throw new Error('Invalid response from AI');

  const patternId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Save to database
  const { error: saveErr } = await supabase.from('ai_patterns').insert({
    user_id: (await supabase.auth.getUser()).data.user.id,
    pattern_id: patternId,
    name: data.name || 'AI Pattern',
    description: prompt,
    source_code: data.sourceCode,
    param_defs: data.paramDefs,
    default_params: data.defaultParams,
    credits_used: creditCost,
  });
  if (saveErr) console.warn('Failed to save pattern record:', saveErr);

  // Register the pattern dynamically
  const PatternClass = compilePatternClass(data.sourceCode);
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
 * Compile a pattern class from source code string.
 * The source is expected to be a self-contained class body that uses
 * the applySymmetryDraw and wrapSVGSymmetry helpers passed as arguments.
 */
function compilePatternClass(sourceCode) {
  // The edge function returns code that expects symmetry utilities as injected arguments.
  // We wrap it in a Function constructor and pass the utilities at call time.
  const fn = new Function(
    'applySymmetryDraw',
    'wrapSVGSymmetry',
    sourceCode + '\nreturn PatternClass;'
  );
  return fn(applySymmetryDraw, wrapSVGSymmetry);
}
