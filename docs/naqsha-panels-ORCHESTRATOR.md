# Naqsha Panels — Orchestrator Runbook (TDD)

> **Paste this whole file as the first message of a fresh Claude Code session**
> (run from `/Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio`).
> It turns that session into an **orchestrator** that implements the Panels v1
> subsystem end-to-end, in dependency order, each work item via a **TDD subagent**
> (red → green → refactor), leaving `npm test` + `npm run build` green after every item.

---

## 0. Mission

Implement work items **WI-1 … WI-6** of the Naqsha Panels v1 subsystem on a fresh
integration branch, each by spawning **one implementation subagent that follows strict
TDD**. After each WI, **you** (the orchestrator) verify tests + build are green, commit,
log, and move on. v2 (3D viewer) and the materials-catalog bridge are **out of scope**.

Source-of-truth docs (read once at start, pass the relevant slice to every subagent):
- `docs/naqsha-panels-plan.md` — locked spec (§-numbers cited below).
- This runbook — per-WI acceptance criteria + TDD seeds.

---

## 1. Hard rules (do not violate, even to "make progress")

1. **Never proceed past a red suite.** If `npm test` or `npm run build` fails and a retry
   doesn't fix it, STOP advancing that WI (see §5).
2. **TDD is mandatory.** Every subagent writes failing tests FIRST (red), shows them
   failing, then implements to green, then refactors. No implementation-before-test.
3. **One commit per WI**, on the integration branch only. Never commit to `main`, never
   force-push, never `git reset --hard` shared history.
4. **No scope drift.** A subagent implements exactly its WI's acceptance criteria. If it
   needs something another WI owns, it **stubs the seam and logs it**; it does not reach across.
5. **Desktop only.** Never modify `MobileStudio.jsx` or mobile tests.
6. **Non-destructive on mode switch.** Switching profiles must NEVER clear `layer.panelId`
   (spec §5). Panels are dormant, not deleted, outside laser mode.
7. **2-attempt cap per WI.** On a second failure: mark blocked, revert that WI's uncommitted
   changes, skip its dependents, continue with the rest (§5).
8. If anything is ambiguous or a decision is missing, **do not guess** — log it as a question
   for the user and skip to the next runnable WI.

---

## 2. One-time preflight

```bash
cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio
node -v                         # expect v22.x
npm ci || npm install
npm test                        # BASELINE must be GREEN before starting
git checkout -b feat/naqsha-panels   # integration branch off current HEAD
```

- If the baseline is red, **stop and report** — do not start on a broken base.
- Commit the two planning docs first (`docs/naqsha-panels-plan.md`, this file) if not already.
- Create a run log `docs/naqsha-panels-run-log.md`; append one line per WI
  (status, commit SHA, test delta, notes).
- **New dependency:** WI-3 adds **JSZip** (`npm install jszip`). Commit the lockfile change
  with WI-3.

Reusable commands: tests `npm test` · build `npm run build` · lint `npm run lint`
· dev server (only if a subagent needs browser verification) `npm run dev`.

---

## 3. Execution order & parallelism

```
Phase 0 (solo):     WI-1  ── panel model + helpers + localStorage + migration  (FOUNDATION)
                       │
        ┌──────────────┼──────────────┬───────────────┐
Phase 1 (PARALLEL):  WI-2           WI-3            WI-4            WI-5
                    cloud blob     export/zip     visibility      LayerTree
                    integration                   wiring          grouped UI
                       └──────────────┴───────────────┴───────────────┘
                                            │
Phase 2 (solo):                          WI-6  ── mode-gate + Studio wiring  (INTEGRATION)
```

| Step | WI | Title | Blocked by | Primary files (disjoint) |
|----:|:--:|-------|-----------|--------------------------|
| 0 | **WI-1** | Panel model + helpers + localStorage persistence + layer migration | — | `src/lib/panels.js` (new), `src/lib/useLayers.js` |
| 1 | **WI-2** | Cloud `config` blob: persist + load `panels` | WI-1 | `src/lib/hooks/useCloudPersistence.js` |
| 1 | **WI-3** | Per-panel + combined SVG export, ZIP, timestamped name | WI-1 | `src/lib/panelExport.js` (new), `package.json` |
| 1 | **WI-4** | `effectiveVisible` wiring into canvas + export | WI-1 | `src/lib/useCanvas.js`, `src/lib/svgExport.js` callers |
| 1 | **WI-5** | LayerTree grouped tier (headers, nest, drag-assign, add/delete, cap) | WI-1 | `src/components/shell/LayerTree.jsx` (+ `PanelHeader.jsx` new) |
| 2 | **WI-6** | Mode-gate to laser + dormancy + Studio wiring + substrate editor | WI-1, WI-5 | `src/pages/Studio.jsx` |

**Phase 1 is genuinely parallel** — the four WIs touch disjoint files and all depend only
on WI-1. Run each in its **own git worktree** (subagent `isolation: 'worktree'`), then the
orchestrator merges them back sequentially (rebase each onto the integration branch, run the
full suite after each merge). If two ever touch the same file, serialize those two.

**Dependents-skip map** (if a WI fails twice, skip these too and log it):
- WI-1 fails → **STOP & report** (foundation; nothing else can run).
- WI-2 / WI-3 / WI-4 fail → independent; continue the others; WI-6 stubs the missing seam.
- WI-5 fails → skip WI-6 (UI integration has nothing to wire).

---

## 4. Per-WI loop (do this for each step in §3)

1. **Brief the subagent.** Spawn ONE implementation subagent. Give it: this WI's section
   from §6, the cited spec §-numbers (paste the text), the ground-truth table (spec §1), and
   hard rules §1. Tell it: *strict TDD, desktop only, your final message is a structured report
   (files changed, tests added, red→green evidence, test count, any seam stubbed).*
2. **Subagent runs red → green → refactor**, then `npm test` + `npm run build`.
3. **You verify** independently: re-run `npm test` and `npm run build`. Confirm the WI's
   acceptance checks (§6) and that no mobile file changed (`git diff --name-only`).
4. **Green →** `git add -A && git commit` with `WI-N: <title>`; append run-log line.
5. **Red after 2 attempts →** §5.

Co-author trailer for commits:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## 5. Failure handling

- Retry once with the subagent (feed it the failing output).
- Still red → `git checkout -- .` / `git clean -fd` the WI's uncommitted work, mark it
  **blocked** in the run log with the error, skip its dependents (§3 map), continue with
  remaining runnable WIs. Never leave the tree red between WIs.

---

## 6. Work items (acceptance criteria + TDD seeds)

> Each subagent writes the **red tests** first (Vitest + Testing Library; `within(region)` /
> `data-testid` conventions). Seeds are the minimum; add edge cases.

### WI-1 — Panel model + helpers + persistence + migration (spec §2, §2.1, §3)
**Files:** new `src/lib/panels.js`; `src/lib/useLayers.js` (add `panelId`, persistence, migration);
tests `src/lib/panels.test.js`, `src/lib/useLayers.panels.test.jsx`.
**Red tests:**
- `createPanel()` → `{ id, name:'Panel N', substrate:{kind:'acrylic',thickness:3,color}, visible:true, order }`.
- `MAX_PANELS === 3`; `SUBSTRATE_KINDS` = `['acrylic','plywood','mdf','cardstock','other']`.
- `addPanel(panels)` appends with next `order`; **at 3 → returns panels unchanged** (+ a way
  to signal "at cap").
- `deletePanel(panels, layers, id, { deleteLayers:false })` → panel removed, its layers'
  `panelId` reassigned to the first remaining panel; `{deleteLayers:true}` → those layers removed too.
- `assignLayerToPanel(layers, layerId, panelId)` sets only that layer's `panelId`.
- `layersForPanel(layers, id)` filters by `panelId`.
- `effectiveVisible(layer, panel)` = `panel.visible && layer.visible` (panel undefined → `layer.visible`).
- **`createLayer` gains `panelId` (default null)** — at both construction sites.
- **Normalizer** (`normalizePanels(panels, layers)`): absent/empty/non-array → seed one
  `Panel 1` and set **every** layer's `panelId` to it; dangling `panelId` → reassigned to
  first panel; valid input passes through. Forgiving like `migrateLayer`.
- **localStorage:** `sonoform-panels` load/save round-trips; missing key → normalizer seeds.
**Acceptance:** pure helpers + persistence + migration only; **no UI, no mode-gating** here.
Existing saved designs load unchanged behaviorally (one auto-seeded panel, all layers in it).

### WI-2 — Cloud config blob (spec §3)
**Files:** `src/lib/hooks/useCloudPersistence.js`; tests `src/lib/hooks/useCloudPersistence.panels.test.jsx`.
**Red tests:**
- `handleSaveToCloud` includes `panels` in the saved `config`
  (`{ layers, canvasW, canvasH, presetIndex, panels }`).
- `handleLoadCloudDesign` reads `config.panels`, applies via the WI-1 normalizer; a design
  saved **without** `panels` (legacy) loads → normalizer seeds Panel 1 (no crash).
**Acceptance:** no new table/migration; owner-only RLS unchanged; round-trip verified.

### WI-3 — Export: per-panel + combined, ZIP, timestamped (spec §7)
**Files:** new `src/lib/panelExport.js`; `package.json` (+ JSZip); tests `src/lib/panelExport.test.js`.
**Red tests:**
- `exportPanelsZip` produces **one entry per visible panel** (named
  `…-panel-<order+1>-<kind>.svg`) **+ one** `…-combined.svg`.
- Hidden panel → excluded from both per-panel set and combined (uses `effectiveVisible`).
- Each per-panel SVG contains only that panel's layers (assert via `buildAllLayersSVG` called
  with the `layersForPanel` subset — mock or inspect).
- Zip filename matches `naqsha-<design>_<YYYY-MM-DD_HHmm>.zip` (inject a clock for determinism).
**Acceptance:** reuses `buildAllLayersSVG` unchanged; JSZip is the only new dep.

### WI-4 — Visibility wiring (spec §4)
**Files:** `src/lib/useCanvas.js`; `src/lib/svgExport.js` call sites (or a shared filter helper);
tests `src/lib/useCanvas.panels.test.jsx`.
**Red tests:**
- A layer on a **hidden panel** is not drawn to canvas (no-draw adapter at the §1 filter
  points) even though `layer.visible === true`.
- Unhiding the panel restores it; per-layer `visible` flag never mutated.
- Non-laser / no-panels path: behavior identical to today (`layer.visible` only).
**Acceptance:** one shared `effectiveVisible` (from WI-1) used at every filter point; no
duplicated visibility logic.

### WI-5 — LayerTree grouped tier (spec §6) — INTEGRATION (UI)
**Files:** `src/components/shell/LayerTree.jsx` (+ new `src/components/shell/PanelHeader.jsx`);
tests `src/components/shell/LayerTree.panels.test.jsx`. Reuses existing `ConfirmDialog` (danger).
**Red tests:**
- Renders one **panel header row** per panel (name, substrate summary, visibility toggle,
  collapse chevron); layers nest under their `panelId`.
- Collapse hides a panel's layer rows; toggle persists open/closed state.
- **"+ Add panel"** calls add handler; **disabled** when `panels.length === 3` with
  `title="Max 3 panels per document"`.
- **Delete panel** opens ConfirmDialog (danger) with the "Delete the layers on this panel too?"
  choice; confirming each branch calls the right handler.
- **Drag a layer** onto another panel header → fires `onAssignLayerToPanel(layerId, panelId)`.
- Inline-rename a panel name; click substrate summary → opens substrate editor (kind select +
  thickness input + color; `other` reveals a free-text label).
**Acceptance:** desktop only; existing LayerTree tests still pass or are updated; one menu/editor
open at a time; props-driven (handlers injected — no direct store access).

### WI-6 — Mode-gate + Studio wiring (spec §5) — INTEGRATION
**Files:** `src/pages/Studio.jsx`; tests `src/pages/StudioRoute.panels.test.jsx`.
**Red tests:**
- Panel tier + per-panel export render **only** when `activeProfileId === 'laser'`; hidden for
  `plotter`/`dragCutter`.
- Switching laser → plotter → laser **preserves** every `layer.panelId` (assert no clear).
- Add/delete/assign/substrate-edit handlers round-trip through Studio → persisted state
  (localStorage `sonoform-panels` + layer `panelId`).
- Plotter export path unchanged (flat layer list).
**Acceptance:** end-to-end laser-only gating + non-destructive dormancy verified at route level.

---

## 7. HITL / future (do NOT auto-run)

- **v2 — R3F 3D stacked acrylic viewer** + inter-panel spacing slider. Separate effort; see
  `../../NAQSHA-SHEETS-GRILL-RESUME.md` for the skill research. File as its own issue when ready.
- **Materials-catalog bridge** — let panels reference the org `materials`/`org_materials`
  catalog (thickness/price) instead of inline substrate, for org cut-job flows. File a GitHub
  issue on `majedbg/Naqsha`; do not implement in v1. Reference spec §8.

Run `gh issue create` only if the user explicitly says so.

---

## 8. Done criteria

- WI-1…WI-6 committed on `feat/naqsha-panels`, each its own commit, suite green throughout;
  build green.
- Run log complete; any blocked WI documented with its error.
- v2 + materials-bridge issues filed (or surfaced to the user to file).
- Branch left unmerged for review (do not merge to `main`).
