# Material → 3D Appearance — Spec & Plan

> Status: **grilled + locked 2026-06-27**, not yet built.
> Companion runbook: `docs/material-3d-appearance-orchestrator.md`.
> Base branch: **`main`** (has 3D preview PR #38 + relief fix `29680b0`). Build in a **new worktree** `feat/material-3d-appearance` — do NOT touch `feat/unified-undo-history`.

## 1. Problem

When the 3D preview is open, selecting acrylic vs wood (or any material in the Color View "Material" lens) **does not carry into the 3D scene** — every material renders identically. `Sheets.jsx` branches on `panel.substrate.kind` and reads `substrate.color`; the user's selected material (`useColorView().material`) is never threaded in.

We want a **maintainable, scalable** material-appearance system so that:
1. Selected material visibly drives the 3D look (P1).
2. Fluorescent acrylic glows at its edges in a way that responds to incident light, reusing the ribbons + bloom primitives (P2).
3. A path exists to render true *cut-through* gaps whose walls are emissive (P3 — spec only tonight).

## 2. Locked decisions (from grilling)

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | **Archetypes in code, params as data.** A small fixed set of render archetypes live in code as real R3F materials/shaders; per-material params (tint, transmission, roughness, IOR, edgeGain, texturePath) are data. "New color" = data; "new look" = code PR. | Shaders stay versioned, testable, coupled to the scene's lighting/bloom contract. No runtime-compiled GLSL from a DB. |
| L2 | **Scope:** P1 ships fully TDD'd; P2 ships as a *parametric approximation* behind smoke screenshots; P3 is spec'd tonight, built later. | GPU look can't be unit-verified; isolate the risk. |
| L3 | **One pure resolver** `resolveAppearance(material)`: explicit → inferred-from-name/type → safe default. **Never requires DB.** | node tests need no Supabase; all 53 existing materials render sensibly today. |
| L4 | **Edge-glow = light-incidence dot + fresnel rim.** Perimeter emissive = `tint × edgeGain × max(0, dot(keyLightDir, faceNormal))`; broad faces get a grazing fresnel emissive; marks reuse existing ribbons + bloom. **Requires a designated key light (see §3.6) — the current scene has none.** | The "incident-light trigonometry" effect, done with one dot + one fresnel. Responds to orbit/lighting; cheap; robust. NOT a TIR simulation. |
| L5 | **No blob storage.** Textures (where used) are committed into the repo as static assets and bundled to the client. | Laser-cuttable materials are a small finite set; a bucket/upload/CORS/fetch subsystem is unjustified risk. |
| L6 | **Wood = procedural grain in v1**; `texturePath` reserved on the archetype for committed grain images as a follow-up. | Distinct-from-acrylic look with zero assets and testable logic. |
| L7 | **No DB migration tonight.** Appearance comes entirely from the in-code registry + inferred resolver. Optional enrichment migration is a clean later follow-up the resolver already honors. | Sidesteps the recurring "migration ships dormant / human-gated" problem. |
| L8 | **Isolation:** new worktree off `main`. **Merge policy:** on green, STOP on the branch + write run report + NEEDS-HUMAN checklist; human eyeballs, then merges. **Smoke:** best-effort Playwright-MCP shots to `docs/3d-shots/`, non-blocking. **P3:** design doc only. | Nothing visually unverified lands on main unattended. |

## 3. Architecture

### 3.1 Appearance contract (the data shape)

```js
// AppearanceParams — what every archetype consumes
{
  archetype: 'fluorescent-acrylic' | 'clear-acrylic' | 'translucent-acrylic'
           | 'opaque-acrylic' | 'wood' | 'opaque-tinted',
  tintHex:      '#E6E954',   // base color
  transmission: 0.0..1.0,    // acrylic see-through (0 for wood/opaque)
  roughness:    0.0..1.0,
  ior:          ~1.49,       // acrylic; ignored by opaque
  edgeGain:     0.0..~8.0,   // perimeter emissive strength (0 = no glow)
  rimGain:      0.0..~2.0,   // face fresnel emissive strength
  texturePath:  null | '/textures/...', // reserved; only wood may set it later
}
```

### 3.2 Archetype registry (code) — `src/lib/three3d/materialArchetypes.js`

A pure map `archetype → default params + a uniform-mapping helper`. The R3F layer reads it; the registry itself imports **no three** (keep it node-testable; three-specific material construction lives in the `.jsx`).

Archetypes for v1 (validated against the **real corpus** — 7 in-code defaults + 46 seed names, see §3.3):
- `fluorescent-acrylic` — high edgeGain, mid transmission, saturated tint, low roughness. *(only source: in-code `green-fluorescent`; seed has none.)*
- `clear-acrylic` — high transmission, near-zero tint, tiny edgeGain. *(Clear / "Clear Colorless")*
- `translucent-acrylic` — mid transmission, tinted, small edgeGain. *("White Translucent", "Frosted Satin Ice", blue-translucent)*
- `opaque-acrylic` — transmission 0, glossy, no edge glow. *("…Opaque", turquoise-opaque)*
- `pearlescent-acrylic` — transmission 0, glossy, slightly higher clearcoat/sheen; v1 = tinted opaque approximation. *("…Pearl", "Fire Tortoise Shell Pearl", "Aura Iridescent", gotham-black-pearl)*
- `mirror-acrylic` — transmission 0, high metalness, very low roughness, no edge glow. *("Gold/Rose Gold/Silver Mirror")*
- `wood` — transmission 0, procedural grain, matte-ish, no edge glow. *(only source: in-code birch/walnut plywood; seed has none.)*
- `opaque-tinted` — safe default for anything unrecognized (built from `hex`). **A known seed/default name reaching this is a bug** — S1's fixture asserts none do.

### 3.3 Resolver (pure) — `src/lib/three3d/resolveAppearance.js`

```
resolveAppearance(material) -> AppearanceParams
  1. explicit:  material.archetype present -> merge registry defaults with material.appearance overrides
  2. inferred:  keyword match on material.name (case-insensitive), THEN material.type. Order matters —
                more specific finishes first so e.g. "Black Opaque" hits opaque before any color rule:
                  /fluor/                         -> fluorescent-acrylic
                  /mirror/                        -> mirror-acrylic
                  /iridescent|aura|pearl|tortoise/-> pearlescent-acrylic
                  /clear|colorless/               -> clear-acrylic
                  /translucent|frost|satin|ice/   -> translucent-acrylic
                  /opaque/                        -> opaque-acrylic
                  /ply|wood|birch|walnut|mdf/     -> wood
                  type 'acrylic' (no finish keyword) -> translucent-acrylic   // last-resort acrylic
                  tintHex sourced from materialSheetHex(material) (reuse materialPreview.js)
  3. default:   opaque-tinted from materialSheetHex(material)   // only truly-unknown materials
```

> **Corpus reality (verified against the real strings, do not re-derive from summaries):**
> The 46 seed rows are **100% acrylic** with finishes: Clear Colorless, Black/White Opaque, White Translucent,
> Frosted Satin Ice, Aura Iridescent, Fire Tortoise Shell Pearl, Gold/Rose Gold/Silver Mirror — **no fluorescent,
> no wood**. Fluorescent (`green-fluorescent`) and wood (`birch-plywood`, `walnut-plywood`) appear **only** in the
> 7 in-code `DEFAULT_PREVIEW_MATERIALS`. The fixture must cover **both** corpora.

**Inference must be proven against the real corpus** — the 7 `DEFAULT_PREVIEW_MATERIALS` + the 46 seed names from
`20250101000006_materials_catalog_seed.sql` (53 total) each assert to a sensible archetype, **and zero known names
fall through to `opaque-tinted`** (fixture test). This is the concrete proof P1 *works*, not merely *builds green*.

### 3.4 Edge-glow math (pure) — `src/lib/three3d/edgeGlow.js`

```
edgeIntensity(keyLightDir, faceNormal, edgeGain) = edgeGain * max(0, dot(keyLightDir, faceNormal))
fresnelFactor(viewDir, normal, power=3) = pow(1 - max(0, dot(viewDir, normal)), power)
edgeMaskForBox(faceNormal, stackAxis) = 1 - abs(dot(faceNormal, stackAxis))  // 1 on side faces, 0 on top/bottom
```

These are tested as plain functions. The `.jsx` glow wiring is smoke-only — but two scene-contract facts
(verified in the codebase) decide whether *any* glow appears, so they are **mandatory**, not optional:

**Technique — rim meshes are the PRIMARY, not the fallback (reversed from first draft on review).**
`Sheets.jsx` renders acrylic with drei **`MeshTransmissionMaterial`**, which runs its own transmission
shader/FBO; emissive injected via `onBeforeCompile` can be swallowed by the transmission pass and you can't
cleanly bloom "just the edges" of that material. **So: build the perimeter glow as separate thin emissive
rim geometry** (plain `meshStandardMaterial` with `emissive`/`emissiveIntensity`, hugging the slab's cut
outline / box sides) — independent of MTM, trivially bloomable. The face fresnel rim can be a second light
emissive shell or an `onBeforeCompile` term on a *non-transmission* copy; keep it simple. `onBeforeCompile`
injection into MTM is **discouraged** for v1.

**Bloom membership is mandatory — per D12, emissive that isn't registered does NOT bloom.**
`EmissiveBloom`/`bloomSelection.js` blooms *only* meshes registered via `useBloomRef`; today only marks/drape
register, `Sheets` does not. **The edge/rim geometry MUST register with `bloomSelection` (`useBloomRef`) or the
glow renders with zero bloom and looks dead.** This is the single most likely "green but no glow" failure — S5
is not done until the rim meshes are in the bloom Select set.

### 3.5 Data flow (live prop, NOT snapshot)

`selectedMaterial` is **lens state** (`useColorView`, resolved live from localStorage), a *sibling* to the
spacing/exaggeration props that already live-update — **not** folded into `designSnapshot` (D14). Changing
material must update the 3D scene without a Rebuild.

```
Studio.jsx (owns useColorView)
  -> RightPanel.jsx (mounts Canvas3DHost)
    -> Canvas3DHost.jsx (boundary; passes prop through)
      -> Scene3D.jsx (accepts selectedMaterial; calls resolveAppearance)
        -> Sheets.jsx (applies AppearanceParams per slab; acrylic edge-glow shader)
```

`Sheets.jsx` precedence: selected material's resolved appearance overrides the substrate's intrinsic
descriptor **when material lens is active**; otherwise falls back to today's `substrate.color` behavior
(operation lens / no material). Surface B (relief) is unaffected — material is fabrication-tied, relief is a field viz.

### 3.6 The key light (REQUIRED — scene has none today)

L4's incidence dot needs a single light direction, but `SceneEnvironment.jsx` is `<Environment preset="studio">`
**IBL only — there is no directional/key light**. Without resolving this, an S5 agent will wire a uniform that's
never set and the glow is constant or zero (and still passes green). **Decision: add one explicit
`<directionalLight>` to the scene as the designated key**, and feed its normalized world-space direction into the
edge-glow as `keyLightDir`. Keep the existing IBL for fill. The directional light's intensity should be modest
(IBL stays the primary lighting); its job is to *drive the edge incidence term*, not to relight the scene.
`keyLightDir` is therefore a known, set uniform — `edgeIntensity()` (§3.4) receives it as input and is unit-tested
against fixed vectors.

## 4. TDD slice plan

Sequential (P1 & P2 both touch `Scene3D.jsx`/`Sheets.jsx`/`sheetSpecs.js` — no parallel worktrees). Green gate
(`npm test && npm run build && npm run lint`) between every slice. Each code slice gets an adversarial review pass.

| Slice | Title | Layer | Verify |
|-------|-------|-------|--------|
| **S0** | Archetype registry + AppearanceParams defaults | pure | unit |
| **S1** | `resolveAppearance` — explicit→inferred→default, **53-material corpus fixture** | pure | unit (the P1 "it works" proof) |
| **S2** | Edge-glow math (`edgeIntensity`, `fresnelFactor`, `edgeMaskForBox`) | pure | unit |
| **S3** | Thread `selectedMaterial` live prop Studio→RightPanel→Canvas3DHost→Scene3D→Sheets | wiring | unit on pure parts + build |
| **S4** | `Sheets.jsx` consumes appearance → tint/transmission/roughness/metalness per archetype (incl. mirror, pearlescent) | .jsx | smoke |
| **S5** | Add key `<directionalLight>` (§3.6); perimeter **rim meshes** (emissive, **registered via `useBloomRef`**) driven by `edgeIntensity`; face fresnel; marks reuse ribbons | .jsx/shader | smoke |
| **S6** | Procedural wood grain shader (noise params testable; shader wiring smoke) | .jsx/shader | unit on noise params + smoke |
| **S7** | Playwright-MCP smoke shots per material → `docs/3d-shots/mat-*.png` (best-effort, non-blocking) | smoke | artifact |
| **S8** | Run report + NEEDS-HUMAN checklist + **P3 design doc** `docs/material-cut-through-plan.md` | docs | — |

## 5. P3 design doc — required contents (written in S8, not built)

`docs/material-cut-through-plan.md` must cover: CSG library evaluation (e.g. `three-bvh-csg`) + dependency/bundle
cost; which cut operations create true gaps vs surface marks; how cut-wall faces receive the emissive edge
material; interaction with the SelectiveBloom `<Select>` pipeline; re-meshing/normals concerns; and open
risks/questions. No code, no dependency added tonight.

## 6. Definition of done (overnight)

> **The green gate (exact, measured at baseline `main`/`29680b0` on 2026-06-27):**
> - `npm test` → **≥ 2203 passed, 0 failed** (46 skipped OK). 251 test files baseline.
> - `npm run build` → succeeds (the >500 kB chunk warning is pre-existing, not a failure).
> - `npm run lint` → **introduces NO new errors.** Baseline is already **24 errors + 6 warnings** on main
>   (pre-existing, NOT this work's to fix). Rule: error count must stay ≤ 24 and every **new file** the slices
>   add must be lint-clean. Agents must NOT "fix" pre-existing lint to make a gate pass.

- All slices committed on `feat/material-3d-appearance` (off main, in worktree).
- **Green** per the gate above (tests 0-fail ≥ baseline; build succeeds; no new lint errors).
- `resolveAppearance` corpus test proves all 53 materials map to sensible archetypes.
- Best-effort smoke shots in `docs/3d-shots/` (or a logged note if Playwright MCP was unavailable).
- `run-report.md`, `NEEDS-HUMAN.md`, and `docs/material-cut-through-plan.md` written.
- **NOT merged.** Branch left for human eyeball.

## 7. Morning NEEDS-HUMAN checklist (visual claims the green gate cannot verify)

- [ ] Fluorescent ≠ clear ≠ opaque ≠ translucent — each visibly distinct in panel-stack.
- [ ] Fluorescent edge glow is visible and **tracks orbit / light direction** (incidence dot working).
- [ ] Face fresnel rim reads as "internally lit", not edge-painted.
- [ ] Engraved/scored marks still bloom (ribbons intact).
- [ ] Wood reads as wood (procedural grain), distinct from acrylic — not colored plastic.
- [ ] Clear acrylic still transmissive; no regression in existing Surface A look.
- [ ] No new console warnings beyond the known "Layer out of range" item.
- [ ] 2D canvas / Color View material lens unaffected.
