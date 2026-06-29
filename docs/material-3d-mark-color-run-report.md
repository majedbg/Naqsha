# Run Report — Material-Accurate 3D Mark/Line Color (TDD)

> Branch: `feat/material-3d-mark-color` (off `main`). **Stopped on the branch — NOT merged.**
> Plan: `docs/material-3d-mark-color-tdd.md`. Executed 2026-06-28 with strict TDD (red→green per behavior).

## What changed

Etched mark/line color in the 3D preview (and its 2D counterpart) now reflects the **panel material**
instead of the raw LightBurn export convention (cut≈red / score≈blue / engrave≈neutral). Acrylic grooves
frost to a brightened **hue of the sheet**; wood grooves char **dark and matte**. Both 2D and 3D derive from
one shared reaction core.

| File | Change |
|------|--------|
| `src/lib/materialReaction.js` | **NEW** — pure, three-free reaction core (the shared source of truth, L1). |
| `src/lib/materialReaction.test.js` | **NEW** — 22 unit tests. |
| `src/lib/three3d/markTexture.js` | `treatmentForProcess(process, substrate?)` is now substrate-aware; `buildPanelMarkSVGs` threads `panel.substrate`. |
| `src/lib/three3d/markTexture.test.js` | +7 tests (28 → 35). |
| `src/lib/materialPreview.js` | Re-exports `materialCategory`/`materialSheetHex`/`luminance` and delegates `materialStrokeColor` to the core; hue-preserving frost (L3). Duplicated helpers/constants removed. |
| `src/lib/materialPreview.test.js` | `darken`→`other` assertions updated; +hue-preserving frost tests. |

### Key design decisions realized
- **L1 shared core.** `materialReaction.js` is a pure, three-free leaf module (imports nothing from
  `materialPreview`/`markTexture`) — both consumers import it; no cycle, no three in the 2D bundle.
- **L2 3D keys off `panel.substrate`** (same data that colors the 3D sheet), not the 2D `colorView` lens.
  `buildPanelMarkSVGs` already had `p.substrate` in scope — no new threading through `RightPanel.jsx`.
- **L3 hue-preserving frost.** Acrylic frost mixes toward `brighten(sheetHex)` (HSL lightness lift that holds
  hue + saturation), so a fluorescent yellow stays a **saturated yellowish-white**, never pure white. The
  same brightened tint drives the 3D emissive, so 2D and 3D agree.
- **L4 matte wood.** Wood emissive intensity is damped by `BURN_GLOW_SCALE` (0.35). Delivered **entirely**
  through the `intensity` value `markTexture` emits — `Marks.jsx` (`emissiveIntensity = BASE_EMISSIVE × intensity`)
  was **not touched**, nor any bloom/scene file.
- **L5 / L6 / L7.** Unknown/`other` substrate → today's laser convention (no regression). Recognized
  materials drop the process-identity hue (no red/blue lines), depth preserved via `intensity`. Pen ink
  unchanged regardless of substrate.

### Reconciliation note (plan said to verify)
The plan's API specifies `materialCategory → 'lighten' | 'burn' | 'other'`, but the live 2D code returned
`'darken'` for the neutral fallback. Verified the **only** consumer of that return value is
`materialStrokeColor`, which branches only on `'lighten'` — so `'burn'`/`'darken'`/`'other'` are
behaviorally identical there, and nothing external keys on `'darken'`. Resolved by returning `'other'` from
the core and updating the two ported 2D assertions. Behavior-neutral.

One refinement beyond the plan's literal text, made during P0: the 2D frost **legibility fallback** (the
near-extreme shadow etch) is gated against the **absolute** white/black extreme, while the frost **mix**
target is the hue-preserving brightened sheet. Without this split, a bright-but-saturated sheet (e.g.
`#E6E954`) tripped the near-white fallback and went dark. Gating on the absolute extreme keeps the original
lens's fallback behavior byte-stable (only a *truly* near-white/near-black sheet falls back) while still
delivering the hue-preserving frost.

## Test delta (green gate)

| Gate | Baseline | After |
|------|----------|-------|
| `npm test` | 2345 pass / 0 fail / 46 skip | **2375 pass / 0 fail / 46 skip** (+30 new) |
| `npm run build` | ok | **ok** (only the pre-existing >500 kB chunk warning) |
| `npm run lint` (changed files) | — | **clean** (eslint exit 0) |

No existing test regressed; the 46 skips are unchanged.

## Visual smoke (best-effort, non-blocking) — CAPTURED

The dev server (`npm run dev`, Vite, http://localhost:5173) was driven with Playwright-MCP (server was
flaky, reconnected several times). Confirmed live, end-to-end:

**Code path verified in the app's own module instance.** Dynamically importing the live
`/src/lib/three3d/markTexture.js` and calling `treatmentForProcess('cut', substrate)` returned:
| substrate | tint | intensity |
|-----------|------|-----------|
| `{kind:'acrylic', color:'#E6E954'}` | `#f5f6bb` (bright yellow-frost) | 0.92 |
| `{kind:'plywood', color:'#cccccc'}` | `#2b2724` (dark char) | 0.322 (= 0.92 × 0.35) |
| `{kind:'plywood', color:'#6B4A2B'}` | `#1c140c` (very dark) | 0.322 |
| *none* (convention) | `#ff3b2f` (red) | 0.92 |

**Screenshots** (in `docs/3d-shots/`):
- `acrylic-frost-3d.png` — Panel 1 = acrylic·3mm. The spirograph renders as **bright frost-white lines** on
  a transmissive sheet. NOT the red/blue laser convention.
- `plywood-char-3d.png` — same design, Panel 1 = plywood. The lines render as **dark, fine, matte etched
  char on an opaque slab, with NO glowing halo** — the L4 wood-matte look, in clear contrast to the acrylic
  frost. (Slab color is the default grey, not walnut brown — see checklist #2.)

**Other live confirmations:** editor loads with no login; the **Color view** radiogroup exposes
**Operation / Material / 3D**; substrate presets are `acrylic · 3/5mm`, `plywood · 4mm`, `mdf · 3mm`,
`cardstock · 1mm`. The 3 baseline console errors are **pre-existing and unrelated** (React hydration nesting
warning, a `key`-spread warning, and a Supabase `400` from being signed out).

**Observed (not a bug in this change):** the 3D preview renders from a snapshot taken **when you enter 3D**
(there is a `designSnapshot` deep-freeze for the 3D scene). Changing a substrate *while already in the 3D
view* leaves the marks AND the sheet material stale until you toggle the color-view out and back. Workflow:
set the substrate first, then enter 3D (or re-enter to refresh). This is upstream of the files this change
touched (the 3D snapshot/scene plumbing) and was left alone.

## NEEDS-HUMAN — visual checklist

The two screenshots above already demonstrate the core lighten-vs-burn + matte contrast. For full sign-off:

1. **Fluorescent hue.** The captured acrylic slab used the default neutral acrylic color, so its frost is a
   bright grey-white. To verify the *yellow* claim specifically, set Panel 1's substrate **color to a
   fluorescent yellow** (`#E6E954`) before entering 3D and confirm the frost reads **yellow-white**. (The
   live module check above already shows the tint is `#f5f6bb` for that color.) Bloom is selection-gated —
   select a mark layer for the full glow.
2. **Walnut color.** Set the plywood substrate color to walnut (`#6B4A2B`); the char tint deepens to
   `#1c140c`. The matte (no-halo) read is already visible in `plywood-char-3d.png`.
3. **Regression — unknown substrate.** A panel with no/`other` substrate (e.g. `cardstock · 1mm`) should
   still show the **laser convention** (red cut / blue score / neutral engrave) at full intensity.
4. Confirm the **2D Material** lens frost on a fluorescent sheet now reads **yellowish**, not pure white.

## Status

P0 + P1 (both tracks) committed on `feat/material-3d-mark-color`. Full green gate passed. Visual smoke
captured (acrylic frost vs plywood matte char, both correct). **Awaiting human review — do not merge yet.**
