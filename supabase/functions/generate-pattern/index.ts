// Supabase Edge Function: generate-pattern
// Proxies pattern generation requests to Claude API, and owns the AI-credit
// deduction and refund for that request (issue #216, adversarial review §B1).
//
// The browser can no longer call deduct_ai_credits / add_ai_credits at all —
// migration 016 revokes EXECUTE from PUBLIC, anon and authenticated. This
// function resolves the caller from their JWT, prices the request server-side,
// deducts before generating, and refunds if the generation does not produce a
// usable pattern. The client learns its remaining balance from the response.
//
// ⚠️  Requires migration 20250101000016_privilege_hardening.sql to be applied
//     FIRST — deduct_ai_credits_for / refund_ai_credits_for are created there.
//
// Deploy: supabase functions deploy generate-pattern
// Set secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import {
  creditCostFor,
  deductCredits,
  refundCredits,
  looksLikePatternSource,
  INSUFFICIENT_CREDITS,
} from './credits.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const MODEL = 'claude-sonnet-4-20250514'

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

const SYSTEM_PROMPT = `You are an expert generative art pattern developer. You create JavaScript pattern classes for a p5.js-based generative art studio.

Every pattern class you generate MUST follow this exact interface:

\`\`\`javascript
// The class must be named PatternClass (exactly)
class PatternClass {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);
    // Destructure params with defaults:
    const { myParam = 10, strokeWeight = 1, symmetry = 1, startAngle = 0, offsetX = 0, offsetY = 0 } = params;
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Generate geometry...
    // Store SVG data in this.svgElements (as strings or {pathD, strokeWeight} objects)
    // Draw to p5 canvas via drawBase function

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);
      p.strokeWeight(strokeWeight);
      p.noFill();
      // ... draw using p.line(), p.vertex(), p.beginShape(), etc.
    };

    // MUST call applySymmetryDraw for symmetry support:
    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const content = this.svgElements.map((el) =>
      typeof el === 'string' ? \`    \${el}\` :
      \`    <path d="\${el.pathD}" stroke="\${color}" fill="none" stroke-width="\${el.strokeWeight}" stroke-linecap="round"/>\`
    ).join('\\n');
    return wrapSVGSymmetry(
      layerId, color, opacity, content,
      this._lastParams?.symmetry || 1, this._lastCx, this._lastCy,
      this._lastParams?.startAngle || 0,
      this._lastParams?.offsetX || 0,
      this._lastParams?.offsetY || 0
    );
  }

  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}
\`\`\`

IMPORTANT RULES:
- The class MUST be named \`PatternClass\`
- \`applySymmetryDraw\` and \`wrapSVGSymmetry\` are available as global functions (injected at runtime)
- Always include symmetry, startAngle, offsetX, offsetY in destructured params
- Use only p5.js drawing API (p.line, p.vertex, p.beginShape, p.endShape, p.ellipse, p.rect, etc.)
- Use p.random() and p.noise() for randomness (they respect the seed)
- Store SVG-compatible path data in this.svgElements for export
- Keep the pattern visually interesting with sensible default parameter values
- Do NOT use Math.random() — use p.random() for reproducibility

Also provide:
1. A short descriptive name for the pattern
2. Default parameter values (object)
3. Parameter definitions array for the UI (each: { key, label, min, max, step, tooltip } or { key, label, type: 'select', options: [{value, label}], tooltip })
   - Always end with the 4 universal params:
     { key: 'symmetry', label: 'Radial Symmetry', min: 1, max: 11, step: 1, tooltip: 'Radial copies' }
     { key: 'startAngle', label: 'Start Angle', min: 0, max: 360, step: 1, tooltip: 'Rotation' }
     { key: 'offsetX', label: 'Offset X', min: -500, max: 500, step: 1, tooltip: 'Horizontal shift' }
     { key: 'offsetY', label: 'Offset Y', min: -500, max: 500, step: 1, tooltip: 'Vertical shift' }

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "name": "Pattern Name",
  "sourceCode": "class PatternClass { ... }",
  "defaultParams": { ... },
  "paramDefs": [ ... ]
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Declared out here so the catch-all below can refund a deduction made
  // inside the try. `deducted` is only ever the server-computed cost.
  let admin: ReturnType<typeof createClient> | null = null
  let userId = ''
  let deducted = 0

  try {
    // Configuration failures happen before any credit is touched.
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse(500, { error: 'ANTHROPIC_API_KEY not set' })
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(500, { error: 'Supabase service credentials not set' })
    }

    // ── Identify the caller ────────────────────────────────────────────────
    // verify_jwt only proves *a* JWT was presented, and the anon key is a
    // valid JWT — so resolve an actual user and refuse if there isn't one.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return jsonResponse(401, { error: 'unauthorized', message: 'Sign in required' })
    }

    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    userId = userData?.user?.id ?? ''
    if (userErr || !userId) {
      return jsonResponse(401, { error: 'unauthorized', message: 'Sign in required' })
    }

    const { prompt, mode, existingSource, existingName, chatHistory } = await req.json()

    // ── Charge, at the server's price ──────────────────────────────────────
    // The request body's `mode` selects a price from a fixed table; it can
    // never supply an amount.
    const cost = creditCostFor(mode)
    const deduction = await deductCredits(admin, userId, cost)

    if (!deduction.ok) {
      if (deduction.reason === INSUFFICIENT_CREDITS) {
        // 402 so the client can distinguish this from a generation failure.
        return jsonResponse(402, {
          error: INSUFFICIENT_CREDITS,
          message: 'Insufficient credits',
        })
      }
      console.error('Credit deduction failed:', deduction.message)
      return jsonResponse(500, { error: 'credit_check_failed', message: 'Failed to check credits' })
    }

    const creditsRemaining = deduction.remaining
    deducted = cost

    /** Refund the deduction, then build the error response. */
    const failWithRefund = async (status: number, body: Record<string, unknown>) => {
      const refund = await refundCredits(admin!, userId, deducted)
      if (!refund.ok) console.error('Credit refund failed:', refund.message)
      deducted = 0 // refunded (or permanently failed) — the catch must not retry
      return jsonResponse(status, body)
    }

    const messages: Array<{ role: string; content: string }> = []

    // Include chat history
    if (chatHistory?.length) {
      for (const msg of chatHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Build the user message
    let userMessage = ''
    if (mode === 'revise' && existingSource) {
      userMessage = `I want to REVISE an existing pattern called "${existingName || 'pattern'}".

Here is the current source code:
\`\`\`javascript
${existingSource}
\`\`\`

Revision request: ${prompt}

Generate the complete revised pattern class with updated parameters.`
    } else {
      userMessage = `Create a new generative art pattern based on this description: ${prompt}`
    }

    messages.push({ role: 'user', content: userMessage })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Claude API error:', errText)
      return await failWithRefund(502, { error: 'AI generation failed' })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    // Parse JSON from response (Claude may wrap in markdown code blocks)
    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      return await failWithRefund(502, { error: 'Failed to parse AI response', raw: text })
    }

    // The user paid for a pattern, not for a response. Obvious garbage is
    // refunded here — the browser's compile gate is the final check.
    if (!looksLikePatternSource(parsed?.sourceCode)) {
      return await failWithRefund(502, { error: 'Invalid response from AI' })
    }

    return jsonResponse(200, { ...parsed, creditsRemaining, creditsUsed: cost })
  } catch (err) {
    // Anything thrown after a successful deduction — network, runtime, a
    // malformed body — must not leave the user charged.
    if (admin && userId && deducted > 0) {
      const refund = await refundCredits(admin, userId, deducted)
      if (!refund.ok) console.error('Credit refund failed:', refund.message)
    }
    return jsonResponse(500, { error: String(err) })
  }
})
