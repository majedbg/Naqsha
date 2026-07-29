# PRD #184 build — handover (2026-07-28)

Branch: `feat/curved-leaf-glyph`. **Nothing merges to `main`** (decision 22 — PR 1 is the
whole set: `hold` + the overlay together).

**Six of eight slices are DONE and green. #191 and #192 remain.**

Suite: **6984 passing / 54 skipped / 531 files**, zero failures.
Baseline at PRD authoring was 6837; this build added 147 tests.

---

## Spec of record, and the warning that must go in every agent prompt

`docs/motif-hold-and-pitch-decisions.md`. **The §2 decisions table is authoritative**, per the
provenance notes in §2 and §7. Four sections of prose are stale or wrong and will make an
agent build the wrong thing:

| section | what it says | truth |
|---|---|---|
| §3 | lists "New fields on `Placement`" as **rejected** | decision 15 ruled the **opposite** |
| §5, §8c | describe an `opts.diagnostics` **opt-in channel** | no such channel; fields are ALWAYS present |
| §8c | "**every placement** on the layer is drawn" | decision 16: hovered slot + its captors only |
| §4b | code sketch `margin * parts.obstacles` | **manufactures a NaN** — see "spec defects" below |

Put this table in every subagent prompt. Do not rely on agents reading the issue caveat.

---

## What is built

| slice | commit(s) | what |
|---|---|---|
| #185 | `acb1307` `7efb47c` | `largestEmptyCircleParts` — boundary/obstacle terms split + winning obstacle identity; `largestEmptyCircleRadius` reduced to `Math.min` and byte-identical |
| #188 | `5433a7f` | `useFootprintReveal` / `useFootprintRevealTrigger` — shared reveal, pointer capture, never `:hover` |
| #186 | `21f9991` | the sizing law: hard/soft cap tiers, `drawnRadius`, seven diagnostic keys, `hold` + `zoneId` threading |
| #187 | `a9e9d65` `83c0d60` `f0978bc` `ba232e9` `f991bb1` | slot card `hold` row, `fixed`-mode disabled state, `canonicalSlot`, tooltip fixes |
| #189 | `b97ea35` | footprint overlay v1 — reserved + drawn rings, binding stroke, `hold` trigger |
| #190 | `9c73773` | the captor — neighbour disc from `capObstacle`, `hostRadius` container ring |

### The contract later slices depend on

**`Placement` carries exactly seven new keys, always present, in BOTH sizing modes.**
No opt-in flag, no conditional shape. Do not add an eighth.

```
packedRadius  number    what was RESERVED into the packer (pushes neighbours)
drawnRadius   number    what was DRAWN (=== radius)
neighbourCap  number    soft cap
hardCap       number    hard cap (boundary + host)
capBy         'natural'|'neighbour'|'boundary'|'host'   what bound drawnRadius
saturated     boolean   the lerp exceeded hardCap
capObstacle   {x,y,r}|null   COPIED disc, populated only when capBy === 'neighbour'
```

`saturated` and `neighbourCap`/`hardCap` still have **no reader** — by design (decision 15b
requires both ring radii and the saturation fact to live on the placement). Do not add one.

**`Assignment` also gained `zoneId`** (`'apex'|'stem'|'cell'` zoned, `null` flat and for a
Rest) — added in #186 specifically so #189 would not reopen `sequencer.js` and move the
sequencer goldens a second time.

**The reveal `scope` is OPAQUE to the hook** — no enum, no switch, no validation. Convention,
enforced nowhere: `{kind:'slot', layerId, seqIndex, zoneId, slotIndex}` and
`{kind:'layer', layerId}`. A parallel PR-2 session depends on this staying opaque.

---

## REMAINING WORK

### #191 — rejected anchors as dotted empty rings (do this first)

Edits `AnchorGhostOverlay.jsx`, the same file #190 just touched — that is why #190 and #191
are sequential, not parallel. **Do not use worktree isolation**; the sequencing already
removes the conflict and a worktree would not carry the parallel session's uncommitted files.

Every anchor rejected `below-floor` or `no-fit` draws a **dotted empty ring at the radius it
wanted** — visually distinct from both the solid reserved ring and the dashed drawn ring, so
a rejection reads as a third category at a glance.

- The resolver's `rejected` list **already exists** on `resolvePlacements`'s return value and
  is **currently discarded by both callers**. Plumb it through.
- Raising `hold` must visibly convert `below-floor` dotted rings into placed glyphs with real
  rings — the rescue made legible.
- `no-fit` rings stay dotted at **every** value of `hold` — that rejection is a hard drop.
- Verify on §1b's reproducible gap-20 case: four dotted rings where four glyphs vanish today.
- ⚠️ `Rejection` has reason `'junction-skip'|'below-floor'|'no-fit'|'rest'`. Only the middle
  two are in scope. A `rest` is not a rejection the user needs explained.

### #192 — wire the remaining three triggers

Layer **Size** (Inspector), slot **Scale** (slot card), per-glyph **override scale** (glyph
popover). One hook, one overlay, N callers.

**Four triggers, NOT five.** Decision 22 says "all five"; the fifth is spacing/density, which
ships with the pitch control in **PR 2** and belongs to a different session. Do not
over-scope.

Three things this slice must know:

1. **Layer Size has NO drag lifecycle.** It is a bare `<input type="number">` at
   `Inspector.jsx:1656-1665`, `data-testid="motif-size"` — no `useDragValue`. **Ruled: give it
   a hover/focus path** — `reveal` on `pointerenter` AND `focus`, `release` on `pointerleave`
   AND `blur`. Rejected: converting it to `DragNumber` (scope creep into a shared control with
   existing assertions, not asked for by #184) and dropping the trigger (descopes story 23 —
   the user's call, not an agent's). This is the degenerate case of the same gesture system,
   not a rival one; `focus`/`blur` is needed regardless because a tabbed-to field gets no
   `pointerenter`.
2. **`scope.layerId` is a SELECTOR, not just a filter.** #189 hit this: the slot card lives in
   the MotifDevice, which `Inspector.jsx:984` renders on the HOST and refuses on a motif
   layer — so a control is hoverable while *no motif is selected*, `motif` is null, and the
   overlay's render gate returns null. It would have shipped **silently OFF**. Every trigger
   needs the same treatment.
3. **`pointerProps` must be spread on a DOM element.** `DragNumber` does not forward unknown
   props, so `<DragNumber {...pointerProps}/>` silently does nothing — it fails OFF, which
   looks exactly like "the overlay never appears".

Per-glyph override scale must make the rings **move** as it drags. Two independent
preconditions, both already satisfied: `overrideRecords` is threaded into the overlay's
re-resolution (#189), and `applyGlyphOverrides` scales `drawnRadius` alongside `radius`
(#186). If the rings sit still, check both.

---

## Standing constraints for every agent prompt

- The stale-spec table above.
- `hold = 0` byte-identical; `largestEmptyCircleRadius` must not move one ULP.
- Goldens move to the true new shape **deliberately** — NEVER loosened to `objectContaining`,
  `toMatchObject` or any partial matcher. This has held across every slice; hold it.
- Polarity: **`w = 1` is NEVER SHRINK, `w = 0` is today's behaviour.** No inversion layer
  anywhere. Do not "fix" it back.
- TDD, plus one adversarial review pass per slice.
- **Rendered SVG output is deliberately NOT tested by assertion** (PRD). Do not add assertions
  on ring geometry to look thorough — that geometry is expected to move. Verified by eye.
- Working tree: a parallel PR-2 session works on `src/pages/Studio.jsx`,
  `src/components/shell/motif-prototypes/*`, `docs/pitch-control-graphic-*.md`. Files may
  appear and disappear. **NEVER** `git add -A` / `add .` / `stash` / `checkout .` / `restore`
  / `clean`. Stage only your own files by explicit path. No branches, no PRs, no merges.
- `waitFor` runs on a separate 1000ms budget that ignores `testTimeout` — prefer sync + `act()`.

---

## Spec defects found during the build — fix the doc before anyone builds from it again

1. **§4b's code sketch manufactures a NaN.** `neighbourCap = margin * parts.obstacles`
   evaluates `0 * Infinity = NaN` once the terms are split; the fused
   `margin * Math.min(boundary, obstacles)` never met that product because the finite term won
   the min first. Implemented verbatim, `margin: 0` with a real boundary turns the FIRST
   placement of every run from radius 0 into NaN — and `NaN < min` is false, so it does not
   reject, it ships silently. Fixed in #186 with
   `capOf(term) = term === Infinity ? Infinity : margin * term`.
2. **§11's claim that "`capBy` + `saturated` on the overlay are the entire answer" is wrong.**
   See issue #193.
3. **Decision 17 and issue #190 both cite "a girih strap's container" — girih emits NO
   `hostRadius`.** Only `pointHostAnchors` (circlepacking) and `cellGridAnchors` (modulegrid,
   truchet cells) emit it. The rule is fine; the example is wrong and would send a reviewer to
   a host that shows no container ring.
4. **§8c cites `useDragValue.js:120`** as owning a pointerup guard and unmount detach. That
   line is the no-op commit suppression; `useDragValue` registers **no effects at all**. The
   real prior art is `useGestureFlush`, `MotifBlockRack.jsx:622-653`.

---

## One behaviour change OUTSIDE the migration guarantee

384 of 9216 differential cases: `margin <= 0` **and** a null boundary **and** nothing placed
yet — both empty-circle terms are Infinity. Pre-#186 produced `0 * Infinity = NaN`, cascading
NaN radii, scales and discs through the whole run; it now produces a sane radius. All 384 were
all-NaN before; none is NaN now.

Judged not worth machinery to preserve a NaN cascade. Unreachable in-app: `margin` has no UI
and is 0.85 everywhere, and the render path always passes a rect boundary
(`MotifPattern.js:124`). **Verified independently through the public API:** `margin:0` WITH a
rect boundary → radius exactly `0`, byte-identical to pre-#186 (so `capOf` is load-bearing);
`margin:0` with `boundary:null` → finite, no NaN.

Mention it at PR review. It is technically outside "byte-identical at `hold = 0`".

---

## Open, needs Majed — do NOT invent

- **Issue #193 — `hold` silently inert when the page edge binds from the start.** Ruled
  2026-07-28: **ship PR 1 as-is, settle separately.** Shape A (`neighbourCap < hardCap <
  naturalTarget`) reads — heavy stroke jumps solid→dashed at the clip, measured separation
  median 8.70 units; story 25 satisfied. Shape B (`hardCap <= neighbourCap`) shows nothing —
  `packed === drawn === hardCap` at every `w`, canvas byte-identical across a full drag.
  #190's host ring fixes the host-bound member; only the boundary member is open. Option space
  recorded in #193, deliberately not chosen.
- **Ceiling on `Scale × hold`** — decision 8 was relayed, never explicitly ruled.
  **Do not add a clamp.** `Scale 300% + hold 100%` drawing 54-unit leaves through each other
  is legal output. A ceiling needs its own ruling.

---

## Human verification queue (cannot be done headless)

- **The container ring reads as a container.** Add a **Circle Packing** host
  (`attempts 400, minRadius 8, maxRadius 45`), add a leaf motif routed to `cell`, hover a
  slot's `hold` row. At the default Size **18**, 76 of 126 glyphs are host-capped and draw the
  dim ring; at Size **40**, all 126 do. Verified end to end through the real stash path, not
  hand-built anchors.
- **The neighbour captor disc** wants a different host — Circle Packing produces **zero**
  neighbour captors (containers too far apart). Use a **Grid** host ~16×16, proportional Size
  60: 285 of 286 are neighbour-capped.
- **No leader line between glyph and captor** — #190's deliberate choice, flagged for eyeball.
  `packedRadius = margin × (d − r_obstacle)`, so the solid ring is exactly tangent at
  `margin: 1` and stands off 15% at the default 0.85 — the captor is always the nearest disc.
  A leader would be a second element per glyph against a one-circle budget.
- **Card width 124px → 136px** (#187). Slot-card decision 9 traded 124px for "~3 chips visible
  before scrolling". Check **chip count**, not just whether the row fits.
- **The `hold` row in both flat Sequencer and Zone sections**, and the two-ring separation as
  `hold` is dragged.

---

## Performance findings (not blocking, but real)

| scenario | reconcile | note |
|---|---|---|
| real grid, 286 rings | 4.49 → **5.33** ms with captors (+19%) | full frame 6.62 → 7.42 ms |
| synthetic, 2000 rings at `MAX_PLACEMENTS`, 1-slot sequence | 74.90 → **83.77** ms (+12%) | far past 60 fps *before* captors |

Circles go 4000 → 5911 (+48%) for +12% time. Decision 16's scoping bounds the worst case at
`MAX_PLACEMENTS / numSlots`, so it only bites on a **1-slot sequence at the cap**.

⚠️ **Unexplained divergence:** #189 measured the 2000-ring reconcile at 27.65 ms; #190's
harness measured the same *before* state at 74.90 ms — 2.7×. The two harnesses agree at 286
rings (4.66 vs 4.49 ms). Not caused by either slice; worth resolving if anyone optimises here.
The verdict is unchanged either way.

---

## Drive-by fixes folded in (each its own commit, trivially revertable)

- **`f991bb1`** — four shipping tooltips in `MotifBlockRack.jsx` rendered literal
  `↕`/`·`: escape sequences inside JSX attribute strings are not processed.
  `DragNumber`'s own default `title` uses a real `↕`, which is how it survived — only the
  overrides were broken. Pre-existing, NOT caused by #184, but the new `hold` row uses real
  characters so the card would read inconsistently. 4 insertions, 4 deletions, no reformatting.
  The `\uXXXX` sequences left in **template literals** (1028, 1088) are correct code — those
  are backticked JS where escapes resolve.
- **`ba232e9`** — `hold` added to `canonicalSlot` (`modeMatch.js`). A gap #184's own field
  created: without it, changing `hold` does not slide the mode column to Custom the way
  changing Scale does. All 54 pre-existing `modeMatch` tests passed untouched, which is the
  migration guarantee as evidence rather than assertion.
