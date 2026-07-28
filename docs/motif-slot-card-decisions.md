# Motif slot card — grilled decisions (2026-07-28)

Branch `feat/motif-module-glyph-ui`. Reworks `SortableSlotChip`
(`src/components/shell/MotifBlockRack.jsx:498`) so a slot in the Sequencer wears
the same control language as the per-glyph popover (`GlyphPopover.jsx`, #139).

## The framing fact

`Slot` already carries `sizeScale`, `rotationOffset` and `flip`
(`src/lib/motif/sequencer.js:46`), all consumed by the placement engine
(`placementEngine.js:371-445`). Nothing in the rack exposes them — the vine
starter chip writes `rotationOffset: 180` in code (`starterChips.js:175`) and
that is the only way they are ever set. **This is surfacing existing fields, not
adding a model.**

## Decisions

| # | Decision | Verdict |
|---|---|---|
| 1 | Rotation semantics | **Relative offset** from the host path — keeps `rotationOffset`'s meaning, keeps vine docs working. Readout must be signed (`+180°`) to distinguish it from the popover's absolute bearing. |
| 2 | Scale semantics | **Repack** — writes `slot.sizeScale`, which the engine already honours *before* the empty-circle test, so neighbours move. (The popover's scale is post-placement and overlaps; these two look identical and behave differently by design.) |
| 3 | Scale units | **Percent**, importing `SCALE_MIN/MAX/STEP/FORMAT/PARSE` from `glyphPopoverPlacement.js` so both surfaces are literally the same numbers. Cascade: layer `Size` × slot `sizeScale` × per-anchor override `scale`. |
| 4 | Eye | **Beat stays empty.** Writes `rest: true` while KEEPING `glyphRef`; un-hiding restores the exact glyph. Rhythm and downstream slots untouched. `makeAssignment` already early-returns on `rest`, so this is free in the engine. |
| 5 | Layout | **Inline rows in every chip** — the whole popover UI copied down, nothing behind a click. |
| 6 | Blast radius | **One chip everywhere** — flat Sequencer and all three Zones (Apex / Stem / Cell, ADR 0008). |
| 7 | Flip | **Tri-state icon on the scale row**, mirroring the angle-rnd icon's position. Ghosted = inherit (`undefined`), solid = flipped, struck = never flip — preserving `flipSpecified`'s full expressivity. |
| 8 | Angle-rnd disclosure | **One row**: `±30°` DragNumber + two small spread toggles drawn as their distribution shapes (flat ▬ / bell ▲). The icon on the rotation row both enables and reveals; off removes `rotationRandom`. |
| 9 | Strip | **Widen chip to ~124px**, keep `flex-nowrap overflow-x-auto`. ~3 chips visible before scrolling. |
| 10 | `…` menu | **Duplicate slot · Reset settings · Delete slot.** No clipboard — a slot's settings are a different shape from `glyphClipboard`'s `{scale, angle}`. |
| 11 | Preview | **Live preview, coalesced undo.** Mechanism already exists: `updateLayer` coalesces by `${id}:params` for 400ms, and `flushEdit` is threaded to the canvas overlay as `onFlushHistory` (`Studio.jsx:2451`). Thread the same prop into `MotifBlockRack`; flush once before a gesture's first write and once on commit. |
| 12 | Weight | **DragNumber row** (linear, 0–5, step 0.5), Random mode only, above scale. Last slider on the card goes. |
| 13 | Rest vs hidden | **Ghosted thumbnail, eye struck** for a hidden glyph (you can see what is muted); a pure Rest keeps the dashed REST plate and shows no eye. Renderer branches on `glyphRef` presence. |
| 14 | Prototype | **In-app**, as a new variant in the existing DEV-gated `src/components/shell/motif-prototypes/` harness — real primitives, real rail width, fake chain, no document writes. |

## Target chip

```
┌──────────┐┌──────────┐┌──────────┐
│◉   ⠿   …││◍   ⠿   …││    ⠿   …│   eye · grip · overflow
│    ✚    ││   (✚)   ││ ╌ REST ╌│   thumb → glyph browser
│ wt 1.5  ││         │└──────────┘   Random mode only
│ 100%  ⇄ ││ 140%  ⇄ │                scale + flip
│  +0°  ≋ ││+180°  ≋ │                rotation + angle-rnd
│ ±30° ▬▲ │└──────────┘                disclosed when ≋ on
└──────────┘
   active    hidden     pure rest
```

## Decision 13, settled

A hidden glyph **keeps its control rows** — ghosted and still editable, so a
muted glyph can be tuned before it comes back, and the strip height does not
jump as you toggle. The whole chip drops in opacity, not just the thumbnail.
A pure Rest still collapses to header + REST plate (+ weight in Random mode).

## Prototype (round 1) — `?slotcard=A|B|C`

`npm run dev` → `http://localhost:5173/?slotcard=A`, `←`/`→` to cycle.
Screenshots: `node scripts/proto-slotcard-shots.mjs <outDir>`.

Cost that the screenshots hide: **A and C read `180°`, B reads `+180°`.**
`DragDial` has no `format` prop, hard-codes `{value}°`, declares
`aria-valuemin={0} aria-valuemax={360}`, and draws a "12 o'clock reference —
absolute bearings are read from here" tick (`DragDial.jsx:209-235`). Picking A
or C therefore means teaching the shared dial a signed readout — in a component
`GlyphPopover` depends on, where the unsigned absolute reading is correct.

### Capture / cleanup, when a variant wins

Fold the winner into `SortableSlotChip` properly (it was written under prototype
rules — no tests, no error handling), then drop from main:

1. `src/components/shell/motif-prototypes/SlotCardVariants.jsx`
2. `src/components/shell/motif-prototypes/SlotCardPrototypeOverlay.jsx`
3. the import + `<SlotCardPrototypeOverlay />` mount in `src/pages/Studio.jsx`
4. `scripts/proto-slotcard-shots.mjs`
5. this section

Do NOT copy the prototype's flush seam. `useCell` latches `opened.current` on
first `onChange` and clears it on `onCommit` — but `DragNumber` emits neither
when a gesture ends where it started, so the latch stays set and the NEXT
gesture skips its opening flush, folding two edits into one undo entry. Take
the discipline from `AnchorGhostOverlay`, which already ships it against real
undo.

## Risks carried

- `editChain` signature is `${id}:params` for every chain edit, so without
  explicit flushes a scale drag and a following rotation drag fold into one undo
  entry. The flush discipline in decision 11 is what prevents that.
- Live preview re-runs the chain and repacks per grid crossing. Dense modules
  may not hold 60fps; measure in the prototype before committing to it.
- `SortableSlotChip` is shared by four surfaces. Its existing tests
  (`MotifBlockRack.test.jsx`) pin `motif-slot-remove`, `motif-slot-anglerand`,
  `motif-slot-range`, `motif-slot-spread`, `motif-slot-weight` — all of which
  change shape here.
