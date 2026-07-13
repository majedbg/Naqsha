# Guest Onboarding — Build Notes

Stop-and-document log per D29 / HARD GUARDRAILS. One entry per human-gated,
deferred, or otherwise noteworthy build decision. Companion docs:
`guest-onboarding-DECISIONS.md` (locked decisions), `guest-onboarding-BUILD-BRIEF.md`
(build plan).

---

## FIX 1 — live-drag "morph" latency: FIXED (rAF-coalesced adaptive render, replaces the 150ms debounce)

**Status:** FIXED + browser-verified (prod build). Was the OVERVIEW §7 item 1 fast-follow —
the highest-value one.

**The bug:** param edits rode a fixed 150ms `setTimeout` debounce in `useCanvas.js`
(~L549-563), keyed on `[layers, …]`. During a fast CONTINUOUS mouse-drag `layers`
changes faster than 150ms, so the timer kept resetting and `renderAll` fired ZERO times
until motion paused — the canvas looked frozen then snapped to the final frame. (Arrow
keys / Shuffle updated live because they're discrete.) This sat directly under the
onboarding "watch the art update live" promise. Note: P0-B's earlier "60fps during a
continuous drag" reading was a FALSE positive — it measured idle input handling on a
canvas that wasn't actually re-rendering.

**The fix:** a new `src/lib/adaptiveRenderScheduler.js` — `createAdaptiveRenderScheduler()`
— replaces the debounce. It **coalesces renders to at most one per animation frame** (rAF)
so a drag morphs live while cadence stays capped, and **measures each render's cost**; after
a short streak (2, not a single spike — hysteresis so one GC pause can't strand the rest of
a drag) of over-budget renders it **backs off to the 150ms debounce** for that heavy config,
restoring the live path the instant a render comes back under budget. A pending frame is
NOT cancelled by later `schedule()` calls (that would recreate the never-renders-mid-drag
bug) — it keeps the latest closure and fires; the last change before drag-end schedules the
trailing settle render. All timer/clock primitives are injected → fully unit-tested with a
hand-driven mocked rAF+timer queue (mirrors `useFrameStats`).

- `useCanvas.js`: the `[layers, …]` debounce effect now calls `scheduler.schedule(render)`
  (no per-change cleanup-cancel — that would refire the bug); a dedicated empty-dep effect
  cancels only on UNMOUNT. The separate rAF-throttled TRANSFORM path (node drag/resize/
  rotate, `[transforms, selectedNodeId]`) is UNTOUCHED. The async Etch repaint
  (`renderAllRef`) is untouched. **SVG export is unaffected** — it reads cached
  `patternInstances` built inside `renderAll`; only the scheduling of `renderAll` changed,
  not its content, and a coalesced render is never MORE stale than the old 150ms debounce.

**Threshold = 33ms, anchored to the documented 30fps workshop-iPad floor (D19)** — one frame
at 30fps. Policy: render every frame while we can hold ≥30fps; back off only when a render
can't sustain the floor. A tighter 16ms (one 60fps frame) would silently snap-to-final any
seed rendering in the 16–33ms band — which on a slow device could be a curated default seed
itself (the false-negative the adversarial reviewer/advisor flagged). Because the decision is
per-measured-cost, the scheduler self-adapts to the actual device: a render that's cheap on
desktop but 40ms on an iPad backs off THERE, correctly.

**Liveness measured DIRECTLY (renders-during-drag), not just fps** (the P0-B trap): a
24-step continuous drag (one param change per animation frame) on each seed's HERO control,
counting how many times `renderAll` actually fired (a `?fps=1` diagnostic seam publishes
render cost + a monotonic render counter to `window.__naqshaRenderStats`, wired ONLY under
`?fps=1`).

| seed (default) | hero control | render cost (prod) | renders / 24-step drag | mode | verdict |
|---|---|---|---|---|---|
| **Phyllotaxis** | Divergence Angle / Size | **1.5–4.4 ms** | **24 / 24** (~56/s) | live | ✅ morphs live @ 60fps (overlay: `60 fps · avg 16.6ms · max 17.6ms`) |
| **Recursive** | Scale Factor | **0.4–2.7 ms** | **24 / 24** (~55/s) | live | ✅ morphs live |
| **Topographic** | Zoom / Feature Size (noiseScale) | 17–72 ms (52 ms baseline) | 9 / 24 (~7/s) | backoff (partial) | ◑ genuinely too heavy for full 60fps live morph; degrades gracefully — still far better than the old snap-to-1 |
| **Topographic, Levels→max** (heavy stress) | — | 150–172 ms | ~2 (guard) | backoff | ✅ adaptive guard: renders ~twice, NOT 24×170ms of blocking jank |

Dev-build numbers (Vite dev) ran 2–4× heavier as expected (Phyllotaxis ~2–3ms, Recursive
~11ms, Topographic ~52–60ms) — recorded here so the prod/dev gap is explicit; prod is the
source of truth. Internal `now()`-around-`renderAll` (JS + canvas-command-submit) reads a
touch lower than the `?fps=1` overlay (true frame time) — fine for triggering backoff,
where generate cost dominates.

**BEFORE (150ms debounce):** every seed rendered 0–1 frames during a continuous drag, then
snapped to the final frame. **AFTER:** Phyllotaxis + Recursive (incl. the default landing
seed) morph fully live at 60fps; Topographic is no worse than before and backs off safely
(never janks). No dropped frames on the live path.

**Adaptive fallback rationale:** heavy configs (the Count/particle controls reach ~5000, and
Topographic's default marching-squares generate is intrinsically ~50ms) would jank if
rendered every frame; the 150ms debounce was the one thing protecting them. The scheduler
KEEPS that protection but only engages it when a render is actually measured heavy, so light
configs are no longer needlessly throttled.

**Product follow-up (not a code fix):** Topographic's curated default (Resolution 160 /
Levels 16) is heavy enough (~52ms prod) that it backs off rather than morphing live. If live
morph on Topographic's "drag me" is desired, LIGHTEN the seed (e.g. Resolution 160→~120,
Levels 16→~12) in `seedDocuments.js` (already marked `// TODO(user): tune`) — an aesthetic
decision left to the user, not changed here.

**Tests:** `adaptiveRenderScheduler.test.js` (10: coalescing / multi-frame liveness /
trailing-settle / cancel / cheap-stays-live / single-spike-tolerated / streak-backoff /
heavy-debounce-during-motion / restore-live / onMeasure). Existing `useCanvas.*` tests
(which await renders via `waitFor`, not hardcoded 150ms advances) stay green. Full suite
green, no test weakened.

---

## FIX 2 — P0-C "New session" reload race: CLOSED (synchronous document flush)

**Status:** FIXED + browser-verified. Was the OVERVIEW §7 item 2 fast-follow.

**The bug (repro):** guests DO persist locally (`tierLimits.js` `guest.localStorage:true`),
so a guest's edits ride the 3s-debounced `sonoform-layers` autosave (`useLayers.js`
~L294-325). "New session / hand to next person" loaded the default seed into React
state via `loadDocumentLayers` but performed NO synchronous localStorage write, so a
`location.reload()` within ~3s tore down the context before the debounce fired and the
**previous attendee's document leaked back**. Repro: plant a prior doc → New session →
reload within ~1s → prior doc reappears.

**The fix:** make the reset persist the document-being-loaded **synchronously**, and
reset ALL sibling state so any later debounce write is byte-identical.
- `useLayers.js` — new module fn **`persistDocumentSnapshotNow({layers, customGlyphs,
  bgColor, optimizations})`**: writes `sonoform-layers` + `sonoform-panels` +
  `sonoform-custom-glyphs` + `sonoform-optimizations` + `sonoform-bg-color` together,
  using `normalizePanels(null, layers)` to seed a fresh Panel 1 and pin the seed
  layer's `panelId` to it (no orphaned/dangling panelId — the HARD hazard). Returns the
  normalized snapshot.
- `useLayers.js` — new hook method **`resetDocument(layers, customGlyphs, optimizations)`**:
  (1) `clearTimeout(saveTimer.current)` so the PRE-EXISTING pending debounce (a stale
  closure over the previous attendee's state) can't fire after the synchronous write and
  clobber it; (2) normalizes ONCE via `persistDocumentSnapshotNow` and uses that SAME
  snapshot for both disk and in-memory `setLayers`/`setPanels`/`setCustomGlyphs`/
  `setBgColor` (genuinely byte-identical memory↔disk — a naive second normalize would
  mint a different Panel-1 id for disk; caught by the adversarial reviewer and fixed).
- `Studio.jsx` — `handleOnboardingNewSession(seedDoc)` now: drops undo history
  (`historyRef.clear()`), resets the optimize hook to "none applied" (`hydrateOptimizations()`
  — that state lives in `useOptimizations`, not `useLayers`), calls
  `resetDocument(seedDoc, {}, serializeApplied(hydrateApplied()))` (the passed opts blob
  exactly matches what the rescheduled debounce emits post-`hydrateOptimizations`), and
  resyncs `lensTipUsed`.
- `GuestOnboarding.jsx` — the reset builds the default seed doc ONCE and routes it through
  `onNewSession(doc)` (Studio owns the full reset) instead of the starter-card
  `onLoadSeed` path, so persisted layers match the layers loaded into state (no id drift).

**Scope safety:** `resetDocument` is used ONLY by the New-session path; share-link / cloud /
draft / example loads still go through `loadDocumentLayers`→`loadLayerSet` untouched (they
carry their own panels/glyphs — reseeding them would be a regression, deliberately avoided).

**Why not `removeItem`:** a bare `removeItem('sonoform-layers')` would orphan the sibling
keys against a now-deleted doc (dangling panelId etc.). The fix writes a mutually-consistent
single-seed snapshot to every key instead.

**Regression tests (leak reproduced then closed):**
- `StudioRoute.newSession.test.jsx` — plants a rich previous-attendee doc (2 named panels,
  a custom glyph, an APPLIED optimization, a custom bg), renders Studio as guest, confirms
  New session, and asserts RIGHT AWAY (no timer advanced) that every key already holds the
  fresh consistent default seed (no orphaned panelId, no leaked glyphs/opts, bg reset). A
  second test advances timers 3500ms and re-asserts consistency AND that the panel/layer ids
  are unchanged (guards the memory↔disk divergence the reviewer found).
- `useLayers.newSession.test.js` — unit contract for `persistDocumentSnapshotNow`.
- `GuestOnboarding.test.jsx` — updated: reset now hands the seed to `onNewSession`, not
  `onLoadSeed`.

**Browser-verified** (Chromium, 1440×900, guest): planted a voronoi prior doc → reloaded
(app loaded it) → New session + confirm → localStorage synchronously held the phyllotaxis
seed (consistent panels, glyphs `{}`, none-applied opts, default bg) → reload-immediately
loaded the phyllotaxis seed, no voronoi leak. `npm test`: full suite green, no test weakened.

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

---

## P0-B — live-drag performance (D19): measured, no coalescing added

**Investigated first, per the slice instructions, before building anything.**

**(A) Is 3D/bloom mounted on the guest landing?** No — confirmed **NOT
mounted by default; strictly opt-in**, so "defer 3D/bloom until after the
first aha" (D19) is **already true by construction**. No machinery was built
to enforce it.
- `<Canvas>` (`@react-three/fiber`) renders in `src/components/canvas3d/Scene3D.jsx:361`.
- It's gated at `src/components/RightPanel.jsx:950`:
  `{threeDMode !== "off" && <Canvas3DHost>...}` — `threeDMode` defaults to
  `"off"` (`RightPanel.jsx:105`), sourced from `Studio.jsx:1927`'s
  `threeD.subMode`, whose reducer initializes to `'off'`
  (`src/lib/three3d/subModeReducer.js:29-30`).
- It only flips on via a direct user click: `ColorViewControl.jsx:221`
  (`onClick={() => (threeDActive ? onExit3D() : onEnter3D())}`) calling
  `use3DLensEntry.enter3D` (`src/lib/three3d/use3DLensEntry.js:37-40`).
- `Canvas3DHost` additionally `lazy(() => import('./Scene3D.jsx'))`s the
  whole three.js chunk (`Canvas3DHost.jsx:7`), so it isn't even in the
  initial JS bundle for a guest who never opens the 3D lens.
- Bloom (`EmissiveBloom`, wrapping `@react-three/postprocessing`) renders
  inside that same `<Canvas>` tree at `Scene3D.jsx:463-469`
  (`{bloomActive && <EmissiveBloom .../>}`), with its own additional
  on-demand gate (`bloomActive`, `Scene3D.jsx:104-112,244`) — "the default
  Surface-A view runs with zero post-processing" (comment, `Scene3D.jsx:458-462`).

**(B) Does the param-drag path already coalesce?** Yes — **a 150ms
`setTimeout` debounce already exists**, so no second coalescing layer was
added.
- Slider drag → `Slider.jsx:283` `onChange` → `updateLayer`
  (`useLayers.js:636-652`) → `setLayers`, synchronously per event.
- Recompute is debounced in `src/lib/useCanvas.js:549-563` ("Debounced
  re-render on layer changes", `setTimeout(..., 150)`), keyed on
  `[layers, canvasW, canvasH, bgColor, renderAll]`.
- A **separate** rAF-throttled immediate-render path exists
  (`useCanvas.js:565-588`) but is explicitly scoped to `[transforms,
  selectedNodeId]` only — i.e. node drag/resize/rotate, not param edits; the
  comment at lines 566-568/582-586 spells out that param edits deliberately
  stay on the 150ms debounce and must not leak into this path. This is a
  *different* concern from the slider-drag path measured here.

**Frame-time / FPS readout built (D19 instrument):**
- `src/lib/onboarding/useFrameStats.js` — `useFrameStats(enabled)` hook;
  runs an rAF loop only while `enabled`, accumulates frame deltas, and
  publishes a windowed `{ fps, avgFrameMs, maxFrameMs, samples }` snapshot
  every 500ms of measured frame time. `computeFrameStats(deltas)` is a pure
  function (no DOM/timers) so the fps math is unit-tested directly; the rAF
  loop itself is tested with a mocked `requestAnimationFrame`/
  `cancelAnimationFrame` queue driven by hand via `renderHook` + `act`.
- `src/lib/onboarding/frameStatsFlag.js` — `isFrameStatsEnabled(search)`,
  a pure query-string check for `?fps=1`.
- `src/components/onboarding/FrameStatsOverlay.jsx` — tiny fixed
  top-right badge (`data-testid="frame-stats-overlay"`), renders `null` and
  schedules **no rAF at all** when disabled, so mounting it unconditionally
  in `Studio.jsx` (not guest-gated — it's a measurement instrument, not part
  of the onboarding UX) costs nothing for the default case.
- **How to enable:** open the app with `?fps=1` in the URL, e.g.
  `http://localhost:5173/?fps=1`. Deliberately query-param-only rather than
  a `DEV` env check, so it's off by default for *everyone* — guests, devs,
  prod — until someone deliberately opts in, in dev or prod builds alike
  (satisfies "do NOT show it to normal users... by default" without relying
  on build mode).
- Tests: `useFrameStats.test.js` (9 cases: pure-math edge cases + hook
  rAF-scheduling/reset behavior), `frameStatsFlag.test.js` (6 cases),
  `FrameStatsOverlay.test.jsx` (2 cases) — 17 new tests total.

**Measured desktop drag (Playwright, Chromium, 1440×900, `localhost:5173/?fps=1`):**

First attempt was flawed and got corrected before writing this up (caught by
an advisor review before committing — worth recording so the methodology is
trusted). A continuous mouse drag at a ~16ms step cadence read a sustained
"60fps" throughout, but that number is a false positive for the thing D19
actually cares about: `useCanvas.js`'s debounce (finding B) resets on every
`layers` change, and a 16ms-cadence drag fires a new change *faster than the
150ms debounce window*, so `renderAll` — the actual expensive p5 recompute —
never fires **during** a fast continuous drag at all, only once ~150ms after
the last move. The continuous-drag "60fps" was measuring React's input
handling on an otherwise-idle canvas, not the recompute cost. (Confirmed
directly: mid-drag the Divergence Angle readout doesn't reflect the
in-flight position because a full-circle sweep returns to its start angle —
not decisive on its own, which is exactly why the follow-up test below uses
discrete, held positions instead.)

**Corrected measurement:** discrete stepped moves on the same Divergence
Angle dial, each followed by a >150ms hold (mouse still down, no further
movement) so the debounce actually fires and `renderAll` runs for real,
sampled after each hold:

| step | angle after move | fps | avg frame | max frame |
|---|---|---|---|---|
| (idle baseline, before any move) | 100.00° | 60 | 16.7ms | 18.7ms |
| 1 | 100.00° | 60 | 16.7ms | 18.6ms |
| 2 | 170.00° | 60 | 16.7ms | 17.8ms |
| 3 | 170.00° | 60 | 16.7ms | 18.8ms |
| 4 | 100.00° | 60 | 16.7ms | 18.4ms |
| 5 | 135.00° | 60 | 16.7ms | 18.5ms |
| (after release, +700ms) | 135.00° | 60 | 16.6ms | 18.3ms |

Each step's angle reading changed (confirming a real recompute fired, not a
no-op), and the canvas visibly redrew a different pattern each time
(screenshotted at 135° — an 8-arm starburst, distinct from the 100°/170°
frames). `maxFrameMs` — an exact max over the sample window, not an average,
so a single slow recompute frame would show up directly — never exceeded
18.8ms across five real, isolated recomputes, statistically indistinguishable
from the 18.7ms idle baseline. The curated Phyllotaxis seed (count=500) fits
its full recompute + p5 redraw inside a single frame's budget with room to
spare; there is no dropped-frame stall to fix.

**Result: no dropped frames under either methodology**, and the corrected
methodology is the one that actually exercises the recompute path D19 is
worried about. Nowhere near the "50% below budget" trigger the brief sets
for adding coalescing.

**Two things this measurement does NOT establish, worth being explicit
about:**
- **The debounce is a latency property, not an fps one.** During a smooth
  continuous drag the canvas renders **zero times** until motion pauses,
  then fires once ~150ms later — a fast dial sweep looks frozen and snaps to
  the final frame on release, it does not visually morph mid-sweep (unlike
  the arrow-key path, which updates on every discrete keypress and *does*
  read as live). That sits directly under the "the art updates live" cue in
  the drag-me copy. This is real but is a UX/latency question, not the
  fps/jank question D19 asks P0-B to answer — flagging as a candidate
  fast-follow, not fixing it here (see below).
- **Only the default seed (Phyllotaxis, count=500) was measured, and it's
  cheap** — the idle baseline itself already reads ~18.7ms, so the
  recompute's marginal cost on top of that is close to zero. Recursive and
  Topographic weren't measured, and the Count × Spacing control goes up to
  5000. The 150ms debounce is exactly what protects those heavier
  configurations from a redraw-every-frame cost — this, not "phyllotaxis
  happens to be cheap," is the real reason not to add rAF-coalescing on top
  of it unattended: doing so would remove the one thing standing between a
  high-count drag and a genuinely janky recompute-every-16ms loop, on a
  shared render pipeline this slice is explicitly scoped to leave alone.

**Decision: no rAF-coalescing added.** Per the slice instructions
("IF drag is already smooth... do NOT add coalescing"): both conditions for
skipping applied — coalescing already exists (the 150ms debounce, finding
B) AND the measurement showed no perf gap to fix. Building a second
coalescing layer on top of an already-smooth, already-debounced path would
be speculative complexity with no evidence behind it — exactly what this
slice's "measure first" framing warns against.

**iPad / on-device: UNVERIFIED.** No physical iPad was available in this
session (per D19's explicit fallback). Desktop Chromium numbers above are
recorded; the `?fps=1` overlay is the durable instrument for a human to
repeat this same measurement on a real workshop iPad later — flagging this
here rather than claiming iPad parity.

**Files added:** `src/lib/onboarding/useFrameStats.js` (+test),
`src/lib/onboarding/frameStatsFlag.js` (+test),
`src/components/onboarding/FrameStatsOverlay.jsx` (+test). **Files
modified:** `src/pages/Studio.jsx` (mounts `<FrameStatsOverlay />` inside
the canvas region, alongside `<GuestOnboarding />`). No P0/DB/auth files
touched; `PatternPickerModal`/`MobileStudio` untouched.

`npm test`: 4761 passed / 54 skipped (up from 4744/54 baseline; +17 new
tests, skip count unchanged, no existing test weakened).
