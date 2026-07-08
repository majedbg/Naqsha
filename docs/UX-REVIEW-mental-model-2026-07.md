# Naqsha — Big-Picture UX Review: The Maker's Mental Model

_2026-07-07 · scope: the platform as a whole (flow, wayfinding, reversibility, pipeline), read against conventions from Figma, the Adobe suite, Ableton, and LightBurn. This is a mental-model review, not a component-level audit or a bug list._

---

## The one paragraph

Naqsha has a **beautiful skin** and a **strong set of engines** — a disciplined paper/ink
token system, a genuine global undo/redo, a fully non-destructive resolution model, a
Figma-style contextual inspector that morphs into an Ableton-style device rack, and a
document-wide modulation-routing graph that is arguably better than Ableton's own. What
it lacks is the **connective tissue between them**: the maker can see paper and panels,
but not _the journey their design takes from the pattern they picked to the file the
machine cuts_. Almost every high-leverage problem is on that seam — the pipeline is
invisible as a whole, the "prepare for the machine" moment was deleted and never
replaced, and a handful of trust breaches (silent undo-wipes, controls that look live
but do nothing) undercut the "reliable" half of the brand. The fixes are not a redesign;
they are **borrowed conventions** the app is already 80% wired for.

**Governing lens (now encoded in `.impeccable.md`): _borrow the mechanic, refuse the
chrome._** Figma/Adobe/Ableton did the UX research; adopt their settled interaction
models and dress them in paper-and-gouache.

---

## The spine: _idea → physical object_

"The mental model of the user as a whole" has a precise meaning for a fabrication tool:
**does the maker hold a coherent picture of what happens between the pattern they pick
and the physical thing the machine makes?** That journey has six conceptual stages.
Here is where each one lives on screen today:

| # | Stage | Conceptually | Where it actually is | Legible? |
|---|-------|--------------|----------------------|----------|
| 1 | Pick a pattern, edit params | design | Right — Inspector | ✅ clear |
| 2 | Route modulation (fields guide other layers) | design | **set** Right (Inspector) · **seen** Left (rail) | ⚠️ split |
| 3 | Assign layers to cut/engrave operations | prepare | **defined** bottom-left · **assigned** left row / top bar | ⚠️ homeless |
| 4 | Optimize geometry for the machine | prepare | bottom-left, **collapsed by default** | ❌ hidden |
| 5 | Preview what the machine will actually do | prepare | **does not exist** | ❌ absent |
| 6 | Export the plot file | export | one menu item, fire-and-forget | ❌ invisible |

Each stage is _internally_ well-built. But the journey physically crosses **all four
corners of the shell**, and stages 4–6 — the entire "commit to the machine" half — are
collapsed, homeless, or absent. A maker genuinely cannot answer "what goes to my
plotter?" from anything on screen. **That is the core finding; everything below is a
consequence of it.**

---

## Findings, prioritized

Severity = impact on the _mental model_ and on the brand promise (_playful, patient,
**reliable**_), not code effort. Each finding names the creative-software convention it
borrows.

### P0 — the mental model breaks, or trust is breached

**P0-1 · There is no "what the machine will do" moment.**
Export (`Studio.jsx` `handleExportAll` → `exportAllLayersSVG`) is a single menu action
that silently folds in the applied optimizations, the machine profile, and a manifest,
and downloads a file. The step that actually _transforms geometry for the machine_
(simplify / merge / reorder-for-travel, `OptimizeControls`) is **collapsed by default**.
For a product whose entire reason to exist is _faithful physical reproduction_, the
absence of a "here is exactly what the machine will do, and how long it takes" beat is
the single largest gap.
→ **Convention:** LightBurn's preview window (exact toolpath + traversal moves + time
estimate before you hit Send) is the gold standard; Illustrator's _Print/Separations
Preview_ and Ableton's render-preview are the same idea. **Recommendation:** a legible
**Cut Plan** step — a preview of the resolved toolpath in machine terms (per-operation
order, estimated plot/cut time, overlap/out-of-bounds warnings) that the user commits
from. This is stage 5, and it is also the answer to P0-2.

**P0-2 · The phase model was deleted and nothing reclaimed "Prepare."**
Design → Prepare → Export was removed (#16) in favour of one unified Figma-like surface;
`activeTab` survives only for persistence, hard-set to `"design"`. There is **no tab, no
mode, no stage indicator** — no "where am I / what's next." Flattening phases is _correct_
for the beginner (frictionless, modeless exploration) — but Figma can flatten phases
_because it has no output pipeline_. Naqsha does. The brief's two personas split cleanly
here: the **beginner** wants modeless play; the **craftsperson** wants _confidence before
spending material_.
→ **Convention:** Ableton reconciles exactly this with Session (explore) vs Arrangement
(commit) — one app, two intents, no regression to tabs. **Recommendation:** keep
exploration modeless, and let the **Cut Plan (P0-1) _be_ the commit step**. That reclaims
100% of the deleted "Prepare" value as a destination rather than a mode — explore freely,
then step into the cut plan when you're ready to make the thing. Do **not** bring back
tabs.

**P0-3 · Switching machine profile silently wipes the entire undo history.**
`Studio.jsx:532–536` calls `history.clear()` on profile switch (and a Document-Setup
Apply that changes profile inherits it). This is a **direct violation of the brand
promise** the brief states as principle #6 — _"the UI never silently changes your work /
always a way back."_ A maker who switches from laser to plotter loses every step back
with no warning.
→ **Recommendation:** make profile switch a normal undoable entry (it already snapshots
`operations`/`assignments`); if a hard reset is truly unavoidable, it must be _consented
to_ ("Switching profile will reset undo history — continue?"), never silent.

**P0-4 · Controls that look live but do nothing — a "reliable" brand breaking its own word.**
The contextual control bar's **Align and Arrange** buttons have no handlers; its **Text**
controls are backed by local state with no text-object model behind them; the menu ships
**Rulers, Zoom in, Zoom out, About** as visible-but-disabled placeholders. A control that
renders as active and then does nothing is not a polish issue — for a brand whose third
word is _reliable_, it is a **trust breach**. Every dead control teaches the user not to
trust the live ones.
→ **Convention:** Figma/Adobe ship _hide-until-real_; nothing renders until it works.
**Recommendation:** remove or hide every non-functional control until it's wired. Ship
less, trust more.

**P0-5 · Cold start: dropped mid-document, with no framing.**
There is **no onboarding, no welcome, no teaching empty state anywhere** (verified by
grep). Worse, the canvas is **pre-seeded with two unexplained patterns** (spirograph +
flowfield with random seeds), so a first-timer lands "already mid-document" with no
signal that this is a plotter/laser tool, what a layer is, or what to do next. The
primary door to _their own_ design is a low-opacity "+ New Layer" ghost row.
→ **Convention:** Figma/Notion teach through the empty state itself; they do **not** use
modal tours (the brief bans lazy modals). **Recommendation:** replace the random seed with
a **paper-native "first naqsheh"** — a single, deliberately chosen, lightly-annotated
starter document whose annotations _are_ the teaching ("this layer → this operation →
this is what the machine draws"), rendered in the app's own paper/ink idiom. The first
screen should frame the mental model, not hide it.

### P1 — the mental model is legible but has seams

**P1-1 · Modulation is _set_ on the right and _seen_ on the left.**
You configure a guide layer's Modulator device in the right-hand Inspector, but the only
picture of the resulting routing is the git-graph rail on the far-left LayerTree — source
and its wiring diagram **never share a viewport**. And a _target_ layer's own params never
show "I am being modulated, by this much" (only the rare grid-`warpNodes` box does).
→ **Convention:** Ableton shows modulation depth _on the target knob_ (a colored ring),
and its mapping browser lists routings next to their controls. **Recommendation:** (a)
surface a modulation indicator on modulated params in the Inspector (a violet "painted
cell" ring — you already have the token and the `ModulationParamBox` precedent); (b) let
the ModulationRail selection cross-highlight into the Inspector so set-and-seen connect.

**P1-2 · Operations are _defined_ in one place and _assigned_ in two others.**
Cut/engrave settings (power/speed/passes) live in the bottom-left Operations library, but
a layer is _assigned_ to an operation from a LayerTree row chip **or** the top-bar swatch
— never inside the panel where the settings live. "Which layers cut how" is never shown
in one place.
→ **Convention:** LightBurn's Cuts/Layers panel unifies define + assign + order in one
table. **Recommendation:** show assignment _in_ the Operations panel (each operation lists
the layers bound to it, drag-to-assign), so the cut plan reads as one object.

**P1-3 · The operations stack can't delete or disable.**
It reads like an Adobe adjustment-layer stack (reorderable, editable, additive) but has
**no remove and no enable/disable** in the UI (`removeOperation` exists, unwired). A
mistaken "Add" is stuck forever; you can't A/B a cut setting by muting it.
→ **Convention:** Adobe adjustment/effect layers and Ableton devices all
toggle/solo/delete. **Recommendation:** wire delete (with the same confirm-and-undo
pattern layers already use) and an enable/disable toggle per operation.

**P1-4 · The brief mislabeled its own reversibility model (now fixed in `.impeccable.md`).**
Principle #6 said "every transformation: preview → apply → revert." The _built_ model is
**live edit + global undo** (Figma/Ableton) — which is _better_ — and the literal
three-step exists only in Optimize. `Inspector.jsx:173` even documents the principle while
implementing the opposite. I've **updated principle #6** to describe live+undo and to
reserve the deliberate three-step for the machine-commit step (P0-1). The remaining work
is to make undo **visible**: ⌘Z alone is not a legible "way back."
→ **Convention:** Photoshop's History panel, Figma's version history. **Recommendation:**
a lightweight, paper-native history affordance (even just a hover readout of "last N
steps" on the Undo control) so the depth of the safety net is _seen_.

**P1-5 · Undo silently evaporates across a cloud reload.**
The embedded-tail import checksum-mismatches whenever a document has non-default
bgColor/operations/assignments/unit/margin/outputMode, so a cloud load keeps the document
but **silently drops the undo stack**. "Always a way back" holds within a session and a
local reload, but breaks across a cloud round-trip.
→ **Recommendation:** persist the history tail with the cloud document (or tell the user
plainly that reopening starts a fresh history) — silence here is the same brand breach as
P0-3, just quieter.

### P2 — friction and discoverability (mostly craftsperson-facing)

- **P2-1 · No ⌘K command palette.** Every action is menu- or panel-bound. This is a
  _craftsperson secondary_, not the discoverability headline (the beginner's answer is
  visible affordances, P0-5). Worth adding — Figma/Ableton both lean on it — but after
  the P0/P1 work. → convention: Figma quick actions (⌘/, ⌘K).
- **P2-2 · Shortcuts are hidden.** A real set exists (V, T, Space, ⌘S, ⌘Z/⇧⌘Z,
  Ctrl/⌘-Alt-P, Esc) but only ⌘Z/⇧⌘Z appears in the UI. → surface keys in tooltips and a
  Help ▸ Keyboard Shortcuts sheet (Adobe/Figma convention).
- **P2-3 · Five competing "add content" doors, no hierarchy.** Picker (Map/Grid),
  Examples, AI chat, SVG import, Photo-extract — all menu-buried, several expert-facing
  (a taxonomy table with a `● ◐ ○ ✦` legend is dense for a first-timer). → establish one
  primary door (the picker) on the canvas; demote AI/import/extract to "advanced."
- **P2-4 · Machine/size setup is invisible until export bites.** `DocumentSetupDialog`
  never surfaces; a maker can design at the wrong physical size and discover it only at
  export. → a gentle, dismissible _nudge_ at first content-add ("Designing for a specific
  machine? Set it up"), not a first-run wall. This is the inverse of Figma's "new file →
  pick a frame size."
- **P2-5 · Two reversibility models to learn.** Optimize uses its own preview/applied
  `CommitSlider` machine, outside the undo stack, so ⌘Z doesn't step through it. Once P0-1
  makes machine-commit a clear moment, fold Optimize into it so there's _one_ upstream
  model (live+undo) and _one_ commit model (the Cut Plan).

### P3 — polish

- Zoom tool has no keyboard shortcut and the Zoom in/out menu items are disabled →
  keyboard zoom is unavailable.
- No "welcome back / recent files" surface; returning users get a silent localStorage
  restore. A quiet recents shelf (Figma's file browser) would orient them.
- The etymology tooltip on the wordmark is a lovely touch — keep this class of quiet
  delight; it's on-brand.

---

## The look holds — protect it

The **token system is sound** as a system: OKLCH throughout (perceptually uniform),
paper↔ink that genuinely _inverts_ between themes rather than a generic dark swap, the
jewel palette quarantined to user content (chrome never borrows it), square-cell radii,
patient exponential easing, and a reduced-motion collapse. This is the disciplined,
paper-native aesthetic the brief asks for, and it is the platform's strongest layer.

Two caveats: (1) I'm judging the token _system_, not per-component adherence — whether
every component actually consumes the tokens (vs. stray literals) is a separate technical
`/audit` pass. (2) The risk as pro-tool density grows is _chrome drift_ — each new panel
is a chance to reach for a generic control. The guardrail is the rule now in the brief:
**borrow the mechanic, refuse the chrome.** A Figma user should feel at home _operating_
Naqsha but never mistake a screenshot of it for Figma.

**Mobile note:** `MobileStudio` is an honest "best viewed on desktop" reduced view — no
operations, modulation, optimize, or setup. Defensible as a non-goal, but it means the
_pipeline mental model has no mobile expression_. Fine to keep, worth stating plainly to
users (it already does).

---

## What NOT to do (guardrails for the fixes)

- **Don't build modal preview → apply → revert on every control.** The live+undo model is
  better; the three-step belongs _only_ at machine-commit (P0-1 / P1-4).
- **Don't add a modal onboarding tour.** Teach through a paper-native first document and
  empty states (P0-5); the brief bans lazy modals.
- **Don't regress to Design/Prepare/Export tabs.** Reclaim "Prepare" as the Cut Plan
  _destination_, not a mode (P0-2).
- **Don't let ⌘K become the headline.** The primary persona is an unhurried hobbyist;
  visible affordances come first, the palette is a power-user accelerator.

---

## Sequenced roadmap (highest leverage first)

1. **The Cut Plan.** Build the missing stage-5 machine-preview + commit (P0-1) — and let
   it absorb Optimize (P2-5) and reclaim "Prepare" (P0-2). This is the keystone; it closes
   the mental model's biggest hole and resolves the phase-model tension in one move.
2. **Trust repairs.** Profile-switch no longer silently wipes undo (P0-3); hide every dead
   control (P0-4); wire operation delete/disable (P1-3). Small, high-signal, brand-critical.
3. **Cold start.** Paper-native first document + teaching empty states + a setup nudge
   (P0-5, P2-4).
4. **Pipeline proximity.** Modulation shown on its targets and cross-highlighted (P1-1);
   operation assignment unified into the Operations panel (P1-2); visible undo (P1-4);
   cloud-reload keeps history (P1-5).
5. **Discoverability accelerators.** Command palette (P2-1), surfaced shortcuts (P2-2),
   add-content hierarchy (P2-3).
6. **Polish** (P3).

---

## Brief changes made in this pass (`.impeccable.md`)

- **Anti-references** rewritten to separate _look_ from _mechanics_: still bans the
  dark-panel clone aesthetic, but adds a **"Conventions we borrow"** section adopting
  Figma (contextual inspector, ⌘K, non-modal reversible edits), Adobe (single-active-tool
  strip, non-destructive modifier layers, real status bar), and Ableton (device-chain /
  modulation-routing model, macro mapping, explore-vs-commit). Governing rule: _borrow the
  mechanic, refuse the chrome._
- **Principle #6** rewritten from "every transformation: preview → apply → revert" to the
  **live + global-undo** model the app actually implements — with three obligations: the
  way back is never silently removed, undo is _visible_, and the literal three-step is
  reserved for the **commit to the machine**.
