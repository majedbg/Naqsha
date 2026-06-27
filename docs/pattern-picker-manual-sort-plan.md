# Pattern Picker — Manual (drag-to-reorder) sort for the Grid

**Status:** PLANNED (grilled 2026-06-26). Build via /tdd + subagent slices.
**Depends on:** the Grid gallery (`feat/pattern-picker-gallery`, PR #36). Branch this off that
branch (or off `main` once #36 merges) — it extends `PatternGalleryView`.
**Scope:** add an **Auto / Custom** sort toggle to the Grid view. Auto = current family-clustered
sort. Custom = user drag-reorders cards playlist-style (touch + mouse + keyboard) with a vertical
insertion line. Custom order persists per-user (DB for logged-in, localStorage for guests).

---

## Locked decisions (from grill)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Touch support | **Touch + mouse both** (iPad is a target) — HTML5 DnD ruled out |
| 2 | DnD implementation | **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) — touch/mouse/keyboard sensors + a11y; custom insertion-line render |
| 3 | Persistence | **Persist sortMode + manualOrder.** Logged-in → DB (`profiles.settings` jsonb). Guests → localStorage. New/AI patterns append to end of saved order |
| 4 | Guest→login | **DB wins if present, else adopt local** (one-time) |
| 5 | DB storage shape | **`settings jsonb default '{}'` column on `profiles`** (one migration); namespaced `settings.patternPicker = { sortMode, manualOrder }` |
| 6 | Drag gating / mode switch | **Auto-switch:** starting a drag while in Auto flips to Custom the moment click+drag begins (seeds order from current family order). **Escape mid-drag cancels AND reverts** to the prior (Auto) state |
| 7 | Toggle labels | **Auto / Custom** (segmented control in the Grid top bar) |
| 8 | Filter × Custom | **Custom mode: filtered-off cards DIM to 20%** (stay in slot), not removed. **Family/Auto mode unchanged** (hide + reflow) |
| 9 | Dimmed cards | **Inert context only** — not pickable, not draggable, no hover caption; slot preserved so order/insertion math stay real |
| 10 | Empty state | **Keep in Auto mode** (all-off = blank grid needs recovery); **never shown in Custom** (dimming covers it) |

---

## State model (extends slice-2 reducer + slice-3 hook)

Add to picker state:
```
sortMode: 'auto' | 'custom'        // 'auto' = family-clustered (current); 'custom' = manualOrder
manualOrder: string[]               // pattern ids, full order (NOT filtered)
// drag lifecycle (transient, not persisted):
dragPrevMode: 'auto' | 'custom' | null   // remembered at drag-start to revert on Escape
```
Reducer actions (pure, immutable):
- `SET_SORT_MODE(mode)` → set sortMode (when entering custom with empty manualOrder, the HOOK seeds it first — see below)
- `SEED_MANUAL(ids)` → if manualOrder empty/stale, set it to `ids` (current family order) + append any ids not present
- `MOVE(id, toIndex)` → reorder `id` to `toIndex` within manualOrder (the drop result)
- `RESET_MANUAL(ids)` → set manualOrder back to family order `ids` ("Reset order" affordance)
- `DRAG_START(prevMode)` → record `dragPrevMode`, set sortMode='custom'
- `DRAG_CANCEL` → restore sortMode=dragPrevMode, clear dragPrevMode (Escape)
- `DRAG_COMMIT` → clear dragPrevMode (keep custom)

Derivation (in PatternGalleryView, useMemo):
- **Auto mode:** unchanged — filter removes off-family cards, family-clustered sort.
- **Custom mode:** render ALL patterns sorted by `manualOrder` (ids missing from manualOrder appended by family order); off-family cards rendered DIMMED + inert (still in slot). No empty state.

---

## DB persistence

### Migration `…_user_settings_json.sql`
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
```
Confirm existing profiles UPDATE RLS lets a user write their own row's `settings` (read the
initial_schema profiles policies; if the update policy is column-restricted, widen to include
`settings`). Add to the AuthContext profile `select` so settings load with the profile.

### Service `src/lib/settingsService.js`
- `getPatternPickerSettings(profile)` → `profile?.settings?.patternPicker ?? null`
- `patchUserSettings(userId, partial)` → read-merge-write `profiles.settings` (jsonb deep-merge
  under `patternPicker`), guarded (no supabase / guest → no-op). Debounce/throttle at the caller.

### Sync strategy (in `usePatternPicker` or a thin `usePickerPersistence`)
- **Read on open/auth:** logged-in → use DB settings if present; else adopt localStorage (guest→login
  one-time, decision #4) and write it up. Guest → localStorage only.
- **Write:** sortMode change and **drag-END** (NOT per-move) → write localStorage immediately +
  (logged-in) debounced `patchUserSettings` (~600ms). Never write during a drag.
- localStorage stays the offline cache/source for guests; key e.g. `sonoform-pattern-picker-sort`.
- `view` persistence stays as-is (localStorage only) — out of scope to move to DB.

---

## dnd-kit integration — wraps BOTH modes (advisor blocker fix)

**CRITICAL:** you cannot start a dnd-kit drag on an element that isn't already a sortable. So the
auto-switch (decision #6 — drag while in Auto promotes to Custom) REQUIRES the cards to be
`useSortable` inside `DndContext`/`SortableContext` in **Auto mode too**. Therefore:
- `DndContext` + `SortableContext` wrap the grid in **both** Auto and Custom modes; every card is
  always `useSortable` (dimmed/locked ones `disabled`).
- "Auto vs Custom" is purely (a) the DISPLAY ORDER (family-clustered vs `manualOrder`) and (b) whether
  a drag has promoted the session to Custom.
- **Mid-drag set is STABLE (no layout shift under the pointer):** the `SortableContext` item set does
  NOT change during a drag. In Auto mode, filtered-off cards are hidden; if a drag promotes to Custom
  mid-gesture, the dimmed (previously-hidden) cards are materialized **on drop**, not during the drag.
  So during any drag the items = the currently-visible set; the order/seed uses that visible set's ids.
- **Locked/SOON cards:** treat like dimmed — rendered in-slot, `disabled` in useSortable, not
  draggable, not pickable.

- `<DndContext sensors={[Pointer, Keyboard]} onDragStart onDragOver onDragCancel onDragEnd>` +
  `<SortableContext items={orderedIds} strategy={rectSortingStrategy}>`.
  Pointer sensor with an activation constraint (small distance) so a click-to-pick isn't a drag.
- Each card = `useSortable({ id })`. Dimmed (off-family) cards: `disabled: true` in useSortable +
  inert styling; they remain rendered (slot preserved) so indices are real.
- **Auto-switch:** `onDragStart` → `DRAG_START(currentMode)` (+ `SEED_MANUAL` if needed). If we were
  in Auto, we're now Custom for the duration.
- **Escape:** dnd-kit fires `onDragCancel` on Escape → `DRAG_CANCEL` (revert to prior mode). Confirm
  Escape does NOT also close the modal mid-drag (stop-propagation / guard the modal's Escape handler
  while a drag is active).
- **Insertion line:** render a vertical highlighted line (violet accent, e.g. `--violet`) at the
  computed insertion index from the `over`/`activeIndex`→`overIndex` — a custom indicator, NOT
  dnd-kit's default gap-shift (or use a thin pseudo-element between the over target's neighbor).
- `onDragEnd` → `MOVE(active.id, overIndex)` + `DRAG_COMMIT` + persist (drag-end write).
- Keyboard a11y comes free via the Keyboard sensor (space to lift, arrows to move, space to drop);
  dnd-kit announces moves to screen readers.

---

## File plan

| File | Action |
|------|--------|
| `package.json` | ADD `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `supabase/migrations/…_user_settings_json.sql` | NEW — `settings jsonb` on profiles (+ RLS check) |
| `src/lib/settingsService.js` (+ test) | NEW — get/patch user settings jsonb |
| `src/lib/patternPickerReducer.js` (+ test) | EXTEND — sortMode/manualOrder/drag actions |
| `src/lib/hooks/usePatternPicker.js` (+ test) | EXTEND — seed, persistence (DB+local), drag lifecycle API |
| `src/components/PatternGalleryView.jsx` (+ test) | EXTEND — Auto/Custom toggle, custom render path (dim+inert), DndContext/SortableContext, insertion line, empty-state Auto-only |
| `src/components/PatternCard.jsx` (+ test) | EXTEND — `dimmed`/`sortableProps` wiring (inert when dimmed); keep Auto path unchanged |
| `src/lib/AuthContext.jsx` | extend profile select to include `settings` |

---

## TDD slices (each its own green commit)

1. **dep + migration + React-19 GATE** — add dnd-kit deps; **verify dnd-kit ↔ React 19.2**: check peer-dep warnings AND smoke-render one `useSortable` list under StrictMode (double-invoked effects have bitten dnd sensors). If not clean, STOP and report — the library choice must be revisited before anything else is built on it. Write the `settings jsonb` migration. Suite green.
2. **settingsService** — get/patch jsonb deep-merge under patternPicker; guest/no-supabase no-op; last-write-wins (note for future co-writers). Unit tests (mock supabase).
3. **reducer extend (the MOVE safety net)** — sortMode/manualOrder + SEED_MANUAL/MOVE/RESET_MANUAL/DRAG_START/CANCEL/COMMIT. **This is where MOVE-correctness is proven** (jsdom can't drive real drags — see slice 6). Pure unit tests, exhaustive: MOVE(id,toIndex) to every position, Escape-revert, seed-append-new-ids, custom-order-with-hidden-ids.
4. **hook extend** — seed on enter-custom, persistence (DB-wins-else-adopt-local, drag-end debounced write, guest localStorage), drag lifecycle API. renderHook tests w/ mocked settingsService + auth.
5. **Auto/Custom toggle + custom DISPLAY** (no DnD yet) — segmented control (explicit Custom entry, testable without dragging); custom mode renders manualOrder, dims+inerts off-family + locked cards, no empty state; Auto unchanged (empty state kept). RTL tests.
6. **dnd-kit wiring (BOTH modes)** — DndContext/SortableContext wrap the grid in both modes; every card useSortable (dimmed/locked disabled); pointer (activation distance) + keyboard sensors; MOVE on drag-end; auto-switch on drag-start (SEED_MANUAL from visible set); Escape cancel+revert (guard modal Escape); stable mid-drag item set. **jsdom CANNOT drive dnd-kit drags (0×0 getBoundingClientRect breaks collision for pointer AND keyboard sensors) — do NOT thrash unit-testing drags; assert only what renders (context present, cards sortable, disabled flags). Drag correctness lives in slice 3's reducer tests + the slice-7 browser pass.**
7. **insertion line + polish + browser-verify** — violet vertical indicator at insertion index; "Reset order" affordance; reduced-motion; final full suite + browser-verify: mouse drag, touch (devtools emulation), keyboard reorder, persistence across reload AND across login (DB), Escape-cancel, dimmed cards inert.

---

## Edge cases / notes
- **Click vs drag:** pointer sensor activation distance so picking a pattern (click) ≠ a drag.
- **Modal Escape conflict:** while dragging, Escape must cancel the drag, not close the modal.
- **New/AI patterns:** appended to end of manualOrder (SEED/merge keeps unknown ids).
- **Dimmed cards never pickable/draggable** (useSortable disabled + onPick guarded).
- **DB write only on drag-end / toggle** (never per-move) — debounced ~600ms; localStorage immediate.
- **Sequencing:** stack on `feat/pattern-picker-gallery` (PR #36) since this extends the gallery;
  rebase onto main after #36 merges, OR merge #36 first then branch off main.
- **Migration is human-gated** for prod apply (matches the org-admin migration-repair caution).
- **AuthContext client-side upsert:** `fetchProfile` already upserts the profile row (onConflict id).
  Confirm its column list does NOT overwrite `settings` back to `'{}'` on conflict (omit settings from
  the upsert payload, or upsert with `ignoreDuplicates`/explicit column set).
- **`settings` read-merge-write is last-write-wins** — fine for single-user/single-tab now; flag it so a
  future second writer (e.g. moving `colorView` into the same blob) doesn't silently clobber.
- **De-risk recap (advisor):** (1) slice 1 is a hard React-19.2 ↔ dnd-kit gate; (2) jsdom can't drive
  dnd-kit drags, so MOVE-correctness is proven in slice-3 reducer tests, not slice-6 render tests.
