# Material → 3D Appearance — Overnight Orchestrator Runbook

> Companion to `docs/material-3d-appearance-plan.md`. This is the operational script for running the build
> unattended overnight with subagents, using the proven sequential-TDD-slice pattern.

## 0. Operating principles

- **Sequential, not parallel.** P1 & P2 share `Scene3D.jsx` / `Sheets.jsx` / `sheetSpecs.js`. One worktree,
  one slice at a time, green gate between each. No parallel worktree agents (they'd conflict on every shared file).
- **The green gate (exact, baseline measured on `main`/`29680b0`):** `npm test` ≥ **2203 pass / 0 fail** (46 skip OK);
  `npm run build` succeeds (pre-existing >500 kB chunk warning is fine); `npm run lint` adds **no new errors**
  (baseline is **24 errors + 6 warnings** — pre-existing, NOT ours to fix; new files must be lint-clean; never
  "fix" unrelated lint to pass a gate).
- **Green ≠ correct.** The gate is **blind to every visual claim.**
  Logic goes into pure node-tested functions; look is smoke-only and goes on the morning checklist.
- **Stop on the branch.** Never merge to `main`. On green, write reports and halt.
- **Fail loud, don't paper over.** If a slice can't go green after 2 honest attempts, STOP, write what's blocking
  into `run-report.md`, and leave the branch at the last green commit. Do not skip tests or weaken the gate to pass.

## 1. Setup (orchestrator, once)

```bash
cd /Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio
git fetch origin
git worktree add ../mat-3d -b feat/material-3d-appearance main
cd ../mat-3d
npm ci    # or npm install if lockfile drift
npm test  # capture BASELINE pass count -> record in run-report.md
```

Record the baseline test count. Every slice must keep tests ≥ baseline with 0 failures.

## 2. Per-slice loop (each slice = one subagent invocation)

For S0…S8 in order, spawn a `general-purpose` (or `claude`) subagent with this contract:

> You are implementing **Slice <N>: <title>** from `docs/material-3d-appearance-plan.md` §4.
> Work in the worktree at `../mat-3d` on branch `feat/material-3d-appearance`.
> **TDD, strictly:** write failing test(s) first (red), implement to green, refactor. For pure-logic slices
> (S0–S3 logic, S6 noise params) the tests are real `vitest` `node` tests co-located as `*.test.js`.
> For `.jsx`/shader slices (S4–S6 wiring) do NOT attempt WebGL unit tests — wire the component, keep all
> extractable math in pure tested helpers, and rely on the build + the S7 smoke step.
> **Gate before you finish (see §0 for exact baselines):** `npm test` (≥ 2203 pass, 0 fail), `npm run build`
> (succeeds), `npm run lint` (no NEW errors beyond the 24-error baseline; your new files lint-clean). Do NOT
> touch pre-existing lint.
> Commit with a conventional message `feat(mat3d): S<N> — <title>`. Do NOT merge. Report what you changed,
> the test delta, and any visual claim that only a human can verify (for the NEEDS-HUMAN checklist).

### After each CODE slice (S1, S3, S4, S5, S6): adversarial review gate

Spawn a second subagent (`code-reviewer` style / `claude`) to review the slice diff **adversarially**:
- Does the resolver actually mis-bucket any of the 53 materials? (S1)
- Is `selectedMaterial` threaded as a live prop, or did it leak into `designSnapshot`? (S3 — must be live)
- Does material override break the operation-lens / no-material fallback path? (S4)
- **(S5 — the two "green but no glow" traps, check both explicitly):**
  - Is there an actual designated key light in the scene, and is its world direction fed to `edgeIntensity`? A
    uniform that's declared but never set means constant/zero glow that still passes green. (§3.6)
  - **Are the emissive rim meshes registered with `bloomSelection` via `useBloomRef`?** Per D12, unregistered
    emissive does NOT bloom — glow renders dead. This is the likeliest silent failure.
  - Did the agent inject emissive into `MeshTransmissionMaterial` via `onBeforeCompile` (discouraged — can be
    swallowed by the transmission pass) instead of using separate rim meshes (primary)?
- Are tests asserting behavior, or just that functions don't throw?

If the reviewer finds a real defect, spawn a fix subagent, re-gate, re-review. Only advance when clean.

## 3. Slice quick-reference

| Slice | Subagent focus | Gate artifact |
|-------|----------------|---------------|
| S0 | `materialArchetypes.js` registry + defaults (no three import) | unit |
| S1 | `resolveAppearance.js` + **53-material corpus fixture test** | unit (P1 proof) |
| S2 | `edgeGlow.js` math | unit |
| S3 | live-prop thread Studio→…→Sheets | build + pure unit |
| S4 | `Sheets.jsx` applies appearance per archetype | build + smoke |
| S5 | edge-glow + fresnel shader; ribbons intact | build + smoke |
| S6 | procedural wood grain | unit (noise) + build + smoke |
| S7 | Playwright-MCP shots → `docs/3d-shots/mat-*.png` (best-effort) | artifact or logged-skip |
| S8 | reports + P3 doc | docs |

## 4. S7 smoke detail (best-effort, non-blocking)

Playwright is **not** a project dependency. Use the **Playwright MCP browser** tools:
1. `npm run dev` (background), wait for the local URL.
2. Navigate, open the 3D panel-stack, switch Color View to Material lens.
3. For each of {fluorescent, clear, opaque, walnut}: select it, screenshot to `docs/3d-shots/mat-<name>.png`.
4. Weak assert: canvas non-blank + no console errors.
If the MCP browser is unavailable in the run environment (e.g. headless/cron), **skip and log it** in
`run-report.md` — this step never blocks the green gate or the branch.

## 5. Finalize (S8, orchestrator)

Write into the worktree root / `docs/`:
- **`run-report.md`** — baseline vs final test count, every slice's commit hash + test delta, what each adversarial
  review found, anything skipped (e.g. S7 if MCP absent), and the exact `git log --oneline main..HEAD`.
- **`NEEDS-HUMAN.md`** — copy the §7 checklist from the plan; this is the morning eyeball list.
- **`docs/material-cut-through-plan.md`** — the P3 design doc (plan §5 contents).

Then **STOP**. Leave the branch unmerged. Final message to the user: where the branch is, the test delta,
the smoke-shot paths (or skip note), and a one-line "eyeball these N visual claims, then merge."

## 6. Guardrails / do-NOT list

- Do **not** add a Supabase migration, a storage bucket, or any DB write. (L5, L7)
- Do **not** add a CSG/boolean dependency. (P3 is doc-only — L2)
- Do **not** commit texture image files. (wood is procedural in v1 — L6)
- Do **not** fold `selectedMaterial` into `designSnapshot`. (must be a live prop — §3.5)
- Do **not** merge to `main`, weaken the gate, or `.skip` a failing test to go green.
- Do **not** touch `feat/unified-undo-history` or the user's primary working tree.
- Do **not** change the 2D Color View / `materialPreview.js` export behavior — reuse `materialSheetHex`, don't fork it.

## 7. Resume / failure recovery

Each slice is its own commit, so a crashed run resumes from the last green commit on `feat/material-3d-appearance`.
Re-read `run-report.md` (if partially written) and `git log --oneline main..HEAD` to find the last completed slice,
then continue the per-slice loop from the next one.
