# Inspector Dock — Right ↔ Bottom Shelf Plan

> Grilled 2026-06-24. A user-switchable toggle to move the pattern **Properties (Inspector)**
> panel between the current **right-docked** vertical column and an Ableton-style **bottom shelf**,
> to support tall/portrait aspect ratios (iPad portrait, where height > width).

## Goal & motivation

The Inspector is hard right-docked at a fixed `w-72` (288px). On portrait/tall screens (iPad
portrait), a right panel steals scarce horizontal width from the canvas. A bottom shelf reclaims
canvas width and puts properties within thumb reach. Feature is **user-switchable**, not forced.

## Survey takeaway (precedent)

No mainstream app toggles the *same* parameter panel between right and bottom. The space splits
into two non-overlapping families, and this feature is a deliberate **hybrid**:
- **Permanently-bottom param shelves:** Ableton (Device/Detail View — horizontal sections, corner-
  triangle toggle, drag-divider resize, Cmd+Opt+L), Logic (Smart Controls / bottom editor pane).
- **User drag-to-dock generic panels + saved workspaces:** Photoshop (blue drop-line), Blender
  (areas + N-panel left/right flip), Unity/Unreal (Layouts).
- Naming verdict: users parse **verb + position** ("Dock Right / Dock Bottom") fastest. "Shelf",
  "tray", "drawer" are evocative but non-standard — keep them out of labels.
- Control home: Apple/Affinity put *position* under **View**; Adobe uses **Window** for show/hide +
  workspaces. This app has no Window menu, so **View** + a visible panel icon.

## Locked decisions

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Dock states | **Right ↔ Bottom** only (no floating, no left). |
| 2 | Auto vs manual | **Manual**, but **smart first-load default**: no saved pref → portrait (height > width) starts **Bottom**, else **Right**. Once user toggles, choice is sticky. Never auto-flip mid-session. |
| 3 | Bottom-shelf reflow | **Responsive group-columns, fit-to-width.** Flow existing param GROUPS into as many ~256px columns as the real width allows (~2–3 at 768px iPad-portrait, more on wide desktop). NOT a fixed 5-column squeeze. |
| 4 | Control home | **Header icon (primary)** on the Inspector + **checkable View-menu entry (secondary)**. |
| 5 | Naming | Tooltip/state: **"Dock Right" / "Dock Bottom"**. View item: **"Dock Properties to Bottom"** (checkable). State: `dockPosition: 'right' \| 'bottom'`. |
| 6 | Resize | **Bottom shelf height-resizable** (drag top divider, `cursor-row-resize`); **right dock stays fixed `w-72`**. |
| 7 | Shelf span | **Full window width** — new row above the status bar; body becomes `[tool-strip \| left column \| canvas]`. |
| 8 | Polish | **Collapse-to-bar** (chevron → thin strip) + **keyboard shortcut** + **persist collapsed state**. **No** dock transition animation (instant snap). |
| 9 | Scope + detect | **AppShell only** (≥768px); MobileStudio (phones) untouched. Smart default detects "tall" by **`innerHeight > innerWidth`** aspect ratio (no matchMedia). |

## Persistence keys (mirror `useTheme` / `usePanelWidth` imperative-write pattern)

- `ui.inspectorDockPosition` → `'right'` | `'bottom'` (default: aspect-ratio-derived on first load)
- `ui.inspectorDockHeight` → px, clamp ~160–520, double-click resets to default (~280)
- `ui.inspectorDockCollapsed` → boolean (bottom only)

## Build sketch (keyed to real files)

All paths under `generative-art-studio/`.

1. **State hook** — new `src/lib/hooks/useInspectorDock.js`, modeled on `useTheme.js`
   (imperative localStorage writes, not effects). Exposes `{ dockPosition, setDockPosition,
   toggleDock, height, onResizeMouseDown, onResizeDoubleClick, collapsed, toggleCollapsed }`.
   First-load default reads `window.innerHeight > window.innerWidth`.

2. **`usePanelHeight.js`** — new hook mirroring `usePanelWidth.js` but Y-axis: `cursor-row-resize`,
   clamp 160–520, persist `ui.inspectorDockHeight`, persist on drag-end + double-click reset only.

3. **`AppShell.jsx`** — conditionally render the Inspector host node:
   - `dockPosition === 'right'` → keep current `<div className="flex flex-col w-72 shrink-0 min-h-0">`
     in the body row (lines ~268–270).
   - `dockPosition === 'bottom'` → drop the right column from the body row; add a **new full-width
     row** below the body (`flex flex-1 min-h-0`) and above `StatusBarRegion`, hosting the shelf with
     a top-divider resize handle (adapt the left-panel resize handle markup, lines ~126–143, to
     horizontal: `cursor-row-resize`, `top-0 left-0 w-full h-1.5`).
   - **Portal architecture means the live Inspector content follows its host node automatically** —
     `Studio.jsx` needs no changes for the move itself.

4. **Inspector header icon** — add a dock-toggle button (two glyphs: dock-right / dock-bottom) to the
   Inspector/Region header. Wire to `toggleDock`. Add collapse chevron when `dockPosition==='bottom'`
   (mirror `OptimizeControls.jsx` / `PanelHeader.jsx` collapse pattern).

5. **Bottom-shelf layout component** — when bottom, wrap `PatternParams` groups in a responsive
   column container. Each `ParamGroup` becomes a column (vertical stack of its rows, its existing
   `space-y-2`), columns laid out as `flex flex-wrap` or CSS columns with a **~256px min column
   width** so count auto-fits the actual width. Horizontal scroll only as last resort.
   - Watch the fixed-width composites: `Pad2D` (104px) and `AngleDial` (104px) set the floor — a
     256px column holds them comfortably; do **not** go below ~240px.

6. **View menu** — `MenuBar.jsx` View items (lines ~183–212): add checkable
   `{ label: "Dock Properties to Bottom", checkable: true, checked: dockPosition==='bottom',
   onSelect: onToggleDock }`. Wire `onToggleDock` from `Studio.jsx`.

7. **Keyboard shortcut** — no global shortcut system exists today (all keydown handlers are local).
   Add a small `window` keydown listener (in `useInspectorDock` or Studio) for **`Ctrl/Cmd+Alt+P`**
   (P = Properties) → `toggleDock`. Verify against browser defaults; guard against firing while a
   text input is focused.

## Verification checklist

- iPad-portrait (768px) first load with no saved pref → defaults to **Bottom**; landscape → **Right**.
- Bottom shelf at 768px shows **2–3 readable group-columns**, sliders not collapsed, dials not clipped,
  no horizontal scroll for a typical 9–13-row pattern.
- Drag top divider resizes height within clamp; double-click resets; height persists across reload.
- Collapse chevron → thin bar; state persists; toggle still reachable.
- View-menu checkmark + header icon + `Ctrl/Cmd+Alt+P` all stay in sync.
- MobileStudio (<768px) unchanged.
- Toggling never touches Studio's portaled Inspector content (selection/edit state intact across moves).

## Deferred (explicitly out of scope)

Floating/detachable dock; left-edge dock; right-dock width resize (fast-follow); height-aware
list↔grid switch; compact label-less knob controls (true Ableton density); dock support inside
MobileStudio; saved multi-panel "workspaces"; dock transition animation.
