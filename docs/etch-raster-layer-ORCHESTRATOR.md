# Raster Etch Layer — Orchestrator Prompt

> **STATUS: READY (not yet executed)**
> **Generated:** 2026-07-12 · grilled via `/grill-with-docs`
> **Spec:** this file + `CONTEXT.md` (Raster Etch section) + `docs/adr/0006-raster-etch-embedded-bitmap-not-vector.md` + `docs/adr/0007-etch-stack-distinct-raster-subsystem.md`
> **Issues:** #80 (S1) → #89 (S10) on `majedbg/Naqsha`
> **Usage:** paste everything below the divider into a fresh session as the opening prompt.
> **Pre-condition:** in the `generative-art-studio` checkout (remote = `majedbg/Naqsha`), branch off `main`, working tree clean. If `CONTEXT.md` / the two ADRs are uncommitted, commit them as the spec baseline first (`docs(etch): spec baseline — CONTEXT + ADR-0006/0007`) so every wave branches from a spec-complete `main`.

---

You are the ORCHESTRATOR for the **Raster Etch** layer in Naqsha — a new layer type
that turns an imported photograph into a laser engraving by mapping its tonal values
to a 1-bit dot field, exported as an embedded bitmap. Work autonomously; only stop
for the pre-flight check, a genuine spec contradiction, or a HITL slice.

## Why (one paragraph)

Every fabrication layer in Naqsha is vector today (patterns, imports, text, motifs →
SVG paths; the s13 laser prototype and all of `extraction/` deliberately *vectorize*
a binarized image). Etch breaks that on purpose: on mirror acrylic, any etched pixel
irreversibly scars the mirror finish, so the maker needs **exact, WYSIWYG control**
over which dots etch — control that is lost the moment dithering is delegated to
LightBurn. The Etch dithers to a locked 1-bit bitmap in-app and embeds it in the SVG,
so what renders on screen is bit-for-bit what etches. Much of the pixel machinery
already exists in `src/lib/extraction/` (`imageIO.js`, `preprocess.js`:
`toGrayField` / `adjustField` / `blurField` / `globalMask` / `adaptiveMask`) and the
`ExtractStepper` Refine step is a working glass-box precedent — but it is wired to a
modal photo→vector-pattern flow. Etch is a persistent canvas layer with a live,
reorderable effect rack that keeps the image *raster*.

## Grilled decisions (binding — do NOT relitigate)

1. **New `etch` layer type.** A persistent canvas layer alongside pattern/import/
   text/motif — NOT an extension of the Extract stepper. Reuse `extraction/`'s pure
   pixel helpers, but Etch is its own subsystem.
2. **Exports as an embedded 1-bit bitmap, never vector** (ADR-0006). `<image>`
   data-URI at engrave colour; cut/score stay vector → ADR-0001 two-path intact.
   `svgExport` gains net-new `<image>` handling.
3. **Etch Stack of Stages** (ADR-0007) — a reorderable, bypassable rack. Distinct
   subsystem from the motif Chain/Block; reuse NONE of that vocabulary.
4. **WYSIWYG single-source invariant (the spine of the whole feature).** All Stages
   are pure CPU functions run in a Web Worker (reuse the `extraction.worker.js`
   pattern). The **same** 1-bit buffer that renders on the p5 canvas is the one that
   exports. Never a shader-preview + separate-CPU-export split. Every wave must keep
   a test asserting rendered pixels == exported pixels.
5. **Highlight Hold is a fixed terminal clamp, not a Stage.** Applied AFTER screening
   so no error-diffusion can violate it; can't be reordered or bypassed away.
   Material-aware default (gold-mirror → on).
6. **Reuse the engrave Operation; DPI lives on the layer** (default 254). No new
   process type — cut/score/engrave/pen stays intact.
7. **Hybrid source storage.** Guest/offline → capped (≤~1024px) data-URI in the local
   draft. Signed-in → private bucket + `sourcePath` (S7, human-gated migration).
8. **Screening semantics.** Exactly one screening Stage active at a time (Dither or
   Halftone); with none present, a plain-threshold fallback runs before the Hold.
9. **Vocabulary is law** (`CONTEXT.md` Raster Etch): **Etch**, **Etch Stack**,
   **Stage**, **Highlight Hold** — in identifiers, comments, and test names. Forbidden
   here: Chain, Block, Pass, effect, filter, device (all reserved/avoided elsewhere).

## Ground rules (standing orchestration policy)

- **TDD every slice** (`/tdd`): write failing vitest first → implement to green →
  refactor. Tests colocate next to source. This is non-negotiable per slice.
- **One agent at a time.** Full build → adversarial Opus review → address findings →
  merge, before the next slice starts. No parallel slices; no starting a wave before
  the prior wave is merged and green.
- **Subagents run on Opus or Sonnet — never Fable.**
- **Serialize browser use.** Only one agent drives Playwright at a time; never two
  concurrent browser sessions.
- **Adversarial Opus review each slice** before merge — correctness + the invariants
  in decisions 4, 5, 8 specifically (buffer identity, post-dither hold, one-screen).
- CONTEXT vocabulary exactly (decision 9). Match surrounding idiom: header comments
  explaining WHY, same density as `useLayers.js` / the extraction suites.
- One conventional commit per slice on green: `feat(etch): <summary>` (or
  `docs(etch:)` / `chore(etch:)`). `npm test` + `npm run lint` fully green at every
  slice boundary.
- Reuse `extraction/` helpers wherever they fit (`imageIO`, `preprocess`); do not
  reimplement grayscale/brightness/contrast/blur/threshold from scratch.

## Execution order (sequential — dependency-driven)

Each wave = one issue = one agent, taken to merge before the next begins.

| Wave | Issue | Slice | Type | Depends on |
|------|-------|-------|------|-----------|
| 1 | #80 | Etch layer spine (import → threshold → render → embedded-bitmap export) | AFK | — |
| 2 | #81 | Etch Stack (reorderable rack) + Tone Stage (exposure/brightness/contrast + Levels) | AFK | #80 |
| 3 | #82 | Dither Stage (Floyd–Steinberg + ordered Bayer) + screening semantics | AFK | #81 |
| 4 | #83 | Highlight Hold (hard post-dither white guarantee, material-aware) | AFK | #82 |
| 5 | #84 | Halftone Stage (AM dots) | AFK | #82 |
| 6 | #85 | Paper texture Stage | AFK | #81 |
| 7 | #87 | Run Plan raster estimate (area×DPI) + Export Receipt note | AFK | #80 |
| 8 | #88 | 1:1 "what etches" preview hero | AFK | #80 |
| 9 | #86 | Signed-in bucket source storage (migration) | **HITL** | #80 |
| 10 | #89 | LightBurn threshold-pass verification | **HITL** | #80 |

Notes:
- Waves 7–8 depend only on #80 and may be resequenced earlier if convenient — but
  still one-at-a-time, fully merged before the next.
- **HITL waves (9, 10): STOP and hand to the human.** Wave 9 authors the migration
  but must NOT auto-apply it — document it in `NEEDS-HUMAN.md` (join the existing
  unapplied-migration list). Wave 10 is a human fabrication test (export an Etch SVG →
  import to LightBurn → confirm no re-dither). Do not attempt either yourself.

## Per-slice loop (apply to every AFK wave)

1. Read the issue (`gh issue view <n> -R majedbg/Naqsha`) + the referenced ADR/CONTEXT.
2. Branch off `main` (clean tree). `/tdd`: failing tests first, to green, refactor.
3. Keep the single-source invariant test (decision 4) passing; add slice-specific
   invariant tests (decision 5 for #83, decision 8 for #82/#84/#85).
4. Browser-verify the user-visible behaviour (serialized Playwright) with a real image.
5. Adversarial Opus review; address findings; re-run `npm test` + `npm run lint`.
6. Commit (`feat(etch): …`), merge to `main`, close the issue. Then — and only then —
   start the next wave.

## Definition of done (feature)

- Import a photo → Etch layer → tune Tone/Dither/Halftone/Paper in a reorderable Etch
  Stack → Highlight Hold protects mirror highlights → export an SVG whose embedded
  1-bit `<image>` is exactly the on-screen preview, with cut/score still vector.
- `npm test` + `npm run lint` green; browser-verified end-to-end.
- Human items parked in `NEEDS-HUMAN.md`: migration application (#86) and the
  LightBurn verification (#89) with its PNG-sidecar fallback decision (ADR-0006).
