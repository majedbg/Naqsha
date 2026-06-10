# Naqsha — Architecture Rework Plan (Orchestrator Instructions)

> **Audience.** An orchestrator agent (Fable) running in a fresh session, dispatching build+test
> work to subagents (Opus for structural slices, Sonnet for pure-logic/test slices). This file is
> the **single source of truth** for the rework. The orchestrator reads §1–§5 once, then hands each
> subagent **only its own WI section** from §6 — each WI is self-contained so subagents never need to
> re-explore the codebase.
>
> **Repo.** `generative-art-studio/` (React 19 + Vite 8 + p5 2.x + Supabase + react-router 7).
> 97 source files, ~13.6k LOC, **zero tests today.** Codename "Naqsha."
>
> **Companion doc.** `PORTFOLIO.md` (human-readable architecture narrative + screenshot guide). Do not
> dispatch from it; it exists for portfolio/diagram work.

---

## 1. The one organizing principle: **blocking seam → parallel fan-out**

Every phase has the same shape, and this is what makes parallel dispatch safe:

1. **One blocking slice** freezes a *contract / seam* (a new module's public interface, a frozen file).
   It must merge before anything else in the phase.
2. **N parallel slices** then only **consume** that seam. They touch **disjoint files**, so they can be
   fanned to separate subagents in isolated worktrees with **no merge collisions**.

The hard failure mode for parallel dispatch is **two subagents writing the same file** (especially
`constants.js`, `Studio.jsx`, `useLayers.js`, `pipeline.js`, `svgExport.js`). §4 (file-ownership
matrix) is the contract that prevents this. **The orchestrator must enforce it:** never run two WIs
concurrently if their *write-owned* file sets intersect.

---

## 2. TDD mode per slice — read this before writing any test

This is a **brownfield refactor of untested code**, not greenfield. Two test modes; every WI declares which:

- **CHARACTERIZATION (golden-master).** The default here. Write a test that **pins the *current*
  observable behavior** of code you are about to restructure. It should pass immediately (proving the
  refactor preserved behavior) — *unless* it encodes a behavior we believe is a **bug**, in which case
  it starts **RED and proves the bug**, and goes GREEN when the WI fixes it. Then refactor under green.
  Use this for everything that reorganizes existing logic (paramOps, fabricationPipeline, the pattern
  DrawingContext migration, Studio decomposition).
- **CLASSIC RED→GREEN (vertical tracer bullets).** One test → minimal impl → repeat, for genuinely
  **new** behavior/modules (`creditModel.js`, share-link size guard). Never write all tests then all
  code (horizontal slicing produces tests of imagined behavior). One behavior at a time.

**Rules for both:** test *behavior through the public interface*, never internals; a test must survive
an internal refactor. Name tests as specifications ("randomizing an iconselect param yields one of its
enum values"), not "test functionX".

**jsdom vs node.** Most targets are pure node (geometry, shareLink, gating, paramOps, creditModel).
Anything that goes through `DOMParser` needs the **jsdom** environment — explicitly: `extractRenderedPaths`
and any `buildPlottableLayers` path that expands SVG transforms/symmetry. Mark those tests
`// @vitest-environment jsdom`. The node-vs-DOM divergence in `pipeline.js` is itself a finding (AR-2B).

---

## 3. Phase / dependency graph

```
P0  TEST HARNESS  ───────────────────────────────  [BLOCKS EVERYTHING] (Sonnet)
      │
      ├─ P1  PURE-LOGIC SEAMS  (fan out — disjoint files, all parallel after P0)
      │     ├─ AR-1A  paramOps + randomize-drift fix      (Sonnet)
      │     ├─ AR-1B  plotter geometry tests + constants   (Sonnet)
      │     ├─ AR-1C  shareLink tests + size guard         (Sonnet)
      │     ├─ AR-1D  tier-gating tests (lock behavior)    (Sonnet)
      │     └─ AR-1E  creditModel extraction               (Sonnet)
      │
      ├─ P2  STRUCTURAL SEAMS  (after P1)
      │     ├─ AR-2A  DrawingContext  ⚠ HIGHEST RISK — staged:
      │     │      ├─ 2A-i   define seam + base class + migrate 3 patterns  [BLOCKING] (Opus)
      │     │      └─ 2A-ii  fan out: migrate remaining 13 patterns          (Sonnet ×N)
      │     ├─ AR-2B  fabricationPipeline (buildPlottableLayers)  (Opus)   [parallel w/ 2A]
      │     └─ AR-2C  persistence consolidation                  (Sonnet) [parallel w/ 2A, 2B]
      │
      └─ P3  GOD-COMPONENT DECOMPOSITION  (after P1; best after P2)  — internally SEQUENTIAL
            ├─ AR-3A  extract Studio domain hooks            (Opus)
            └─ AR-3B  collapse 8-hop param chain + cache hook (Opus)

OPTIONAL / LOW-PRIORITY (only if budget remains; do not spend Opus):
   O-1  collapse dead pro/studio tiers   O-2  modal error boundaries   O-3  mulberry32 shared util (folds into 2A-i)
```

**What's parallel vs sequential, explicitly:**
- P0 alone, first.
- P1: **AR-1A…1E fully parallel** (5 subagents, disjoint write-sets — see §4).
- P2: **2A, 2B, 2C parallel** (disjoint write-sets). *Inside* 2A: 2A-i blocks, then 2A-ii fans out per-pattern.
- P3: **3A then 3B sequential** (both touch the Studio↔LeftPanel↔LayerCard region).
- A phase's blocking work must merge before the next phase starts. P2 and P3 may overlap only if their write-sets are disjoint (they are: P2 = lib/plotter, lib/patterns, services; P3 = Studio/LayerCard/panels) — but P3-B consumes the param plumbing, so prefer P1 fully merged first.

---

## 4. File-ownership matrix (the collision contract)

Within a concurrently-running set, **each file has exactly one writer.** "read" = may import/read only.
If a WI needs to change a file another concurrent WI owns, **serialize them** — do not run concurrently.

| File | P0 | 1A | 1B | 1C | 1D | 1E | 2A | 2B | 2C | 3A | 3B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `package.json`, `vitest.config.*` | **W** | | | | | | | | | | |
| `src/lib/params/paramOps.js` *(new)* | | **W** | | | | | | | | | r |
| `PatternParams.jsx`, `ParamGroup.jsx`, `ParamRow.jsx` | | **W** | | | | | | | | | r |
| `src/lib/useLayers.js` | | **W** | | | | | | | | | →**W** |
| `LayerCard.jsx` | | **W** | | | | | | | | | →**W** |
| `src/lib/plotter/constants.js` *(new)* | | | **W** | | | | | r | | | |
| `src/lib/plotter/pathOps.js`, `overlapCheck.js`, `units.js` | | | **W** | | | | | r | | | |
| `src/lib/plotter/pipeline.js` | | | **W** | | | | | →**W** | | | |
| `src/lib/svgExport.js` | | | **W**¹ | | | | | →**W** | | | |
| `src/lib/plotter/fabricationPipeline.js` *(new)* | | | | | | | | **W** | | | |
| `prepare/OptimizeSection.jsx`,`OverlapWarnings.jsx`,`PlotPreviewSection.jsx`,`OutputModeSection.jsx` | | | | | | | | **W** | | | |
| `src/lib/shareLink.js` | | | | **W** | | | | | | | |
| `src/lib/tierLimits.js`, `useGate.js` | | | | | **W** | | | | | | |
| `src/lib/AuthContext.jsx` | | | | | **W**² | | | | r | | |
| `src/lib/creditModel.js` *(new)* | | | | | | **W** | | | r | | |
| `aiPatternService.js`, `AIPatternChat.jsx`, `AuthButton.jsx` | | | | | | **W** | | | →**W**³ | | |
| `src/lib/patterns/*.js` (16 patterns), `symmetryUtils.js` | | | | | | | **W** | r | | | |
| `src/lib/patterns/drawingContext.js`, base `Pattern` *(new)* | | | | | | | **W** | r | | | |
| `src/lib/useCanvas.js` | | | | | | | **W** | r | | r | |
| `designService.js`, `collectionService.js`, `CloudSaveModal.jsx` | | | | | | | | | **W** | | |
| `src/pages/Studio.jsx` | | | | | | | | | | **W** | r |
| `src/lib/hooks/*` (useCanvasSize, useOptimizations, useDesignPersistence…) *(new)* | | | | | | | | | | **W** | |
| `LeftPanel.jsx`, `LayersSection.jsx` | | | | | | | | | | **W**⁴ | r |
| `src/lib/usePatternCache.js`, `useLayerParams.js` *(new)* | | | | | | | | | | | **W** |
| `src/constants.js` | r | r | r | r | r | r | r | r | r | r | r |

¹ AR-1B touches `svgExport.js` only to import the new shared constants (one-line). ² AR-1D adds a
characterization test for `getEffectiveTier`; only *reads/extracts*, doesn't rewrite AuthContext.
³ AR-2C edits aiPatternService **after** AR-1E has landed creditModel (sequential within the file's
history, not concurrent). ⁴ If P3-A and P3-B must run concurrently, LeftPanel/LayersSection are owned
by 3A; 3B coordinates. **`src/constants.js` is read-only for the entire rework** — no WI rewrites it.
(`→W` = becomes the writer in a *later* phase, not concurrently.)

---

## 5. Global Definition of Done (every WI)

- [ ] **Tests first**, in the declared mode (§2). New/changed behavior is covered; tests assert through
      public interfaces and would survive an internal refactor.
- [ ] `npm test` green (the whole suite, not just the new file). `npm run lint` clean. No console errors.
- [ ] **No behavior change to existing patterns/UI** unless the WI explicitly says so. Param values keep
      their existing types (number/string) — no state migration.
- [ ] Craft contract preserved for any UI touched (it mostly isn't in this rework): saffron = single
      load-bearing accent, hairline borders/no shadows, keyboard-first parity with `Slider.jsx`,
      `prefers-reduced-motion` honored. (Full rules: `docs/param-ux-plan.md` §3.)
- [ ] PR/commit body: names the seam created, the deletion-test result it improves, files touched, and
      any cross-WI coordination. Update this matrix if ownership shifts.
- [ ] Worktree isolation per subagent (`isolation: worktree`) for any WI that runs concurrently with another.

**Why this rework (ranked, deletion-test-positive spine).** Pull-quote for the orchestrator:
the codebase is a **13.6k-LOC studio with zero tests** whose pure logic is **tangled into components**
and whose **pattern engine can't render headlessly** (hard p5 coupling). The recent UI/UX wave added real
debt: the **8-hop param prop-chain** deepened with the new semantic controls; **three divergent
copies** of layer→plottable-path extraction arrived with the prepare workflow (OptimizeSection /
OverlapWarnings / PlotPreviewSection — each computing in a *different* coordinate space); **`new Function`
compilation + a credit model scattered across 4 files** arrived with AI chat. The spine: **(1)** stand up
a test harness, **(2)** extract testable pure-logic seams, **(3)** make the pattern engine
headless-renderable behind a `DrawingContext` seam, **(4)** consolidate the fabrication pipeline,
**(5)** decompose the Studio god-component. Each step is deletion-test-positive: delete the new seam and
complexity reappears across N callers.

---

## 6. Work items (hand each subagent ONLY its own section)

Common preamble for every subagent prompt: *"Repo: generative-art-studio (React 19 + Vite + p5 +
Supabase). Zero pre-existing tests; the harness is from AR-P0 (Vitest). Follow the TDD mode named in your
WI. Touch ONLY your write-owned files (see the WI's File-locks). Do not edit `src/constants.js`. Run
`npm test` and `npm run lint` before reporting done. Report: seam created, tests added (names), files
touched."*

---

### AR-P0 — Test harness  · Sonnet · sequential, merges first · BLOCKS ALL

**Objective.** Stand up the test runner so every later WI can be test-first. No product behavior changes.

**Do.**
- Add dev deps: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
- `vitest.config.js` (or extend `vite.config`): default `environment: 'node'`; allow per-file
  `@vitest-environment jsdom` override; set up coverage; `globals: true`.
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cov": "vitest run --coverage"`.
- One **tracer test** that imports a trivial existing pure fn (e.g. `units.js` mm↔px) and asserts a known
  value — proves the harness runs in CI-less local. One jsdom smoke test (render `<ThemeToggle/>`), proving
  the jsdom path works.

**Acceptance.** `npm test` runs both tests green; jsdom override works; coverage report emits.
**File-locks (W):** `package.json`, `vitest.config.js`, `src/**/__tests__/harness.smoke.test.*`.

---

### AR-1A — `paramOps` seam + randomize-drift fix · Sonnet · P1 (parallel) · mode: CHARACTERIZATION (+1 tracer RED)

**Problem.** The pure param-logic functions are **duplicated and drifted** across components. Critically,
`randomValueForDef` exists twice with **different branch conditions**:
`src/lib/useLayers.js:71` → `if (def.type === 'select')` vs `PatternParams.jsx:23` → `if (def.options)`.
An `iconselect` def (e.g. `shape`, `fillMode`) carries `options` but type `'iconselect'`, so randomizing
it through the **layer-level** path (useLayers) falls into the **numeric** branch and produces a non-enum
value (number/NaN) instead of a valid option. Same drift risk for `randomPatchForDef`, `defaultPatchForDef`,
`isRowDefault` (copied verbatim in `ParamGroup.jsx` and `ParamRow.jsx`), and the tier gate-counting loop
(duplicated in `PatternParams.jsx` and `LayerCard.jsx`).

**TDD.**
1. **Tracer bullet (RED):** in `paramOps.test.js`, write
   *"randomValueForDef for an iconselect def (has `options`, no numeric range) returns one of its option
   values."* Point it at the **useLayers** behavior today → it fails (returns number/NaN). This proves the
   bug before the fix.
2. Create `src/lib/params/paramOps.js` exporting **one** canonical version of each:
   `randomValueForDef` (branch on `def.options`, honoring `randomOptions`/`randomMin`/`randomMax`),
   `randomPatchForDef` (handles `def.axes`, `def.keys`, single `def.key`), `defaultPatchForDef`,
   `isRowDefault`, and `buildGatedParamItems(defs, checkFn)` (the shared gate-counting loop).
   Make the tracer GREEN.
3. **Characterization tests** pinning current correct behavior for: numeric snap-to-step, `randomOptions`
   override, composite `keys`/`axes` patches, `isRowDefault` for composite vs single, gate item counting.
4. Replace the inline copies in `useLayers.js`, `PatternParams.jsx`, `ParamGroup.jsx`, `ParamRow.jsx`,
   `LayerCard.jsx` with imports from `paramOps`. **No behavior change** beyond the iconselect fix.

**Acceptance.** Randomizing `shape`/`fillMode` via the per-layer "Randomize Params" button yields a valid
enum value (tracer green). All copies removed; one source of truth. Existing patterns visually unchanged.
**File-locks (W):** `src/lib/params/paramOps.js`(new)+test, `useLayers.js`, `PatternParams.jsx`,
`ParamGroup.jsx`, `ParamRow.jsx`, `LayerCard.jsx`. (read: `constants.js`, `tierLimits.js`.)

---

### AR-1B — Plotter geometry tests + shared constants + PATH_RE robustness · Sonnet · P1 (parallel) · mode: CHARACTERIZATION

**Problem.** The most algorithmic subsystem (`pathOps`, `overlapCheck`, `pipeline`, `units`) is already
**pure and deep** but **completely untested** — the highest-ROI place to lock behavior. Two latent
fragilities: `pipeline.js` `PATH_RE` assumes `d="…"` is the *first* attribute on `<path>` (silent point
loss if a pattern emits `stroke` first); and `PX_PER_MM`/PPI/`MM_PER_IN` constants are **re-declared in 4
places** (`pathOps`, `svgExport`, `units`, plus inline in `Studio.jsx`).

**TDD (characterization — these pass immediately, pinning behavior; the PATH_RE one starts RED).**
Write golden-master tests for: `rdp` simplification (epsilon edge cases), `mergeLines`, `reorderPaths`
(travel decreases), `intersect` (cardinal/T-junction/near-miss), `parsePathD`↔`pathDFromPoints`
round-trip (idempotent on points; document the 2-dp precision loss), `parseTransformAttr` (composition
order, rotate-with-pivot), `pathStats` (draw vs travel mm), `countOverlaps` (known counts, 3k-segment
truncation), `optimizeGroup` (string-in/out, apply order). **RED test:** a `<path stroke="…" d="…"/>`
input currently loses points → then make `PATH_RE` attribute-order-tolerant (or fall back to DOMParser)
→ GREEN.

**Refactor.** Create `src/lib/plotter/constants.js` (`PPI=96`, `MM_PER_IN=25.4`, `PX_PER_MM`,
`DRAW_SPEED`, `TRAVEL_SPEED`) and import it everywhere those constants are currently re-declared (one-line
edits in `pathOps`, `svgExport`, `units`; leave the `Studio.jsx` inline for AR-3A to pick up — note it).

**Acceptance.** ~8 pure-function suites green; PATH_RE tolerant of attribute order; constants single-sourced.
**File-locks (W):** `src/lib/plotter/constants.js`(new), `pathOps.js`, `overlapCheck.js`, `pipeline.js`,
`units.js`, `svgExport.js`(import-only), + new tests. (Note: `pipeline.js`/`svgExport.js` are handed to
AR-2B in P2 — 1B must merge first.)

---

### AR-1C — shareLink tests + size guard · Sonnet · P1 (parallel) · mode: CHARACTERIZATION + CLASSIC for guard

**Problem.** `shareLink.js` is a clean pure base64url encode/decode seam (great first TDD target) but has
**no size guard** — an oversized design silently produces an unusable URL.

**TDD.** Characterization: encode→decode identity; protocol/version mismatch → null; malformed token →
null; round-trips large JSON. **Classic RED→GREEN** for the new behavior: *"encodeShare returns
`{ url, tooLarge: true }` (or throws a typed error) when the encoded length exceeds a safe URL ceiling
(~8k chars)"* → implement the guard minimally.

**Acceptance.** Round-trip + failure-mode tests green; oversized state surfaces a signal instead of a
broken URL; callers (`ShareLinkButton`) handle the signal (read-only check; no UI redesign required here).
**File-locks (W):** `src/lib/shareLink.js` + test. (read: `ShareLinkButton.jsx` to confirm caller contract.)

---

### AR-1D — Tier-gating tests (lock behavior) · Sonnet · P1 (parallel) · mode: CHARACTERIZATION

**Problem.** `tierLimits.checkGate` is pure with ~10 feature branches and **zero tests**; gating decisions
are scattered (raw `limits.field` reads re-derived in `CloudSaveModal`). Also `getEffectiveTier`
(`AuthContext`) runs an elaborate subscription state machine while **`free`/`pro`/`studio` limits are
byte-identical** today (dead differentiation). We are **locking behavior**, not changing it (the
pro/studio collapse is OPTIONAL O-1, post-lock).

**TDD (characterization).** For each feature case (`pattern`, `layers`, `preset`, `customSize`, `param`,
`seed`, `cloudSave`, `share`, `fork`, `collections`, `history`, `aiCredits`) × {guest, free, pro, studio}:
pin `{ allowed, reason, upgradeTarget }`. For `getEffectiveTier`: each subscription status, expiry
boundaries, null profile → guest. Document (in the test file header) that pro≡studio≡free today — so O-1
becomes a safe deletion later.

**Acceptance.** Gate matrix fully characterized; any future change to tier rules now has a regression net.
**File-locks (W):** `src/lib/tierLimits.js`(+ `useGate.js` if needed) + tests; `AuthContext` *read/test only*.

---

### AR-1E — `creditModel` extraction · Sonnet · P1 (parallel) · mode: CLASSIC RED→GREEN

**Problem.** The AI-credit model is smeared across 4 files: cost constants in `aiPatternService`, the magic
number `24` hardcoded in `AuthButton` and `AIPatternChat`, `canGenerate` derived client-side in the chat,
balance read from `profile.ai_credits`. No single definition.

**TDD (classic, new module).** Tracer: *"`creditCost('revision')` returns the revision cost."* → minimal
`src/lib/creditModel.js`. Then one behavior at a time: `creditCost('new')`, `STARTING_CREDITS`,
`canGenerate(credits, mode)` (boundary at exactly cost), `displayBalance(credits)`. Then replace the
scattered literals in `aiPatternService`, `AIPatternChat`, `AuthButton` with imports.

**Acceptance.** One module owns costs/starting-credits/eligibility; no magic `24` left in components
(grep clean); chat + AuthButton render identical numbers as before.
**File-locks (W):** `src/lib/creditModel.js`(new)+test, `aiPatternService.js`, `AIPatternChat.jsx`,
`AuthButton.jsx`. (Sequenced before AR-2C touches `aiPatternService`.)

---

### AR-2A — DrawingContext seam (headless-renderable patterns) · ⚠ HIGHEST RISK · P2 · staged

> This is the keystone deepening and the biggest blast radius (16 pattern files + `useCanvas`). Stage it.
> Today every pattern's `generate(p, …)` calls p5 globals directly, so **no pattern can be tested without a
> real p5 canvas**; the existing offscreen proxy in `useCanvas` stubs only ~26 of p5's methods, so hidden
> layers silently mis-render (e.g. Phyllotaxis uses `p.triangle`/`p.rectMode`, absent from the proxy).
> The pattern "contract" (`generate` / `generateWithContext` / `toSVGGroup` populating `this.svgElements`)
> is **implicit and undocumented**; the `generateWithContext`+`toSVGGroup` boilerplate is copy-pasted 16×.

#### AR-2A-i — Define the seam + base class + migrate 3 patterns · Opus · BLOCKING within 2A · mode: CHARACTERIZATION
**Do.**
- Define `DrawingContext` — the explicit interface every pattern draws through (the union of p5 methods
  patterns actually use; enumerate by grepping `p\.` across `patterns/*.js`). Provide two adapters:
  `P5Adapter` (wraps a live p5 instance — production) and `RecordingContext` (records draw calls + RNG —
  **headless tests**). Fold the shared `mulberry32` (O-3) into a `rng.js` the context exposes.
- Introduce a base `Pattern` class documenting the contract (JSDoc): `generate(ctx, seed, params, w, h,
  color, opacity)`, `generateWithContext(...)` (stores `_lastParams/_lastCx/_lastCy`, calls `generate`),
  `toSVGGroup(...)` implemented once in the base via a `contentFor(color)` hook subclasses override.
- **Migrate 3 reference patterns** (pick a simple one, a noise one, a `mulberry32` one — e.g. `Grid`,
  `FlowField`, `Duality`) from `p` → `ctx`. Write **headless characterization tests** via `RecordingContext`
  pinning their emitted draw-call/SVG output for a fixed seed+params (golden master).
- Wire `useCanvas` to inject `P5Adapter` in production and complete/replace the offscreen proxy with the
  same `DrawingContext` so hidden-layer rendering matches visible.

**Freeze & publish the contract** (signature + `contentFor` hook + which p5 methods `DrawingContext`
guarantees). 2A-ii subagents code against this frozen doc.

**Acceptance.** 3 patterns render headlessly under test with golden output; on-canvas rendering of those 3
is pixel-identical to `main`; contract documented in `drawingContext.js` header.
**File-locks (W):** `src/lib/patterns/drawingContext.js`+`rng.js`+base `Pattern` (new), `useCanvas.js`,
the 3 migrated pattern files, + tests. (read: `symmetryUtils.js`.)

#### AR-2A-ii — Fan out: migrate remaining 13 patterns · Sonnet ×N · parallel after 2A-i · mode: CHARACTERIZATION
Each subagent owns **exactly one** pattern file + its test. Per pattern: write a `RecordingContext`
golden-master test pinning current output (seed+params fixed) → migrate `p`→`ctx` and onto the base class
→ test stays green. Independent, no shared writes (each owns its own file). Batch 13 across subagents.
**Acceptance per pattern.** Headless test green; on-canvas output unchanged; boilerplate now inherited.
**File-locks (W):** one `patterns/<Name>.js` + its test, per subagent. (read: `drawingContext.js`.)

---

### AR-2B — `fabricationPipeline` (one canonical render→plot model) · Opus · P2 (parallel w/ 2A) · mode: CHARACTERIZATION

**Problem.** Layer→plottable-path extraction is **reimplemented three times**, each in a *different
coordinate space*, producing potentially **different answers** for the same design:
`OptimizeSection`(`usePreviewStats`, pre-transform/pre-symmetry), `OverlapWarnings`(`useOverlapSummary`,
post-transform/symmetry via `extractRenderedPaths`), `PlotPreviewSection`(`buildRoute`+`routeTiming`,
post-optimize, with `estimateTimeSec` re-implemented inline). `svgExport` tangles pure SVG-string building
with the DOM `downloadSVG` side effect.

**TDD (characterization first — pin reality before unifying).** Before refactoring, write tests capturing
what each of the three call sites computes today for a fixture design (this *documents* the divergence —
expect them to disagree; that disagreement is the finding). Then build `src/lib/plotter/fabricationPipeline.js`:
`buildPlottableLayers(layers, instances, { optimizations, includeHidden }) → [{ layerId, color, role,
paths, stats:{paths,points,drawMm,travelMm,seconds} }]` in **one** canonical space
(post-transform → post-symmetry → post-optimize). Split `svgExport` into pure `buildLayerSVG(...) → string`
(node-testable) and `downloadSVG(svg, name)` (DOM side-effect, isolated). Route all three prepare
components + the export manifest through `buildPlottableLayers`. Tests for the transform/symmetry path use
**jsdom** (`extractRenderedPaths` needs `DOMParser`); document the node-fallback divergence and make the
node path match (or fail loudly) rather than silently differ.

**Acceptance.** Optimize stats, overlap counts, and plot-preview timing all derive from one extraction →
they agree by construction; `buildLayerSVG` unit-tested in node; three prepare components contain UI only
(their `useX` hooks reduced to calling the pipeline). Deletion test: delete `fabricationPipeline` and the
fabrication logic reappears in all three components.
**File-locks (W):** `src/lib/plotter/fabricationPipeline.js`(new), `pipeline.js`, `svgExport.js`,
`prepare/OptimizeSection.jsx`, `OverlapWarnings.jsx`, `PlotPreviewSection.jsx`, `OutputModeSection.jsx`
(use `roleColor` from `fabrication.js` instead of inline) + tests. (read: `pathOps.js`, `plotter/constants.js`.)

---

### AR-2C — Persistence/service consolidation · Sonnet · P2 (parallel w/ 2A, 2B) · mode: CHARACTERIZATION + guard tests

**Problem.** `CloudSaveModal` reaches **directly into Supabase** for `design_history` reads (lines ~57,74),
duplicating the read side of a table `designService.saveHistorySnapshot` owns the write/prune side of —
the app↔Supabase seam's one clear breach. `collectionService.deleteCollection/renameCollection` scope by
id only (RLS-only, inconsistent with the userId-scoped reads). `aiPatternService` **deducts credits before
the edge call and before the auth check, with no refund on failure**, and `compilePatternClass` runs
`new Function(...)` returning `undefined` silently if `PatternClass` is undefined (callers register it
anyway).

**TDD.** Mock the injected `supabase` client (services should accept it or import a mockable singleton).
Characterize current service contracts; add **RED guard tests** for the new behaviors: *"a failed edge
generation refunds the deducted credits"*, *"compilePatternClass throws a typed error when source omits
PatternClass"*, *"loadDesignHistory lives in designService"*. Then: hoist `design_history` reads into
`designService.loadDesignHistory/loadHistorySnapshot`; add `userId` to collection mutations; add
credit-refund + post-compile null-check + validate `name`/`paramDefs`/`defaultParams` before registering.

**Acceptance.** `CloudSaveModal` no longer imports `supabase` (pure UI calling the service); failed AI
generation no longer burns credits; invalid compiled patterns rejected with a clear error.
**File-locks (W):** `designService.js`, `collectionService.js`, `aiPatternService.js`, `CloudSaveModal.jsx`
+ tests. (Runs after AR-1E for the `aiPatternService` history; read: `creditModel.js`.)

---

### AR-3A — Extract Studio domain hooks · Opus · P3 (after P1; sequential before 3B) · mode: CHARACTERIZATION

**Problem.** `Studio.jsx` (701 lines) is a god-component: **~19 useState + 3 useRef + 3 useEffect + 5
useCallback + 4 domain hooks**, holding 7 independent concerns (canvas sizing, optimization state machine,
dirty-tracking/persistence, cloud sync, modal/UI chrome, examples, export manifest). Adding any feature
means editing Studio.

**TDD.** These hooks hold logic that's currently untestable inside the component. Extract to
`src/lib/hooks/`: `useCanvasSize` (preset/dims/unit/margin/outputMode), `useOptimizations` (preview-vs-
applied state machine), `useDesignPersistence` (serialize/dirty/localStorage/share-hydration),
`useCloudPersistence` (save/load handlers), `useUIState` (modal/chrome flags, or a reducer). Write
characterization tests via `@testing-library/react`'s `renderHook` pinning each hook's behavior (e.g.
"optimization preview tolerance never leaks into the applied value until Apply"). Studio becomes a thin
coordinator composing the hooks + `<LeftPanel/>`/`<RightPanel/>`. Pick up the inline PPI math noted by 1B.

**Acceptance.** Studio < ~250 lines, no domain logic beyond composition; each extracted hook has a
behavior test; app behaves identically (dirty-tracking, optimization apply/revert, cloud save/load, examples).
**File-locks (W):** `src/pages/Studio.jsx`, `src/lib/hooks/*`(new), `LeftPanel.jsx`, `LayersSection.jsx`
(prop threading only) + tests.

---

### AR-3B — Collapse the 8-hop param chain + `usePatternCache` · Opus · P3 (after 3A) · mode: CHARACTERIZATION

**Problem.** A single param keystroke tunnels **8 hops**: Studio → LeftPanel → LayersSection → LayerCard →
PatternParams → ParamGroup → ParamRow → ParamControl. Every intermediary re-renders; adding a param-level
side-effect means editing ~5 files. `LayerCard` (437 lines) also embeds an opaque **pattern-switch cache**
state machine (saves/restores prior params per type) tangled with gate-checking.

**TDD.** Extract `usePatternCache(layerId)` (the cache machine, currently `LayerCard:45–93`) and a
`useLayerParams(layerId)`/context that exposes `{ params, onChange, randomizeKeys }` at the LayerCard
boundary, collapsing the deep closure tower to ~3 hops. Characterization tests: "switch pattern A→B→A
restores A's exact params"; "a param change reaches state without remounting siblings". Consumes the
`paramOps` seam from AR-1A (use its `buildGatedParamItems`).

**Acceptance.** Param updates flow through ≤3 hops; cache logic is a tested hook out of LayerCard; switch
round-trip test green; no behavior change to editing/randomize/reset.
**File-locks (W):** `LayerCard.jsx`, `useLayers.js`, `usePatternCache.js`/`useLayerParams.js`(new),
`PatternParams.jsx`/`ParamGroup.jsx`/`ParamRow.jsx` (threading) + tests. (Run after 3A; both touch the
Studio↔LayerCard region — do not parallelize.)

---

## 7. Suggested dispatch sequence (orchestrator quick-reference)

1. **AR-P0** → merge.
2. Fan out **AR-1A, 1B, 1C, 1D, 1E** concurrently (5 worktrees) → merge each as green.
3. Fan out **AR-2A-i**, **AR-2B**, **AR-2C** concurrently → merge 2A-i → fan out **AR-2A-ii** (per-pattern,
   batched) → merge.
4. **AR-3A** → merge → **AR-3B** → merge.
5. If budget remains: **O-1, O-2, O-3** (Sonnet; skip if not).

Each merge: run full `npm test` + `npm run lint` on the integrated tree before starting the next
concurrent set. If a WI's write-set would collide with an in-flight WI (§4), serialize them.
