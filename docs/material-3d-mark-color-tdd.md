# Material-Accurate 3D Mark/Line Color — TDD Plan

> Status: **grilled + locked 2026-06-28**, not yet built.
> Scope: the **etched mark/line color** in the 3D preview (and its 2D counterpart) — NOT the sheet body.
> Sibling docs (DIFFERENT, broader scope — sheet body appearance, transmission, wood grain, edge-glow
> archetypes): `docs/material-3d-appearance-plan.md` + `docs/material-3d-appearance-orchestrator.md`.
> This plan is independent of those and touches a disjoint set of files.

---

## 0. ⚠️ Read first — the code has drifted

A parallel effort has been changing the 3D preview (bloom / anti-aliasing on the cut-overlay textures, and
possibly `Marks.jsx` / `EmissiveBloom.jsx` / `Sheets.jsx`). **Before writing anything, re-read the live files**
named in §4 and confirm the function names / behaviors still match this plan. Do NOT trust line numbers.
Use `rg` / symbol search, not memorized offsets.

**Hard constraint — stay out of the parallel session's territory.** Do **NOT** edit:
`src/components/canvas3d/Marks.jsx`, `EmissiveBloom.jsx`, `bloomSelection.jsx`, `Sheets.jsx`, `Scene3D.jsx`,
or any bloom/postprocessing plumbing. The required emissive-intensity reduction for wood is delivered
**entirely through the `intensity` value that `markTexture.js` already emits** — `Marks.jsx` multiplies
`BASE_EMISSIVE × intensity`, so lowering it upstream needs zero `Marks.jsx` change.

---

## 1. Problem

In the 3D preview, pattern/layer lines render in their **raw SVG export color** — the LightBurn laser
convention (cut ≈ red `#ff3b2f`, score ≈ blue `#3b7bff`, engrave ≈ neutral). That is physically wrong on a
real cut piece:

- **Fluorescent yellow acrylic** scored/engraved → lines are **white/yellowish and emissive** (frost +
  fluorescence re-emission in the body hue), never blue.
- **Walnut laminated plywood** scored/engraved → lines are **dark matte char (burn marks)**, never blue.

The 2D "Material" preview lens (`materialPreview.js`) already models this reaction; the 3D mark path
(`markTexture.js`) is material-blind. This plan gives both paths **one shared reaction source of truth**.

---

## 2. Locked decisions (from grilling, 2026-06-28)

| # | Decision | Notes |
|---|----------|-------|
| L1 | **Shared reaction module** `src/lib/materialReaction.js` (pure, three-free, 2D-side). Both `materialPreview.js` (2D) and `markTexture.js` (3D) import it. | The "same entity" the user asked for; 2D & 3D may render *slightly* differently (flat stroke vs emissive) but derive from one reaction core. |
| L2 | **3D marks key off `panel.substrate`** (the SAME data that colors the 3D sheet in `sheetSpecs.js`), NOT the 2D `colorView` lens. | Marks must match the slab they sit on. Consequence (accepted): the 2D "Material" lens override does not change 3D. |
| L3 | **Acrylic (`lighten`) → material-tinted frost**, not pure white. Emissive line = a **hue-preserving brightened** version of the panel hex (fluorescent yellow → saturated yellowish-white). Keeps the glow; bloom is correct here. | Mirror the hue-preserving frost into 2D's `FROST_TARGET` so 2D & 3D agree. |
| L4 | **Wood (`burn`) → dark char tint + reduced emissive intensity** (`intensity × BURN_GLOW_SCALE`) so it reads matte, not a glowing dark halo. | Bloom is selection-gated (`luminanceThreshold = 0`, `EmissiveBloom.jsx`): every selected mark glows by construction, so color alone is insufficient — the intensity drop is required. Delivered via `markTexture`'s emitted `intensity`; no `Marks.jsx`/bloom edit. |
| L5 | **Unknown / `other` substrate → today's laser-convention tints** (red cut / blue score / neutral engrave) + today's intensities. No regression for un-specified panels. | |
| L6 | **Process-identity hue (red/blue/neutral) is intentionally dropped for recognized materials.** All processes on a material become shades of its reaction, ordered by depth (cut > engrave > score). | Exactly the goal: no red/blue lines on a fluorescent panel. Depth ordering preserved via `intensity`. |
| L7 | **Pen process unchanged** — ink sits ON the sheet, keeps the operation's own color. | |
| L8 | **Surgical.** Only `markTexture.js`, `materialPreview.js`, and the new `materialReaction.js` change (+ their tests). Nothing in the 3D scene/bloom files. | |

---

## 3. Architecture — the shared reaction module

`src/lib/materialReaction.js` — **pure, three-free, 2D-side** (so `markTexture.js` can import it without
leaking three into the 2D bundle). Proposed API (settle exact names in P0; both downstream tracks build
against these):

```js
// Classification — accepts a loose material-like object:
//   2D passes colorView.material ({ type|category, hex|color })
//   3D passes panel.substrate     ({ kind, color })
export function materialCategory(m)   // -> 'lighten' | 'burn' | 'other'
export function materialSheetHex(m)   // -> '#rrggbb'

// Color helpers (pure)
export function mix(aHex, bHex, t)
export function luminance(hex)
export function brighten(hex, amount) // hue-preserving brighten toward a saturated bright version

// Reaction constants (lifted from materialPreview.js)
export const FROST_TARGET, BURN_TARGET
export const MIX = { score, engrave, cut }     // per-process depth mix
export const MIN_VISIBLE, SHADOW_SCALE         // sheet-at-extreme fallback
export const BURN_GLOW_SCALE                   // emissive damp for wood (matte)

// 2D flat stroke color (mark sits ON the lit sheet; needs contrast). Behaviorally
// the old materialStrokeColor, but frost target is now hue-preserving (L3).
export function reactionStrokeColor(sheetHex, category, process, opColor) // -> hex

// 3D emissive tint + glow scale (mark glows; bloom-aware).
export function reactionEmissive(sheetHex, category, process)
//   -> { tint: string|null, intensityScale: number }
//   lighten -> { tint: brightened hue-preserving frost,      intensityScale: 1 }
//   burn    -> { tint: char near BURN_TARGET,                intensityScale: BURN_GLOW_SCALE }
//   other   -> { tint: null  (caller uses convention tint),  intensityScale: 1 }
```

### Consumers

**2D — `src/lib/materialPreview.js`:** keep its public surface stable. Re-export `materialCategory`,
`materialSheetHex`, `luminance` from `materialReaction`. `materialStrokeColor` delegates to
`reactionStrokeColor`. The only visible behavior change: acrylic frost retains the panel hue (L3).

**3D — `src/lib/three3d/markTexture.js`:**
- `treatmentForProcess(process, substrate?)` — **add an optional 2nd arg** (back-compat: called with one arg →
  today's convention behavior, so existing tests pass unchanged).
  - substrate recognized (`lighten`/`burn`): `tint` from `reactionEmissive(...).tint`;
    `intensity = PROCESS_INTENSITY[process] × reactionEmissive(...).intensityScale`.
  - `other`/absent: today's `PROCESS_TINT[process]` + `PROCESS_INTENSITY[process]`.
- `buildPanelMarkSVGs` already loops per panel (`for (const p of visiblePanels)`) and has `p.substrate` in
  scope — pass `p.substrate` into the per-process treatment. No new threading through `RightPanel.jsx`.

---

## 4. Files

| File | Change | Track |
|------|--------|-------|
| `src/lib/materialReaction.js` | **NEW** — shared reaction core + tests | P0 (blocking) |
| `src/lib/materialReaction.test.js` | **NEW** — unit tests for the core | P0 |
| `src/lib/three3d/markTexture.js` | substrate-aware `treatmentForProcess` + `buildPanelMarkSVGs` | P1-A |
| `src/lib/three3d/markTexture.test.js` (verify name on disk) | new behaviors | P1-A |
| `src/lib/materialPreview.js` | delegate to reaction core; hue-preserving frost | P1-B |
| `src/lib/materialPreview.test.js` | update frost expectations | P1-B |

**Do not touch:** `Marks.jsx`, `EmissiveBloom.jsx`, `bloomSelection.jsx`, `Sheets.jsx`, `Scene3D.jsx`,
`sheetSpecs.js`, `svgExport.js`, `fabrication.js`, any export path.

---

## 5. Phases (TDD vertical slices — red → green per behavior, never horizontal)

### P0 — Reaction core (BLOCKING, single agent; everything depends on the API)

Create `materialReaction.js` by **lifting** the existing pure logic from `materialPreview.js` (color
helpers, `materialCategory`, `materialSheetHex`, mix/shadow constants) so behavior is preserved, then add the
emissive + hue-preserving-frost functions. TDD, one behavior at a time:

1. `materialCategory`: acrylic-ish `type`/`kind` → `lighten`; wood/ply/mdf-ish → `burn`; unknown → `other`;
   explicit `category` honored.
2. `materialSheetHex`: explicit hex wins; named-color fallback; neutral default.
3. `brighten`: hue-preserving — output has higher luminance, same hue family (e.g. `#E6E954` stays yellow,
   not white); idempotent at amount 0.
4. `reactionStrokeColor` (lighten): mixes sheet toward a **hue-tinted** frost; cut > engrave > score in
   distance from sheet; never crosses (monotonic).
5. `reactionStrokeColor` (burn): mixes toward `BURN_TARGET`; same ordering.
6. `reactionStrokeColor`: sheet-at-extreme `MIN_VISIBLE` shadow fallback still triggers (port existing test).
7. `reactionStrokeColor` (pen): returns `opColor`.
8. `reactionEmissive`: lighten → non-null brightened tint, `intensityScale === 1`; burn → dark tint
   (`luminance < lighten's`), `intensityScale === BURN_GLOW_SCALE (<1)`; other → `tint === null`,
   `intensityScale === 1`.

**Gate:** `npm test` (P0 file green + no existing test regresses).

### P1 — Two independent tracks (PARALLELIZE after P0 is merged/green)

> A & B touch **disjoint files** and both depend only on the P0 module → run as two subagents in parallel
> (or two worktrees). They do not share any file.

**Track A — 3D marks (`markTexture.js` + its test):**
1. `treatmentForProcess('cut')` with NO substrate → unchanged convention tint/intensity (back-compat).
2. `treatmentForProcess('score', acrylicSubstrate)` → tint is a brightened hue of the substrate color
   (not blue), `intensity === PROCESS_INTENSITY.score` (scale 1).
3. `treatmentForProcess('cut', woodSubstrate)` → dark tint AND `intensity < PROCESS_INTENSITY.cut`
   (matte: scaled by `BURN_GLOW_SCALE`).
4. `treatmentForProcess(p, otherSubstrate)` → convention tint/intensity (fallback).
5. `buildPanelMarkSVGs`: a panel with an acrylic substrate emits per-process SVGs stroked in the
   reaction tint (assert stroke color ≠ convention blue/red; matches substrate-derived frost).
6. `buildPanelMarkSVGs`: a wood-substrate panel emits dark-tinted SVGs with reduced `intensity`.
7. `buildPanelMarkSVGs`: panel with absent/`other` substrate → unchanged convention output (regression
   guard for existing snapshots).

**Track B — 2D preview (`materialPreview.js` + its test):**
1. `materialStrokeColor` still passes all PORTED existing tests (delegation preserves behavior) EXCEPT the
   frost-hue ones updated next.
2. Fluorescent acrylic score/engrave/cut: frost retains a yellow hue (assert hue, not pure-white) — update
   the prior pure-white expectation.
3. Wood/burn, pen, and shadow-fallback behaviors unchanged.
4. `resolveCanvasColor` + `sheetBackground` unchanged (operation mode still byte-identical to export).

**Gate (each track):** `npm test` green; `npm run build` succeeds; `npm run lint` adds no new errors;
new files lint-clean.

### P2 — Integration + visual smoke (single agent, after A & B green)

- Full `npm test` + `npm run build` + `npm run lint` green gate.
- Best-effort Playwright-MCP screenshots of the 3D preview with (a) a fluorescent acrylic panel and (b) a
  walnut plywood panel; confirm acrylic lines glow yellow-white and wood lines read as dark matte (no
  glowing halo). Non-blocking; attach to `docs/3d-shots/` if the harness allows.
- Write a short `run-report.md`: what changed, test delta, and a NEEDS-HUMAN visual checklist. **Stop on the
  branch; do not merge.**

---

## 6. Green gate (measure baseline first — do NOT hardcode a stale count)

```bash
npm test          # record BASELINE pass/fail/skip BEFORE any change; every slice keeps pass ≥ baseline, 0 new fails
npm run build     # must succeed (a pre-existing >500 kB chunk warning is fine)
npm run lint      # must add NO new errors; new files must be lint-clean; never "fix" unrelated lint to pass
```

Green ≠ correct: the gate is blind to every visual claim. All decision logic lives in pure, node-tested
functions; the *look* is smoke-only (P2 checklist).

---

## 7. Suggested git hygiene

Branch `feat/material-3d-mark-color` off current `main`. If running P1-A and P1-B as parallel worktree
agents, give each its own worktree to avoid lockfile/working-tree conflicts; they edit disjoint files so the
merge is clean. On green: stop, write the run report, leave for human review.
