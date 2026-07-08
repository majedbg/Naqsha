# The Run Plan is a shell-morph destination that owns run conditioning

The Run Plan (reclaiming the "Prepare" phase deleted in #16) is **not** a modal, a
route, or a tab: it is a shell state over the same canvas — the right column swaps
Inspector → plan panel; the canvas re-renders as the machine view (paths tinted by
operation, travel dashed, crops ghosted, optional animated run-through); the left
column stays live. Entries: File ▸ Run plan… (⇧⌘E), the status-bar machine cluster,
and the Export Receipt link. The View ▸ Overlays plot toggle retires into it.

**Boundary rule: the plan edits how the machine executes, never what the design is.**
The Optimize stack (simplify/merge/reorder + CommitSlider) **moves** out of the
bottom-left `OptimizeControls` into the plan panel — its value (travel/time deltas) is
only legible against the plan's numbers. This gives the app exactly two reversibility
geographies: everything outside the plan is live-edit + global undo; the plan's
optimize section is the one deliberate preview→apply→revert surface (per the revised
principle #6 in `.impeccable.md`). Applied optimize values therefore stay **outside**
the ⌘Z stack (their way back is the plan's own Revert) but **persist with the
document** — previously they were bare `useState` and silently vanished on reload,
changing what export produced. Warnings inside the plan describe the post-applied-
optimize geometry (what the machine will actually run), retiring the legacy
pre-optimize overlap basis.

Consequences: the machine-profile switch invited by the plan's title ("Run Plan: Laser
cutting") makes the P0-3 fix a shipping dependency — profile switch becomes a recorded
undoable batch instead of `history.clear()`. Estimation becomes profile-aware: laser
time derives from each operation's own speed × passes (rapid speed is a per-profile
constant, not a setting); plotter keeps AxiDraw constants and adds a flat per-pen-swap
allowance; estimates are always labeled "Estimated". No auto-fix actions in v1 —
warnings locate on canvas (both directions), the maker fixes with tools they know.
