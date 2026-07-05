# Motif/Adorn — Architecture Precedent Brief

*Extracted 2026-07-04 from the live codebase (Naqsha clone). Exact signatures a slice subagent builds against. Paths relative to repo root.*

## 1. Pattern contract + DrawingContext dual-emit
`src/lib/patterns/drawingContext.js`:
- `class Pattern` (`:244`): `constructor()` sets `this.svgElements = []`. Abstract `generate(ctx, seed, params, canvasW, canvasH, color, opacity)` (`:253`) — subclass MUST override; populates `this.svgElements` AND draws via `ctx`. `contentFor(color)→string` (`:263`) default joins svgElements; override if elements are objects. `generateWithContext(...)` (`:270`) stores `_lastParams`, `_lastCx=w/2`, `_lastCy=h/2`, calls generate — **this is the entry point callers use.** `toSVGGroup(layerId,color,opacity)` (`:281`) wraps `contentFor` via `wrapSVGSymmetry`.
- `P5Adapter` (`:75`) production ctx; `RecordingContext` (`:151`) test double — pure JS, records `.calls=[{op,args}]`, RNG via mulberry32, constructed `new RecordingContext({seed})`.
- ctx interface: RNG randomSeed/noiseSeed/random/noise; color color/red/green/blue/map; transform push/pop/translate/rotate/scale; style stroke/noStroke/fill/noFill/strokeWeight/strokeCap/rectMode; draw line/ellipse/rect/triangle/beginShape/vertex/bezierVertex/endShape.
- **Two SVG paths**: patterns push to `this.svgElements` inside generate (NOT captured from ctx). ctx drives canvas; svgElements+toSVGGroup drive export. Emitted in parallel by hand.
- Registry: `src/lib/patterns/index.js` — `PATTERN_CLASSES` map (`:36`), `getPatternClass(id)` (`:62`). Dynamic patterns via `src/lib/patternRegistry.js` `registerPattern`.
- Representative: `src/lib/patterns/Spiral.js` — extends Pattern, pushes `{pathD, strokeWeight}` to svgElements, overrides `contentFor`.

## 2. Modulation precedent (adornGraph template)
- `resolveModulationForTarget(targetLayer, layers)` `src/lib/fields/resolveModulationForTarget.js:22` — pure render-time; scans layers for a guide whose `modulator.maps` has `targetLayerId===target.id`; forbids self; returns `{field, channel, amount, range:{min,max}, offset, shape, steps}`. First match wins.
- `buildModulationGraph(layers)` `src/lib/fields/modulationGraph.js:26` → `{edges:[{guideId,targetId,channel,polaritySign,active}], byGuide:Map, byTarget:Map}`. One edge per modulator.map where guide canProduceField and target resolves; skips self + dangling; first incoming edge per target active. **MIRROR THIS SHAPE for adornGraph.**
- `ScalarField` `src/lib/fields/ScalarField.js:24` — pre-sampled nx×ny Float32 grid over unit domain (u,v)∈[0,1]². `constructor({nx,ny,data,min,max,meta})`; static `fromFunction(fn,{nx=129,ny=129,meta})`; `sample(u,v)` bilinear, `sampleSigned`→[-1,1], `sampleNorm`→[0,1], `sampleGradient(u,v,h)→{dx,dy}`. NO explicit threshold/invert operator — that lives in `modulation.js` transfer chain (applyRange/offset/shapeEase/steps/amount). For field-mask: sample + compare to threshold + optional invert must be implemented in placement engine.
- Binding: guide layer carries `layer.modulator = {offset,shape,steps,range,maps:[{targetLayerId,channel,amount}]}`. No field on target. Dangling targets silently skipped (tolerate-don't-cascade precedent).

## 3. Flat layer model
`src/lib/useLayers.js` — `useState` array, no reducer. Layer shape (`createLayer` `:71`): `{id,name,nameIsCustom,locked,color,opacity,visible,bgColor,bgOpacity,patternType,params:{},seed,randomizeKeys:[],paramsCache:{},role:'cut'|'score'|'engrave',operationId,penSlot,panelId}`. Optional: `type` ('import' `:265`, 'text' `:311`), `transform:{x,y,rotation,scale}`, `moireRole`, `moireGroupId`, `modulator:{...}`, `variableWeight`.
- patternType values: spirograph,flowfield,phyllotaxis,wave,voronoi,recursive,phyllodash,grainfield,flowhatch,feather,turing,duality,radialetch,grid,spiral,modulegrid,topographic,diffgrowth,girih,circlepacking,dendrite + moire + import/text + dynamic extracted.
- Cross-refs ONLY via moireGroupId/moireRole and modulator.maps[].targetLayerId. No targetLayerId field on layer itself.
- Mutators call recordEdit/recordStructural then setLayers: addLayer(:219), addImportedLayer(:246), addTextLayer(:297), duplicateLayer(:332), removeLayer(:396), updateLayer(:419), changeLayerPattern(:452), reorderLayers(:554), loadLayerSet(:702).
- Deletion: removeLayer cascades ONLY Moiré pairs. Does NOT clean modulator.maps → dangling, silently skipped at derivation. **Adorn follows tolerate-dangling precedent.**

## 4. ImportedPath (glyph→Pattern precedent)
`src/lib/patterns/ImportedPath.js` — `class ImportedPath extends Pattern` (`:31`). `pathData` in `layer.params.pathData` (array of `d` strings). `generate` (`:37`) draws each as polyline via parsePathD + ctx.beginShape/vertex/endShape. `toSVGGroup` (`:58`) **overrides base**, emits verbatim `<path d>` per outline so curves survive export. Instantiated directly `new ImportedPath()` in `useCanvas.js:112` from `layer.type==='import'`.

## 5. Tile stamping
`src/lib/extraction/tileComposer.js` — `tilePlacements(lattice, region)→{x,y}[]` (`:39`) pure; lattice `{t1:[x,y],t2:[x,y],cell:{width,height}}`; integer combos i·t1+j·t2 intersecting region; deterministic row-major; cap MAX_TILE_PLACEMENTS=2048. **Transform = pure translation {x,y} today** (no rot/scale yet; growth seam noted).
`src/lib/patterns/ExtractedPatternGenerator.js` — `makeExtractedPatternClass(entity)` (`:118`) closes over tile+lattice. `generate` (`:123`) placements=tilePlacements(...)→stamps tile.fills+tile.strokes at each {x,y}. `toSVGGroup` (`:163`) one `<g transform="translate(x y)">` per placement with verbatim d. `flattenPathD(d, curveSegments=12)` (`:39`).

## 6. SVG export (locked build-time rule)
`src/lib/svgExport.js` — `buildAllLayersSVG(layers, patternInstances, w, h, includeHidden, opts)` (`:152`) calls `instance.toSVGGroup(...)` (`:165`) — reads svgElements/_lastParams/_lastCx/_lastCy, NEVER calls generate. Geometry resolves at BUILD time in `useCanvas.js` render loop: `instance.generateWithContext(...)` for ALL layers incl hidden (via noDrawCtx `:182`) so export works. Export wraps each group via `wrapLayerTransform(content, layer, w, h)` (`:26`) using `transformToSVG` with pivot (canvas center for patterns, bbox center for imports). **Motif layer: generate() must resolve ALL stamped geometry into svgElements, OR override toSVGGroup to emit from stored data + _lastCx/_lastCy. Export never re-runs placement.**

## 7. Rail UI
`src/components/shell/ModulationRail.jsx` — `ModulationRail({layers, selectedLayerId, rowRefs})` (`:45`). 18px absolute left gutter, pointer-events-none. `buildModulationGraph(layers)` (`:46`) → one bezier `<path>` per edge (`:99`). rowRefs: Map<layerId,HTMLElement>; rowCenterY via getBoundingClientRect; useLayoutEffect + ResizeObserver re-measure; jsdom→0 but still renders with data-attrs. `edgeColor(polaritySign)` (`:31`) → ANCHOR_POS/ANCHOR_NEG/NEUTRAL from colormap.js. Edges carry data-guide/target/active/polarity/emphasis. **Adorn rail: swap buildModulationGraph→buildAdornGraph, new edge-color.**

## 8. Test conventions
Vitest, globals:true. Config `vitest.config.js`; env node default, jsdom per-file via `// @vitest-environment jsdom`; setup `src/test/setup.js`; glob `src/**/*.{test,spec}.{js,jsx}`. Pattern tests in `src/lib/patterns/__tests__/`; pure-module tests beside source. Determinism idiom: two instances different adapter seeds, `expect(a.svgElements).toEqual(b.svgElements)` (Duality.test.js:43); golden via `toMatchSnapshot()`. Field/graph tests: inline factory helpers + toEqual/toMatchObject.

## 9. Seeded RNG + geometry utils (REUSE)
- PRNG: `mulberry32(seed)→()=>float[0,1)` `src/lib/patterns/rng.js:18`. Canonical for headless determinism.
- `src/lib/transform/transformOps.js` — transform `{x,y,rotation(deg),scale}`; `applyTransform(point,t)` (`:34`), `applyTransformAbout(point,t,pivot)` (`:46`), `inversePoint` (`:59`), `transformToSVG(t,pivot)` (`:85`, emits translate rotate scale; '' if identity), `transformBBox` (`:117`).
- `src/lib/plotter/pathOps.js` — `parsePathD(d)→{points,closed}` (`:55`), `pathDFromPoints(points,closed)` (`:115`), rdp, simplifyPaths, mmToPx/pxToMm.
- `src/lib/scene/placement.js` — pathsBBox, importLayerBBox, importLayerPivot (`:77`), centerTransform (`:90`), parseForPlacement(svg).
- `src/lib/patterns/symmetryUtils.js` — applySymmetryDraw (`:10`), wrapSVGSymmetry (`:35`).
- No generic vec2 module — inline vector ops; transformOps+pathOps+placement are the primitives.
