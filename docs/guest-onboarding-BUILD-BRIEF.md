# Guest Onboarding v1 — BUILD BRIEF (overnight)

Source of truth for the overnight build. Companion research/spec:
`scratchpad/guest-onboarding-synthesis.md` (patterns, evidence, P0 rationale).
Reference prototype (locked, eyeball-approved by user): the "Choose your naqsheh"
starter-select artifact — Phyllotaxis · Recursive · Topographic, ported faithfully.

## The product
Sonoform / internally "Naqsha": browser-based generative-art → laser/pen-plotter studio.
A maker composes generative patterns as layers, routes modulation, assigns fabrication
settings, exports a machine-faithful file. Named for the *naqsheh* (the grid-sheet a
carpet designer hands the weaver). Guests use it with no account. NO onboarding exists today.

## What v1 is (locked with the user)
A minimal first-run for a GUEST built on the spine **Land → Play → Prove**, delivered as a
"Choose your naqsheh" **starter-select of three seeds**, Pokémon-starter style. The mandatory
surface is: one chosen seed on the canvas + a "drag me" cue on its hero control + a "Surprise
me"/Shuffle button + the always-on cut/engrave lens + one confidence line. Everything else is
additive. Do NOT block exploration; every prompt one-click dismissable and re-openable.

## The three starters (LOCKED) — use the REAL app engines, not the prototype's reimplementations
The prototype reimplemented these for eyeballing; the real seeds must be actual app documents
(layers + params) driving `src/lib/patterns/*`:

1. **Phyllotaxis** (`Phyllotaxis.js`) — organic. Hero control = `angle` (detune around the golden
   137.508°; small changes swing whole spiral arms). Modulation = a **modulation layer driving
   size** (there is no built-in size wave; it must be a real modulation layer — this is exactly
   the "bake modulation into the seed" decision).
2. **Recursive** (`RecursiveGeometry.js`) — geometric. The seed is ONE hand-picked form (recursion
   only locks in cleanly at certain angles). Ship landing frame = **pentagon · rotationPerLevel 36°
   · depth 4** (pentagon already exists in `sidesForShape`; no engine change). Modulation = animate
   the **linear scale (`scaleFactor`)** so the fractal *breathes* with every edge dead straight
   (NOT warp — warp destroys its geometric character; user was explicit). The user's stepped-form
   ladder (square 45/30/22.5/15 → pentagon 36/18/54) is a LATER nicety for the param UI, not v1.
3. **Topographic** (`TopographicContours.js`) — flowing. Hero control = `noiseScale` (terrain zoom).
   Modulation = the **warp** channel (subtle contour drift) — its native modulation.

Landing frames (seed value + hero position) are SENSIBLE DEFAULTS the user will fine-tune later —
put each in a clearly-named editable constant and leave a `// TODO(user): tune landing frame` note.

## The five v1 elements
1. **Land** — guest opens on the chosen seed (replaces the random `createLayer(0)` default for
   guests; guest = `persistToLocal===false`, i.e. `limits.localStorage` false). One quiet line +
   dismiss, transparent backdrop, then get out. The confidence line carries the naqsheh metaphor +
   reversibility: e.g. *"This is your naqsheh — the sheet the machine weaves. Nudge anything; ⌘Z
   undoes it. You can't break it."*
2. **Drag-me cue** — one pulse on the seed's hero control (the phyllotaxis angle / recursive scale /
   topo zoom). `prefers-reduced-motion` → static highlight, no pulse. Touch: tap-and-drag target,
   NO hover-only tooltip.
3. **Shuffle / "Surprise me"** — re-rolls params within curated ranges, honoring the existing
   `RANDOMIZE_EXCLUDED_KEYS` (`src/constants.js`). Guarantees repeat wins; kills the post-aha dead-end.
4. **Always-on cut/engrave lens** — surface the existing `ColorViewControl`
   (`src/components/canvas/ColorViewControl.jsx`) early so "it's a real fabrication file" lands cheap.
   Cut vs engrave must NOT be color-only (weight/dash cue too — laser safety + a11y).
5. **Starter-select** — the three seeds as a choose-your-starter first-run surface for guests.

## The four P0 gates
- **P0-A Guest-work-survives-signup** — VERIFY (don't assume) the existing `guestSave`/`draftRecovery`
  path (`StudioRoute.guestSave.test.jsx`, `StudioRoute.draftRecovery.test.jsx`,
  `src/lib/hooks/useDesignPersistence.js`) carries an in-progress guest doc through account creation
  with zero loss. If it holds → add a regression test + a "your work is safe" line at the auth prompt.
  If it does NOT hold → STOP, document precisely, leave as ticket #1. Do NOT rewrite auth/persistence
  overnight.
- **P0-B Live-drag performance** — the seed must recompute smoothly on a real workshop iPad
  (2D + R3F/bloom is the risk). Add drag throttle / rAF-coalescing; consider deferring 3D/bloom
  until after the first aha. Define a frame budget; if you can't measure on-device, wire an FPS/
  frame-time readout and note desktop numbers + that iPad is unverified.
- **P0-C Shared-machine re-fire** — guests don't write localStorage, so a reload already = "next
  person" (good). Add a lightweight **"New session / hand to next person"** reset for a long-lived
  operator tab. Onboarding-dismissal state lives in-memory/sessionStorage, NEVER a cross-person store.
- **P0-D Touch/iPad + a11y** — tap-and-drag targets, no hover-only tips, route panels via
  `useInspectorDock` (`src/lib/hooks/useInspectorDock.js`), reduced-motion pulse, keyboard-operable
  slider aha, non-color-only cut/engrave encoding.

## Named code seams
- Guest seed default → `src/lib/useLayers.js` (`createLayer`, the `persistToLocal` guest branch).
- Curated ranges / excluded keys → `src/constants.js` (`RANDOMIZE_EXCLUDED_KEYS`, `DEFAULT_PARAMS`,
  `PATTERN_PARAM_DEFS`).
- Cut/engrave lens → `src/components/canvas/ColorViewControl.jsx`.
- Modulation wiring → `src/lib/useCanvas.js` + the modulation param UI (`ModulationParamBox.jsx`);
  channels seen in-engine: `warp` (recursive/topographic), plus a size-driving layer for phyllotaxis.
- Touch dock → `src/lib/hooks/useInspectorDock.js`.
- Guest persistence / draft recovery → `src/lib/hooks/useDesignPersistence.js` + the
  `StudioRoute.guestSave` / `draftRecovery` tests.
- Studio entry → `src/pages/Studio.jsx`, `src/pages/StudioRoute.jsx`, mobile `src/pages/MobileStudio.jsx`.

## Instrumentation (build a stub, don't overbuild)
Activation event = "second distinct param change" or "opened modulation" (teaching-true), NOT
"first drag." Emit lightweight events (aha reached, Shuffle clicks, lens opened, export reached);
a console/no-op sink is fine for v1 if there's no analytics layer — leave a clear seam.

## Build slices (ONE at a time: build → test → browser-verify → self-review on Opus → commit)
- **S0** — Read the codebase; confirm the seams above; write findings. If the modulation system
  can't cleanly drive size/scale for the seeds, ship STATIC seed frames first and flag modulation-
  animation as a sub-slice (don't block the whole build on it).
- **S1** — Curated seed documents for the three starters (real params, editable landing-frame
  constants) + guest default swap in `useLayers`.
- **S2** — "Choose your naqsheh" starter-select first-run surface for guests (dismissable, re-openable).
- **S3** — Drag-me cue on each seed's hero control (reduced-motion + touch safe).
- **S4** — Shuffle / "Surprise me" honoring `RANDOMIZE_EXCLUDED_KEYS`.
- **S5** — Surface `ColorViewControl` early + non-color-only cut/engrave encoding.
- **S6** — Confidence line (naqsheh metaphor + ⌘Z) + reduced-motion/touch/a11y pass.
- **S7** — Seed modulation layers (phyllotaxis→size, recursive→linear-scale, topo→warp) IF S0 showed
  it's clean; else document as follow-up.
- **P0 work** — P0-B (perf throttle) and P0-C (session reset) are buildable; do them. P0-A (verify
  guest→signup) is verify-or-document. P0-D folds into S3/S5/S6.

## HARD GUARDRAILS
- Work in an **isolated git worktree branched from `main`** (e.g. `git worktree add ../onboard-build
  -b feat/guest-onboarding main`). NEVER touch the main working copy — it has uncommitted
  `feat/etch-preview-hero` changes (Studio/RightPanel/Inspector/useCanvas) that must not be disturbed.
- `npm install` in the worktree (stale/absent node_modules is a known gotcha).
- Commit per slice with clear messages. **Do NOT push. Do NOT open a PR. Do NOT merge.**
- **No DB/migrations, no auth changes, no Supabase writes.** Anything needing those → document as a
  human-gated ticket, don't attempt.
- Run `npm test` (vitest) before each commit; keep the suite green. `test:rls` needs live DB — skip it.
- Subagents (if any) on Opus/Sonnet, never Fable; ONE at a time; serialize any browser use.
- If blocked or uncertain on anything irreversible or human-gated: STOP, write a clear note in
  `docs/guest-onboarding-BUILD-NOTES.md` in the worktree, move to the next independent slice or end.
- Leave a final `docs/guest-onboarding-BUILD-NOTES.md`: what shipped, test/verify results, open
  human-gated items, and how to review the branch.
