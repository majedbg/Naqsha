# Pattern Picker — "Grid" Gallery View + Family Filter

**Status:** PLANNED (grilled 2026-06-26). Build via /tdd + /impeccable craft.
**Scope:** Add a second view to `PatternPickerModal` ("Choose a pattern"): a dense,
larger-card gallery with a top family-filter pill bar. Existing taxonomy view kept as-is.

---

## Locked decisions (from grill)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Gallery internal layout | **Flat grid, family-clustered** — one dense auto-fill grid, cards sorted so same-family colors sit together, no section headers |
| 2 | Filter scope | **Gallery only** — Map view stays a complete taxonomy map; pills live in & affect only the Grid |
| 3 | Persistence | **Remember view, reset filter** — active tab persisted to localStorage (own key, mirrors `useColorView`); family filter resets to all-on every open |
| 4 | State management | **Dedicated `usePatternPicker` hook backed by a pure reducer** (SET_VIEW, TOGGLE_FAMILY, SELECT_ALL, CLEAR_ALL, RESET) |
| 5 | Card content | **Scaled-up table card** (~50% bigger ≈ 140px): bigger art, symbol chip, name+badges on hover. Reuse `PatternCard` with a `size` prop |
| 6 | Animation | **Tasteful CSS, no new dep** — tab crossfade, card fade+scale on filter, grid CSS reflow, pill press transition, honors `prefers-reduced-motion` |
| 7 | Pill counts | **Show counts** (static family size, see correctness #2) |
| 8 | Custom/AI bucket | **Include in Grid + a "Custom" pill** (neutral color — NOT family `C`, see blocker #1) |
| 9 | Empty state | **Gentle empty state** — "No families selected — [Select all]" when all off |
| 10 | Tab labels | **Map** (taxonomy) / **Grid** (gallery) |
| 11 | First-run tab | **Grid** (then persistence remembers last-used) |

---

## Correctness items (from advisor — must implement)

### BLOCKER 1 — "Custom" must NOT reuse family key `C`
Today `PATTERN_FAMILIES.C` = *Reaction-Diffusion*, and custom/AI patterns are rendered
with `family:'C'` (PatternPickerModal line ~280), kept separate only by their own section.
For the Grid (cluster-by-`familyKey` + a Custom pill + deselected-set), custom patterns
must get a **synthetic family key `'custom'`** with its own deliberate neutral color
(e.g. `#8a8f99`), and be identified by **identity** (`id ∉ PATTERN_TAXONOMY`), not by `C`.
Reaction-Diffusion (`C`) and Custom (`custom`) are then distinct pills/clusters.

### 2 — Single source of truth for "what patterns exist"
Extract one selector, consumed by Map view, Grid view, AND pill counts:
```
getVisiblePatterns(dynamicTypes) -> [{ id, meta, familyKey }]
  • iterate PATTERN_TAXONOMY, skip meta.pickerHidden, validate form/geom (existing warn)
  • append ready dynamic patterns not in taxonomy as { familyKey:'custom', meta: <synthetic> }
```
Prevents Map/Grid enumeration drift (classic bug: Grid forgets `pickerHidden` → shows `moire`).
**Pill counts = static family size from this selector (pickerHidden excluded), NOT the
post-filter result.** (Counts don't shrink as you toggle.)

### 3 — Characterization test of Map view FIRST
The current modal has zero tests. Before extracting `PatternTableView`, write a
characterization test asserting current Map rendering (a known row label, a known card
present, the Custom section) so the refactor is provably non-breaking.

### Minor — card `size`
Drive via inline `style={{ width, height }}`, NOT a Tailwind arbitrary class
(`w-[${size}px]` won't compile). Consistent with the card's existing inline transform/border.

---

## State model (deselected-set — robust to dynamic families)

```
// pure reducer — src/lib/patternPickerReducer.js
state = { view: 'grid'|'map', off: Set<familyKey> }   // `off` = deselected families
  SET_VIEW(view)            -> { ...state, view }
  TOGGLE_FAMILY(key)        -> toggle key in `off`
  SELECT_ALL               -> off = ∅
  CLEAR_ALL(allKeys)        -> off = new Set(allKeys)
  RESET                    -> off = ∅            (filter only; view untouched)
isOn(key) = !off.has(key)   // new families default ON automatically
```
Reducer is **pure** (no localStorage) → unit-test with zero render.

```
// hook — src/lib/hooks/usePatternPicker.js
usePatternPicker({ open }) {
  useReducer(reducer, initFromStorage())        // view seeded from localStorage, default 'grid'
  useEffect persist view -> localStorage         // key: 'sonoform-pattern-picker-view'
  useEffect on open===true -> dispatch RESET     // reset filter each open; survives tab switch
  returns { view, setView, isOn, toggle, selectAll, clearAll }
}
```
Filtered+clustered list computed in the Grid view via `useMemo` over `getVisiblePatterns`
(separation: hook owns state, view owns derivation).

---

## File plan

| File | Action |
|------|--------|
| `src/lib/patternPickerReducer.js` (+ `.test.js`) | NEW — pure reducer + initial state |
| `src/lib/hooks/usePatternPicker.js` (+ `.test.jsx`) | NEW — reducer + persistence + reset-on-open |
| `src/lib/patternCatalog.js` (or in patterns lib) (+ test) | NEW — `getVisiblePatterns()` selector + synthetic `custom` family |
| `src/components/PatternCard.jsx` (+ `.test.jsx`) | EXTRACT from modal; add `size` prop (default 92) |
| `src/components/PatternTableView.jsx` | EXTRACT current Map body verbatim (after characterization test) |
| `src/components/FamilyFilterBar.jsx` (+ `.test.jsx`) | NEW — pills (color, count, aria-pressed) + All/None |
| `src/components/PatternGalleryView.jsx` (+ `.test.jsx`) | NEW — filter bar + clustered grid + empty state |
| `src/components/PatternPickerModal.jsx` | REFACTOR — tablist/tab/tabpanel, compose Map\|Grid, keep ESC + onPick-closes |

`PATTERN_FAMILIES` / constants: add the synthetic `custom` family color (or define it in the
selector module so constants stay taxonomy-only — decide at build, lean: selector module).

---

## TDD slices (each its own commit, full suite green)

0. **Characterization** — pin current Map render (known row, known card, Custom section). RED→GREEN trivially (documents existing behavior).
1. **Selector** — `getVisiblePatterns` (taxonomy + pickerHidden skip + form/geom + custom synthetic family). Pure unit tests incl. the `C`-vs-`custom` distinction.
2. **Reducer** — all 5 actions + `isOn` (deselected-set). Pure unit tests, zero render.
3. **Hook** — `usePatternPicker`: localStorage persist/read, reset-on-open, toggle/all/none. `renderHook`.
4. **PatternCard extract** — move out, `size` prop, table view regression stays green.
5. **FamilyFilterBar** — pills render with color+count+aria-pressed; All/None; click toggles `isOn`.
6. **PatternGalleryView** — clustered grid from selector; deselect family hides its cards; counts stay static; empty state when none; Custom cluster present.
7. **Modal tabs** — tablist/tab/tabpanel roles; default Grid; switch shows Map(existing)/Grid(new); ESC closes; onPick closes.
8. **Polish (impeccable/craft)** — crossfade, card fade+scale on filter, grid reflow, pill transitions, reduced-motion; full suite + browser-verify the modal.

---

## A11y / behavior notes
- Tabs: `role=tablist` / `role=tab aria-selected` / `role=tabpanel`; arrow-key nav between tabs.
- Pills: `<button aria-pressed>` toggles; All/None are plain buttons. Family color as the on-state fill, muted/outline when off.
- Picking a pattern (`onPick`) still closes the modal (unchanged; PatternSelect wires setOpen(false)).
- No focus-trap today — keep parity (do NOT regress); note as a separate future improvement.
- Grid: `grid` + `auto-fill minmax(140px, 1fr)`, cards `aspect-square`, inline width/height for size.
