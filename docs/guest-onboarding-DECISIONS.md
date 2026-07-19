# Guest Onboarding v1 — Grill & Decisions Report

Self-grilled on the user's behalf (they opted to accept my recommendations). Every open
branch of the decision tree is resolved below with the recommended answer + rationale.
Companion docs: `guest-onboarding-synthesis.md` (research/evidence),
`guest-onboarding-BUILD-BRIEF.md` (build plan + guardrails). Locked prototype:
"Choose your naqsheh" starter-trio artifact.

Legend: **D#** = decision · ✅ locked · ⚠️ human-gated (built-or-documented, not guessed).

---

## A. Trigger & framing

**D1 — Who gets onboarding in v1?** ✅ **Guests only** (`persistToLocal===false`).
Signed-in/new-account onboarding is a separate, deferred concern. *Why:* the ask is the guest
first-run; signed-in users have already converted and have different needs.

**D2 — Blocking wall vs. non-blocking?** ✅ **Non-blocking.** The guest lands directly on a live
seed (never a blank canvas, never a modal wall). The "Choose your naqsheh" starter chooser floats
over the already-alive canvas and is one-tap dismissable; skipping keeps the default seed. *Why:*
research is unanimous — embedded > modal (~1.5× action), modal walls read as paywalls. The
Pokémon-choice feeling survives as a *gentle* chooser, not a gate.

**D3 — Re-fire cadence.** ✅ Dismissal stored in **sessionStorage** (per-tab). A fresh page load
re-shows it — which is correct for a shared workshop machine (reload = next attendee). *Why:*
guests don't write localStorage anyway; sessionStorage keeps it per-session without a cross-person
store. Pairs with D18 (operator reset).

**D4 — Re-entry.** ✅ A persistent **"?" / Help affordance** re-opens the chooser + drag-me cue.
*Why:* every prompt must be recoverable (NN/g).

## B. The seed & the aha

**D5 — Default landing seed (before any choice).** ✅ **Phyllotaxis.** *Why:* most universally
loved, most forgiving across its hero range, highest wow-per-drag; best odds the first involuntary
glance already delights.

**D6 — Hero control per seed (what "drag me" points at).** ✅ Phyllotaxis → **angle** (detune near
137.508°); Recursive → **scaleFactor** (nesting tightness, clamped to a nice band); Topographic →
**noiseScale** (terrain zoom). *Why:* each is the single most satisfying, always-beautiful drag for
its engine. (The stepped square→pentagon *form* ladder is a later param-UI nicety, NOT the v1 aha.)

**D7 — Curated golden ranges (editable constants).** ✅ Phyllotaxis angle **137.2–137.9°**;
Recursive scaleFactor **0.62–0.80**; Topographic noiseScale **1.6–3.2×**. Every value in-band looks
good → the wow is *reliable*, not lucky. *Why:* the reviewer's #1 gap — sliders pass through mud
without clamping. `// TODO(user): tune` on each.

**D8 — Deterministic landing frame.** ✅ Each starter opens on a **fixed known-good seed value +
hero position** (not random), so every guest sees a vetted frame. Shuffle then randomizes. *Why:*
consistency of first impression; removes the "landed on an ugly one" risk.

**D9 — Modulation baked into each seed.** ✅ Phyllotaxis → a **size-driving modulation layer**;
Recursive → animate the **linear scale** (breathes, edges stay straight — NOT warp); Topographic →
**warp** channel. *Why:* teaches the differentiator by demonstration; matches each engine's native
character (user was explicit that warping recursive breaks it). ⚠️ **D9-fallback:** if the app's
modulation system can't cleanly animate a seed in the build, ship the **static** seed frame and
file modulation-animation as a sub-slice — do NOT block the whole build on it.

**D10 — Seed = a real app document.** ✅ Predefined layers+params (a `seedDocuments` constant),
loaded by `useLayers` for guests in place of the random `createLayer(0)`. NOT a DB row, NOT the
prototype's reimplemented math — the real `Phyllotaxis/RecursiveGeometry/TopographicContours`
engines. *Why:* fidelity + zero backend surface.

## C. Shuffle / "Surprise me"

**D11 — Scope.** ✅ Re-rolls **only the current seed's params within the curated ranges**; it does
NOT switch starters (switching = the chooser). Honors `RANDOMIZE_EXCLUDED_KEYS`. *Why:* guaranteed
repeat wins without wandering out of the vetted band; keeps starter identity stable.

**D12 — Keyboard shortcut.** ⚠️ Button always present. Add an `S` shortcut **only if** it doesn't
collide with an existing Studio shortcut (build-time check); else button-only. *Why:* don't shadow
an existing binding.

## D. Cut/engrave lens ("it's a real fabrication file")

**D13 — Surface the existing lens early.** ✅ Reuse `ColorViewControl`; make it **discoverable for
guests** via one contextual tip (not a new forced always-on state). *Why:* the "real file" wow is
the deepest one — surface it cheap, don't rebuild it.

**D14 — Non-color-only encoding.** ✅ Cut vs engrave must also differ by **line weight/dash**, not
color alone. *Why:* colorblind a11y AND laser safety (mistaking cut for engrave is dangerous).

**D15 — Fake a cut perimeter on seeds?** ✅ **No.** Seeds are honest engrave-only decorative tiles;
the lens shows "all engrave." *Why:* don't fabricate a cut the design doesn't have; honesty over
demo-theater. (If we later want the distinction visible, that's a deliberate seed-design choice.)

## E. Copy & progressive tips

**D16 — Confidence line.** ✅ Naqsheh metaphor + reversibility, one line in the chooser, persisting
as a subtle hint until the first param change: *"This is your naqsheh — the sheet the machine
weaves. Nudge anything; ⌘Z undoes it. You can't break it."* *Why:* dissolves "I'm not an artist,"
signals the undo system, nearly free.

**D17 — Which tips fire (fire-on-first-use only).** ✅ At most **two** in v1: (a) the **modulation**
nudge after the 2nd distinct param change (*"that glow follows your pattern — that's modulation,
try routing it into another layer"*), (b) the **cut/engrave lens** discoverability tip. NO tips on
conventional UI. **No checklist in v1** (fast-follow; momentum comes from Shuffle + the nudge).
*Why:* progressive > front-loaded on every measured outcome; avoid tour fatigue.

## F. The four P0 gates

**D18 — P0-C Shared-machine.** ✅ sessionStorage dismissal + an explicit **"New session / hand to
next person"** reset for a long-lived operator tab. Never a cross-person store. *Why:* Brooklyn
Spark workshop reality.

**D19 — P0-B Performance.** ✅ Target **60fps desktop, ≥30fps on a workshop iPad**. rAF-coalesce
drag recomputes; **defer R3F/3D + bloom until after the first aha**; wire a frame-time readout.
⚠️ If no iPad to measure on, record desktop numbers and flag iPad as unverified — don't claim it.
*Why:* a janky morph kills the exact moment the plan rests on.

**D20 — P0-A Guest-work-survives-signup.** ⚠️ **Verify, don't rewrite.** Exercise the existing
`guestSave`/`draftRecovery` path end-to-end; if it carries a guest doc through account creation with
zero loss → add a regression test + a "your work is safe" line at the auth prompt. If it does NOT →
STOP and document as ticket #1. **No auth/persistence rewrite overnight.** *Why:* it's the hardest
piece and the documented Adobe-Express killer; too risky to guess unattended.

**D21 — P0-D Touch/iPad + a11y.** ✅ Tap-and-drag hero targets, no hover-only tips, route panels via
`useInspectorDock`, reduced-motion pulse, keyboard-operable slider aha, non-color-only cut/engrave.
*Why:* workshops run on tablets; a11y + safety.

## G. Instrumentation

**D22 — Activation event.** ✅ Primary = **"second distinct param change"** (teaching-true, simple).
Also emit: aha-reached, shuffle-click, lens-opened, modulation-opened, export-reached,
signup-after-value. ⚠️ Sink = a no-op/console seam if there's no analytics layer yet — leave it
clean to wire later. *Why:* measure whether any of this works; don't overbuild a pipeline.

## H. Platform & scope boundaries

**D23 — MobileStudio (phone).** ✅ Out of v1 scope, but the guest seed-default swap **must not
break** `MobileStudio.jsx`. iPad is covered via the Inspector Dock in the main Studio. *Why:* focus;
don't regress the phone path.

**D24 — Don't touch the pattern picker.** ✅ The starter chooser is a **first-run guest surface
only**; `PatternPickerModal` and the normal flow are untouched. *Why:* minimize blast radius.

**D25 — Vocabulary collision.** ✅ Use **"naqsheh"** only as onboarding *metaphor copy* — do NOT
introduce it as a new UI noun, because the app already has **"Sheet"** (the physical material) in
its locked vocabulary (CONTEXT.md). Keep all existing UI nouns unchanged. *Why:* avoid muddying the
deliberate domain language.

## I. Build process (per user)

**D26 — Isolated worktree from `main`.** ✅ `git worktree add ../onboard-build -b
feat/guest-onboarding main`; never touch the dirty `feat/etch-preview-hero` main working copy;
`npm install` in the worktree. **No push, no PR, no merge.** *Why:* the main tree has uncommitted
etch work; isolation is mandatory (rogue-agent/checkout-race lessons).

**D27 — Subagents, lean, one-at-a-time.** ✅ Orchestrate via subagents (Opus/Sonnet, never Fable),
**ONE at a time** (full build→verify→review→commit before the next), to keep the orchestrator's
context lean. Serialize any browser use. *Why:* the user's standing orchestration rule.

**D28 — TDD.** ✅ Each slice red→green→refactor per the `/tdd` skill; `npm test` (vitest) green
before every commit; `test:rls` skipped (needs live DB). *Why:* the user asked for TDD; the repo is
vitest-based with a large existing suite.

**D29 — Stop-and-document on any human-gated / irreversible / uncertain step.** ✅ Write
`docs/guest-onboarding-BUILD-NOTES.md` and move to the next independent slice or end. No DB,
migrations, auth, Supabase writes, or pushes. *Why:* safe unattended operation.

---

## Locked decision summary

| Area | Decision |
|------|----------|
| Audience | Guests only (D1) |
| Entry | Land on live seed + non-blocking floating chooser, dismissable/re-openable (D2, D4) |
| Re-fire | sessionStorage per-tab + operator "New session" reset (D3, D18) |
| Default seed | Phyllotaxis (D5) |
| Hero controls | angle / scaleFactor / noiseScale (D6) |
| Golden ranges | clamped, editable constants (D7) |
| Landing frame | fixed known-good per starter (D8) |
| Modulation | size / linear-scale / warp — static fallback if hard (D9) |
| Seed form | real app documents via `useLayers` guest branch (D10) |
| Shuffle | current-seed params only, curated, excluded-keys respected (D11) |
| Lens | reuse ColorViewControl, discoverable, non-color-only, honest engrave-only seeds (D13–15) |
| Copy | naqsheh + ⌘Z line; ≤2 fire-on-use tips; no checklist v1 (D16, D17) |
| P0 | perf throttle + defer 3D (D19), verify-not-rewrite signup carry (D20), touch/a11y (D21) |
| Instrumentation | "2nd param change" activation, no-op sink seam (D22) |
| Scope guards | don't break MobileStudio, don't touch picker, no "naqsheh" UI noun (D23–25) |
| Build | isolated worktree from main, subagents 1-at-a-time, TDD, no push (D26–29) |

## ⚠️ Human-gated items (build-or-document, surfaced for the user)
- **D20** guest-work-survives-signup: verified with a test, or documented as ticket #1 if it fails.
- **D9-fallback**: whether modulation animates in-app, or seeds ship static pending a sub-slice.
- **D12**: `S` shortcut kept only if free.
- **D19**: iPad perf unverified unless a device is available.
- Signup-defer wiring, full export airlock, get-started checklist, stepped-form param UI, test tile,
  post-aha reseed intent branch — all explicitly **fast-follows**, not v1.
