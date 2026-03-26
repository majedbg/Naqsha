// Supabase Edge Function: generate-pattern
// Proxies pattern generation requests to Claude API.
// Deploy: supabase functions deploy generate-pattern
// Set secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-sonnet-4-20250514'

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

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { prompt, mode, existingSource, existingName, chatHistory } = await req.json()

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
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text || ''

    // Parse JSON from response (Claude may wrap in markdown code blocks)
    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: text }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
