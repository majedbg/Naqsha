# Design: Spiral & Grid as modulation targets

Status: **Spec — grilled, not yet built** · Date: 2026-07-01

Makes the **Spiral** and **Grid** patterns modulation *targets* (like
`TopographicContours` today), and gives Grid's warped output a compact,
hand-editable **bézier** representation. This doc is the shared understanding
produced by a `/grill-me` session; it records both the decisions and the *why*
so a fresh build session can execute without re-litigating.

---

## 1. Channel wiring — `lib/fields/channelConsumers.js`

```js
const CHANNEL_BY_TYPE = {
  grainfield:  'density',
  chladni:     'warp',
  topographic: 'warp',
  flowfield:   'warp',
  recursive:   'warp',
  spiral:      'distort',   // NEW channel — scalar amount-mask
  grid:        'warp',      // NEW target — reuses existing gradient path
};
```

`resolveModulationForTarget` already passes `channel` through untouched; the
Modulator UI auto-derives candidate targets from `channelForTarget`. No
device/resolve/migration changes needed for the channel wiring itself.

**Why a new `'distort'` channel instead of overloading `'warp'`:** Spiral's
mechanism (a scalar amount-mask on existing noise) is genuinely different from
warp's gradient vertex-push. Overloading `'warp'` would make one channel name
mean two contracts — a future-you footgun. Per-type consumption is already the
model (`density` vs `warp`), so `distort` is a clean third.

---

## 2. Spiral → `'distort'` (the novel part)

**Mechanism — field spatially *scales* the existing noise jitter.** Spiral
already has a `distortAmount` scalar that scales a per-point `ctx.noise`
displacement. The field turns that global scalar into a spatial one:

```js
// inside the per-point loop, where dx,dy are currently computed:
const s    = field.sampleSigned(u, v);              // signed field value
const mask = Math.max(0, modulationTransfer(s, cfg)); // shared transfer chain
const perPointDistort = distortAmount * mask;         // distortAmount = ceiling
// ...then the existing noise dx,dy are scaled by perPointDistort instead of distortAmount
```

- Reuses the **shared** `modulationTransfer(s, cfg)` chain
  (`range → offset → shape → steps → amount`) — the same one `density` uses.
  `distort` is not a special snowflake; it just clamps negatives (a distortion
  *magnitude* can't go below zero).
- `distortAmount` stays the **ceiling**; the field decides how much of it
  applies where. Field low/neutral → clean spiral; field strong → full jitter.
  The noise still supplies the dx,dy *character*.

**New param `distortFrame: 'cartesian' | 'polar'`** — interpreted entirely inside
`Spiral.generate`. This is the headline feature: *which coordinate frame the field
is sampled in.* Default is **`'cartesian'`** (build decision — see §8.1: polar's
angle-wrap seam made it a poor default for the typical non-periodic field). Polar
stays selectable.

| Frame | `u` | `v` |
|---|---|---|
| Cartesian (default) | `(x + W/2) / W` | `(y + H/2) / H` |
| Polar | `(atan2(y,x) mod 2π) / 2π` | `r / outerRadius` |

- Polar is sampled on the **undistorted** point (use the loop's `r` and
  `atan2(y,x)` before displacement) so there's no feedback. As an arm winds, `u`
  re-sweeps `0..1` each turn at a larger `v` — "which spoke, how far out."
- **Why a Spiral param, not a per-map property:** the coordinate frame is how
  the *target interprets space* (a spiral natively thinks in polar), not a
  property of the guide's output. Single-source modulation is the current
  reality (`resolveModulationForTarget` does `maps.find` → first match only), so
  a per-map frame buys nothing behaviorally today and would touch the modulator
  device, resolve layer, and old-doc migration. Spiral-param is the smaller,
  correct diff.

**Invariant (snapshot-safe):** when there is no matching `'distort'` modulation
(`params.modulation` absent or wrong channel), the distortion block runs
*exactly* as today — byte-identical. Mirrors `TopographicContours`'
`warpMod === null` guard. Non-destructive; preview/apply-safe.

**Spiral output stays a polyline.** Bézier editability is grid-specific and
meaningless for the generative spiral.

---

## 3. Grid → `'warp'` (bézier, export-editable)

**Structural fact:** Grid emits straight `<line>` elements (two endpoints). You
cannot make a straight line "distort" like a contour by moving its two
endpoints — it stays straight. So a warped Grid must **subdivide**.

- **Unmodulated → straight `<line>`, byte-identical to today.** Snapshot-safe;
  keeps plotter paths short by default. Subdivision cost is only paid when warp
  is actually used.
- **Warp field present → bézier `<path>`.** New param **`warpNodes`
  (default 6, range 2–24)**:
  1. Place `K = warpNodes` nodes along the original line.
  2. **Pin the two endpoints** to the grid's rectangular frame (keeps a tidy
     plotter footprint; only interior nodes move).
  3. Displace interior nodes via the existing
     `warpDisplacement(field, u, v)` (Cartesian, gradient-follow — identical to
     the `TopographicContours` warp pass).
  4. Smooth through the anchors with **Catmull-Rom → cubic bézier**, emit
     `<path>` with `C` commands.
- `warpNodes` is the **underfit ↔ overfit** knob: low K samples the field
  coarsely (misses wiggles → underfit); high K traces every fluctuation
  (overfit). *No fitting algorithm* — nodes ARE the sample points, so K is the
  only knob. This is why we chose "place K nodes, displace, smooth" over
  "dense-sample then least-squares fit" (the latter needs error-tolerance math
  the user explicitly does not want).

**Why Grid reuses `'warp'` (not the new `'distort'`):** Grid has no existing
distortion to mask, so the field must *produce* the displacement. Pushing
subdivided vertices along ∇field is exactly what `TopographicContours` already
does — Grid becomes a `'warp'` consumer reusing the tested `warpDisplacement()`.
Zero new mechanism, most contour-like result. Grid needs no polar frame (grids
think Cartesian; warp is Cartesian-native).

**Canvas == SVG:** compute the cubic control points **once** from the K displaced
anchors, then feed both the SVG `C` string *and* p5 `bezierVertex`. Same
determinism principle as the rest of the dual-emit patterns — export and preview
never drift.

---

## 4. Plotter bridge — `lib/plotter/pathOps.js`

`parsePathD` currently recognizes only `M/L/Z`. Both plotter ingest routes
(`extractRenderedPaths` and the regex `optimizeGroup`) use it, so a cubic `C`
would have its two control points **misread as on-curve vertices** → corrupted
plotted geometry.

**Fix: teach `parsePathD` to flatten `C` (and `S`) into sampled points** —
evaluate the cubic at N sub-steps between anchors and emit line points. The
export/design SVG keeps the compact bézier (hand-editable in any vector tool
before cutting); only the *plotter bridge* flattens. This is what laser/plotter
toolchains do anyway (the "slicer" step segments curves into motion
instructions), so flattening belongs here, not pre-export. General win: any
future bézier-emitting pattern rides the same bridge.

`parsePathD` is a **hand-rolled** parser (not `path.getPointAtLength`) *on
purpose*: jsdom does not implement `getTotalLength`/`getPointAtLength`, so a DOM
approach dies in tests. **Do not "improve" the C-flatten into a DOM call** —
evaluate the cubic in plain JS. Confirmed: `parsePathD` is the **only**
flatten site — `extractRenderedPaths` and `optimizeGroup` both route through it,
and there is no other extraction path (see §8).

> Note: `pathDFromPoints` (used to re-serialize after `simplify`/`merge`) emits
> `M/L` only, so an *optimized* plotter export is flattened by design. The user's
> editable design export is the raw pattern SVG (bézier). This is expected.

---

## 5. Modulation-scoped param UI — `warpNodes`

`warpNodes` is only meaningful when the grid is actively warped, and must appear
in **two** places, always in sync.

- **Canonical home:** Grid layer param (single source of truth).
- **Two render sites, both editing the same value** via the existing generic
  `onUpdateLayer(gridLayerId, { params: { warpNodes } })` (the modulator UI
  already holds this handler — how `patchModulator` writes — so **zero new
  plumbing**):
  1. **Grid layer panel** — labeled as modulation-scoped.
  2. **Modulator map row** (for the grid target) — labeled "belongs to Grid
     layer".
- **Conditional visibility:** show only when the grid is an active `'warp'`
  target — gate on `resolveModulationForTarget(gridLayer, layers) !== null`
  (Grid panel) / `channel === 'warp' && targetType === 'grid'` (modulator row).
- **Shared component `<ModulationParamBox>`** — a violet box using the existing
  `border-violet bg-violet/10` convention (the `--violet` oklch(305) token,
  already used for the active-preview button in `Inspector.jsx`). It takes an
  `owner` label prop and wraps any control.

**Abstraction level — concrete with clean seams (not a registry yet):** build
`warpNodes` through the shared `<ModulationParamBox>` in both sites, with ONE
declaration that `grid.warpNodes` is modulation-scoped. Promoting to a full
`modulationParams` registry (sibling to `channelConsumers`) is mechanical when
param #2 arrives. Avoids over-abstracting on a sample size of one. This is the
intended reusable pattern going forward.

### 5.1 `<ModulationParamBox>` — visual design (per `.impeccable.md`)

The naqsheh anchor governs this: it is a **painted cell on the grid-sheet**, not a
card, not a glowing panel. A modulation-scoped param is a *special cell* marked in
the **violet ornamental ink** — the same hue as the focus ring and the active
`modulation-preview` button, so this extends an existing signal rather than
inventing a new visual language.

- **Container:** full **1px** `border-violet/40` hairline (NOT a side-stripe — a
  side accent border is a banned AI tell), fill `bg-violet/8`–`/10`, radius =
  existing `--radius-cell` / `rounded-cell` token. Quiet and painted; **no glow,
  no glass, no drop shadow.**
- **Owner label:** a small naqsheh-style annotation — `text-[11px] uppercase
  tracking-wider text-violet` (mirrors the existing "Targets" micro-heading),
  reading e.g. **"Grid layer"** in the modulator site and a "Modulation"
  tag in the Grid-panel site. Passed via an `owner`/`label` prop.
- **Rarity = meaning (60-30-10):** violet is the 10% accent; because
  modulation-scoped params are the exception, the violet cell reads as *special*
  against the cream/paper ground. Do not spread violet elsewhere.
- **Reveal motion:** when modulation becomes active, the box enters via a
  `grid-template-rows: 0fr → 1fr` transition (never animate height), ease-out,
  ~200ms — **patient, nothing snaps.** Respect `prefers-reduced-motion`.
- **Composition:** header row (owner label + optional small modulation glyph),
  body = the single wrapped control (the `warpNodes` slider, reusing the existing
  `accent-violet` range styling already in `Inspector.jsx`).
- **Empty/inactive:** the box simply is not rendered when modulation is inactive
  (conditional visibility, §5) — there is no "disabled" state to design.

The fresh build session should run `/impeccable craft`'s **visual-iteration
loop** (browser inspection via Playwright) on the *built* component against this
section and the AI-slop test before considering it done.

---

## 6. Deliberately NOT doing (non-goals)

- **No 3-way runtime mechanism mode** for spiral (mask / gradient / value as a
  player choice) — triples surface for overlapping behavior; maintainability
  trap.
- **No per-map `frame` property** — frame belongs to the target's geometry;
  single-source modulation makes it behaviorally moot today.
- **Grid does NOT get the scalar `'distort'` interpretation** — would fork the
  channel's meaning.
- **No in-app bézier node editor** — editability is for the *exported* SVG
  (external vector tools). The app builds the path, it doesn't edit it on-canvas.
- **No `modulationParams` registry yet** — deferred until the 2nd
  modulation-scoped param exists.
- **No tension/curvature knob** on the Grid bézier — `warpNodes` (node count) is
  the only curve control; Catmull-Rom supplies the smoothing.

---

## 7. Blast radius

| File | Change |
|---|---|
| `lib/fields/channelConsumers.js` | `spiral:'distort'`, `grid:'warp'` (+2 lines) |
| `lib/patterns/Spiral.js` | scalar mask + `distortFrame` in the point loop |
| `lib/patterns/Grid.js` | gated bézier warp (subdivide → displace → Catmull-Rom) |
| `lib/plotter/pathOps.js` | `parsePathD` flattens `C`/`S` |
| `components/ui/ModulationParamBox.jsx` | **new** shared violet-box component |
| `components/shell/Inspector.jsx` | mirror row for grid `warpNodes` |
| Grid param schema | register `warpNodes`; Spiral schema: `distortFrame` |
| tests | new: distort channel, grid bézier warp, `parsePathD` C-flatten, ModulationParamBox |

Existing `Spiral`/`Grid` snapshots stay green via the unmodulated invariants
(they render without a field).

---

## 8. Open verification points / known risks for the build

**Eyeball FIRST — gates the polar default:**

1. **Polar sampling seam at the atan2 wrap.** `u = (atan2(y,x) mod 2π)/2π`
   sawtooths 0→1 every turn, jumping at the −x axis (angle = π). Unless the guide
   field matches at `u=0` and `u=1`, `mask` is **discontinuous** there — a visible
   radial seam along the −x ray, every turn. Inherent to wrapping a non-periodic
   field onto a periodic angle. **Verify visually with a typical field before
   locking `distortFrame: 'polar'` as the default.** If ugly: default to Cartesian,
   or add a periodic remap (e.g. mirror the field at the seam). Does not block the
   feature; does gate the default.

   > **RESOLVED (build, 2026-07-01):** eyeballed with a typical smooth non-periodic
   > field (polar vs cartesian, side-by-side, faithful Spiral math + smooth jitter).
   > Polar showed a **clear hard radial seam** along the +x wrap ray — reads as
   > broken. Cartesian flows continuously, no seam. **Default flipped to
   > `'cartesian'`.** `'polar'` remains selectable for periodic fields / the
   > spoke-and-radius look. (`DEFAULT_PARAMS.spiral.distortFrame = 'cartesian'`.)

**Correctness items to confirm during build:**

2. **Out-of-domain `(u,v)`.** Spiral `outerRadius` (default 400) can exceed canvas
   half-width, so Cartesian `u=(x+W/2)/W` can fall outside `[0,1]`. Confirm what
   `ScalarField.sample` does off-domain — clamp / wrap / NaN. **NaN silently
   poisons the mask.** Clamp `(u,v)` before sampling if `sample` doesn't.
3. **`ScalarField.sampleSigned` exists and returns ~`[-1,1]`** — spec assumes it;
   verify the signature.
4. **Catmull-Rom endpoint tangents.** With endpoints pinned, the first/last
   segments need a boundary condition (duplicate-endpoint or one-sided tangent) or
   the curve misbehaves at the ends. Use a standard construction in the shared
   helper — don't hand-roll per-caller.
5. **`onUpdateLayer` merge semantics** for nested `params` (shallow vs deep) — the
   mirror write must not clobber sibling grid params. Spread
   `{ params: { ...grid.params, warpNodes } }` if shallow.

**Resolved during grill (recorded so the build doesn't re-investigate):**

6. **`parsePathD` is the only plotter C-flatten site.** `extractRenderedPaths`
   walks the DOM but extracts **only `<path>`**; `<line>`/`<polyline>` fall through.
   So current Grid (`<line>`) *and* TopographicContours (`<polyline>`) don't reach
   the plotter at all — a **pre-existing gap** (note in `NEEDS-HUMAN.md`, do not fix
   here). Consequence: warping a Grid to `<path>` makes it plotter-visible for the
   first time.

**UX confirmation (not a blocker):**

7. **`distort` uses the full transfer chain; `warp` is amount-only.** The
   modulator's device-level `shape`/`steps`/`offset` are *shared across all maps*.
   A guide driving both a grid (`warp`) and a spiral (`distort`) will have those
   knobs affect the spiral but not the grid. Intended — confirm the UI doesn't read
   as broken.
