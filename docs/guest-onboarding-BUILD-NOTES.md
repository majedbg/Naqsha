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

---

## S6 — Part A shipped: modulation nudge (D17a) + activation event (D22)

A dismissable, guest-only nudge fires once the guest has changed **2
DISTINCT param keys** on the currently active seed (the 2nd distinct key
crosses the threshold — a 2nd edit to the SAME key does not), inviting
discovery of modulation. It fires `ONBOARDING_EVENTS.SECOND_PARAM_CHANGE`
(already existed in `telemetry.js` from S1, unused until now) as the D22
activation event, at most once per session
(`src/lib/onboarding/modulationNudgeStore.js`, same guarded sessionStorage +
memory-fallback shape as `lensTipStore.js`/`heroCueStore.js`).

**Observation, not a new write path**: the tracker watches the SAME
`activeLayer` prop Shuffle (S4) already reads (`Studio.jsx` passes
`layers.find((l) => l.id === selectedLayerId) || layers[0]`), diffing it
against a per-seed baseline captured on mount/starter-switch. Every param
edit — drag, arrow-key, direct numeric entry, or a Shuffle re-roll — already
funnels through the same `useLayerParams` `onChange` -> `updateLayer(id,
patch)` path (see `LayerCard.jsx`), so `activeLayer.params` changing is a
sufficient signal; no new hook into the write path was needed. The baseline
resets on `activeLayer.id` change (a starter switch via the chooser always
builds a fresh layer id — `seedDocuments.js`), so distinct-key counting is
scoped per seed, matching the brief's "count unique param keys changed on
the active seed."

**Shuffle counts as edits, deliberately** — a Shuffle click that touches 2+
keys at once can also cross the threshold. This mirrors the existing S4
precedent: HeroDragCue's own comment notes Shuffle-driven hero-param changes
already trigger its aha through the identical params-diffing mechanism,
"no separate aha-reached emit needed" for Shuffle specifically. Treating
Shuffle-driven changes identically here keeps the mental model consistent
across every onboarding surface that watches `params`.

**Copy** (`MODULATION_NUDGE_LINE` in `GuestOnboarding.jsx`, `//
TODO(user): tune nudge copy`): deliberately does NOT use the D17-drafted
"that glow follows your pattern" line — seeds are static in this build
(D9-fallback, confirmed still true by reading `seedDocuments.js`: no
modulation layer is wired), so claiming a live effect would be dishonest.
Rewritten as a discovery invitation instead.

**Placement**: bottom-center of the canvas region (`inset-x-0 mx-auto`,
NOT a `-translate-x-1/2` transform — see the code comment on why: it would
fight the `anim-rise` entrance class's `transform: translateY(...)`
keyframes, which fully replace the element's `transform` and would
permanently clobber a transform-based horizontal center once the animation's
`both` fill-mode holds its end state). This is the one region nothing else
claims — chooser/reopen/Shuffle sit top-left, the lens tip + ColorViewControl
sit bottom-left, the zoom pod sits bottom-right, the laser-only panels-ZIP
export sits top-right. Browser-verified at 1440×900: both bottom tips
(lens tip + modulation nudge) render side-by-side without overlapping.

**Sequencing**: the distinct-key COUNT (and the D22 telemetry) runs
regardless of whether the chooser is still open (matches D2's non-blocking
design — a guest could technically edit params while the chooser floats
open). The visual CARD, however, only appears once the chooser is dismissed
— same front-loading guard S5 already established for the lens tip, so a
guest never sees the chooser + the nudge stacked at once. If the threshold
is crossed while the chooser is still open, the card is queued and appears
the moment the guest dismisses the chooser.

**MODULATION_OPENED**: NOT wired in this slice. Per the ask, "leave that as
a separate later hook if not trivially available." The actual modulation
entry point (`ModulationRail.jsx`, rendered inside `LayerTree.jsx`'s object
tree) is a drag-to-route gesture, not a single click handler analogous to
`ColorViewControl`'s `onSetMode` (which S5 could cleanly wrap) — wiring it
would mean instrumenting `ModulationRail`'s drag-drop completion, a
meaningfully larger and riskier change than this slice's scope. Follow-up
ticket: wire `ONBOARDING_EVENTS.MODULATION_OPENED` at
`ModulationRail`'s drop-completion call site once a maintainer decides
where in that flow "opened" should mean "started dragging" vs. "completed a
route."

See `src/lib/onboarding/modulationNudgeStore.js`,
`src/components/onboarding/GuestOnboarding.jsx`, and the new tests in
`GuestOnboarding.test.jsx` / `modulationNudgeStore.test.js`.

---

## S6 — Part B: reduced-motion / touch / a11y sweep across S2–S6 surfaces

Audited the chooser (S2), HeroDragCue (S3), Shuffle (S4), the lens tip (S5),
and the new modulation nudge (S6). Findings:

- **Reduced motion**: the chooser card and lens tip (S2/S5) have NO entrance
  animation at all today — nothing to guard, confirmed by reading
  `GuestOnboarding.jsx` (no `anim-*` class on either). HeroDragCue (S3)
  already branches correctly in JS (`prefersReducedMotion()` ->
  static ring, not a hidden one, existing test coverage). The new S6 nudge
  reuses the existing `.anim-rise` utility (`src/index.css`), whose duration
  is driven by the `--motion-*` CSS custom properties in
  `src/styles/tokens.css`, which collapse to `0ms` under `prefers-reduced-
  motion: reduce` — the SAME mechanism already used by the gallery cards,
  the pattern-picker panel fade, and `ModulationParamBox`'s own reveal
  (`naqsha-reveal-rows`). No new CSS or JS branch was needed; added a test
  that mocks `matchMedia` and confirms the nudge still renders correctly
  under reduced motion (the actual 0ms collapse isn't independently
  observable from jsdom, which never runs real CSS animations — this is a
  known limitation shared by every other reduced-motion test in this
  codebase for token-driven, non-looping entrances).
- **Touch targets — fixed inline**: the "?" reopen affordance and Shuffle
  button were 28px (`h-7`/`w-7`), and the three × dismiss buttons (chooser
  skip, lens tip, new nudge) were 20px (`h-5`/`w-5`) — below the ~40px
  guidance. Bumped to 32px (`h-8`/`w-8`) and 24px (`h-6`/`w-6`) respectively
  — a partial, pragmatic fix, NOT full 40px compliance. **Follow-up, not
  fixed**: going to a literal 40px would visually clash with the rest of the
  app's much denser controls (e.g. `ColorViewControl`'s own swatch/toggle
  buttons run 16-20px — untouched here, out of scope per D13 "surface the
  existing lens... don't rebuild it"). Full 40px compliance needs an
  app-wide density decision, not a guest-onboarding-only patch.
- **Keyboard**: chooser starter cards, Shuffle (button + `S` shortcut),
  every dismiss ×, and the hero param slider are all real `<button>` /
  native `<input type="range">` elements — confirmed the Slider primitive
  (`src/components/ui/Slider.jsx`) is a native range input under a styled
  overlay, so keyboard operability (arrows/Home/End) was already free.
  Focus visibility is handled globally (`:focus-visible { outline: 2px
  solid var(--violet) }` in `src/index.css`), so no per-component fix was
  needed.
- **Escape — inconsistency found, NOT fixed (documented)**: only the
  chooser (S2) dismisses on `Escape` (a scoped document-level listener with
  `stopPropagation`, added deliberately to avoid colliding with Studio's own
  Escape handling, e.g. armed-placement cancel). The lens tip (S5) and the
  new S6 nudge are click-only (×). Adding Escape to them would be a small
  diff, but touching `ModulationRail`/Studio's broader Escape surface
  unattended risks swallowing an Escape meant for something else (the exact
  risk the chooser's own comment calls out) — deferred rather than guessed
  at. Follow-up: if a maintainer wants full Escape consistency, the lens tip
  and nudge are naturally mutually exclusive with the chooser (never visible
  at the same time), so adding `stopPropagation`-guarded Escape handlers to
  each independently should be safe to layer in later with a human review
  pass.
- **Touch/iPad + Inspector dock overlap — verified via code, not a live
  portrait viewport**: confirmed by reading `AppShell.jsx` that the bottom
  Inspector dock (`useInspectorDock`, portrait/iPad default) renders as a
  full-width flex row BELOW the canvas region, not an absolute overlay on
  top of it — so it shrinks the canvas vertically but cannot cover any
  onboarding surface (all of which are `absolute`-positioned INSIDE the
  canvas container, corner-anchored, and will simply have less room, not
  overlap). Not visually verified in a live portrait/iPad-shaped viewport
  (this slice's required browser-verify pass was 1440×900 landscape only,
  same unverified-device caveat as D19's iPad-perf gap) — flagging for a
  future pass with an iPad-shaped resize.
- Tap target sizing on `StarterCard` (the three chooser cards themselves,
  S2) is already generous (full-width flex cards, comfortably >40px tall) —
  no change needed there.

No test was weakened; 14 new tests added (4 store + 10 component,
including the reduced-motion render test above), `npm test` stayed at
4724 passed / 54 skipped (up from 4710/54, skip count unchanged).
