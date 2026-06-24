# Inspector Dock — Orchestrator Runbook (TDD)

> **Paste this whole file as the first message of a fresh Claude Code session**
> (run from `/Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio`).
> It turns that session into an **orchestrator** that implements the Inspector
> right↔bottom-shelf dock toggle end-to-end, in dependency order, each work item via
> a **TDD subagent** (red → green → refactor), leaving `npm test` + `npm run build`
> green after every item, and finishing with a **reference doc** (Phase D).

---

## 0. Mission

Implement work items **WI-1 … WI-6** of the Inspector dock feature on a fresh
integration branch `feat/inspector-dock`, in the order in §3, each by spawning **one
implementation subagent that follows strict TDD**. After each WI, **you** (the
orchestrator) independently verify tests + build are green, commit, log, and move on.
Then run **Phase D** (documentation) and **Phase E** (HITL hand-off). The end state
is a reviewable branch + a future-reference `docs/inspector-dock-FEATURE.md`.

Source-of-truth docs (read once at start; pass the relevant slice to every subagent):
- `docs/inspector-dock-plan.md` — locked decision spec (the §/Q-numbers below cite its
  "Locked decisions" table and "Build sketch").
- This runbook — per-WI acceptance criteria + TDD seeds.

**The one load-bearing risk** (caught in grilling): on a **768px** iPad-portrait shelf,
the params must reflow into **2–3 readable ~256px columns** — NOT a 5-column squeeze that
collapses sliders and clips the fixed 104px `Pad2D`/`AngleDial`. Every layout WI must
prove this with a width-constrained test. If a subagent can't, it STOPS and reports.

---

## 1. Hard rules (do not violate, even to "make progress")

1. **Never proceed past a red suite.** If `npm test` or `npm run build` fails and a
   retry doesn't fix it, STOP advancing that WI (see §5).
2. **TDD is mandatory.** Every subagent writes failing tests FIRST (red), shows them
   failing, then implements to green, then refactors. No implementation-before-test.
3. **One commit per WI**, on `feat/inspector-dock` only. Never commit to `main`, never
   force-push, never `git reset --hard` shared history.
4. **No scope drift.** A subagent implements exactly its WI's acceptance criteria. If it
   needs something another WI owns, it stubs the seam and logs it; it does not reach across.
5. **Desktop only.** Never modify `MobileStudio.jsx` or mobile tests. This feature lives
   only in `AppShell` (≥768px). (spec Q9)
6. **Preserve the current default.** `dockPosition` defaults to **`'right'`** whenever a
   saved pref exists or width ≥ height. The existing right-dock layout must be byte-for-byte
   unchanged when `dockPosition === 'right'`.
7. **Don't break the portal.** Moving the Inspector host node must re-parent the live
   `Studio` content with **zero** changes to `Studio.jsx`'s portal targets. If a WI is
   tempted to touch the slot providers, it's doing it wrong — log and stop.
8. **2-attempt cap per WI.** On a second failure: mark blocked, revert that WI's uncommitted
   changes, skip its dependents, continue with the rest (§5).
9. If anything is ambiguous or a decision is missing, **do not guess** — log it as a
   question for the user and skip to the next runnable WI.

---

## 2. One-time preflight

```bash
cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio
node -v                          # expect v22.x
npm ci || npm install
npm test                         # BASELINE must be GREEN before starting
npm run build                    # BASELINE build must pass too
git checkout -b feat/inspector-dock   # integration branch off current HEAD
```

- If the baseline is red, **stop and report** — do not start on a broken base.
- Commit the two planning docs first (`docs/inspector-dock-plan.md`, this file) if not
  already committed.
- Create a run log `docs/inspector-dock-run-log.md`; append one line per WI (status,
  commit SHA, test delta, notes).

Reusable commands: tests `npm test` · build `npm run build` · lint `npm run lint` · dev
server (only if a subagent needs browser verification) `npm run dev`.

---

## 3. Execution order (topological)

WI-1, WI-2, WI-3 are **mutually independent** (run sequentially unattended). WI-4
restructures the shell and consumes all three. WI-5 adds the in-panel control. WI-6
wires the menu/Studio/shortcut.

| Step | WI | Title | Blocked by |
|----:|:--:|-------|------------|
| 1 | **WI-1** | `useInspectorDock` hook: `dockPosition` state · aspect-ratio smart default · `collapsed` · persistence | — |
| 2 | **WI-2** | `usePanelHeight` hook: Y-axis drag-resize + clamp + persist (`ui.inspectorDockHeight`) | — |
| 3 | **WI-3** | `InspectorShelf` layout: responsive fit-to-width group-columns (the 768px proof) | — |
| 4 | **WI-4** | `AppShell` restructure: render Inspector host at right **or** full-width bottom row + row-resize handle | WI-1, WI-2, WI-3 |
| 5 | **WI-5** | Inspector header **dock-toggle icon** + **collapse chevron** | WI-1 |
| 6 | **WI-6** | View-menu entry · `Studio` wiring · `Ctrl/Cmd+Alt+P` global shortcut | WI-1, WI-5 |
| — | Phase D | **Documentation** — write `docs/inspector-dock-FEATURE.md` | all WIs green |
| — | Phase E | **HITL** — surface deferred items (right-dock resize, etc.) to the user | — |

**Dependents-skip map** (if a WI fails twice, skip these too and log it):
- WI-1 fails → skip WI-4, WI-5, WI-6 (STOP & report — it's the foundation)
- WI-2 fails → WI-4 can still ship a **fixed-height** bottom shelf; log degraded resize
- WI-3 fails → WI-4 can still move the panel but content is cramped; log the 768px risk as unmet
- WI-4 fails → skip WI-5, WI-6 (nothing to toggle) — STOP & report
- WI-5 fails → WI-6 proceeds (menu + shortcut still toggle); log missing icon
- WI-6 fails → feature works via the header icon only; log missing menu/shortcut

---

## 4. Per-WI loop (do this for each step in §3)

1. **Brief the subagent.** Spawn ONE implementation subagent. Give it: this WI's section
   from §6, the cited spec rows (paste the text), the load-bearing 768px rule (§0), and
   hard rules §1. Tell it: *strict TDD, desktop only, your final message is a structured
   report (files changed, tests added, red→green evidence, test count, any seam stubbed).*
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

> Each subagent writes the **red tests** first. Seeds below are the minimum; add edge
> cases. Tests are `*.test.jsx` / `*.test.js` (Vitest + Testing Library, `within(region)`
> / `data-testid` conventions). Mirror existing hooks: `src/lib/useTheme.js` (imperative
> localStorage writes, NOT effects) and `src/lib/hooks/usePanelWidth.js`.

### WI-1 — `useInspectorDock` hook (spec Q2, Q5, Q8, Q9)
**Files:** `src/lib/hooks/useInspectorDock.js`; tests `src/lib/hooks/useInspectorDock.test.jsx`.
**Red tests:**
- No saved pref + `innerHeight > innerWidth` (portrait) → `dockPosition === 'bottom'`; no
  saved pref + landscape → `'right'`. (Stub `window.innerWidth/innerHeight` per case.)
- A saved `ui.inspectorDockPosition` **always wins** over aspect ratio (sticky).
- `toggleDock()` flips right↔bottom and **imperatively** writes `ui.inspectorDockPosition`
  (write happens on toggle, not via an effect).
- `collapsed` defaults `false`; `toggleCollapsed()` flips it and persists
  `ui.inspectorDockCollapsed`; collapsed state survives a remount (re-read from storage).
- Unknown/garbage stored values fall back to the aspect-ratio default (mirror
  `useTheme`'s `KNOWN_THEMES` guard).
**Acceptance:** exposes `{ dockPosition, setDockPosition, toggleDock, collapsed, toggleCollapsed }`;
no React effect writes to localStorage; storage keys exactly `ui.inspectorDockPosition` /
`ui.inspectorDockCollapsed`.

### WI-2 — `usePanelHeight` hook (spec Q6)
**Files:** `src/lib/hooks/usePanelHeight.js`; tests `src/lib/hooks/usePanelHeight.test.jsx`.
**Red tests:**
- Default height ~280 when no stored value; clamps stored 999 → 520 and 50 → 160 on load.
- Returns `onMouseDown` that begins a **vertical** (Y-axis) drag; simulated drag updates
  height and clamps to [160, 520]; **drag-end** writes `localStorage["ui.inspectorDockHeight"]`
  (mid-drag does not — mirror `usePanelWidth`'s `latestWidth`/persist-on-up pattern).
- `onDoubleClick` resets to 280 (+ persists).
- `window` listeners cleaned up after drag; `<body>` gets a drag class during and loses it after.
**Acceptance:** pure Y-axis twin of `usePanelWidth`; constants `MIN_HEIGHT=160`, `MAX_HEIGHT=520`,
`DEFAULT_HEIGHT=280`, `STORAGE_KEY="ui.inspectorDockHeight"` exported.

### WI-3 — `InspectorShelf` responsive layout (spec Q3 corrected) — THE 768px PROOF
**Files:** `src/components/shell/InspectorShelf.jsx`; tests `src/components/shell/InspectorShelf.test.jsx`.
**What it is:** a presentational wrapper used **only** when docked bottom. It lays the
existing `ParamGroup` children into columns sized to a **~256px minimum** so the column
count auto-fits the available width (CSS `columns`/`grid-template-columns:
repeat(auto-fill, minmax(256px, 1fr))`, or `flex flex-wrap` with `min-w-[256px]` items).
Each group keeps its own vertical `space-y-2` stack internally — no per-param redesign.
**Red tests:**
- At a constrained container width of **768px**, the rendered layout exposes **2–3 columns**
  (assert via the computed `grid-template-columns` track count or the wrap geometry), and
  **no** child column is narrower than 240px.
- At a **wide** width (e.g. 1400px) the same content yields **more** columns (≥4) — proves
  fit-to-width, not a fixed count.
- A group containing a fixed-width composite (mock a 104px `Pad2D`/`AngleDial` child) does
  **not** overflow its column (no horizontal scroll within a column).
- Renders an arbitrary set of `ParamGroup` children in source order; empty groups don't
  create empty columns.
**Acceptance:** zero changes to `Slider`/`ParamRow`/`Pad2D`/`AngleDial`; the component is
pure layout; the 768px column-count assertion is the gate (if it can't pass, STOP per §0).

### WI-4 — `AppShell` restructure (spec Q1, Q6, Q7) — INTEGRATION
**Files:** `src/components/shell/AppShell.jsx`; tests `src/components/shell/AppShell.dock.test.jsx`.
Depends on WI-1/2/3.
**Red tests:**
- `dockPosition === 'right'` → Inspector host renders in the body row as the current
  `flex flex-col w-72 shrink-0` column; the DOM/layout matches the pre-feature snapshot
  (regression guard for hard rule 6).
- `dockPosition === 'bottom'` → the right column is **absent** from the body row, and a
  **new full-width row** renders below the body and **above** `StatusBarRegion`, hosting
  the Inspector node wrapped in `InspectorShelf`.
- The bottom row carries a **top-edge** resize handle with `cursor-row-resize` /
  `data-testid="inspector-shelf-resize"`, wired to WI-2's `usePanelHeight`; its height
  reflects the hook value.
- The Inspector **host node identity is preserved** across a right→bottom toggle (the same
  callback-ref node is re-parented, not recreated) so portaled `Studio` content survives —
  assert the `data-testid` host element persists and slot providers are untouched.
- When `collapsed` (bottom only), the shelf renders a thin bar (height ≈ header only) but
  the toggle/host remain reachable.
**Acceptance:** body row becomes `[tool-strip | left column | canvas]` when bottom; right
path unchanged; no `Studio.jsx` edits; mobile path untouched.

### WI-5 — Inspector header control (spec Q4, Q8)
**Files:** the Inspector/Region header (e.g. `src/components/shell/AppShell.jsx`
`InspectorRegion` header or a small `DockToggle.jsx`); tests `DockToggle.test.jsx`.
**Red tests:**
- A dock-toggle button renders in the Inspector header with two glyph states (dock-right /
  dock-bottom) reflecting `dockPosition`; `aria-label` reads "Dock Right"/"Dock Bottom";
  click calls `toggleDock`.
- When `dockPosition === 'bottom'`, a **collapse chevron** renders (mirror
  `OptimizeControls.jsx`/`PanelHeader.jsx` chevron); click calls `toggleCollapsed`;
  chevron rotates per collapsed state. Chevron is absent when docked right.
**Acceptance:** visible in both dock states; touch-target ≥ the app's icon-button size;
no selection side effects.

### WI-6 — Menu · Studio wiring · keyboard shortcut (spec Q4, Q5, Q8)
**Files:** `src/components/shell/MenuBar.jsx` (View items), `src/pages/Studio.jsx`
(handler + global listener); tests `MenuBar.dock.test.jsx`, `Studio.dock.test.jsx`.
**Red tests:**
- View menu contains a **checkable** item `"Dock Properties to Bottom"`, `checked` ===
  `dockPosition === 'bottom'`, `onSelect` → `toggleDock`.
- `Ctrl/Cmd+Alt+P` on `window` toggles the dock; the listener **ignores** the event when an
  `<input>`/`<textarea>`/`contenteditable` is focused (don't hijack text entry); listener is
  added once and removed on unmount.
- A toggle from the menu, the header icon (WI-5), and the shortcut all converge on the same
  `dockPosition` (single source of truth via WI-1's hook).
**Acceptance:** no global shortcut system existed before — this adds exactly one guarded
`keydown` listener; chosen combo verified not to collide with a browser default.

---

## Phase D — Documentation (run after WI-1…WI-6 are green; the user's explicit ask)

Spawn ONE documentation subagent to write `docs/inspector-dock-FEATURE.md` — the **future
reference** for how the shipped feature works. It must contain:
- **What & why** (1 para): right↔bottom dock for portrait/iPad.
- **User guide:** how to switch (header icon, View → "Dock Properties to Bottom",
  `Ctrl/Cmd+Alt+P`), how to resize (drag the shelf's top edge; double-click resets), how to
  collapse, and the smart first-load default rule.
- **Architecture:** the three hooks (`useInspectorDock`, `usePanelHeight`) + `InspectorShelf`
  + the `AppShell` conditional row, and the **portal re-parenting** insight that made the
  move cheap. One small ASCII diagram of both layouts.
- **Persistence table:** the three `ui.*` keys, their values, defaults, clamps.
- **Extension points / deferred:** right-dock width resize, height-aware list↔grid,
  compact knob controls, MobileStudio support, floating dock (cite spec "Deferred").
- **File map:** every file added/changed with a one-line role.
- **Verification:** restate the spec's checklist as a manual QA script (esp. the 768px
  2–3-column check).

Commit as `docs: inspector-dock feature reference`. Append the final run-log line.

## Phase E — HITL hand-off (do NOT auto-implement)

Surface to the user (do not code): the **Deferred** list from `docs/inspector-dock-plan.md`
— right-dock width resize (fast-follow), height-aware list↔grid switch, compact label-less
knob controls, dock inside MobileStudio, floating dock. Offer to file them as issues on
`majedbg/Naqsha` via `/to-issues` **only if the user asks**.

---

## 7. Done criteria

- WI-1…WI-6 committed on `feat/inspector-dock`, each its own commit, suite green throughout;
  `npm run build` green.
- The **768px → 2–3 readable columns** test (WI-3) is present and passing — the load-bearing
  risk is provably met, not assumed.
- Right-dock layout proven unchanged when `dockPosition === 'right'` (WI-4 regression test).
- `docs/inspector-dock-FEATURE.md` written (Phase D); `docs/inspector-dock-run-log.md` complete,
  any blocked WI documented with its error.
- Deferred items surfaced to the user (Phase E).
- Branch left **unmerged** for review (do not merge to `main`).
```
