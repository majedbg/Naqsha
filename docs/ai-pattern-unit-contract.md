# AI-Pattern Unit-Tag Contract (issue #13)

How AI-generated (and hand-authored) pattern param defs declare units so the
shell Inspector can present px-backed lengths in the user's chosen unit (mm/in)
**without ever changing the geometry that is generated or exported**.

## The one rule

Param values are **always pixels** (at 96 PPI). The `unit` tag is *display-only
metadata*. Pattern generation and SVG/export read the same px numbers they always
have — they must never branch on the active unit.

## The schema

Each entry in `PATTERN_PARAM_DEFS[patternType]` is a param def object. The unit
tag is an **optional** field on that object:

```js
{ key: 'amplitude', label: 'Amplitude', min: 5, max: 500, step: 1,
  unit: 'length', tooltip: '…' }
```

| `unit` value | Meaning | Inspector behaviour |
| --- | --- | --- |
| `'length'` | A px-backed real-world length (distance / size / offset in px). | Readout shown in the active document unit (mm/in); typed entry converted back to px via `src/lib/units.js`. Slider bounds (`min`/`max`/`step`) stay px — only the displayed number and parsed entry are unit-aware. |
| *(absent)* | Unitless / raw. | Displayed verbatim, unchanged. |

There is currently exactly one tag value, `'length'`. Absence is the default and
means "raw number".

## When to tag `unit: 'length'`

Tag a param **only** when its value is a physical length the user thinks of in
mm/in: distances, sizes, radii, offsets, spacings, margins, dash lengths, stroke
positions — anything measured in px on the canvas.

Examples that **should** be tagged: `spacing`, `amplitude`, `lineSpacing`,
`margin`, `d`/`R`/`r` (radii/offsets), `innerRadius`/`outerRadius`,
`minDashLen`/`maxDashLen`, sizes/extents in px.

## When to leave it untagged (unitless)

Do **not** tag dimensionless quantities:

- counts: `cols`, `waveCount`, `dashCount`, `particleCount`, `lineCount`,
  `sampleCount`, `cellCount`, `revolutions`, `spiralTurns`
- angles in degrees: `angle`, `rotation`, `startAngle`, `arcMinAngle`
- structural/selector: `symmetry`, `shape`, `drawMode`, `preset`
- frequencies / noise: `noiseScale`, `frequency`, `harmonicK`
- multipliers / growth / shaping: `sizeGrowth`, `scaleFactor`, `patternScale`,
  `spiralGrowth`, `scaleNonLinearity`, `curlStrength`
- probabilities / ratios / jitter fractions: `dashSparsity`, `angleJitter`
  (0–1), `overlapPriority`

When unsure: if the value is a number of pixels-on-canvas, tag it; otherwise
leave it untagged.

## Constraints AI patterns must respect

1. **Never read the active unit in generation.** Generators receive px and only
   px. Adding the tag must not change any generated/exported coordinate.
2. **The tag is additive.** It does not alter `min`/`max`/`step` or the pattern's
   `DEFAULT_PARAMS` entry (which is also px).
3. **Stroke widths / sub-px params:** prefer leaving `strokeWeight` untagged.
   Its px range (~0.3–4) converts to awkward fractional mm; until a dedicated
   small-length display exists, tagging it hurts more than it helps. (Deferred.)
4. **Composite controls are deferred.** `plot2d` / `pad2d` defs (e.g.
   `RADII_PLOT_PARAM`, `OFFSET_PAD_PARAM`) render through their own components,
   not the shared `Slider`, so the `unit` tag is **not yet honoured** for them.
   Do not rely on it there; those remain raw px for now.

## Mechanism (where this lives)

- Tag is read in `src/components/ui/ParamControl.jsx` (default → `Slider`).
- Active unit flows: `Studio` → `<Inspector unit>` → `buildLayerParamsValue({ unit })`
  → `useLayerParams()` context → `ParamControl`.
- Conversion uses `pxToUnit` / `unitToPx` from `src/lib/units.js`.
- The legacy `LayerCard` editor does **not** pass `unit`, so it keeps showing raw
  px (acceptable; legacy is being decommissioned in #16).

## Batches

Full coverage is an ongoing drip (one batch of patterns per issue, the C5 task);
tagging every pattern is **not** required in a single issue.

- **Tagged (this batch):** `spirograph.d`, `wave.amplitude`, `wave.lineSpacing`.
- **Deferred (future batches):** all other length params across the remaining
  patterns (e.g. `grid.spacing`/`grid.margin`, `feather` R/r/d, dash-length
  params in `flowhatch`/`grainfield`/`turing`/`duality`, `radialetch` radii,
  etc.), all `strokeWeight` params (see constraint 3), and all composite
  `plot2d`/`pad2d` length params (see constraint 4).
