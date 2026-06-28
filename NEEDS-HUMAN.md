# NEEDS-HUMAN — Material → 3D Appearance

> Branch `feat/material-3d-appearance` is green per the gate (`npm test` 2366 passed / 0 failed; build succeeds;
> lint at baseline 24 errors + 6 warnings) but **NOT merged**. The items below are visual/runtime claims the green
> gate **cannot** verify — they require a human eyeball in `npm run dev` before merge. See `run-report.md` for the
> full slice/commit table and the open issues found during the run.

## §7 Morning NEEDS-HUMAN checklist (verbatim from `docs/material-3d-appearance-plan.md`)

- [ ] Fluorescent ≠ clear ≠ opaque ≠ translucent — each visibly distinct in panel-stack.
- [ ] Fluorescent edge glow is visible and **tracks orbit / light direction** (incidence dot working).
- [ ] Face fresnel rim reads as "internally lit", not edge-painted.
- [ ] Engraved/scored marks still bloom (ribbons intact).
- [ ] Wood reads as wood (procedural grain), distinct from acrylic — not colored plastic.
- [ ] Clear acrylic still transmissive; no regression in existing Surface A look.
- [ ] No new console warnings beyond the known "Layer out of range" item.
- [ ] 2D canvas / Color View material lens unaffected.

## Reference smoke shots (S7, best-effort, single static viewpoints)

`docs/3d-shots/mat-fluorescent.png`, `mat-clear.png`, `mat-opaque.png`, `mat-walnut.png` — captured via Playwright MCP.
Per-material pixel fingerprints differed (fluorescent avg RGB [74,72,40] / clear [47,34,38] / opaque [52,82,79] /
walnut [51,33,29]), confirming the four render distinctly. These are static viewpoints — "glow tracks orbit" is NOT
captured and must be confirmed live.

## Extra human-only verifications surfaced during the run (beyond §7)

- [ ] **"Maximum update depth exceeded" React loop** — fires ~70× on every lens/material switch into the 3D path.
      Pre-existing (S3–S6, not S7), real prod-affecting invariant violation, corroborated by the existing
      `react-hooks/set-state-in-effect` lint hit (~Studio line 635). Scene still renders, but **diagnose before merge.**
- [ ] **Per-archetype `edgeGain` gating** — the S7 opaque (turquoise) and walnut shots appear to show edge/body bloom,
      yet `opaque-acrylic` and `wood` should have NO edge glow (`edgeGain 0`). Confirm the S5 rim meshes self-gate
      correctly in `Sheets.jsx`.
- [ ] **Gate-blind GLSL** — the fresnel `shaderMaterial` (S5) and wood-grain `onBeforeCompile` (S6) are bundled by Vite
      as strings and never compiled by `npm run build`. Confirm in-browser: no console shader-compile error, canvas
      non-blank, wood slab shows procedural grain (not flat plastic, not blank).

## How to verify

1. `cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/mat-3d && npm run dev`
2. Open `localhost:5173` → Color View radiogroup → **Material** lens → "change material" picker → pick a material →
   click the **3D** radio. (The 3D radio may need a JS click; the material picker is hidden while in 3D, so choose the
   material in the Material lens first, then re-enter 3D — this round-trip is the only reachable path and also proves
   live threading without a Rebuild.)
3. Cycle green-fluorescent / clear / an opaque / walnut; **orbit** the camera for each and watch the bright edge rotate
   relative to the camera (incidence is view-independent by design).
4. Watch the dev console for any **new** shader-compile error or warning beyond the known "Layer out of range" item.
