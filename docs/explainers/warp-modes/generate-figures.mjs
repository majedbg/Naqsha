// Generates a presentation-ready markdown (with honest, math-derived SVG figures)
// documenting the vertices-only vs bendable-edges distinction for warp-aware
// motif anchoring. Figures come from the SAME warp shape the renderer uses
// (gradient of a scalar field, magnitude-clamped) so the drift is real, not drawn.
//
//   node genDoc.mjs > warp-modes-vertices-vs-bendable.md

const CANVAS = 460, CX = 230, CY = 230, R = 135;
const L = 75, SCALE = 4200, MAX = 100; // tuned for a clear, honest ~28px anchor drift
const SIDES = 6;                       // hexagon

// --- field: closed-form scalar field; gradient is the warp direction ----------
const f = (x, y) => Math.sin((x - CX) / L) * Math.cos((y - CY) / L)
                  + 0.5 * Math.sin((y - CY) / (L * 0.8)) * Math.cos((x - CX) / (L * 1.3));
const grad = (x, y) => {
  const h = 1.0;
  return { gx: (f(x + h, y) - f(x - h, y)) / (2 * h),
           gy: (f(x, y + h) - f(x, y - h)) / (2 * h) };
};
// disp() mirrors warpDisplacement: push along gradient*scale, clamp magnitude.
const disp = (x, y) => {
  const { gx, gy } = grad(x, y);
  let vx = gx * SCALE, vy = gy * SCALE;
  const len = Math.hypot(vx, vy);
  if (len > MAX && len > 0) { const s = MAX / len; vx *= s; vy *= s; }
  return { dx: vx, dy: vy };
};
const warp = (p) => { const d = disp(p.x, p.y); return { x: p.x + d.dx, y: p.y + d.dy }; };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// hexagon (pointy-top), original (unwarped) vertices
const verts = [];
for (let i = 0; i < SIDES; i++) {
  const a = -Math.PI / 2 + (Math.PI * 2 * i) / SIDES;
  verts.push({ x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
}
const sideIdx = (i) => [verts[i], verts[(i + 1) % SIDES]];

// --- SVG helpers --------------------------------------------------------------
const C = { ink:'#20242b', field:'#e7e2d6', chord:'#9aa0ab',
            ok:'#0f7d6b', bad:'#c85a2b', dash:'#c85a2b', ghost:'#b9c0cb', label:'#5b6068' };
const P = (pts) => pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
function dot(p, col, r=5){ return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${col}"/>`; }
function ring(p, col, r=12){ return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="3 3"/>`; }
function rosette(p, ang, col, r=15){
  let d = '';
  const N = 6;
  for (let k=0;k<N;k++){
    const t = ang + (k/N)*Math.PI*2;
    const tip = { x:p.x+Math.cos(t)*r, y:p.y+Math.sin(t)*r };
    const c1  = { x:p.x+Math.cos(t-0.30)*r*0.66, y:p.y+Math.sin(t-0.30)*r*0.66 };
    const c2  = { x:p.x+Math.cos(t+0.30)*r*0.66, y:p.y+Math.sin(t+0.30)*r*0.66 };
    d += `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${tip.x.toFixed(1)},${tip.y.toFixed(1)} Q${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)} `;
  }
  const stem = { x:p.x+Math.cos(ang)*r*1.5, y:p.y+Math.sin(ang)*r*1.5 };
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.5"/>`
       + `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${stem.x.toFixed(1)}" y2="${stem.y.toFixed(1)}" stroke="${col}" stroke-width="1.5"/>`;
}
function svg(inner, w=CANVAS, h=CANVAS){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`
       + `<rect width="${w}" height="${h}" fill="#fbfaf7"/>${inner}</svg>`;
}
function label(x,y,txt,col=C.label,size=13,anchor='middle'){
  return `<text x="${x}" y="${y}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${size}" fill="${col}" text-anchor="${anchor}">${txt}</text>`;
}

// faint field streaks so the warp direction is legible
function fieldHint(){
  let s = '';
  for (let gx=40; gx<CANVAS; gx+=46)
    for (let gy=40; gy<CANVAS; gy+=46){
      const d = disp(gx,gy); const L = Math.hypot(d.dx,d.dy)||1; const k=9/L;
      s += `<line x1="${gx}" y1="${gy}" x2="${(gx+d.dx*k).toFixed(1)}" y2="${(gy+d.dy*k).toFixed(1)}" stroke="${C.field}" stroke-width="2"/>`;
    }
  return s;
}

// bendable side path: subdivide original chord into K, warp each node
function bendSide(a, b, K=18){
  const pts = [];
  for (let k=0;k<K;k++){ pts.push(warp(lerp(a,b,k/(K-1)))); }
  return pts;
}

// ---- FIGURE 1: the two warp modes, in ONE combined svg -----------------------
function figModes(){
  const w = CANVAS*2 + 20;
  // vertices-only panel (left)
  const wv = verts.map(warp);
  let A = fieldHint();
  A += `<path d="${P([...wv, wv[0]])}" fill="none" stroke="${C.ink}" stroke-width="2.4"/>`;
  wv.forEach(v=>A+=dot(v,C.ink,3.5));
  A += label(CANVAS/2, 34, 'A · vertices-only  (K=2)', C.ink, 15);
  A += label(CANVAS/2, CANVAS-22, 'corners move · sides stay straight', C.label, 13);
  // bendable panel (right)
  let B = fieldHint();
  let dpath = '';
  for (let i=0;i<SIDES;i++){ const [a,b]=sideIdx(i); dpath += P(bendSide(a,b)) + ' '; }
  B += `<path d="${dpath}" fill="none" stroke="${C.ink}" stroke-width="2.4"/>`;
  verts.map(warp).forEach(v=>B+=dot(v,C.ink,3.5));
  B += label(CANVAS/2, 34, 'B · bendable edges  (K≥3)', C.ink, 15);
  B += label(CANVAS/2, CANVAS-22, 'corners move · whole form bends', C.label, 13);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${CANVAS}" width="${w}" height="${CANVAS}" role="img">`
       + `<rect width="${w}" height="${CANVAS}" fill="#fbfaf7"/>`
       + `<g>${A}</g>`
       + `<line x1="${CANVAS+10}" y1="20" x2="${CANVAS+10}" y2="${CANVAS-20}" stroke="#e2ddd2" stroke-width="1.5"/>`
       + `<g transform="translate(${CANVAS+20},0)">${B}</g>`
       + `</svg>`;
}

const DEMO = 3; // the side whose warp floats most perpendicular — clearest drift

// corner legend: two colour keys + a caption, well clear of the geometry
function legend(title, okTxt, badTxt, note){
  let s = label(24, 34, title, C.ink, 15, 'start');
  s += `<rect x="24" y="48" width="14" height="14" rx="3" fill="${C.ok}"/>`;
  s += label(46, 60, okTxt, C.ok, 12.5, 'start');
  s += `<rect x="24" y="70" width="14" height="14" rx="3" fill="${C.bad}"/>`;
  s += label(46, 82, badTxt, C.bad, 12.5, 'start');
  if (note) s += label(CANVAS/2, CANVAS-20, note, C.label, 11);
  return s;
}
// short leader line from an anchor point to its label, with the px gap called out
function leader(from, to, txt, col){
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${col}" stroke-width="1" stroke-dasharray="2 2"/>`
       + label(to.x, to.y, txt, col, 11.5, to.x < CANVAS/2 ? 'end' : 'start');
}

// ---- FIGURE 2: edge anchor in vertices-only (straight) mode ------------------
function figStraight(){
  const [a,b] = sideIdx(DEMO);
  const wa = warp(a), wb = warp(b);
  const correct = mid(wa, wb);           // midpoint of warped vertices — ON the side
  const naive   = warp(mid(a,b));        // warp(ideal midpoint) — floats OFF the side
  const off = Math.hypot(correct.x-naive.x, correct.y-naive.y);
  const tang = Math.atan2(wb.y-wa.y, wb.x-wa.x);
  let s = fieldHint();
  const wv = verts.map(warp);
  s += `<path d="${P([...wv,wv[0]])}" fill="none" stroke="${C.ghost}" stroke-width="1.4"/>`;        // ghost form
  s += `<path d="${P([wa,wb])}" fill="none" stroke="${C.ink}" stroke-width="3.2"/>`;                 // the drawn side
  s += dot(wa,C.ink,4)+dot(wb,C.ink,4);
  s += `<line x1="${naive.x.toFixed(1)}" y1="${naive.y.toFixed(1)}" x2="${correct.x.toFixed(1)}" y2="${correct.y.toFixed(1)}" stroke="${C.dash}" stroke-width="1.3" stroke-dasharray="3 3"/>`;
  s += rosette(correct, tang, C.ok, 13);
  s += rosette(naive, tang, C.bad, 13);
  s += dot(correct,C.ok,3.5)+dot(naive,C.bad,3.5);
  s += leader(naive, {x:naive.x-70, y:naive.y-40}, `floats ${off.toFixed(0)}px off`, C.bad);
  s += legend('Vertices-only: where does the edge motif sit?',
              'midpoint of warped vertices — on the drawn side',
              'warp(midpoint) — off a line never drawn',
              'the motif must anchor to the segment that was actually painted');
  return svg(s);
}

// ---- FIGURE 3: same edge in bendable mode — the correct method FLIPS ---------
function figBendable(){
  const [a,b] = sideIdx(DEMO);
  const wa = warp(a), wb = warp(b);
  const curve = bendSide(a,b, 24);
  const onCurve = warp(mid(a,b));        // node at t=0.5 — ON the bent curve
  const chordMid = mid(wa, wb);          // midpoint of warped verts — cuts the bow
  const off = Math.hypot(onCurve.x-chordMid.x, onCurve.y-chordMid.y);
  const m1 = warp(lerp(a,b,0.48)), m2 = warp(lerp(a,b,0.52));
  const tang = Math.atan2(m2.y-m1.y, m2.x-m1.x);
  let s = fieldHint();
  let dpath='';
  for (let i=0;i<SIDES;i++){ const [p,q]=sideIdx(i); dpath += P(bendSide(p,q)) + ' '; }
  s += `<path d="${dpath}" fill="none" stroke="${C.ghost}" stroke-width="1.4"/>`;                    // ghost bent form
  s += `<path d="${P([wa,wb])}" fill="none" stroke="${C.chord}" stroke-width="1.4" stroke-dasharray="5 4"/>`; // the old chord
  s += `<path d="${P(curve)}" fill="none" stroke="${C.ink}" stroke-width="3.2"/>`;                   // the drawn bent side
  s += dot(wa,C.ink,4)+dot(wb,C.ink,4);
  s += `<line x1="${chordMid.x.toFixed(1)}" y1="${chordMid.y.toFixed(1)}" x2="${onCurve.x.toFixed(1)}" y2="${onCurve.y.toFixed(1)}" stroke="${C.dash}" stroke-width="1.3" stroke-dasharray="3 3"/>`;
  s += rosette(onCurve, tang, C.ok, 13);
  s += rosette(chordMid, tang, C.bad, 13);
  s += dot(onCurve,C.ok,3.5)+dot(chordMid,C.bad,3.5);
  s += leader(chordMid, {x:chordMid.x-60, y:chordMid.y+46}, `cuts ${off.toFixed(0)}px into the bow`, C.bad);
  s += legend('Bendable: the winning method reverses',
              'on-curve node ( = warp(midpoint) ) — follows the bend',
              'midpoint of warped vertices — cuts across the bow',
              'dashed grey = the straight chord that was “correct” in Figure 2');
  return svg(s);
}

const F1 = figModes(), F2 = figStraight(), F3 = figBendable();

// ---- assemble the markdown ---------------------------------------------------
const md = `# Warp modes: vertices-only vs bendable edges
### …and why every motif anchor depends on knowing which one you're in

> **One-line takeaway.** A warped form can move its *corners* (rigid facets) or bend its *whole outline* (flowing). These are two different drawings — so a motif's anchor point must be derived from *the drawing that was actually made*. Use the wrong derivation and every rosette, dot, and glyph drifts off the geometry it's supposed to sit on. The correct method is not fixed — **it flips between the two modes.**

*Figures below are generated from the real warp primitive (gradient of a scalar field, magnitude-clamped) — the drift shown is measured, not illustrated. Amplitude is exaggerated for legibility.*

---

## 1 · A form can warp two ways

Naqsha displaces geometry by pushing points along a guide field. For a polygon there are two honest things "warp" could mean:

![Vertices-only vs bendable warp of a hexagon](figures/fig-1-modes.svg)

- **A · Vertices-only** — warp each corner; draw straight sides between the moved corners. The form becomes a set of tilted, rigid facets. (This is recursive geometry's behavior today.)
- **B · Bendable edges** — subdivide each side into *K* nodes, warp *every* node, and draw a smooth curve through them. The whole outline flows with the field. (This is how grid lines already warp.)

Both are desirable. In Naqsha they're the **two ends of one slider** — the same \`warpNodes\` control that grid uses. \`K = 2\` gives you vertices-only; sliding \`K\` up bends the edges. You move smoothly from faceted to flowing.

---

## 2 · Where does the motif sit? (vertices-only)

A motif bound to an **edge** anchors at that side's midpoint. Two plausible ways to compute it:

- **warp(midpoint)** — take the side's ideal midpoint, push it along the field.
- **midpoint of warped vertices** — warp the two corners, then take their midpoint.

They are *not* the same point, because the field's push at the midpoint differs from the average of its push at the two corners. In vertices-only mode the drawn side is a **straight segment between the two warped corners** — so only one of these lands on it:

![Edge motif in vertices-only mode — midpoint of warped vertices sits on the side; warp of the midpoint floats off](figures/fig-2-vertices-only.svg)

The green rosette (midpoint of warped vertices) sits **on the drawn side**. The orange rosette (warp of the ideal midpoint) **floats off into space** — anchored to a line that was never drawn. Multiply this across every edge, tip, and cell of a recursive form and the motif layer visibly detaches from its host.

---

## 3 · Now bend the edges — and the correct method reverses

Slide \`K\` up so the sides actually bend. The drawn side is now a **curve** through warped nodes. Watch what happens to the same two candidate points:

![Same edge in bendable mode — the on-curve node follows the bend; the midpoint of warped vertices now cuts across the bow](figures/fig-3-bendable.svg)

The methods have **swapped roles**:

- **on-curve node** (green) — the warped node at the side's centre — now lies exactly on the bent curve. (This is literally \`warp(midpoint)\`, the method that was *wrong* in §2.)
- **midpoint of warped vertices** (orange) — the average of the two moved corners — now cuts straight across the bow, **inside** the curve. (This is the method that was *right* in §2.)

The dashed grey line is the straight chord that *was* the drawing in A. It isn't the drawing anymore.

> **This is the whole point.** There is no single "correct" anchor formula. The right derivation is a function of **which warp mode drew the form.** Pick one and hard-code it, and half your motifs are wrong half the time.

---

## 4 · The principle: anchors are mode-matched

The rule that falls out: **derive every anchor from the same geometry the renderer drew, in the mode it drew it.**

| anchor role | vertices-only (K=2) | bendable (K≥3) |
|---|---|---|
| **crossing** (vertex) | \`warp(v)\` — exact | \`warp(v)\` — exact (a warped node) |
| **edge** (side) | midpoint of warped vertices; tangent = warped-side direction — *exact, no estimation* | sample the bent curve on-curve → the capture path |
| **cell / tip** (centre) | centroid of warped vertices | \`warp(centre)\` + finite-difference frame |

Two invariants hold in **both** columns:

1. **One displacement primitive.** Every method above only ever calls \`stackWarpDisplacement\` — the single, shared warp function the renderer uses. Nothing re-implements the displacement, so the anchors can never drift from the paint by construction.
2. **Orientation follows the field.** A motif doesn't just translate to its anchor — it *rotates* to the local warp frame, so a rosette at a bent crossing leans the way the form leans.

---

## 5 · The decision, as posed

> **Q — Recursive structural anchors: derive from the warped vertices, or point-warp each anchor's ideal position? And since I want to warp not just the vertices but the whole line (bendable), like grid — can both be built?**

**A — Both, and they aren't rivals: each matches a render mode, selected by the \`warpNodes\` bend slider.**

- \`K = 2\` → **vertices-only**: warp corners, straight sides, anchors *derived from warped vertices* (exact — edge tangents come for free from the warped-side direction).
- \`K ≥ 3\` → **bendable edges**: subdivide every side, warp all nodes (recursive never pins), smooth curve; structural anchors use *point-warp + finite-difference frame*, and along-edge anchors ride the capture path.

Recursive reuses grid's exact machinery (\`catmullRomToBezier\` + the warp loop), minus endpoint-pinning. The bendable render mode is a genuine new renderer feature — carved as its own build slice so it's visible, not smuggled in.

---

## Appendix · why the two points differ (the math)

For a side with endpoints \`a, b\` and displacement field \`d(·)\`:

- **midpoint of warped vertices** \`= ½·(a + d(a)) + ½·(b + d(b)) = m + ½·(d(a)+d(b))\`, where \`m = (a+b)/2\`.
- **warp(midpoint)** \`= m + d(m)\`.

They coincide only when \`d(m) = ½·(d(a)+d(b))\` — i.e. when the field is **linear** across the side. Real guide fields never are, so the gap \`d(m) − ½(d(a)+d(b))\` is exactly the "sagitta" you see the orange rosette occupy. In vertices-only mode the drawing keeps the *chord*, so the chord-midpoint (first formula) is on it. In bendable mode the drawing keeps the *curve*, whose centre node is \`m + d(m)\` (second formula). Same two expressions, opposite winners — which is why the anchor extractor has to know the mode.
`;

const which = process.argv[2] || 'md';
if (which === 'f1') process.stdout.write(F1);
else if (which === 'f2') process.stdout.write(F2);
else if (which === 'f3') process.stdout.write(F3);
else process.stdout.write(md);
