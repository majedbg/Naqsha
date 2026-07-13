# Guest Onboarding — Build Notes

Stop-and-document log per D29 / HARD GUARDRAILS. One entry per human-gated,
deferred, or otherwise noteworthy build decision. Companion docs:
`guest-onboarding-DECISIONS.md` (locked decisions), `guest-onboarding-BUILD-BRIEF.md`
(build plan).

---

## S5 — D14 non-color-only cut/engrave encoding: DEFERRED (safety-critical, needs review)

**Status:** NOT implemented. Documented here per the slice instructions'
explicit DO-OR-DOCUMENT gate — investigated first, then declined to build
unattended because the only viable low-risk seam turned out not to be
low-risk.

**The ask (D14):** in the Operation lens, cut vs engrave must be
distinguishable by more than color — also by line weight and/or dash, for
laser safety (mistaking a cut for an engrave is dangerous) and colorblind
accessibility.

**What I found (investigation, no edits made):**
- Role→**color** resolution for the Operation lens IS centralized:
  `resolveCanvasColor()` in `src/lib/materialPreview.js:122-139` delegates to
  `resolveExportColor()` / `resolveLayerColor()` / `roleColor()` in
  `src/lib/fabrication.js:21-55` (`LASER_ROLES`: cut=#FF0000, score=#0000FF,
  engrave=#000000). `src/lib/useCanvas.js` calls `resolveCanvasColor` at 6
  sites (lines 150, 185, 197, 215, 344, 365), one per layer, right before
  each pattern's `generateWithContext(...)`.
- Role→**strokeWidth** is NOT centralized. The canvas renders via p5.js on an
  imperative `<canvas>` (not SVG/React props) through `P5Adapter`
  (`src/lib/patterns/drawingContext.js`), but each of ~76 individual pattern
  files under `src/lib/patterns/*.js` (e.g. `Grid.js:111`,
  `CirclePacking.js:204`, `Feather.js:79`, `FractalTree.js:69`) calls
  `ctx.strokeWeight(w)` itself with its own user-tunable "line thickness"
  param — no role awareness anywhere in that chain.
- **Dash has no support at all.** p5 has no native dashed-stroke API; it
  would require reaching into the raw Canvas2D context via
  `p.drawingContext.setLineDash(...)` (p5 exposes this in P2D mode), which
  `P5Adapter` does not currently do.
- The only contained seam that avoids touching all 76 pattern files is
  `P5Adapter` itself (`drawingContext.js`, wrap `stroke()`/`strokeWeight()`
  and add a dash call, keyed off the current layer's role — threading role
  through the same `useCanvas.js` call sites that already feed
  `resolveCanvasColor`). That's only 2-3 files, but **`P5Adapter` is the
  single shared draw context used for every pattern, every lens, and every
  user** — not just the Operation lens. Canvas2D's `setLineDash` state
  persists on the context across draw calls unless explicitly reset per
  shape; getting that reset wrong doesn't just mis-render the operation
  lens, it can leak dashes/weights into unrelated draws across the whole
  canvas. That is exactly the "deep/risky change to shared rendering with
  real regression surface" the slice instructions say not to attempt
  unattended.
- **Export is confirmed to be a fully separate code path**
  (`src/lib/svgExport.js` imports `resolveExportColor` directly, never
  `resolveCanvasColor`/`useCanvas.js`/`P5Adapter`, and serializes from cached
  pattern instances with each pattern's own stroke-width param) — so a
  `P5Adapter`-only change would be preview-only and could not corrupt
  exported file geometry. That derisks the *export-safety* concern but not
  the *shared-render-regression* concern above.
- No existing tests assert on-screen stroke width or dash (the tests that do
  assert exact `strokeWeight` values, e.g. `CirclePacking.test.js`,
  `GrainField.test.js`, `PhyllotaxisDash.test.js`, `Dendrite.test.js`,
  `Feather.test.js`, `drawingContext.test.js`, all go through
  `RecordingContext`, a separate adapter from `P5Adapter` — a `P5Adapter`
  change wouldn't trip them, which also means no regression safety net
  exists for this seam today).

**Decision:** defer. Write this ticket instead of implementing unattended.

**Ticket — "Non-color-only cut/engrave encoding in the Operation lens (D14)":**
- **Why it matters:** laser safety (mistaking a cut op for an engrave op is
  dangerous) + colorblind accessibility. Currently the Operation lens is
  color-only.
- **Where:** `src/lib/patterns/drawingContext.js` (`P5Adapter`, the shared
  p5 draw context — likely around its `stroke()`/`strokeWeight()` wrapper
  methods), `src/lib/useCanvas.js` (the 6 `resolveCanvasColor` call sites,
  to also thread the resolved role through to `P5Adapter`), possibly
  `src/lib/materialPreview.js` (if role resolution needs a sibling
  `resolveCanvasStrokeStyle`-style helper colocated with
  `resolveCanvasColor`).
- **Recommended shape:** a role→{widthMultiplier, dash} mapping (e.g. cut =
  solid + heavier, engrave = lighter/dashed — pick a laser-convention-
  sensible mapping and leave a `// TODO(user): confirm cut/engrave
  weight+dash convention` note per the slice brief), applied ONLY inside
  `P5Adapter` (never in `RecordingContext` or the export path), active only
  while the Operation lens is the active mode, with an explicit
  dash-state-reset at the start of every shape/path draw so Canvas2D's
  persistent `setLineDash` never leaks between layers/patterns.
- **Why deferred, not built:** the only contained seam sits inside the one
  shared draw context every render (every lens, every pattern, every user)
  goes through. A per-shape dash-state-reset bug there has app-wide
  regression surface, and no existing test suite currently exercises
  `P5Adapter` stroke calls directly (only the separate `RecordingContext`
  path is asserted on) — so a mistake here would ship silently. Needs a
  human review pass (ideally with a new `P5Adapter`-level test harness
  asserting stroke calls, not just `RecordingContext`) before landing.
- **Scope note:** this is a safety/a11y fix, not guest-only — once built it
  should apply to ALL users' Operation lens, not gated behind
  `isGuest`.

---

## S5 — Part A shipped

Guest Operation-lens discoverability tip (D13, D17): a dismissable callout
near `ColorViewControl` that appears once the "Choose your naqsheh" chooser
is dismissed (deliberately sequenced — showing chooser + drag-me cue + lens
tip all at once on landing would be the front-loading D17 warns against),
retires itself the moment a guest engages the Operation/Material switch
(hooked at the `onSetMode` call site in `Studio.jsx`, not by diffing
`colorView.mode`, since clicking the already-active "Operation" button never
changes the mode value), and fires `ONBOARDING_EVENTS.LENS_OPENED` exactly
once per session. Per-tab sessionStorage via
`src/lib/onboarding/lensTipStore.js` (same guarded shape as
`dismissalStore.js`/`heroCueStore.js` — never a cross-person store, D18).
Signed-in users never see it. See `src/components/onboarding/GuestOnboarding.jsx`,
`src/pages/Studio.jsx` (`handleSetColorViewMode`), and the tests in
`GuestOnboarding.test.jsx` / `StudioRoute.lensTip.test.jsx` /
`lensTipStore.test.js`.
