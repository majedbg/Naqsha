# Parameter UX Overhaul — Subagent Work Plan

> **Goal.** Replace generic sliders with **semantic, param-specific controls** where a slider
> under-serves the parameter. Five new controls, built on one shared foundation.
> Symmetry leads: it stops being a numeric slider and becomes a single-select grid of
> SVG symbols, and it becomes the **featured (top) param** for Flow Field and Recursive.
>
> This document is the source of truth for the work. Read it fully before touching code.
> All UI must satisfy the craft contract in **§ Craft Rules** (quoted from `.impeccable.md`).

---

## 0. Decisions already made (do not relitigate)

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Symmetry is **rotational order only** (N copies at 360/N°). Pure UI reskin. | **No engine change.** `symmetryUtils.js` untouched. Icons = N radial arms, never mirror axes. |
| D2 | Keep **all 11 values** (1–11). Icons **generated programmatically** (N-arm SVG), wrapping grid. | No hand-drawn assets. N≥7 needs a numeral disambiguator (see WI-2). |
| D3 | New **featured-param slot** renders one param **above all groups**, always visible. Pin `symmetry` for `flowfield` + `recursive` only. | Symmetry's button UI applies **everywhere** it appears (~14 patterns); only the *pin-to-top* is those two patterns. |
| D4 | New **`<ParamControl>` dispatcher** owns `type → component` mapping. | `ParamGroup` stops switching inline; each control is its own file in `components/ui/`. |
| D5 | Build **all four** extra controls: 2D Offset Pad, Angle Dial, Shape IconSelect, Curve Editor. | WI-3…WI-6. |
| D6 | 2D Pad is a **composite def** — `{ type:'pad2d', keys:['offsetX','offsetY'] }` replacing both slider defs. | Needs a **synthetic primary key** so per-key lookups don't break (see WI-1 §1.4). |
| D7 | Curve Editor = **single scalar, no engine change**, **`scaleNonLinearity` only**. | `sizeGrowth` / `strokeDepthDecay` stay sliders. Engine untouched. |

---

## 1. Dependency graph

```
WI-1  FOUNDATION  ───────────────  [BLOCKS EVERYTHING BELOW — must merge first]
  ├─ WI-2  Symmetry IconSelect      (parallel)
  ├─ WI-3  2D Offset Pad            (parallel)
  ├─ WI-4  Angle Dial              (parallel)
  ├─ WI-5  Shape IconSelect         (parallel)
  └─ WI-6  Curve Editor             (parallel)
```

WI-2…WI-6 are independent of each other and can be fanned to separate subagents **once WI-1 is merged.**

---

## 2. Codebase map (current state — verified)

| File | Role | Touched by |
|------|------|------------|
| `src/constants.js` | `PATTERN_PARAM_DEFS`, `DEFAULT_PARAMS`, `PARAM_GROUPS`, `PARAM_GROUP_MAP`, `COLLAPSED_GROUPS`, `SYMMETRY_PARAM` (L267), `OFFSET_X/Y_PARAM`, `START_ANGLE_PARAM` | WI-1,2,3,4,5,6 |
| `src/components/PatternParams.jsx` | Builds param items, runs tier gate, groups by `PARAM_GROUP_MAP`, `randomValueForDef` | WI-1 |
| `src/components/ParamGroup.jsx` | Renders each group; **inline `def.type==='select' ? <Select> : <Slider>`** + reset/randomize side-rail | WI-1 |
| `src/components/ui/Slider.jsx` | Numeric primitive. **Reference bar for keyboard a11y.** | (reference only) |
| `src/components/ui/Select.jsx` | Native `<select>` primitive | (reference only) |
| `src/lib/tierLimits.js` | `UNIVERSAL_PARAM_KEYS` (gate uses `def.key`) | WI-1 (composite key) |
| `src/lib/patterns/symmetryUtils.js` | Rotational draw/SVG transforms. **Do NOT modify** (D1). | — |

**Current control dispatch** (`ParamGroup.jsx`, inside the `allowedItems.map`):
```jsx
def.type === "select"
  ? <Select label={def.label} value={params[def.key] || def.options[0].value} ... />
  : <Slider label={def.label} value={params[def.key] ?? def.min} min max step ... />
```

**Current randomization** (`PatternParams.jsx`):
```js
function randomValueForDef(def) {
  if (def.type === "select") { /* pick from options */ }
  /* else numeric snap to step */
}
```

---

## 3. Craft Rules — quoted from `.impeccable.md` (NON-NEGOTIABLE)

Every new control must satisfy these. Cite the principle number in your PR description.

- **P2 — Color as punctuation.** Selected state uses **one load-bearing accent at a time: `saffron`**, rendered like a *painted cell* (solid fill on the selected button/nub), not a glow or gradient. Unselected = paper ground + hairline border. Token: `bg-saffron` / `text-saffron` / `border-saffron` (see `tailwind.config.js`).
- **P4 — Patient motion.** Transitions decelerate like a hand setting something down: **ease-out-quart/quint, 240–360ms** for medium moves. **No bounce, no elastic, no snap.** Respect `prefers-reduced-motion` (drop transforms/transitions, keep the state change).
- **P5 — Precision you can see.** Interactive affordances are **obvious** — "a painted cell you can see from across the room." **Keyboard-first: every control has a visible focus ring and a sensible shortcut.** Match `Slider.jsx`'s keyboard sophistication (Arrow = 1 step, Shift+Arrow = coarse, Home/End = min/max).
- **P1 — Paper first.** Containers are **hairlines on paper**, not drop-shadowed cards. Use `border-hairline`, no shadows.
- **P3 — Grid as substrate.** Honor the **4pt scale**; align to the existing gutter rhythm.
- **P7 — Named after what it does.** No emoji. Specific, unhurried tooltips. Tabular figures for numeric readouts.
- **Anti-references.** Must NOT read as a Figma/Adobe dark-panel clone or "AI slop" (cyan glow, purple→blue gradients, neon, chrome). Icons feel **painted/manuscript**, not technical-neon.

**Shared a11y contract (all new controls):**
- IconSelect controls: `role="radiogroup"`, each button `role="radio"` + `aria-checked`; Arrow keys move selection, Enter/Space commit, `aria-label` per option.
- Pad/Dial: focusable, Arrow keys nudge by `step`, Shift+Arrow coarse, visible focus ring, `aria-label` + live numeric readout (`aria-valuetext`).
- All: visible `focus-visible` ring; never rely on color alone (selected state also changes border/weight).

---

# WI-1 — FOUNDATION  *(blocking; one subagent; merge before all others)*

**Outcome:** the plumbing every control depends on, with **zero visual change** to existing
sliders/selects (symmetry still renders — as a slider — until WI-2). Existing patterns must
look and behave identically after this lands.

### 1.1 `ParamControl` dispatcher — `src/components/ui/ParamControl.jsx` (NEW)
Extract the dispatch out of `ParamGroup.jsx`. Signature:
```jsx
<ParamControl def={def} params={params} onChange={onChange} />
```
- Owns the `type → component` switch. Initial mapping:
  - `iconselect` → `IconSelect` (WI-2/WI-5)
  - `pad2d` → `Pad2D` (WI-3)
  - `dial` → `AngleDial` (WI-4)
  - `curve` → `CurveEditor` (WI-6)
  - `select` → `Select`
  - default → `Slider`
- For single-key controls it reads `params[def.key]` and calls `onChange({ ...params, [def.key]: v })`.
- For composite controls (`def.keys`) it reads/writes the listed keys (pass `params`/`onChange` straight through and let the control map the keys, OR provide a `values` object + `onChangeMany(patch)` — implementer's choice, but document it for WI-3).
- Until WI-2…WI-6 land, the unknown `type` values fall through to the default `Slider` gracefully (no crash).

`ParamGroup.jsx`: replace the inline ternary with `<ParamControl ... />`. **Keep the reset / randomize-checkbox / randomize-button side-rail exactly as is.**

### 1.2 Featured-param slot
- **`src/constants.js`:** add
  ```js
  // One param rendered above all groups, always visible, ungrouped. Keyed by patternType.
  export const FEATURED_PARAMS = {
    flowfield: 'symmetry',
    recursive: 'symmetry',
  };
  ```
- **`src/components/PatternParams.jsx`:**
  - Look up `const featuredKey = FEATURED_PARAMS[patternType];`
  - Build the featured item from `defs.find(d => d.key === featuredKey)` (run it through the **same** gate check as other params).
  - Render it **above** the `PARAM_GROUPS.map(...)`, ungrouped, in its own block, with the same reset/randomize affordances a normal row gets.
  - **Exclude it from its normal group** so it does not render twice. (Filter `featuredKey` out of `grouped[...]` / `paramItems` before the group render.) ← *advisor-flagged; verify with a manual check that symmetry appears once.*
  - Guest tier: if the featured param is gated off for guests, fall back to normal behavior (don't show a locked featured slot at the very top).

### 1.3 `randomValueForDef` — branch on **options presence**, not `type`
Current code keys off `def.type === "select"`. Shape IconSelect (WI-5) carries `options` but a *different* type, and would wrongly hit the numeric path. Fix:
```js
function randomValueForDef(def) {
  if (def.options) {                      // ← was: def.type === "select"
    const opts = def.randomOptions || def.options;
    return opts[Math.floor(Math.random() * opts.length)].value;
  }
  // numeric snap (unchanged)
}
```

### 1.4 Composite-key support (for WI-3's `pad2d`) — **the main landmine**
A `{ type:'pad2d', keys:['offsetX','offsetY'] }` def has **no `.key`**, but the row machinery
keys off `def.key` everywhere. WI-1 must make composites first-class:

1. Give every composite a **synthetic primary key**: `{ key:'offset', keys:['offsetX','offsetY'], ... }`. `key` is used for React keys, grouping, gating, and the randomize-checkbox; `keys` is the real value set.
2. **`randomValueForDef` → `randomPatchForDef`** (or add a sibling): when `def.keys` exists, return a **patch object** `{ offsetX: rndX, offsetY: rndY }` and have `randomizeSingle`/`randomizeGroup` spread the patch instead of assigning one value. Single-key path returns `{ [def.key]: v }` for symmetry.
3. **Reset:** `resetSingle`/`resetGroup` must reset **all** of `def.keys` to their defaults (read each from `defaults`). `isDefault` for the row = *all* listed keys equal their defaults.
4. **Grouping:** `PARAM_GROUP_MAP['offset'] = 'transform'` (add it). The pad lives in the Transform group.
5. **Tier gate:** gate the composite on its synthetic `key` (`offset`). Add `'offset'` handling wherever `UNIVERSAL_PARAM_KEYS` / `paramKey` is consumed so the gate resolves. Confirm offsets remain in the same tier they're in today.
6. **Randomize checkbox:** one checkbox controls the synthetic `key`; when checked, group-randomize patches both real keys.

*(No def actually uses `pad2d` yet in WI-1 — but the machinery must be in place and unit-exercised with a temporary fixture, then removed. WI-3 only adds the def + the component.)*

### WI-1 Acceptance criteria
- [ ] All existing patterns render **pixel-identically** to `main` (sliders/selects unchanged).
- [ ] `ParamControl.jsx` exists; `ParamGroup` delegates to it; reset/randomize rail intact.
- [ ] Flow Field & Recursive show **symmetry above all groups** (still a slider for now) and **not** duplicated inside Transform.
- [ ] `randomValueForDef` branches on `def.options`.
- [ ] Composite-key plumbing handles grouping, gating, reset, and randomize for a `keys:[...]` def (proven via a temporary 2-key fixture, then reverted).
- [ ] `npm run lint` clean. No console errors.

---

# WI-2 — Symmetry IconSelect  *(after WI-1)*

**Outcome:** symmetry (1–11) renders as a wrapping grid of generated N-arm SVG buttons,
everywhere it appears. Selected = saffron painted cell.

### Files
- `src/components/ui/IconSelect.jsx` (NEW) — generic single-select icon-button grid.
- `src/components/ui/paramIcons.jsx` (NEW) — icon source: `SymmetryGlyph({ n })` generator (+ shape/fill glyphs land here in WI-5).
- `src/constants.js` — change `SYMMETRY_PARAM` to the new control type.

### `IconSelect` contract
```jsx
<IconSelect
  label value onChange tooltip
  // EITHER generated:
  range={{ min, max, step }} glyph="symmetry"
  // OR enumerated (WI-5 uses this):
  options={[{ value, label, glyph }]}
/>
```
- Renders a **wrapping grid** of ~28×28px buttons (4pt-aligned), `role="radiogroup"`.
- Generated mode: iterate `min..max` by `step`, render `<SymmetryGlyph n={value} />` per button.
- Selected button: `bg-saffron` painted cell + saffron border + ink-on-saffron glyph. Unselected: paper ground, `border-hairline`, ink-soft glyph. Hover: subtle warm ground (no glow).
- Keyboard: Arrow keys move + commit selection (radiogroup semantics), Home/End → first/last, visible `focus-visible` ring.
- Motion: selection fill transitions ease-out ~240ms; respect reduced-motion.

### `SymmetryGlyph({ n })`
- **n = 1:** a single centered dot (no symmetry).
- **n ≥ 2:** `n` arms radiating from center, evenly spaced at `360/n°`, drawn as thin strokes (iron-gall ink weight). n=2 → one vertical line (two collinear arms); n=4 → "+"; n=3 → three arms at 120°; etc.
- **n ≥ 7 (D2 disambiguation):** arms get visually dense at 16–28px — overlay the **numeral** `n` in tabular figures, small, centered (or render numeral as the primary mark with a faint arm ring). Pick whichever stays legible against the saffron selected state; document the choice.
- Stroke uses `currentColor` so selected (ink-on-saffron) vs unselected (ink-soft) both work.
- Pure SVG, no external assets, no animation inside the glyph.

### `SYMMETRY_PARAM` change (`constants.js:267`)
```js
const SYMMETRY_PARAM = {
  key: 'symmetry', label: 'Symmetry', type: 'iconselect',
  glyph: 'symmetry', range: { min: 1, max: 11, step: 1 },
  min: 1, max: 11, step: 1, randomMax: 10,     // keep min/max/step for randomValueForDef numeric path
  tooltip: 'Radial copies — 1 = none, 2 = 180°, 3 = 120°, 4 = +, …',
};
```
- Drop the misleading "mirror" wording (D1). Value stays a **number**; defaults unchanged (`symmetry: 1`).
- `randomValueForDef` numeric path still applies (no `options`), capped by `randomMax`.

### WI-2 Acceptance
- [ ] Symmetry renders as an 11-button wrapping grid in **every** pattern that has it.
- [ ] Generated glyphs correct for 1–11; N≥7 legible (numeral disambiguation present).
- [ ] Selected = saffron painted cell; full keyboard radiogroup nav; visible focus.
- [ ] Reset/randomize still work (writes a number 1–11).
- [ ] On Flow Field & Recursive it appears in the **featured slot** (top), as buttons.
- [ ] `npm run lint` clean.

---

# WI-3 — 2D Offset Pad  *(after WI-1)*

**Outcome:** `offsetX` + `offsetY` collapse into one draggable nub in a framed square.

### Files
- `src/components/ui/Pad2D.jsx` (NEW)
- `src/constants.js` — replace the two `OFFSET_X_PARAM` / `OFFSET_Y_PARAM` entries **in each pattern's def array** with a single composite. Keep the standalone param consts available or inline the composite via a shared `OFFSET_PAD_PARAM`:
  ```js
  const OFFSET_PAD_PARAM = {
    key: 'offset', type: 'pad2d', label: 'Offset',
    keys: ['offsetX', 'offsetY'], min: -500, max: 500, step: 1,
    tooltip: 'Drag to shift the pattern. Center = no offset.',
  };
  ```
  Replace `OFFSET_X_PARAM, OFFSET_Y_PARAM` pairs with `OFFSET_PAD_PARAM` in `PATTERN_PARAM_DEFS`.
- `PARAM_GROUP_MAP`: add `offset: 'transform'` (WI-1 may have already done this — verify).

### `Pad2D` contract
- A square framed by a **hairline** (P1), faint 4pt graticule inside (P3, "grid as substrate"), origin at center.
- A draggable **nub** (painted saffron cell when focused/active) maps position → `(offsetX, offsetY)` linearly across `[min,max]`. Center = `(0,0)`.
- Writes **both** keys via the composite patch (`onChange({ ...params, offsetX, offsetY })`).
- Numeric readout below/beside: `x: +40  y: −12` in tabular figures (P7). Optionally click-to-edit like Slider (nice-to-have).
- Keyboard: focusable; Arrow keys nudge nub by `step`; Shift+Arrow coarse (×10); Home → recenter to (0,0); visible focus ring; `aria-label="Offset"`, `aria-valuetext` announces both values.
- Pointer: drag with pointer events (capture), clamp to bounds, respect reduced-motion (no easing on the nub while dragging; settle transition ≤240ms ease-out on release).

### WI-3 Acceptance
- [ ] Every pattern that had Offset X/Y now shows **one** Offset Pad (no leftover offset sliders).
- [ ] Dragging updates both params live; readout matches; center = (0,0).
- [ ] One reset (recenters both) + one randomize checkbox/button (patches both) — via WI-1 composite plumbing.
- [ ] Full keyboard control + visible focus; reduced-motion honored.
- [ ] `npm run lint` clean.

---

# WI-4 — Angle Dial  *(after WI-1)*

**Outcome:** `startAngle` (0–360°) becomes a circular drag knob; reusable for phyllotaxis
divergence `angle` (100–170°) with a **golden-angle 137.5° detent**.

### Files
- `src/components/ui/AngleDial.jsx` (NEW)
- `src/constants.js`:
  - `START_ANGLE_PARAM` → `{ key:'startAngle', type:'dial', label:'Start Angle', min:0, max:360, step:1, wrap:true, tooltip:'Rotates the whole pattern.' }`
  - Phyllotaxis `angle` def → add `type:'dial', detent:137.508, detentLabel:'Golden'` (keep `min:100, max:170, step:0.01`). Non-wrapping arc.

### `AngleDial` contract
- A circle (hairline) with a draggable handle on the rim; the swept angle from a reference (12 o'clock or pattern convention) maps to the value.
- **Center readout**: degrees in tabular figures (`137°` / `45°`).
- `wrap:true` (startAngle): 359°→0° is continuous. Non-wrap (divergence): clamp to `[min,max]`, render as an **arc** of the live range, not a full circle.
- `detent`: a marked tick on the rim (`◉ Golden`) and a soft magnetic snap within ~±1° (snap is a value-nudge, not a motion bounce — P4). Holding a modifier (e.g. Alt) bypasses the detent for fine control.
- Selected/active handle = saffron painted cell. Hairline ring, ink-soft ticks.
- Keyboard: Arrow = ±step, Shift+Arrow coarse, Home/End → min/max (or 0/wrap), `aria-label` + `aria-valuetext` in degrees; visible focus.

### WI-4 Acceptance
- [ ] `startAngle` renders as a wrapping dial in every pattern that has it; value 0–360 round-trips.
- [ ] Phyllotaxis divergence renders as a clamped arc dial with a visible **137.5° golden detent** + soft snap + bypass modifier.
- [ ] Keyboard + focus + reduced-motion; reset/randomize unchanged (single key).
- [ ] `npm run lint` clean.

---

# WI-5 — Shape IconSelect  *(after WI-1; reuses WI-2's IconSelect)*

**Outcome:** the `shape` and `fillMode` `<select>`s become geometric **glyph buttons**, using
the **same `IconSelect`** component WI-2 introduces (enumerated `options` mode).

> Coordinate: WI-5 depends on `IconSelect.jsx` + `paramIcons.jsx` existing. If WI-2 and WI-5
> run truly in parallel, WI-2 owns the files; WI-5 only **adds glyphs** to `paramIcons.jsx`
> and flips the defs. Note this in both PRs to avoid a merge collision on `paramIcons.jsx`.

### Files
- `src/components/ui/paramIcons.jsx` — add static glyphs: `circle, square, triangle, pentagon, hexagon, star` and fill glyphs `outline, fill, both`.
- `src/constants.js` — change the relevant `shape` / `fillMode` defs from `type:'select'` to `type:'iconselect'`, attaching a `glyph` to each option:
  ```js
  { key:'shape', label:'Shape', type:'iconselect', options:[
      { value:'circle', label:'Circle', glyph:'circle' },
      { value:'square', label:'Square', glyph:'square' },
      ...
  ], tooltip:'Shape of each element' }
  ```
  Apply to: phyllotaxis `shape` + `fillMode`, recursive `shape`, and any other `shape`/`fillMode` selects (grep `type: 'select'` in `constants.js` and convert the geometric ones; **leave non-geometric selects** like `drawMode`, `curveType` as `<select>` for now).

### Glyph rules
- Outline shapes drawn as hairline strokes (cut metaphor); `fill` glyph filled (engrave metaphor); `both` = filled with outline. Manuscript/painted feel, not neon.
- `currentColor` so selected (ink-on-saffron) and unselected (ink-soft) both read.

### WI-5 Acceptance
- [ ] `shape` + `fillMode` render as icon buttons via `IconSelect` (no new bespoke component).
- [ ] Value still round-trips as the existing string (`'circle'`, `'fill'`, …); defaults unchanged.
- [ ] Randomize works (hits the `def.options` path from WI-1).
- [ ] Non-geometric selects untouched.
- [ ] `npm run lint` clean.

---

# WI-6 — Curve Editor  *(after WI-1)*

**Outcome:** `scaleNonLinearity` (−1..1) renders as a small panel showing the **live falloff
curve** that scalar produces; drag up/down sets the single value. **No engine change** (D7).

### Files
- `src/components/ui/CurveEditor.jsx` (NEW)
- `src/constants.js` — recursive `scaleNonLinearity` def → `type:'curve'` (keep `min:-1, max:1, step:0.05`). **Only** this param; `sizeGrowth` / `strokeDepthDecay` stay sliders.

### `CurveEditor` contract
- A small framed panel (hairline, faint graticule) plots the decay curve the scalar implies
  (mirror the engine's actual `scaleNonLinearity` math so the preview is honest — read how
  `RecursiveGeometry.js` applies it; the preview must match what the pattern does).
- It is a **single-scalar input**: dragging vertically (or along the curve) maps to one value
  in `[-1, 1]`. There are **no editable control points** — the curve is a *readout* of the
  scalar, draggable to change it.
- Numeric readout (tabular figures). Selected/active stroke = saffron; curve line = ink.
- Keyboard: Arrow = ±step, Shift+Arrow coarse, Home/End → min/max, `aria-label` + `aria-valuetext`; visible focus.
- Motion: curve redraws follow value immediately (no lag); any settle ≤240ms ease-out; reduced-motion safe.

### WI-6 Acceptance
- [ ] `scaleNonLinearity` renders as the curve panel; value round-trips in [−1,1]; default unchanged.
- [ ] Preview curve **matches** the engine's actual scaleNonLinearity behavior.
- [ ] `sizeGrowth` / `strokeDepthDecay` untouched (still sliders).
- [ ] Single scalar only — no engine change, no multi-point editing.
- [ ] Keyboard + focus + reduced-motion; reset/randomize unchanged.
- [ ] `npm run lint` clean.

---

## 4. Global Definition of Done (every WI)

- [ ] Satisfies the cited **Craft Rules** (§3); selected state is saffron, single load-bearing accent.
- [ ] Keyboard-first parity with `Slider.jsx`; visible `focus-visible`; `prefers-reduced-motion` honored.
- [ ] No emoji; tooltips specific and unhurried; numeric readouts use tabular figures.
- [ ] Param values keep their existing **types** (number/string) — no state migration, no engine edits except where this doc explicitly says none are needed.
- [ ] `npm run lint` passes; no console errors/warnings; existing patterns visually unaffected outside the changed control.
- [ ] PR description names the principle(s) satisfied and notes any shared-file coordination (e.g. `paramIcons.jsx` between WI-2/WI-5).
