# Inspector Dock — Feature Reference

> Shipped on `feat/inspector-dock` (WI-1…WI-6 + WI-4b). This is the durable
> reference for how the right↔bottom Properties dock works. Spec: `inspector-dock-plan.md`.
> Build journal: `inspector-dock-run-log.md`.

## What & why

The pattern **Properties / Inspector** panel can dock either **right** (the
classic vertical `w-72` rail) or **bottom** (a full-width, height-resizable
shelf). On portrait / tall screens — iPad portrait especially, where
`height > width` — a right rail steals scarce horizontal width from the canvas;
the bottom shelf reclaims that width and puts the params within thumb reach. The
feature is **user-switchable and sticky**, never forced and never auto-flipped
mid-session. Desktop-only (the pro shell, ≥768px); `MobileStudio` is untouched.

## Using it

- **Switch docks** — three converging entry points, all driving one state:
  - the **dock-toggle icon** in the Inspector header (names the destination:
    "Dock Bottom" when on the right, "Dock Right" when on the bottom);
  - **View → "Dock Properties to Bottom"** (a checkmark reflects the live state);
  - the keyboard shortcut **Ctrl/Cmd + Alt + P** (P = Properties). The shortcut is
    ignored while a text input / textarea / contenteditable is focused, so it
    never steals a keystroke.
- **Smart first-load default** — with no saved preference, the dock starts
  **bottom** on a portrait window (`innerHeight > innerWidth`) and **right**
  otherwise. After your first manual toggle the choice is sticky and always wins
  over aspect ratio on later loads. The dock **never** auto-flips during a session
  (resizing the window does not move it).
- **Resize the shelf** (bottom only) — drag its **top edge** (the `row-resize`
  handle); dragging up grows it. Height clamps to **160–520px**.
  **Double-click** the handle to reset to **280px**. The height persists.
- **Collapse the shelf** (bottom only) — click the **chevron** in the header to
  collapse to a thin ~36px bar (the header keeps peeking, so you can re-expand);
  click again to restore. The collapsed state persists.
- The **right dock stays a fixed `w-72`** (288px) — width-resize there is a
  deferred fast-follow (see below).

## Architecture

Four moving parts, plus one insight that made the move cheap.

1. **`useInspectorDock`** (`src/lib/hooks/useInspectorDock.js`) — the single
   source of truth. Owns `dockPosition` (`'right'|'bottom'`) and `collapsed`.
   Imperative persistence (writes only inside the toggle/setter callbacks, never
   in an effect — mirrors `useTheme`). Computes the aspect-ratio first-load
   default; a saved value always wins; garbage coerces to the default
   (`KNOWN_POSITIONS` guard). Also hosts the one global `Ctrl/Cmd+Alt+P` keydown
   listener (AppShell mounts the hook once, so the listener is registered once).
2. **`usePanelHeight`** (`src/lib/hooks/usePanelHeight.js`) — the shelf's
   resizable, persisted height. A Y-axis twin of `usePanelWidth`: top-edge drag
   (`next = clamp(startHeight - (clientY - startY))`), persist on drag-end +
   double-click reset only, listeners torn down on unmount.
3. **`InspectorShelf`** (`src/components/shell/InspectorShelf.jsx`) — pure layout.
   Flows its **direct children** (the `ParamGroup`s) into a fit-to-width CSS grid.
   Column count is computed in JS from a measured width —
   `columnCount(w) = max(1, floor(w / 256))` rendered as
   `repeat(n, minmax(0, 1fr))` — **not** CSS `auto-fill` (jsdom can't resolve
   auto-fill, so this is what makes the "2–3 columns at 768px" gate a real,
   deterministic unit test). Each group is an atomic grid item (`min-w-0`) so it
   never splits and a fixed 104px `Pad2D`/`AngleDial` fits without overflow.
   Production measures its own width via a guarded `ResizeObserver`.
4. **`AppShell`** (`src/components/shell/AppShell.jsx`) — renders the Inspector
   host either in the existing right `w-72` column (`'right'`, byte-unchanged) or
   in a new full-width shelf row below the body and above the status bar
   (`'bottom'`) with the top-edge resize handle + collapse-to-bar.

**The insight — dock state reaches the portaled Inspector via React context, so
the move needs ZERO `Studio.jsx` changes.** `Studio` React-portals its
`<Inspector>` into the host node that AppShell publishes. A portal relocates only
the *DOM* node — the portaled subtree is still a React *descendant* of AppShell's
providers. So AppShell wraps `{children}` in a null-default
`InspectorDockProvider` (`inspectorDockContext.js`, mirroring the `shellSlots`
pattern), and the portaled consumers read it directly:
- **`PatternParams`** (WI-4b) wraps its `PARAM_GROUPS` output in `<InspectorShelf>`
  when `dockPosition==='bottom'` → the real 2–3 columns. Featured param stays
  pinned above; guest locked-summary stays below; gate/guest logic untouched.
- **`DockToggle`** (WI-5), inside the Inspector header, renders the dock-toggle +
  collapse chevron. Living inside the (portaled) Inspector content keeps the
  right-dock *shell* byte-unchanged while the toggle still appears in both modes.
- **`MenuBar`** (WI-6), also portaled, appends the checkable View item.

Moving the host node remounts the portal subtree, but selection/edit state lives
in Studio's `useLayers` (which never unmounts), so it survives the toggle for free
— node identity is deliberately *not* preserved.

```
 dockPosition = 'right' (landscape default)        dockPosition = 'bottom' (portrait default)
 ┌───────────────────────────────────────┐        ┌───────────────────────────────────────┐
 │ menu bar                               │        │ menu bar                               │
 │ contextual control bar                 │        │ contextual control bar                 │
 ├──┬──────────┬───────────────┬──────────┤        ├──┬──────────┬───────────────────────────┤
 │T │ left     │   canvas      │ Inspector│        │T │ left     │        canvas             │
 │o │ column   │               │  (w-72   │        │o │ column   │                           │
 │o │ (tree +  │               │  rail)   │        │o │ (tree +  │                           │
 │l │  ops)    │               │  ▲params │        │l │  ops)    │                           │
 │  │          │               │  │stack  │        │  │          │                           │
 ├──┴──────────┴───────────────┴──────────┤        ├──┴──────────┴───────────────────────────┤
 │ status bar                             │        │ ═══ resize handle (drag top edge) ═══   │
 └───────────────────────────────────────┘        │ Inspector shelf  [grp│grp│grp] 2–3 cols │
                                                   ├───────────────────────────────────────┤
                                                   │ status bar                             │
                                                   └───────────────────────────────────────┘
```

## Persistence

All keys are written imperatively (on toggle / drag-end / reset), read on mount.

| Key | Values | Default | Clamp / guard |
|-----|--------|---------|---------------|
| `ui.inspectorDockPosition` | `'right'` \| `'bottom'` | aspect-ratio on first load (portrait→bottom, else right) | unknown value → aspect default |
| `ui.inspectorDockCollapsed` | `'true'` \| `'false'` | `false` | non-boolean → `false` |
| `ui.inspectorDockHeight` | px integer | `280` | clamp 160–520; finite-out-of-range clamps, garbage → 280 |

## File map

| File | Role |
|------|------|
| `src/lib/hooks/useInspectorDock.js` | Dock-position + collapsed state, smart default, persistence, the `Ctrl/Cmd+Alt+P` listener (WI-1, WI-6) |
| `src/lib/hooks/usePanelHeight.js` | Shelf height: top-edge drag-resize, clamp, persist (WI-2) |
| `src/components/shell/InspectorShelf.jsx` | Pure fit-to-width group-column grid (WI-3) |
| `src/components/shell/inspectorDockContext.js` | Null-default context bridging dock state through the portal (WI-4) |
| `src/components/shell/AppShell.jsx` | Conditional right-column vs full-width shelf row + resize/collapse (WI-4) |
| `src/components/PatternParams.jsx` | Columnizes its groups via `InspectorShelf` when docked bottom (WI-4b) |
| `src/components/shell/DockToggle.jsx` | Header dock-toggle icon + collapse chevron (WI-5) |
| `src/components/shell/Inspector.jsx` | Renders `<DockToggle/>` atop each branch (WI-5) |
| `src/components/shell/MenuBar.jsx` | Checkable "Dock Properties to Bottom" View item (WI-6) |

Tests sit beside each file (`*.test.jsx`); `AppShell.dock`, `PatternParams.dock`,
`DockToggle`, `MenuBar.dock`, `useInspectorDock.shortcut` cover the feature.

## Verification (manual QA script)

1. **Smart default** — clear `localStorage`, set an iPad-portrait viewport
   (e.g. 768×1024), load: dock starts **bottom**. A landscape viewport starts
   **right**. *(Verified live: at 768×1024 with cleared storage, defaulted bottom.)*
2. **The 768px column proof (load-bearing)** — in the bottom shelf at 768px,
   the params reflow into **2–3 readable columns**, sliders not collapsed, dials
   (`Pad2D`/`AngleDial`) not clipped, **no horizontal scroll**.
   *(Verified live: `inspector-shelf-grid` resolved to `360.625px 360.625px` = 2
   columns ≥ 240px each, 5 groups, no horizontal overflow; unit gate
   `columnCount(768) ∈ {2,3}` passes deterministically.)*
3. **Resize** — drag the shelf's top edge: height changes within 160–520 (drag up
   grows); double-click resets to 280; reload preserves the height.
4. **Collapse** — chevron collapses to a ~36px bar; the header still shows the
   chevron; re-expand restores; reload preserves the collapsed state.
5. **Convergence** — the header icon, View → "Dock Properties to Bottom", and
   `Ctrl/Cmd+Alt+P` all flip the same `dockPosition` and the View checkmark stays
   in sync. The shortcut does nothing while typing in a field.
6. **Right dock unchanged** — toggle back to right: the `w-72` rail layout is
   identical to before the feature (regression-guarded in `AppShell.dock.test`).
7. **Mobile** — below 768px, `MobileStudio` is unchanged (no dock UI).

## Extension points / deferred (out of scope)

From the spec's "Deferred" list, in rough priority order:
- **Right-dock width resize** (fast-follow) — the right rail is fixed `w-72` today.
- **Height-aware list↔grid switch** — denser layout when the shelf is short.
- **Compact, label-less knob controls** — true Ableton-style density.
- **Dock support inside `MobileStudio`**.
- **Floating / detachable dock**, left-edge dock, saved multi-panel "workspaces",
  and a dock transition animation (today the snap is instant by design).

### Known minor polish item
The bottom shelf row uses `overflow-hidden` (to clip the body when collapsed),
which also clips the top ~half of the resize handle — it's still grabbable via its
lower half. A future polish pass could move the clip to an inner wrapper.
