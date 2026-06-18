# Object Tree Panel — Orchestrator Runbook (TDD)

> **Paste this whole file as the first message of a fresh Claude Code session**
> (run from `/Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio`).
> It turns that session into an **orchestrator** that implements the object-tree
> panel overhaul end-to-end, in dependency order, each work item via a **TDD
> subagent** (red → green → refactor), leaving `npm test` + `npm run build` green
> after every item.

---

## 0. Mission

Implement work items **WI-1 … WI-6** of the object-tree panel overhaul on a fresh
integration branch, in the order in §3, each by spawning **one implementation
subagent that follows strict TDD**. After each WI, **you** (the orchestrator)
verify tests + build are green, commit, log, and move on. **WI-7 is HITL** (a
human files a GitHub issue) — do not implement it as code.

Source-of-truth docs (read once at start, pass the relevant slice to every subagent):
- `docs/object-tree-panel-plan.md` — locked decision spec (§-numbers below cite it).
- This runbook — per-WI acceptance criteria + TDD seeds.

---

## 1. Hard rules (do not violate, even to "make progress")

1. **Never proceed past a red suite.** If `npm test` or `npm run build` fails and a
   retry doesn't fix it, STOP advancing that WI (see §5).
2. **TDD is mandatory.** Every subagent writes failing tests FIRST (red), shows
   them failing, then implements to green, then refactors. No implementation-before-test.
3. **One commit per WI**, on the integration branch only. Never commit to `main`,
   never force-push, never `git reset --hard` shared history.
4. **No scope drift.** A subagent implements exactly its WI's acceptance criteria
   — nothing from another WI. If it needs something another WI owns, it stubs the
   seam and logs it; it does not reach across.
5. **Desktop only.** Never modify `MobileStudio.jsx` or mobile tests.
6. **2-attempt cap per WI.** On a second failure: mark blocked, revert that WI's
   uncommitted changes, skip its dependents, continue with the rest (§5).
7. **Truthful copy.** Never write "this can be undone" — there is no undo (spec §1).
8. If anything is ambiguous or a decision is missing, **do not guess** — log it as
   a question for the user and skip to the next runnable WI.

---

## 2. One-time preflight

```bash
cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio
node -v                         # expect v22.x
npm ci || npm install
npm test                        # BASELINE must be GREEN before starting
git checkout -b feat/object-tree-panel    # integration branch off current HEAD
```

- If the baseline is red, **stop and report** — do not start on a broken base.
- Commit the two planning docs first (`docs/object-tree-panel-plan.md`, this file)
  if they aren't already committed.
- Create a run log `docs/object-tree-panel-run-log.md`; append one line per WI
  (status, commit SHA, test delta, notes).

Reusable commands: tests `npm test` · build `npm run build` · lint `npm run lint`
· dev server (only if a subagent needs browser verification) `npm run dev`.

---

## 3. Execution order (topological)

WI-1…WI-4 are **mutually independent** (may run sequentially or in parallel —
sequential recommended unattended). WI-5 integrates them. WI-6 wires the host.

| Step | WI | Title | Blocked by |
|----:|:--:|-------|------------|
| 1 | **WI-1** | Layer model: auto-naming + `nameIsCustom` + `locked` default + migration + duplicate branch | — |
| 2 | **WI-2** | `ConfirmDialog` danger variant | — |
| 3 | **WI-3** | Resizable + persisted panel width | — |
| 4 | **WI-4** | `RowMenu` popper component | — |
| 5 | **WI-5** | `LayerTree` row rework (layout · inline rename · dice+confirm+lock · op-swatch · responsive · wire RowMenu + confirms) | WI-1, WI-2, WI-4 |
| 6 | **WI-6** | Studio wiring: rename handler · bulk randomize skips locked · per-row lock guard | WI-1, WI-5 |
| — | ~~WI-7~~ | File deferred "lock blocks canvas interaction" issue | **HITL — see §7** |

**Dependents-skip map** (if a WI fails twice, skip these too and log it):
- WI-1 fails → skip WI-5, WI-6 (STOP & report — it's the foundation)
- WI-2 fails → WI-5 proceeds but delete/randomize confirms degrade; log it
- WI-4 fails → skip WI-5, WI-6
- WI-5 fails → skip WI-6
- WI-3 fails → independent; continue everything else

---

## 4. Per-WI loop (do this for each step in §3)

1. **Brief the subagent.** Spawn ONE implementation subagent. Give it: this WI's
   section from §6, the cited spec §-numbers (paste the text), the ground-truth
   table (spec §1), and hard rules §1. Tell it: *strict TDD, desktop only, your
   final message is a structured report (files changed, tests added, red→green
   evidence, test count, any seam stubbed).*
2. **Subagent runs red → green → refactor**, then `npm test` + `npm run build`.
3. **You verify** independently: re-run `npm test` and `npm run build`. Confirm the
   WI's acceptance checks (§6) and that no mobile file changed (`git diff --name-only`).
4. **Green →** `git add -A && git commit` with `WI-N: <title>`; append run-log line.
5. **Red after 2 attempts →** §5.

Co-author trailer for commits:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## 5. Failure handling

- Retry once with the subagent (feed it the failing output).
- Still red → `git checkout -- .` / `git clean -fd` the WI's uncommitted work,
  mark it **blocked** in the run log with the error, skip its dependents (§3 map),
  continue with remaining runnable WIs. Never leave the tree red between WIs.

---

## 6. Work items (acceptance criteria + TDD seeds)

> Each subagent writes the **red tests** first. Seeds below are the minimum; add
> edge cases. Files are `*.test.jsx` (Vitest + Testing Library, `within(region)` /
> `data-testid` conventions).

### WI-1 — Layer model (spec §8, §9)
**Files:** `src/lib/useLayers.js`; tests `src/lib/useLayers.naming.test.jsx`.
**Red tests:**
- `createLayer` for a pattern type → `name === 'Pattern (Sg)'` (spirograph) via a
  new `autoLayerName(patternType)`; unknown/symbol-less type → falls back to `Layer N`.
- New layers have `nameIsCustom === false` and `locked === false` — at **both**
  construction sites (`createLayer` and the inline `addLayer`).
- Pattern-switch router: switching `patternType` when `nameIsCustom === false`
  recomputes `name` (`Pattern (Sg)` → `Pattern (Ls)`); when `true`, name is frozen.
- `duplicateLayer`: source auto-named → copy keeps auto-name, `nameIsCustom: false`,
  **no "copy" suffix**; source custom → copy is `"<name> copy"`, `nameIsCustom: true`.
  (Moiré pair duplication preserves the same rule for both members.)
- `loadLayers` migration: persisted layer missing `nameIsCustom` → `true`; missing
  `locked` → `false`. Existing `Layer 1` names are NOT rewritten.
**Acceptance:** `autoLayerName` imported from `constants` `PATTERN_SYMBOLS`; both
creation sites use it; no behavior change for existing saved layers.

### WI-2 — ConfirmDialog danger variant (spec §6, §10.3)
**Files:** `src/components/ui/ConfirmDialog.jsx`; tests `src/components/ui/ConfirmDialog.test.jsx`.
**Red tests:**
- Default (no `danger`) → confirm button keeps `bg-saffron` (snapshot/class assert).
- `danger` prop → confirm button uses a red/destructive token; Esc still cancels,
  Enter still confirms, focus still lands on confirm.
**Acceptance:** backward compatible (existing call shape unchanged); `danger` opt-in.

### WI-3 — Resizable panel (spec §2)
**Files:** `src/components/shell/AppShell.jsx` (`ObjectTreeRegion`); a small hook
`src/lib/hooks/usePanelWidth.js`; tests `src/components/shell/AppShell.resize.test.jsx`
+ `src/lib/hooks/usePanelWidth.test.jsx`.
**Red tests:**
- Default width 280 when no stored value; clamps a stored 999 → 480 and 50 → 200 on load.
- Region renders a handle with `cursor-col-resize` / a `data-testid="object-tree-resize"`.
- Simulated drag updates width and clamps to [200, 480]; **drag-end** writes
  `localStorage["ui.objectTreeWidth"]` (mid-drag does not).
- Double-click handle resets to 280 (+ persists).
**Acceptance:** `w-56` removed; width is state-driven; `window` listeners cleaned
up on unmount; `<body>` `select-none` added during drag and removed after.

### WI-4 — RowMenu popper (spec §4)
**Files:** `src/components/shell/RowMenu.jsx`; tests `src/components/shell/RowMenu.test.jsx`.
**Red tests:**
- Renders items in order Rename · Duplicate · Download · (divider) · Delete; Delete
  carries a danger class; `role="menu"`/`menuitem`.
- Closed by default; opens on trigger; selecting an item fires its callback AND closes.
- Esc closes; click-away closes; only the given menu open (controlled `open`).
- Keyboard ↑/↓ moves focus, Enter activates.
- Flips upward when an `anchorNearBottom`/equivalent prop is set (assert the
  up-vs-down positioning class).
**Acceptance:** inline (not portaled); found via `within(region)`; no new dependency.

### WI-5 — LayerTree row rework (spec §3, §3.1, §3.2, §5, §6, §7) — INTEGRATION
**Files:** `src/components/shell/LayerTree.jsx`; tests update
`src/components/shell/LayerTree.test.jsx`, `LayerTree.rowActions.test.jsx`, and a
new `LayerTree.rename.test.jsx`. Depends on WI-1/2/4.
**Red tests:**
- Row inline order = `[reorder] glyph name op-swatch 🎲 👁 🔒 ⋯`; **no** rand-seed
  icon; dup/download/delete NOT inline (only in RowMenu).
- Clicking the **name** selects the layer; clicking 👁/🔒/⋯ does **not** select.
- Op element renders **swatch + initial only** (no operation-name text inline);
  hover exposes full name (title attr); clicking opens OperationPicker.
- **Double-click name** → input, select-all; Enter commits via
  `onUpdateLayer(id,{name,nameIsCustom:true})`; Esc reverts; empty/whitespace reverts; trims.
- ⋯ **Rename** focuses the same input.
- 🎲 click → ConfirmDialog with the truthful copy; confirm calls the randomize-params
  handler; on a **locked** layer the dice is disabled + `title="Layer locked"` and
  does NOT open the confirm.
- ⋯ **Delete** → ConfirmDialog **danger** with `Delete "<name>"?`; confirm calls delete.
- ⋯ **Duplicate**/**Download** call their handlers.
- Responsive: dice hidden below 240px (container-query rule or `compact` prop —
  test via the chosen mechanism; spec §3.2).
**Acceptance:** all existing LayerTree tests still pass or are updated to the new
layout; RowMenu + ConfirmDialog wired; one menu open at a time.

### WI-6 — Studio wiring (spec §7, §9)
**Files:** `src/pages/Studio.jsx` (+ `useLayers.js` randomize-all if needed);
tests `src/pages/StudioRoute.objectTree.test.jsx`.
**Red tests:**
- A rename in the tree round-trips through Studio → `updateLayer` → persisted name.
- Header "Rand Params" / "Rand Seeds" **skip locked layers** (a locked layer's
  params/seed unchanged; unlocked ones change).
- Per-row randomize handler no-ops on a locked layer.
**Acceptance:** end-to-end rename + lock-aware randomization verified at the route level.

---

## 7. HITL — WI-7 (do NOT auto-run)

File a GitHub issue on `majedbg/Naqsha`:
- **Title:** *Locked layers should ignore canvas interaction (no click-select, no drag-move)*
- **Body:** Forward-looking. Today `layer.locked` only blocks randomization
  (this overhaul). When canvas layer selection/drag is built, locked layers must
  be unselectable + immovable on the canvas — the original pain point (a stray
  canvas click selecting a layer). Reference `docs/object-tree-panel-plan.md` §9.

Leave it for the user (or run `gh issue create` only if the user explicitly says so).

---

## 8. Done criteria

- WI-1…WI-6 committed on `feat/object-tree-panel`, each its own commit, suite green
  throughout; build green.
- Run log complete; any blocked WI documented with its error.
- WI-7 issue filed (or surfaced to the user to file).
- Branch left unmerged for review (do not merge to `main`).
