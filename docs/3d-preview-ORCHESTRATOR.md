# 3D Preview — Overnight Orchestrator Runbook

> Companion to `docs/3d-preview-plan.md` (locked spec). Execute on branch `feat/3d-preview`
> (worktree `.claude/worktrees/3d-preview`, off `main`). Parallel session `feat/cloud-save-ux`
> is live — DO NOT touch `main`, DO NOT push, DO NOT merge (D16).

## Operating rules
- TDD per slice: write/extend vitest tests first, then implement to green. One commit per slice,
  suite green at every commit, build green.
- Subagents do the slice work; the orchestrator owns sequencing, gates, review, and the run log.
- **Gates per slice:** `npm run test` (vitest) GREEN · `npm run build` GREEN · `npm run lint`
  at/under baseline. Record counts in the run log.
- On a RED gate that a subagent can't resolve in 2 attempts: stop that slice, log the error verbatim,
  continue with independent slices, surface it in the AM checklist. Do NOT thrash.
- Scene smoke (S7) is a SOFT gate (artifact + eyeball), never an auto-fail loop (PRD §6, advisor A2).
- End state: branch built + self-reviewed + run log + screenshots + AM checklist. STOP. No merge/push/issue.

## PRE-FLIGHT (orchestrator runs FIRST, before any slice — single point of failure)
- **P0 — Install + smoke the matrix.** Install the four PINNED deps (PRD §2):
  `three@0.185.0 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 @react-three/postprocessing@3.0.4`.
  Confirm install succeeds with NO peer break (if react peer conflict → pin react/react-dom 19.2.x,
  never `--force`). Mount a trivial dynamic-imported `<Canvas>` with a single mesh; `npm run build` GREEN;
  confirm three.js is code-split OUT of the main bundle (inspect build output). If P0 fails → STOP the
  entire run and leave the error for morning. Nothing downstream is worth attempting without P0 green.
- Confirm Playwright MCP reachability; if absent, S7 degrades to morning-eyeball-only (still proceed).

## Slice graph (sequenced for "minimum shippable core" first — advisor A3)

```
P0 preflight ─► S1 foundation ─► S2 camera+lighting+bloom ─► S3 3D-mode mount/lens + transition
                                                                  │
                          ┌───────────────────────────────────────┤
                          ▼                                        ▼
   S4 A: sheets+materials (D7) ─► S5 A: texture-mode marks (D6) ─► S6 A: spacing+export(PNG)
                          │            = MINIMUM SHIPPABLE CORE for A
                          ▼
   S8 B: relief from field (D5/D10) ─► S9 B: per-channel drape + target toggles (§3.4)
                          │
                          ▼
   S7 scene smoke (Playwright MCP, SOFT)  ── run after A-core and after B
                          │
                          ▼
   S10 A: ribbon geometry under cap (D6)  ── LAST, NON-BLOCKING enhancement (highest risk, no skill)
                          │
                          ▼
   S11 persistence (D13) + self-review pass + run log + AM checklist
```

### Slices
- **S1 — Foundation.** Dynamic-import boundary; shared `<Canvas>` scaffold; sub-mode state machine
  (`panel-stack` | `height-surface` | off). Unit: sub-mode reducer, mount/unmount of p5-hidden state.
- **S2 — Camera + lighting + bloom.** Perspective cam, `OrbitControls`, 3/4 default, zoom-fit + reset
  (D4); `<Environment preset="studio">`, selective bloom on emissive only, dark bg (D12). Unit: zoom-fit
  bounds math, reset.
- **S3 — 3D-mode mount + lens entry + transition.** Add A as a lens peer to ColorView; "Building…"
  indicator; snapshot-on-enter; close restores prior view (D1/D2/D14). Unit: enter/exit restores prior
  lens; snapshot capture is pure.
- **S4 — A sheets + materials.** Panels → extruded slabs, thickness from `substrate.thickness`, stacked
  by `panel.order`, material-per-kind (D7), effective visibility. Unit: panel→scene-spec mapping;
  material selector per kind; visibility.
- **S5 — A texture-mode marks (MIN SHIPPABLE CORE).** Per-panel SVG (in-memory) → offscreen raster →
  `emissiveMap`; per-operation tint/intensity from process scores (D3). Unit: cap/mode decision (1500,
  mobile/DPR override); process→treatment mapping; raster builder is pure-ish (assert inputs/decision).
- **S6 — A spacing + PNG export.** Spacing slider 0–60mm default 12mm (D11); "Save image" PNG (D8).
  Unit: spacing→layout math; filename stamping (timestamp injected, not `Date.now()` in pure fn).
- **S7 — Scene smoke (SOFT).** Playwright MCP: `vite preview` → 3D A + B → canvas present, WebGL context
  via readback, 0 console errors, save screenshots. Artifact + flag only.
- **S8 — B relief.** `fieldForLayer(guide)` → `PlaneGeometry` ≤256², Z = sampleSigned×exag, diverging
  colormap, exaggeration slider (D5/D10). Unit: heightmap builder, colormap, exaggeration math, seg cap.
- **S9 — B per-channel drape + toggles.** All active targets (modulationGraph "first edge wins"),
  per-target toggle, warp→gradient xy-displace, density→spacing variation (§3.4). Unit: active-target
  resolution; warp displacement transform; density spacing; empty-state.
- **S10 — A ribbon geometry (LAST, NON-BLOCKING).** `SVGLoader.pointsToStroke → ExtrudeGeometry →
  mergeGeometries` when panel paths ≤1500; else texture (already S5). Raw three.js docs — no skill.
  Unit: builder vertex/group counts on small fixtures; cap routing. If too hard in 2 attempts → log,
  ship with texture-mode only (core stays complete), flag in AM checklist.
- **S11 — Persistence + self-review.** localStorage sub-mode/spacing/exaggeration (D13). Adversarial
  self-review of A & B (correctness, perf budget, honesty of drape, bundle split), fix findings,
  finalize run log + screenshots + AM checklist.

## Final combined gate (before STOP)
- `npm run test` GREEN (report N passed); `npm run build` GREEN; `npm run lint` ≤ baseline.
- three.js confirmed code-split out of main bundle.
- Screenshots saved for A (texture + ribbon if shipped) and B.
- Run log complete; every skipped/blocked slice documented with verbatim error.

## AM checklist (for the human, morning)
- [ ] Open 3D lens → eyeball stacked acrylic look (transmission, grooves, bloom, spacing).
- [ ] Open a guide layer's Modulation → "Preview in 3D" → relief + drape reads correctly; toggle targets.
- [ ] PNG snapshot looks right for both.
- [ ] Review S10 ribbon outcome (shipped vs texture-only fallback).
- [ ] Confirm veto-window defaults (PRD §9): cap=1500, emissive tints, per-channel drape semantics.
- [ ] If approved: merge `feat/3d-preview` → main yourself, then push.
```
