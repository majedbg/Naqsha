# Guest Onboarding — Engineer Overview (read this first)

**A ~10-minute orientation** to the guest first-run onboarding: what it does, how the
code is laid out, the decisions and why they were made, and why the shape follows
onboarding best practice. Deeper companions in this folder: `-DECISIONS.md` (all 29
locked decisions D1–D29), `-BUILD-BRIEF.md` (build plan), `-synthesis.md` (research +
expert UX review), `-BUILD-NOTES.md` (per-slice build log + deferred tickets).

> Status: built on branch `feat/guest-onboarding` (isolated worktree), TDD, **4761 tests
> pass / 54 skipped**. Not merged, not pushed. Seeds are **static** (live modulation is
> slice S7, not yet built). Two open items flagged at the end.

---

## 1. What it is (the one-paragraph version)

Sonoform/Naqsha is a browser generative-art → laser/pen studio; guests use it with **no
account**. Before this, a guest landed on a random blank-ish default and had to figure it
out. This feature gives them a **minimal, non-blocking first run**: they land on a
beautiful live pattern, a "Choose your naqsheh" card lets them pick one of **three
starter seeds** (Pokémon-starter style), a single **"drag me"** cue gets them to the
"aha" (change a parameter → the art changes), and a few **contextual, one-at-a-time**
nudges introduce the ideas that make the tool special (modulation; that it exports a real
fabrication file). Nothing blocks exploration; everything is dismissable and re-openable.

The design spine is **Land → Play → Prove**: land on something alive (never a blank
canvas), play until the aha, prove it's a real fabrication tool — with account creation
deferred until there's something worth saving.

---

## 2. The flow (what the guest actually experiences)

```
GUEST OPENS APP  (no account, tier = 'guest')
   │
   ▼
① LAND ── canvas already shows the Phyllotaxis seed, alive.
   │        A floating "Choose your naqsheh" card sits over it (NON-blocking —
   │        you can pan/zoom/edit behind it). Confidence line:
   │        "This is your naqsheh — the sheet the machine weaves. Nudge
   │         anything; ⌘Z undoes it. You can't break it."
   │
   ├─▶ pick a starter card ──▶ canvas swaps to Recursive / Topographic
   │                            (chooser closes; STARTER_SELECTED emitted)
   └─▶ dismiss (×) or ignore ─▶ keep Phyllotaxis
   │        A persistent "?" affordance can re-open the chooser anytime (D4).
   │
   ▼
② PLAY ── a "drag me" cue points at the seed's hero control
   │        (Phyllotaxis→Divergence Angle, Recursive→Scale Factor,
   │         Topographic→Terrain zoom). First param change = the AHA;
   │        the cue retires itself. (reduced-motion → static ring; keyboard/touch safe)
   │
   ├─▶ "Surprise me" / press S ─▶ re-rolls the seed's params WITHIN the curated
   │                              golden band (always pretty; starter unchanged)
   │
   ├─▶ open the Operation lens ─▶ a one-time tip near it retires
   │        (the "this is a real cut/engrave file, not a picture" moment)
   │
   └─▶ change a 2ND distinct param ─▶ modulation nudge appears (bottom-center),
            inviting discovery of modulation. This is the ACTIVATION EVENT.
            (mutually exclusive with the lens tip — never two tips at once)
   │
   ▼
③ PROVE ── (mostly fast-follow) the lens already shows cut vs engrave; signup is
            deferred to export/save; guest work should survive account creation.
```

Two guardrails run through all of it: **surfaces are shown one at a time** (never
front-loaded together — that's tour fatigue), and **everything is dismissable + re-openable**.

**Shared-machine reset:** a **"New session / hand to next person"** control wipes the
per-tab onboarding state and reloads the default seed for the next workshop attendee.

---

## 3. Code map

All new code lives under `src/lib/onboarding/` (logic, unit-tested) and
`src/components/onboarding/` (UI). Integration touches only `Studio.jsx` and `useLayers.js`.

| File | Responsibility |
|------|----------------|
| `lib/onboarding/seedDocuments.js` | The three curated starter seeds as **real app layer documents** (built on `createLayer`, role forced to `engrave`, fixed `seed` for a deterministic frame). Exports `getSeedDocument(key)`, `DEFAULT_SEED_KEY`, `SEED_KEYS`, and `SEED_HERO_RANGES` (the golden bands). |
| `lib/onboarding/shuffle.js` | `shuffleSeedParams` — re-rolls the active seed's params **within its golden band**, honoring `RANDOMIZE_EXCLUDED_KEYS`. Never switches starter. |
| `lib/onboarding/dismissalStore.js` | Chooser dismissed flag. **Per-tab sessionStorage + in-memory fallback, never a cross-person store** (D18). |
| `lib/onboarding/heroCueStore.js` | "drag me" cue seen-state (same guarded shape). |
| `lib/onboarding/lensTipStore.js` | Operation-lens tip seen-state. |
| `lib/onboarding/modulationNudgeStore.js` | Modulation-nudge seen-state + distinct-param baseline. |
| `lib/onboarding/session.js` | `resetAllOnboarding()` — the "New session" wipe of every store. |
| `lib/onboarding/telemetry.js` | `ONBOARDING_EVENTS` + `emitOnboardingEvent` — a **thin, swappable sink** (dev-console today, `analytics.track` later) that **never throws**. Activation event = `SECOND_PARAM_CHANGE`. |
| `lib/onboarding/useFrameStats.js` + `frameStatsFlag.js` | Frame-time/FPS instrument, opt-in via `?fps=1`. Costs nothing when off. |
| `components/onboarding/GuestOnboarding.jsx` | **The single owner** of the whole guest UX: chooser card, confidence line, "?" reopen, drag-me cue, Shuffle button, lens tip, modulation nudge, and the "New session" confirm dialog. Studio renders one component. |
| `components/onboarding/FrameStatsOverlay.jsx` | The `?fps=1` badge. |

**Integration points (only two files touched):**
- `src/pages/Studio.jsx` — computes `isGuest = !user && tier === 'guest'` (**one place**,
  ~L2073) and gates the whole `GuestOnboarding` render on it; seeds the guest default via
  `useLayers`; `loadDocumentLayers` (~L575) performs starter-swap and New-session reload;
  `handleSetColorViewMode` retires the lens tip; mounts `<GuestOnboarding/>` +
  `<FrameStatsOverlay/>` inside the canvas region.
- `src/lib/useLayers.js` — the guest default-seed branch, and the existing **3s-debounced
  `sonoform-layers` autosave** (~L294) that the P0-C reset interacts with (see §7).

**Nothing else changed.** `PatternPickerModal` and `MobileStudio` are untouched; the
pattern engines in `src/lib/patterns/*` are used as-is (not reimplemented).

### The three seeds (concrete, all editable)
`seedDocuments.js` — landing frames are hand-tuned overrides on top of each pattern's
normal defaults, each marked `// TODO(user): tune`:

| Starter | Character | Hero control (golden band) | Landing frame |
|---------|-----------|----------------------------|---------------|
| **Phyllotaxis** (default) | Organic | `angle` 137.2–137.9° | angle **137.5°** |
| **Recursive** | Geometric | `scaleFactor` 0.62–0.80 | pentagon · rotationPerLevel **36°** · depth **4** · scale **0.71** |
| **Topographic** | Flowing | `noiseScale` 1.6–3.2× | noiseScale **2.4** |

All seeds pin `seed = 42` so every guest sees the identical frame (Topographic's noise
field is seed-derived, so this matters), and force `role: 'engrave'` (honest single-layer
engrave tiles — no fake cut perimeter).

---

## 4. The decisions that matter (and why)

The full set is in `-DECISIONS.md` (D1–D29). The ones that shape the code:

- **Guests only, non-blocking (D1/D2).** Land on a live seed + a *floating* chooser, never
  a modal wall. *Why:* research is consistent — embedded guidance beats blocking modals
  (~1.5× more likely to act); modal walls read as paywalls to exploration.
- **Land on a seed, never blank (D5).** *Why:* the "empty canvas" is where creative-tool
  conversion dies; the first act should be *edit*, not *create-from-nothing*.
- **Curated golden ranges (D7).** The hero control is clamped to a band where *every* value
  looks good. *Why:* parametric sliders pass through ugly mud between good spots — without
  clamping, the second drag can destroy the first impression. This makes the "aha" reliable,
  not lucky.
- **Deterministic landing frame (D8).** Fixed values + fixed `seed`. *Why:* every guest
  gets the same vetted first impression; Shuffle is where randomness enters.
- **Modulation baked in — but static fallback (D9).** Intended: each seed carries a live
  modulation (phyllotaxis→size, recursive→**linear-scale breathing**, topo→warp) so the
  differentiator is *shown, not told*. Reality: modulation is channel-whitelisted by pattern
  type and phyllotaxis isn't even a modulation target, so **v1 ships static seeds** and live
  modulation is slice **S7**. *Why the fallback:* don't block the whole build on the hardest
  slice; ship the aha now.
- **Recursive breathes via linear scale, never warp (D9).** *Why:* warping the vertices
  destroys the crisp geometric character that *is* the pattern; animating the scale factor
  keeps every edge straight.
- **One-at-a-time, fire-on-first-use tips; no checklist (D17).** At most two tips (lens,
  modulation), each triggered *when the guest reaches that surface*, never up front. *Why:*
  progressive tips beat front-loaded ones on every measured outcome; front-loading is tour
  fatigue.
- **Activation = "2nd distinct param change" (D22),** not "first drag." *Why:* it's a
  teaching-true signal that the guest is actually manipulating the tool, not a stray click.
- **"naqsheh" is metaphor copy only (D25).** *Why:* the app already has a locked UI noun
  **"Sheet"** (the physical material); introducing "naqsheh" as a second noun would muddy
  the deliberate domain language. It appears only in the welcome line.
- **Per-tab sessionStorage, never cross-person (D3/D18).** *Why:* a workshop machine is
  shared by many attendees; a reload = "next person," and onboarding state must never persist
  across people.
- **Reuse the existing lens, don't rebuild it (D13); honest engrave-only seeds (D15).**
  *Why:* minimal blast radius, and don't fake a cut the design doesn't have.
- **Isolated worktree, subagents one-at-a-time, TDD, no push (D26–29).** *Why:* the main
  tree had uncommitted work from another feature; isolation + per-slice review + green tests
  is how this repo avoids checkout-races and regressions.

---

## 5. Why this is best practice

Onboarding research (NN/g, Appcues, Chameleon, Growth.Design, product teardowns of Figma /
Canva / Framer / p5.js / Cricut / Glowforge — see `-synthesis.md`) converges on a few
principles, and each maps to something concrete here:

- **"Shortest path to one real action + a result," not a tutorial you watch.** → land on a
  live seed + one "drag me" cue → the aha is a *drag*, in seconds.
- **Kill the empty canvas.** → seeded starter, editable, obviously yours.
- **Time-to-value is the metric; the first ~300s decide conversion.** → nothing gates the
  canvas; the aha is immediate.
- **Embedded > modal; progressive > front-loaded; let them skip.** → floating chooser,
  fire-on-first-use tips shown one at a time, everything dismissable + re-openable.
- **Show the differentiator, don't list features.** → modulation is taught by a contextual
  nudge at the right moment (and, in S7, by a live effect), not a feature tour.
- **Defer signup until there's value to save; never lose in-progress work at the wall**
  (the documented Adobe-Express failure). → signup deferred to export; guest-work-survives-
  signup is a P0 (see §7).
- **De-risk the scary fabrication step** (the maker-tool lesson). → the cut/engrave lens is
  surfaced early and cheaply so "it's a real file" lands without a funnel.

The anti-patterns the research warns about — feature-dump tours, stacked modal walls,
front-loaded coach-mark carousels, unskippable tours, signup-before-value — are all
explicitly avoided.

---

## 6. The four P0 gates (why they exist + status)

These were treated as blocking because each is a way the aha silently fails:

| Gate | Why it's P0 | Status |
|------|-------------|--------|
| **P0-A Guest-work-survives-signup** | Losing a guest's design at the account wall is the #1 documented onboarding killer. | ⚠️ **Verify, not rewrite** — the signed-in *gate* is confirmed single-guard (`Studio.jsx:2073`); the guest→signup *carry-through* is **not yet verified**. Open. |
| **P0-B Live-drag performance** | A janky morph kills the exact moment the plan rests on. | ✅ Measured on desktop (no dropped frames; 3D/bloom confirmed **deferred by construction** — not mounted until the guest opens the 3D lens). `?fps=1` instrument shipped. **iPad unverified** (no device). |
| **P0-C Shared-machine re-fire** | A workshop machine is shared; state must not leak between attendees. | ✅ "New session" reset + per-tab sessionStorage shipped — **but a narrow reload-race remains** (see §7). |
| **P0-D Touch / a11y** | Workshops run on iPads; color-only cut/engrave is a laser *safety* miss. | ◑ Partial: keyboard/focus/reduced-motion handled; touch targets bumped (not full 40px); **non-color-only cut/engrave encoding deferred** (safety-critical, needs review — see §7). |

---

## 7. Open items / fast-follows (start here to finish it)

Ranked by impact:

1. **Live-drag "morph" latency (highest-value decision).** Param edits ride a **150ms
   debounce** (`useCanvas.js`), so a *fast continuous mouse-drag renders zero frames until
   you pause*, then snaps to the final frame — it doesn't visibly morph mid-drag (arrow-keys
   and Shuffle *do* update live). That sits directly under the "watch the art update live"
   promise. Not a jank problem (P0-B is clean) — a UX/latency one. **Needs a product decision**
   before it's the right aha. Fixing it means touching the shared render debounce carefully.
2. **P0-C reload race.** "New session" resets React state synchronously, but the protecting
   `sonoform-layers` write is 3s-debounced, and `location.reload()` within ~3s loses it → the
   previous attendee's doc can leak back. Narrow (New session already re-shows the chooser
   in-memory, so a reload usually isn't needed) but real. **Fix direction:** make a document
   *load* persist synchronously (it's a discrete event, unlike a drag), or add a `beforeunload`
   flush. *Do not* just `removeItem('sonoform-layers')` — it orphans `sonoform-panels`/
   `-custom-glyphs`/`-optimizations`.
3. **S7 — live seed modulation.** Wire phyllotaxis→size, recursive→linear-scale breathing,
   topo→warp using the real modulation system. Until then seeds are static and the nudge copy
   is honestly written to *invite* modulation rather than claim a running effect.
4. **P0-A verification.** Exercise the existing `guestSave`/`draftRecovery` path end-to-end
   through account creation; add a regression test + a "your work is safe" line at the auth
   prompt. If it fails → it's ticket #1 (do not rewrite auth blind).
5. **Non-color-only cut/engrave encoding (D14, safety/a11y).** The only clean seam is the
   shared p5 draw context (`drawingContext.js` `P5Adapter`) — genuinely risky unattended
   (Canvas2D dash state leaks across draws); needs a human pass with a `P5Adapter`-level test.
   This is app-wide, not guest-only.
6. Smaller: `MODULATION_OPENED` telemetry (drag-to-route, no clean click seam yet), Escape on
   the two tips, full 40px touch targets (needs an app-wide density decision).

---

## 8. How to run, verify, extend

- **Run:** dev server as usual; open as a **guest** (logged out) to see it. Logged-in users
  see nothing (single guard, `Studio.jsx:2073`).
- **Perf overlay:** append `?fps=1` to the URL for a live frame-time badge (off for everyone
  otherwise). Use it to repeat the P0-B measurement on a real iPad.
- **Tests:** `npm test` (vitest). Every logic module has a colocated `*.test.js`; component
  behavior is in `GuestOnboarding.test.jsx` + `StudioRoute.*` integration tests. Skip
  `test:rls` (needs a live DB). Baseline: 4761 pass / 54 skip.
- **Tune the seeds:** edit the landing-frame constants + `SEED_HERO_RANGES` in
  `seedDocuments.js` (all marked `// TODO(user): tune`). Add/replace a starter = add a key to
  `SEED_LANDING_PARAMS` + `SEED_HERO_RANGES` + `STARTER_COPY`.
- **Wire real analytics:** swap the body of `emitOnboardingEvent` in `telemetry.js`; call
  sites don't change.
- **Add a surface:** it belongs inside `GuestOnboarding.jsx` (the single owner) with its own
  per-tab store mirroring `lensTipStore.js`'s guarded shape; keep the "one tip at a time" rule.

---

*Prototype (eyeball the starter aesthetics & interaction):* the "Choose your naqsheh"
artifact — Phyllotaxis / Recursive / Topographic with the hero slider, Shuffle, fabrication
lens, and FPS meter. That prototype reimplemented the pattern math for speed of iteration;
the shipped code uses the real engines.
