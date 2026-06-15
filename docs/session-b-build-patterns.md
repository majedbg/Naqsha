# Session B — Build 4 new generative patterns

You are building **four new generative-art patterns** for the Sonoform studio
(a Vite + React + p5 app). A parallel session is simultaneously building the
pattern-**picker** UI and has already declared your patterns' taxonomy slots.
**Stay inside your file boundary (see §6) so the two sessions never collide** —
this is not a git repo, so there is no merge step; overlapping edits clobber.

Work directory: `generative-art-studio/` (run `npm test` / `npm run build` there).

---

## 1. What to build

| id | Label | Family | Taxonomy cell (already declared) | Essence |
|----|-------|--------|----------------------------------|---------|
| `lissajous` | Lissajous | Harmonic Curves | radial · Crystalline (geom 0) | Two perpendicular harmonic oscillations `x=A·sin(aθ+δ), y=B·sin(bθ)`. A **harmonograph** adds slow exponential damping → spiralling-in ribbons. Deterministic, supports radial symmetry. |
| `chladni` | Chladni | Waves & Interference | wave · Parametric (geom 1) | **Cymatic nodal lines** of a vibrating square plate: draw the contour where `cos(nπx/L)cos(mπy/L) − cos(mπx/L)cos(nπy/L) ≈ 0` (superposed standing-wave modes m,n). Sound made visible — the marquee pattern for "Sonoform". Deterministic, symmetric. |
| `truchet` | Truchet | Lattices & Tilings | grid · Seeded (geom 2) | Grid of square tiles, each randomly one of a few rotations of a motif (quarter-arc "Smith" tiles are the classic — arcs join across tiles into flowing loops). Seeded (uses the layer seed), no radial symmetry. |
| `hilbert` | Hilbert Curve | Recursion & Fractals | nested · Crystalline (geom 0) | A single unbroken **space-filling curve** (Hilbert or Peano) of selectable order. One continuous polyline — the ideal one-stroke plotter path. Deterministic, no symmetry. |

The taxonomy entries (`family/geom/form/det/mark/sym/blurb`) already exist in
`src/constants.js` → `PATTERN_TAXONOMY`. **Do not edit them.** Build each pattern
to match its declared character (determinism, mark type, symmetry support).

---

## 2. The pattern contract (read `src/lib/patterns/drawingContext.js` first)

Each pattern is a class extending `Pattern` (from `./drawingContext`). It overrides:

```js
generate(ctx, seed, params, canvasW, canvasH, color, opacity) { … }
```

It must, inside `generate`:
1. Reset `this.svgElements = []`, then `ctx.randomSeed(seed); ctx.noiseSeed(seed);`
2. Read params with destructured **defaults** (params may be partial).
3. Build the geometry, pushing one SVG element string per shape into
   `this.svgElements` (for SVG export), AND issuing the matching draw calls via
   `ctx` (for the live canvas). Both paths must agree.
4. Wrap canvas draw calls through `applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle*Math.PI/180, offsetX, offsetY)` from `./symmetryUtils` **if the pattern supports radial symmetry** (lissajous, chladni). truchet/hilbert have `sym:false` — still accept `symmetry/startAngle/offsetX/offsetY` params (default 1/0/0/0) so the universal transform UI keeps working; you may pass them through `applySymmetryDraw` with symmetry default 1 (a no-op) for consistency with other patterns.

### Hard rules (these make it correct AND testable)
- **NEVER call `Math.random()` / `Math.sin`-is-fine but randomness must be `ctx.random(...)` / `ctx.noise(...)`.** The whole render is seed-deterministic and byte-identical between canvas + SVG export *only* because RNG flows through `ctx`. `Math.random` breaks reproducibility and the tests.
- **Only call DrawingContext members** — the whitelist is documented at the top of `drawingContext.js` (push/pop/translate/rotate/stroke/fill/strokeWeight/line/ellipse/rect/beginShape/vertex/endShape, plus random/noise/color/map, and constants TWO_PI/PI/CLOSE/etc.). Do not reach for raw p5 methods outside it.
- If your `svgElements` hold **objects** rather than strings (rare — only if you batch a polyline), override `contentFor(color)` to serialise them. For plain `<line/>`/`<path/>` strings the inherited `contentFor` is fine.
- **`hilbert` is one continuous polyline** → emit a single `<path d="M…L…"/>` (or `<polyline>`) and one `beginShape()/vertex()*/endShape()` run. Don't fragment it into segments; the point is a single pen path.

### Reference file to copy
`src/lib/patterns/Grid.js` is the clean minimal example (params destructure →
build `lines[]` → push SVG strings → `drawBase()` → `applySymmetryDraw`). For a
`beginShape/vertex` curve, see `src/lib/patterns/Spiral.js`.

---

## 3. Registration — how your pattern reaches the app

**Put each file in `src/lib/patterns/extras/` and self-register at the bottom.**
An eager `import.meta.glob` (`src/lib/registerBuiltinExtras.js`, already wired
into `main.jsx`) auto-loads everything in that folder at app start. You do **not**
edit any shared registry, constants, or the canvas hook.

```js
// src/lib/patterns/extras/Lissajous.js
import { Pattern } from '../drawingContext';
import { applySymmetryDraw } from '../symmetryUtils';
import { registerPattern } from '../../patternRegistry';

export default class Lissajous extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) { /* … */ }
}

const DEFAULTS = { /* every param key → default value */ };
const PARAM_DEFS = [ /* { key, label, min, max, step, tooltip } … + SYMMETRY/START_ANGLE/OFFSET as needed */ ];

registerPattern('lissajous', Lissajous, 'Lissajous', DEFAULTS, PARAM_DEFS, { isAI: false });
```

- The `{ isAI: false }` flag is **required** — it marks these as first-class
  built-ins (no AI violet dot, normal gating), not AI-generated patterns.
- `id` MUST exactly match the taxonomy key: `lissajous`, `chladni`, `truchet`,
  `hilbert`.
- The picker shows each pattern as a disabled **"Soon"** card until its class is
  registered; the moment your file exists it lights up in its declared cell.
- For `PARAM_DEFS`, mirror the shape used in `src/constants.js` →
  `PATTERN_PARAM_DEFS` (import `SYMMETRY_PARAM` etc. are defined there but not
  exported — just inline equivalent `{ key:'symmetry', … }` defs, or keep params
  minimal; the param editor reads whatever you register via the dynamic registry).

> Note: built-ins registered this way live in the **dynamic registry**, exactly
> like AI patterns, so `useCanvas`, `usePatternCache`, and `PatternTabs` already
> pick them up. This is intentional — it keeps you out of the shared static
> tables. (They can be "promoted" to fully-static entries later if desired; not
> your task.)

---

## 4. Tests (the repo has 561 passing — keep it green)

Add one test per pattern in `src/lib/patterns/extras/__tests__/` (or
`src/lib/patterns/__tests__/`), modelled on
`src/lib/patterns/__tests__/Spiral.test.js`. It should:
- assert the class `extends Pattern`,
- run headlessly with a `RecordingContext({ seed })` and a fixed PARAMS object,
- `expect(inst.svgElements.length).toBeGreaterThan(0)` and snapshot
  `svgElements` + `toSVGGroup(...)` (golden master),
- assert the expected draw ops fire (`line` for grid-like, `vertex` for curves),
- assert determinism: same seed → identical `svgElements` across two runs.

Run `npm test` and `npm run build` before declaring done.

---

## 5. Per-pattern hints

- **Lissajous / harmonograph**: param suggestions — `freqA`, `freqB` (1–12, int
  detents make the nice closed figures), `phase` (0–2π), `amplitude` (fraction of
  min(w,h)/2), `damping` (0 = pure Lissajous, >0 = harmonograph spiral-in),
  `steps` (≥1500 for smooth), `strokeWeight`, + symmetry/startAngle/offset.
  One continuous `beginShape/vertex/endShape`.
- **Chladni**: params `m`, `n` (mode integers 1–12), optional `blend` of a second
  (m,n) pair, `resolution` (grid for marching-squares of the nodal contour, ~120–
  300), `strokeWeight`. Marching squares over the field gives clean contour lines;
  reuse the approach in `TopographicContours.js` if helpful (contours of a field).
- **Truchet**: params `tiles` (cols≈rows count, 6–40), `tileSet`
  (`arcs`|`diagonals`|`triangles`), `strokeWeight`, seed-driven per-tile rotation
  via `ctx.random`. Arc tiles: each cell draws two quarter-circles; random 1 of 2
  orientations makes the classic maze of loops.
- **Hilbert**: param `order` (1–7; #points = 4^order, cap so order 7 ≈ 16k pts is
  the max), `margin`, `strokeWeight`. Generate the L-system / recursive Hilbert
  vertex list, scale to fit `min(w,h) - 2*margin`, emit ONE polyline. Peano is an
  acceptable alternative if you prefer a 3× subdivision.

---

## 6. File-ownership boundary — DO NOT CROSS

**You may create/edit ONLY:**
- `src/lib/patterns/extras/*.js` (your 4 pattern files)
- `src/lib/patterns/extras/__tests__/*` (your tests + snapshots)

**Do NOT touch** (the other session owns these): `src/constants.js`,
`src/lib/useCanvas.js`, `src/lib/patterns/index.js`, `src/lib/patternRegistry.js`,
`src/lib/registerBuiltinExtras.js`, `src/components/PatternPickerModal.jsx`,
`src/components/PatternTabs.jsx`, `src/pages/Studio.jsx`, `src/lib/useLayers.js`,
`docs/pattern-taxonomy.md`. Everything you need from them is read-only reference.

If you believe you need to edit a file outside your boundary, STOP and flag it
instead — it almost certainly means there's a registry/taxonomy seam you should
use instead.
