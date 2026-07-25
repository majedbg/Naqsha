# Sonoform / Naqsha — Guest Walkthrough: Research Synthesis (v1)

**Goal:** a *minimal* first-run walkthrough/demo that introduces a first-time **guest**
(no account) to the tool. App = browser-based generative-art → laser-cutting studio:
pick a parametric pattern → tweak params → route modulation → preview 2D/3D → choose
material → export a cut/engrave file. No onboarding exists today (greenfield).

The app's own value language: a maker "composes generative patterns as layers, routes
modulation between them, assigns fabrication settings, and exports a file their machine
faithfully reproduces." Named for the *naqsheh* — the grid-sheet a carpet designer hands
a weaver. The walkthrough should teach that story, not a toolbar.

---

## The one finding that dominates everything

Onboarding is **not a tutorial you watch — it's the shortest path to the user doing one
real thing and seeing a result.** For this tool the "aha" has a precise shape, and it's
the same one p5.js nails: **drag a parameter → watch the art change, live.** Everything
below is in service of reaching that moment in the first ~30 seconds, then quietly
building confidence toward the unfamiliar part (export = a real fabrication file).

Three anchoring numbers from the research:
- Time-to-value under 5 min = excellent tier (Figma/Canva/Linear); the first ~300s decide conversion.
- Embedded/contextual guidance → users ~1.5× more likely to act than blocking modals.
- Checklist-initiated flows out-activate and out-convert auto-triggered tours; progress indicators ~+12% completion; progressive (trigger-on-first-use) tips beat front-loaded on every measured outcome.

---

## Top 10 candidate approaches — compared

Scored 1–5 (5 = best) on: **Activation** (does it move first-win), **TTV** (speed to aha),
**Minimal** (low build + low intrusion), **Fit** (suits a parametric/creative tool), **Guest**
(works without an account). ★ = keep in the recommended design.

| # | Candidate | Act | TTV | Min | Fit | Guest | Verdict |
|---|-----------|-----|-----|-----|-----|-------|---------|
| 1 ★ | **Seeded hero pattern on load** (open on a genuinely beautiful, editable pattern — never a blank canvas) | 5 | 5 | 5 | 5 | 5 | **Foundation.** Kills the empty-canvas problem. Framer/Spline/p5 all do it. Cheapest highest-leverage move. |
| 2 ★ | **"Drag me" cue on the primary slider** (one pulsing coach mark on the most satisfying param) | 5 | 5 | 5 | 5 | 5 | **The aha driver.** One drag, zero setup → live morph. This *is* the 300-second win. |
| 3 ★ | **Progressive, trigger-on-first-use tips** for the *novel* concepts only (modulation, 2D/3D toggle, export-to-laser) — fire when the user first reaches each surface | 4 | 4 | 4 | 5 | 5 | **Yes, but disciplined.** Only genuinely-novel mechanics; never conventional UI. Contextual > front-loaded. |
| 4 | Opt-in product tour / coach-mark sequence (Figma-style, 3–5 steps, skippable, progress dot) | 3 | 3 | 3 | 3 | 4 | **Optional fallback.** Fine as an opt-in "Show me around," but linear tours fight a nonlinear creative tool. Not the spine. |
| 5 ★ | **Slide-in "Get started" checklist** (pick → tweak → modulate → preview 3D → export; first item pre-checked = endowed progress) | 4 | 3 | 4 | 4 | 5 | **Strong optional companion.** Self-paced, non-blocking, respects autonomy, out-converts tours. Persistent re-entry point. |
| 6 | One-question intent branch ("What do you want to make? coaster / wall-art / jewelry / just exploring") → pre-picks pattern+material | 4 | 3 | 3 | 4 | 4 | **Powerful but adds friction before value.** Canva got +10% activation — but for a *guest*, a question before the first pixel risks a bounce. Consider as a *post-aha* branch, or skip for v1. |
| 7 | Guaranteed-success starter artifact decoupled from creativity (Cricut/Glowforge "make a ruler/coaster" → a real downloadable file in <60s, no design decisions) | 4 | 4 | 3 | 3 | 4 | **Great confidence idea, partial fit.** Sonoform's whole point is the *creative* act, so a fully-decoupled artifact is less apt — but the principle (reach a valid export fast) folds into #2+#10. |
| 8 | Template / starter gallery (choose from several art-grade patterns) | 3 | 3 | 3 | 4 | 5 | **Complements #1.** The seeded pattern is one; a small "try another" tray lets exploration continue. Secondary. |
| 9 | Demo video / GIF loop of a drag→morph | 2 | 3 | 4 | 3 | 5 | **Weak alone** (passive, low retention) but a tiny looping GIF in an *empty state* or splash is a cheap attention hook. Never the whole onboarding, never a gate. |
| 10 ★ | **Pre-flight / export "airlock" + test tile** (before Export: material confirmed, cut/engrave color-coded, size/time, a simulation of what the laser does; option to download a 1-inch test tile) | 5 | 3 | 3 | 5 | 4 | **The fabrication-confidence keystone.** Easel + Silhouette + Carbide + Glowforge all de-risk the irreversible step. Sonoform already has Run Plan + Export Receipt to build on. |

**Rejected as anti-patterns (do NOT do):** feature-dump tours; stacked/blocking modal
walls on first load; front-loaded coach-mark carousels (tips before context); unskippable
tours; watch-don't-do video as the whole flow; a signup wall before the aha; and — the
single most-documented failure (Adobe Express) — **discarding in-progress guest work at
the signup step.** Never lose their design across the auth boundary.

---

## Recommended minimal design (the synthesis)

A three-beat spine — **Land → Play → Prove** — with two optional, non-blocking companions.
Nothing blocks exploration; every prompt is one-click escapable and re-openable.

### Beat 1 — LAND (0–5s): no blank canvas, no wall
- Guest opens directly onto a **seeded hero pattern**, already rendered, obviously theirs
  to touch. One quiet welcome line + one CTA ("Make it yours" / dismiss). Transparent
  backdrop, then get out of the way. No account, no survey, no modal stack.

### Beat 2 — PLAY (5–30s): the aha
- A single **pulsing "drag me" cue on the most satisfying slider.** They drag → the art
  morphs live (p5-style instant feedback). That's the win. Everything else stays silent.
- *Then* progressive tips unlock **only as they wander into novel territory** — the first
  time they open modulation, toggle 2D/3D, or reach export. One tip, in context, skippable.
- Optional **slide-in "Get started" checklist** in a corner (pick → tweak → modulate →
  preview → export), first step pre-checked. Self-paced, dismissible, re-openable. This is
  the re-entry point for anyone who skipped everything.

### Beat 3 — PROVE (later, when they choose to fabricate): de-risk the export
- Before the file is created, a calm **pre-flight airlock**: this is your material, here's
  what's cut vs engraved (color-coded), here's size + est. time, here's a **preview/sim of
  exactly what the machine will do** (reuse Run Plan + Export Receipt). Optionally: **"Download
  a 1-inch test tile"** so their first real commitment costs an inch of material, not a sheet.
- **Defer signup to here** — ask for an account only when there's something worth saving
  (export/save), and **carry their work through the auth step intact.**

### Why this shape
- It front-loads the *one* thing that converts (live drag → morph) and defers the *scary*
  thing (fabrication) behind a reassurance layer — matching both the creative-tool teardown
  (p5/Framer/Canva) and the maker teardown (Cricut/Glowforge/Easel) evidence.
- It's minimal: the mandatory surface is exactly **one seeded pattern + one coach mark.**
  Checklist, progressive tips, and airlock are additive and independently shippable.
- It teaches the tool's *language* (pattern → modulation → run/export) through doing, not a
  glossary.

### Open questions to flesh out with the user
1. **Scope of v1** — is "seeded hero pattern + one 'drag me' cue" enough to ship first, with
   checklist/airlock as fast-follows? (Recommended: yes — smallest thing that delivers the aha.)
2. **Intent branch (#6)** — worth the friction for a guest, or defer to post-aha / skip?
3. **Test tile (#10)** — real value or scope creep for a first pass?
4. **Re-entry** — where does a returning guest re-summon the walkthrough (Help menu? "?" button)?
5. **Instrumentation** — what activation event defines "activated guest" (first drag? first
   preview? first export?) so we can measure whether any of this works.
6. **Persistence** — guest state is ephemeral; does the walkthrough re-fire every session, or
   remember dismissal via localStorage?

---

# v2 — Fleshed v1 spec (after expert review + user decisions)

**Decisions locked:** double-duty seed · modulation baked into the seed · ALL FOUR P0 risks
are blocking gates (guest-work-survives-signup, live-drag perf, shared-machine re-fire,
touch/iPad + a11y). Test tile, full pre-flight airlock ceremony, intent-branch gate, demo
GIF, and linear opt-in tour are OUT of v1. Checklist is a fast-follow.

## The v1 experience — "a seed that teaches by being touched"

Mandatory surface = **one curated seed + one drag-me cue + one Shuffle button + the
always-on cut/engrave lens + one confidence line.** No modal wall, no gate before value.

### The curated seed document (the core asset)
Replaces the current random `createLayer(0)` for guests with a hand-authored seed doc:
- **Inviting-simple, not virtuoso** — legible enough that a guest thinks "I could make that,"
  not "the app made that."
- **A fixed seed value** (not `randomSeed()`) so every guest lands on the same known-good frame.
- **A curated "golden range" on ONE hero param** — the slider the drag-me cue points at is
  soft-clamped (or its default sits mid-golden-range) so *any* drag lands in a beautiful band,
  never mud. This is the mechanism that makes the wow reliable.
- **A pre-wired live modulation** already running between a layer-pair (reuse the moiré
  role-A/role-B wiring in `useLayers` / `ModulationParamBox`) so the guest *watches routing
  do something* before any tooltip names it. Teaches the differentiator by demonstration.

### The five v1 elements
1. **Land:** open on the seed, one quiet welcome line + dismiss. The confidence line carries
   the **naqsheh metaphor + reversibility**: e.g. *"This is your naqsheh — the sheet the machine
   weaves. Nudge anything; ⌘Z undoes it. You can't break it."* (One line, dissolves "I'm not an
   artist," signals the undo system already in the app.)
2. **Drag-me cue:** one pulse on the hero slider (`prefers-reduced-motion` → static highlight).
   Drag → live morph within the golden range = the aha.
3. **Shuffle / "Surprise me":** one button that re-rolls params *within curated ranges* (respect
   `RANDOMIZE_EXCLUDED_KEYS`, already in constants). Guarantees repeat wins, kills the post-aha
   dead-end, de-risks exploration.
4. **Always-on cut/engrave lens:** surface the existing `ColorViewControl` early so "this is a
   real fabrication file, not a picture" lands cheap and without a funnel. Non-color-only
   encoding for the cut/engrave distinction (a11y + laser safety).
5. **Contextual nudge, not a checklist (v1):** after the 2nd distinct param change, one optional
   in-context nudge — *"See the glow follow your pattern? That's modulation — try routing it into
   another layer."* — pulling toward the novel concept. Fire-on-behavior, skippable, once.

### The four P0 gates (blocking)
- **P0-A · Guest work survives signup.** VERIFY the existing `guestSave` / `draftRecovery` path
  actually carries an in-progress guest doc through account creation with zero loss. If it holds,
  this is a test + a "your work is safe" affordance at the auth prompt; if it doesn't, it's ticket #1.
- **P0-B · Live-drag performance.** Seed must recompute under a fixed frame budget on a real
  workshop iPad (2D + R3F/bloom is the risk). Requires: a cheap-to-recompute seed, drag throttle/
  rAF-coalescing, and possibly deferring 3D/bloom until after the first aha. Define the budget,
  measure on-device, treat a miss as a release blocker.
- **P0-C · Shared-machine re-fire.** Guests don't write localStorage, so a reload already = "next
  person" (good). Gap = a long-lived operator tab: add a lightweight **"New session / hand to next
  person"** reset. Onboarding dismissal state lives in-memory/sessionStorage, never in a cross-person
  store.
- **P0-D · Touch/iPad + a11y.** Larger tap-and-drag hero target; zero hover-only tips (workshops are
  on tablets); route panels through the existing `useInspectorDock`; reduced-motion pulse; keyboard-
  operable slider aha; non-color-only cut/engrave encoding.

## Fast-follows (post-v1, independently shippable)
- Slide-in "Get started" checklist (endowed progress) — but momentum via Shuffle + nudge first.
- Full pre-flight export airlock (material confirmed, sim of machine action) on the real export path.
- Post-aha reseed as gentle intent branch ("make it yours: coaster / wall-art / jewelry") — a
  reseed, NOT a pre-value gate.
- Test tile (serves the hardware-owning minority only).

## Instrumentation (decide before build)
Activation event = **"second distinct param change" or "opened modulation"** (a teaching-true
target), not "first drag." Also track: aha reached, Shuffle clicks, lens opened, nudge
accept/skip, export reached, signup-after-value. These validate whether any of this works.

## Named code seams (buildable, not abstract)
- Seed doc → replace guest `createLayer(0)` default in `src/lib/useLayers.js` (`persistToLocal`
  false = guest); curated golden range via `DEFAULT_PARAMS` + `PATTERN_PARAM_DEFS` clamp.
- Modulation demo → moiré role-A/role-B wiring + `src/components/ui/ModulationParamBox.jsx`.
- Cut/engrave lens → `src/components/canvas/ColorViewControl.jsx` (already exists).
- Shuffle → reuse randomize path honoring `RANDOMIZE_EXCLUDED_KEYS` (`src/constants.js`).
- Touch/dock → `src/lib/hooks/useInspectorDock.js`.
- Guest-work-survives-signup → `StudioRoute.guestSave.test.jsx` + `draftRecovery` +
  `useDesignPersistence.js`.
- Reduced-motion tokens already present in `src/index.css` / `src/styles/tokens.css`.
