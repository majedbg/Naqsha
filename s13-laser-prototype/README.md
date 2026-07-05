# S13 (#62) — Laser-cut prototype package (FILLED-CONTOUR variant)

Final milestone of the Naqsha **Photo → Pattern Extraction** feature (#48): take a
real ornament photograph through the **FREE** pipeline and produce a
**load-and-cut** laser SVG for a ~100 mm tile on 3 mm plywood.

**This is a HITL (human-in-the-loop) stop. Everything here is *prepared* for a
physical cut. No physical cut was performed.** The human performs the cut.

This is the **FILLED / contour variant.** An earlier regeneration used the
**centerline default** — it thinned the lattice members to single-stroke *score*
lines, giving a clean but **sparse line-net** (engrave 20 / score 8). This
variant instead emits every traced member as a **FILLED closed contour**
(engrave), so the tile reads as the **solid star-and-rosette lattice** of the
clean binary — solid members, filled rosettes, pierced cells — not thin lines.
Both are supported (locked **decision 9**); centerline is just the default.

---

## Files

| File | What it is |
|------|------------|
| `jali-source.jpg` | The source photograph (CC0). See `SOURCE.txt`. |
| `SOURCE.txt` | Source URL, license, attribution, and why it was chosen. |
| `pattern.svg` | The exported cut file — genuine pipeline output, two documented fabrication-prep edits, ~100 mm. |
| `pattern-preview.png` | Rendered preview of the **shipped** `pattern.svg` (preview == deliverable). |
| `binary-reference.png` | The tuned **binary** (`binarize(image, TUNED)`) — the filled look this variant targets. For the honest side-by-side. |
| `README.md` | This file. |

---

## The centerline-vs-contour mechanism (how this variant is FILLED)

`vectorize()` (`src/lib/extraction/vectorizer.js`) returns per-motif
`components`, and **every component carries BOTH representations**:

- `contour` — the closed outline (evenodd, holes included). **Always present**
  (the guaranteed single-motif floor, decision 8).
- `centerline` — the Zhang–Suen skeleton, a single open stroke. `null` when the
  skeleton is degenerate.

`vectorize` then **classifies** each: long-thin line-work defaults to
`kind:'stroke'` / `role:'score'` (draw the centerline), solid blobs default to
`kind:'fill'` / `role:'engrave'` (fill the contour). This classification is the
**default**, and it is what made the earlier regeneration a sparse line-net — the
lattice members are long and thin, so they classified as centerline strokes.

The **Review step** lets the user flip any component. In
`ExtractStepper.jsx`, `toggleShapeKind` maps **centerline → `{kind:'fill',
role:'engrave'}`** (and back). `buildTile` honours the edit: `kind:'fill'` emits
`shape.contour.d` as a filled evenodd path; `kind:'stroke'` emits
`shape.centerline.d` as an open stroke.

**This variant's one lever:** apply that Review edit to **every** shape —
`edits = shapes.map(() => ({ kind:'fill', role:'engrave' }))`. Because every
component always has a `contour`, this yields **all filled closed contours, zero
centerline strokes**. It is the genuine product mechanism (decision 9's toggle),
applied uniformly. Driver: `scripts/verify-s13-contour.mjs` (the centerline
default is `scripts/verify-s13.mjs`; the **only** difference between them is this
edits line).

## Pipeline route (genuine functions)

Run through the real library functions under the project's module loader — the
same path ExtractStepper + Studio take on the free "keep the traced tile" flow.

```
decode jali-source.jpg  (PIL: central 1400×1400 crop → downscale to 760 px)  [see note]
  → runExtraction({ image, options: { trace: {
        invert:true, adaptive:true, window:25, k:0.2, blur:1, minArea:5 } } })   pipeline.js
        (== ExtractStepper AUTO_CLEAN_PRESET as buildTraceOptions() serializes it)
        stages: flatten:skipped → lattice:done → symmetry:done → trace:done
  → shapesFromResult                                    (verbatim from ExtractStepper)
  → edits = every shape → {kind:'fill', role:'engrave'} ← THE FILLED-CONTOUR LEVER
  → buildTile(result, shapes, edits)                    (verbatim from ExtractStepper)
  → makeExtractedPattern({ tile, lattice, symmetry })   extractedPattern.js
  → makeExtractedPatternClass(entity) → instance        ExtractedPatternGenerator.js
  → buildAllLayersSVG([layer],[instance],378,378,false,{ profileId:'laser' })   svgExport.js
        → #68 role colors applied (engrave #000000 / score #0000FF / cut #FF0000)
  → fabrication-prep edit 1: strip the presentation white background <rect> (no data-role)
  → fabrication-prep edit 2: add one 100 mm perimeter as a data-role="cut" red path
  → pattern.svg
```

**Tuned preprocessing (kept identical to the clean-binary run):** `invert:true`
+ Auto-clean adaptive (`adaptive:true, window:25, k:0.2, blur:1, minArea:5`) —
the verbatim `AUTO_CLEAN_PRESET` from `ExtractStepper.jsx`. Invert traces the
**light stone members** (not the negative-space gap-web); the Sauvola local
threshold + light blur + min-area produce the coherent connected binary you see
in `binary-reference.png`.

**Decode divergence (documented):** the pixel decode is **PIL**, not the app's
browser `Image`. The fidelity-relevant part — the CV pipeline (lattice /
symmetry / trace, including the preprocessing) — is genuine, unmodified app code.

**Crop deviation (documented, and it matters).** A full central square crop of
the 3615×5026 photo captures 40+ repeats, so lattice detection locks onto a
degenerate ~18 px cell. To get a cell at *member scale*, the central crop window
was tightened to **1400×1400 px** before the 760 px downscale, yielding a
**201×207 px** square super-cell tiled **2×2** across the 100 mm sheet. ~1400 px
is a reasonable member-scale choice, not a uniquely "correct" one.

## The exported SVG

- **Physical size:** `width="100.01mm" height="100.01mm"`,
  `viewBox="0 0 378 378"` (378 px ÷ 96 PPI × 25.4 = 100.01 mm). Real-world units.
- **Detected structure:** square lattice, cell **201×207 px**, confidence
  **0.74**; symmetry **p1** (confidence **0.18**). The paid S12 star-family fit
  correctly did **not** clear its honest gate on this crop, so the free
  **traced-tile** path was kept (no star proposal surfaced).
- **Components:** 7 per super-cell (default kinds `stroke, fill, fill, stroke,
  fill, fill, fill` — 2 would have been centerline strokes), **all forced to
  filled contour**, tiled 2×2.
- **Per-role path counts + colors (read from the emitted file):**

  | role | count | color | presentation |
  |---|---|---|---|
  | `engrave` | **28** | `#000000` black | **filled** (`fill-rule="evenodd" stroke="none"`) |
  | `score` | **0** | — | none — this is the filled variant |
  | `cut` | **1** | `#FF0000` red | the added 100 mm perimeter (see below) |

  **Engrave-fill-dominated, as intended** (contrast the centerline variant's
  20 engrave / 8 score). Every one of the 28 engrave paths is a **closed
  contour** (all carry a `Z`; verified 0 open) drawn as an evenodd fill — solid
  lattice members, not thin lines. Their bbox aspect ratios span **1.02–4.24**
  (median ~1.83): compact filled regions, **no long slivers** (an aspect ≫6 would
  signal a line accidentally traced as a doubled outline — none here). This
  proves **#68** too: distinct, separately-mappable operation colors.

- **Two documented fabrication-prep edits** (the only hand-edits to
  `buildAllLayersSVG` output; both keep the file genuinely load-and-cut):
  1. **Stripped the presentation white background `<rect>`.** `buildAllLayersSVG`
     emits a full-tile `<rect fill="white"/>` with **no `data-role`** — a preview
     backdrop, not geometry. Left in, laser software would import it as a
     full-tile filled shape (and, in a filled/engrave-heavy design, a giant
     unwanted raster). It carries no role, so removing it is unambiguously safe
     and is what makes the file one-load-cuttable. **The shipped `pattern.svg`
     has no white rect.**
  2. **Added the 100 mm perimeter cut.** The traced tile has no cut geometry —
     nothing releases the 100 mm piece. A single `data-role="cut"` red path was
     added as an explicit fabrication boundary: a square inset 0.5 px
     (`M0.5 0.5 H377.5 V377.5 H0.5 Z`, `stroke="#FF0000"`). **Not pipeline
     output** — a fabrication boundary so the piece releases.

- **Single-pass centerline:** moot here — there are **0** score strokes.

## Fidelity — honest read

**Verdict: this IS the filled star-and-rosette payoff.** Put
`pattern-preview.png` next to `binary-reference.png`: the filled-contour tile
reproduces the binary's **solid lattice** — solid X-crossing members, filled
quatrefoil/floral rosettes at the star centers, star cells, and the small square
cells with their tiny pierced holes preserved. It is a **large, obvious step up**
from the sparse centerline line-net: solid black *area*, not single strokes. The
2×2 super-cell repeat is coherent and reads as one connected ornament.

**Honest caveats (no flattery):**
- **Slightly softer / more organic than the crisp binary.** potrace smooths and
  rounds the traced outlines, so members are gently rounded and a few rosette
  lobes read as **filled paisley/comma blobs** rather than crisp 4-petal petals.
  It is the *filled* ornament, faithfully — just a touch more painterly than the
  hard-edged binary.
- **A couple of rosette clusters are quite solid** (bordering on a small black
  blob) where the binary had fine internal breaks. Not an over-filled mess, but
  the finest interior detail of those motifs is simplified.
- **Some members are bold/thick** — good for a laser engrave (survives cleanly),
  but the delicacy of the thinnest stone ribs is slightly heavier than the photo.
- Symmetry is **p1** (conf 0.18), so this is the *raw traced tile* of this crop,
  not an idealized/symmetrized rosette panel. The star/rosette structure is
  genuine to the photo, not enforced.

Bottom line: **filled, solid, clearly star-and-rosette — matches the binary's
filled character**, with potrace's characteristic softening as the only honest
gap. Meaningfully richer than the line-net variant.

## Before you cut — required steps

1. **Confirm the color→operation map** in your laser software: black `#000000`
   → Engrave, red `#FF0000` → Cut. (No blue/score in this variant.)
2. **Sanity-check the added perimeter** is your intended outline / size (~100 mm).
3. **This variant is engrave-heavy** — 28 filled regions raster-fill across the
   whole tile, so **engrave/raster time is much longer** than the line-net
   variant (which mostly scored). Budget accordingly and check your fill line
   interval.
4. **Run a test cut/engrave on scrap 3 mm plywood first.**

(The white background rect older exports carried has already been removed, so
there is nothing extra to delete on import.)

## Laser settings starter table — 3 mm plywood

Power/speed are **machine-specific**. These are conservative **starting points**
only — **always run a test cut/engrave on scrap of the same 3 mm plywood first**
and adjust. Ranges bracket a typical hobby CO₂ (~40 W) and a 10 W diode.

| Role → color | Laser operation | CO₂ ~40 W (start) | Diode ~10 W (start) | Notes |
|---|---|---|---|---|
| `engrave` → `#000000` black | **Engrave** (raster fill; or light vector fill) | ~20–35 % power, 150–300 mm/s (raster) | ~40–60 % power, 800–1500 mm/min (raster) | The dominant op here — 28 solid regions. **Raster-fill is slow over this much area**; consider a coarser fill interval / grayscale-depth pass. Test the fill interval on scrap. |
| `cut` → `#FF0000` red (added perimeter) | **Cut** (through) | ~65–90 % power, 8–15 mm/s, 1–2 passes | ~100 % power, 150–250 mm/min, 3–6 passes | Must sever 3 mm plywood; expect multiple diode passes. Add tabs if needed. |
| — | — | Air assist ON for cut; focus to top surface. | Air assist ON if available. | Plywood scorches — mask/tape or reduce power for clean edges. Engrave-heavy = more smoke; keep exhaust running. |

## Provenance / reproducibility

- Dedicated clone `Naqsha-extraction`, `main` @ `565bb28` (extraction S0–S12 +
  #69 + #68 + #70a/#70b merged, **3260 tests green**). **No product source was
  modified for this deliverable** — only reusable QA drivers were used
  (`scripts/verify-s13.mjs` centerline default; `scripts/verify-s13-contour.mjs`
  this filled variant).
- Fixes exercised here: **#69** (invert/polarity), **#68** (role→color laser
  export), **#70** (adaptive Sauvola threshold + blur + min-area — the Auto-clean
  preset). The filled look uses **decision 9's centerline↔contour toggle**.
- **No physical cut was performed. STOP here — the human performs the cut.**
