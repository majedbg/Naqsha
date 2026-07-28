# Adversarial review: PRD #143 — Naqsha motif host expansion

## 1. Verdict

This PRD is **not safe to hand to autonomous agents as written**. The host-size idea is viable, and the existing capture/export seams support much of the proposed work, but the PRD currently promises behavior the engine cannot deliver and omits integration surfaces an agent will not discover from the five proposed modules. Before ticketing, it must: correct the scope from seven hosts to eight; define containment under positional jitter and the below-floor override case; decide what zoned modes do on cell-only hosts; include the per-glyph overlay and Chladni warp-capture seams; specify open/closed capture semantics; define an actual role-repair lifecycle; and give Girih a path/ID contract. Without those changes, independent implementations can pass the proposed unit tests while shipping blank modes, missing override controls, off-curve Chladni motifs, and incorrect Route scope.

## 2. Blocking findings

### B1 — The PRD says seven new hosts but specifies eight

**Classification:** blocking specification defect.

**What the PRD says:** “Seven patterns become motif hosts,” then names Girih, Module Grid, Truchet, Circle Packing, Radial Etch, Hilbert, Lissajous, and Chladni.

**What the code says:** these are eight distinct registry IDs/classes: `radialetch`, `modulegrid`, `girih`, and `circlepacking` are separate static entries (`src/lib/patterns/index.js:50-58`), while Truchet, Hilbert, Lissajous, and Chladni each self-register under another distinct ID (`src/lib/patterns/extras/Truchet.js:207`, `src/lib/patterns/extras/Hilbert.js:142`, `src/lib/patterns/extras/Lissajous.js:124`, `src/lib/patterns/extras/Chladni.js:330`).

**Concrete failure:** a ticket generator using the stated count can silently omit a host, write seven acceptance fixtures for eight implementations, or treat two independent patterns as one slice. The PRD repeats the wrong count in the problem, solution, implementation, and scope prose, so this is not an isolated typo an autonomous agent can safely ignore.

**Smallest correct fix:** change the scope and all counts to eight, then enumerate the eight registry IDs once in a normative acceptance table.

### B2 — A `hostRadius` radius clamp does not keep a position-jittered Glyph inside its host

**Classification:** wrong-behavior defect.

**What the PRD says:** a Glyph on a small circle stays inside it, while the existing jitter controls retain their meaning.

**What the code says:** lateral and along jitter move the placement center before sizing (`src/lib/motif/placementEngine.js:375-388`). The proportional branch then clamps only the Glyph radius (`src/lib/motif/placementEngine.js:419-425`). It has no container center and no term for the distance by which the Glyph center moved away from the anchor.

**Concrete failure:** for a circle of radius `h`, the proposed `radius <= margin * h` is safe only while the placement remains at the circle center. A lateral/along displacement `d` requires `radius + d <= h`; otherwise the Glyph crosses the circle even though the new clamp passed. The same problem applies to Module Grid and Truchet cells. The proposed tests mention scale jitter but not lateral/along jitter, so an implementation can satisfy the test plan and violate stories 1, 6, 7, and 10 in normal use.

**Smallest correct fix:** state a containment rule. Either clamp to `margin * max(0, hostRadius - hypot(lateralDisp, alongDisp))`, suppress positional jitter for container anchors, or explicitly weaken “stays inside” and test the chosen behavior.

### B3 — “Per-glyph override wins over host sizing” is false when the host clamp falls below the placement floor

**Classification:** wrong-behavior defect.

**What the PRD says:** per-glyph scale applies after packing and can deliberately break a Glyph out of its host.

**What the code says:** proportional placement rejects an anchor immediately when the computed radius is below `sizing.min` (`src/lib/motif/placementEngine.js:422-427`). Per-glyph scale is applied only to the already accepted `placements` array after the loop (`src/lib/motif/placementEngine.js:452-461`), where it multiplies the accepted radius and scale (`src/lib/motif/overrides.js:276-284`).

**Concrete failure:** if `margin * hostRadius < min`, there is no placement for the override to enlarge. A force-show record can restore selection, but it still cannot survive this placement rejection. The proposed “override composes” test can miss this by choosing a host large enough to pass the floor.

**Smallest correct fix:** define the exceptional case and test it. Either an explicit scale override bypasses the `min` rejection/creates a placement using a well-defined pre-override footprint, or the PRD must say overrides win only after an anchor has passed placement acceptance.

### B4 — The existing zoned Vine mode silently rests every Cell anchor

**Classification:** wrong-behavior defect and missing product decision.

**What the PRD says:** Circle Packing and Module Grid emit Cells only; all new hosts work with the full Chain and Zones continue unchanged.

**What the code says:** the Zone partitioner explicitly excludes `cell` anchors from both Apex and Stem (`src/lib/motif/zones.js:64-78`). The zoned Sequencer turns every anchor not assigned to a configured Zone into a Rest (`src/lib/motif/sequencer.js:240-268`). The Vine starter mode is always offered, routes semantic hosts to Crossing/Edge/Tip, and contains only Apex and Stem Zones (`src/lib/motif/starterChips.js:111-160`). The Inspector builds all starter modes for every host without filtering (`src/components/shell/Inspector.jsx:902-924`).

**Concrete failure:** selecting Vine on Circle Packing or Module Grid produces zero Glyphs. On a Truchet motif routed to Cells it does the same. `rolesForHost` does not solve this: even if its Route is repaired to Cells, the zoned Sequencer still rests them all. This directly contradicts the “every offered choice produces something” rationale.

**Smallest correct fix:** make a product decision before implementation. Either hide/disable Vine and any zoned mode on cell-only routes, add a maker-facing Cell Zone, or define a cell fallback to a flat deal. Update starter-mode generation, mode matching, Route repair, and tests together.

### B5 — Three of the four stash hosts will have no per-glyph override UI

**Classification:** omitted integration seam causing wrong/incomplete behavior.

**What the PRD says:** per-glyph overrides work on all new hosts, and the deep-module list implies no downstream consumer changes.

**What the code says:** `AnchorGhostOverlay` is the canvas UI that exposes individual anchors and writes per-glyph settings. For semantic hosts it forwards instance-stashed geometry only for Voronoi (`src/components/canvas/AnchorGhostOverlay.jsx:193-205`); every other semantic host calls `getSemanticAnchors` with only params and `hostSeed` (`src/components/canvas/AnchorGhostOverlay.jsx:206-212`). Edge hosts have a separate `hostPaths` branch (`src/components/canvas/AnchorGhostOverlay.jsx:213-230`).

**Concrete failure:** Circle Packing, Girih, Module Grid, and Truchet can render from prepass geometry after the proposed router changes, but the overlay cannot reconstruct their stash-backed anchors. The user sees Glyphs but no editable dots/popover, so story 53 and the paste/reset workflow fail. Tests aimed only at extractors and `MotifPattern` will not catch it.

**Smallest correct fix:** add a generic semantic geometry-in resolver shared by `resolveMotifHostParams` and `AnchorGhostOverlay`, or explicitly thread each new stash shape from `patternInstances[host.id].motifHostGeometry` into `getSemanticAnchors`. Add overlay tests for at least one cell host and Girih, including a hidden host.

### B6 — Chladni is not a registry-only edge host

**Classification:** wrong architecture claim.

**What the PRD says:** Chladni needs a registry addition plus a default capture regression.

**What the code says:** Chladni applies runtime warp modulation directly to its final contour vertices (`src/lib/patterns/extras/Chladni.js:177-197`). The capture prepass injects resolved warp modulation only for the hard-coded set `grid`, `flowfield`, and `topographic` (`src/lib/useCanvas.js:35-49`, `src/lib/useCanvas.js:291-295`). The main paint pass resolves modulation for every target (`src/lib/useCanvas.js:441-465`).

**Concrete failure:** after adding Chladni only to `EDGE_MOTIF_HOSTS`, a warped Chladni paints warped contours but the probe captures unwarped contours. Glyphs float off the visible nodal lines. The default-params regression proposed by the PRD has no modulation and will pass.

**Smallest correct fix:** include `chladni` in the warp-capture contract (preferably replace the private set with a pattern capability), and add a warped capture-vs-paint regression rather than only a default capture smoke test.

### B7 — Chladni has supported blank configurations the PRD and test plan deny

**Classification:** wrong-behavior defect.

**What the PRD says:** the four edge hosts are always usable registry additions; the capture tests exercise only default params.

**What the code says:** the Chladni field is the difference between mode pairs (`src/lib/patterns/extras/Chladni.js:72-84`). When `m === n`, that field is identically zero, every marching-square cell is code 0, and no segments are emitted (`src/lib/patterns/extras/Chladni.js:113-126`). The UI itself documents this: “Equal m and n give a blank plate” (`src/lib/patterns/extras/Chladni.js:316-318`). The same applies at `blend === 1` when `m2 === n2`.

**Concrete failure:** Chladni remains selectable as a host and Route offers Edges, but capture is empty and every choice produces nothing—the exact failure `rolesForHost` is meant to eliminate.

**Smallest correct fix:** make Chladni host availability params-aware for both pure and blended blank cases, or accept the blank state explicitly and remove the universal “every option produces something” claim. Add boundary-param tests, not just defaults.

### B8 — Route open/closed scope will lie for Lissajous loops and Chladni closed contours

**Classification:** wrong-behavior defect.

**What the PRD says:** path-scope options reflect whether these hosts draw closed or open paths.

**What the code says:** capture marks a path closed only when `endShape` receives a non-null first argument (`src/lib/motif/capturePolylines.js:153-159`). Lissajous calls `endShape()` with no `CLOSE`, including the documented `damping === 0` closed figure (`src/lib/patterns/extras/Lissajous.js:8-13`, `src/lib/patterns/extras/Lissajous.js:66-81`). Chladni’s stitcher recognizes a loop when it returns to the starting key (`src/lib/patterns/extras/Chladni.js:262-276`), but drawing still calls `endShape()` without `CLOSE` for every polyline (`src/lib/patterns/extras/Chladni.js:209-223`).

**Concrete failure:** Route “Closed loops” filters out mathematically closed Lissajous figures and closed Chladni contours, while “Open strands” includes them. Apex derivation also treats them as open and flowers an artificial seam.

**Smallest correct fix:** preserve closure in the pattern-side polyline data and record it (`endShape(ctx.CLOSE)` where paint/export semantics agree), or teach capture to infer exact endpoint closure under a specified tolerance. Test both Route scope and Apex/Stem membership.

### B9 — The proposed “load-time role repair” has no defined lifecycle and contradicts byte-identical loading

**Classification:** implementation-stalling gap plus contradictory acceptance criteria.

**What the PRD says:** invalid roles are repaired on load, the existing coercion is generalized, no migration is required, and every existing document renders byte-identically.

**What the code says:** the existing edge-role coercion is a pure runtime clone; it rewrites every Route block only for edge rendering and does not persist anything (`src/lib/motif/edgeRoles.js:27-44`). Local loading migrates only layer metadata through `migrateLayer` (`src/lib/useLayers.js:175-197`), and the common layer-set load funnel does the same (`src/lib/useLayers.js:1084-1096`). A Route role filter genuinely removes all anchors of unsupported roles (`src/lib/motif/chain.js:90-110`).

**Concrete failure:** an agent has no authoritative place to implement “on load,” no instruction for local/cloud/share/example paths, and no rule for whether repair is persisted or undoable. More fundamentally, changing a stale `roles:['cell']` Spiral from blank to Edges makes the document render differently, so “repair to render” and “every existing document renders byte-identically” cannot both pass.

**Smallest correct fix:** choose one contract. Recommended: derive a runtime effective role set for render and UI, preserve stored data, and surface a repair action; alternatively define a real migration at every load funnel, state that output changes for previously blank documents, clear/import history deliberately, and test multiple Route blocks (including mixed valid/invalid role arrays).

### B10 — Girih has no specified path model, so Chain restart and Apex selection are underdetermined

**Classification:** implementation-stalling geometry gap.

**What the PRD says:** module C converts a vertex/edge graph to Crossing, Edge, and Tip anchors; Zones treat Girih tips as Apex; edge runs sample straps.

**What the code says:** cycling Blocks and Slots restart by `meta.pathIndex`, defaulting every anchor without one to path 0 (`src/lib/motif/chain.js:70-87`, `src/lib/motif/sequencer.js:174-187`). Apex end selection also chooses one upper/lower member per `pathIndex` (`src/lib/motif/zones.js:98-118`). The current Girih class produces a graph—canonical vertices and undirected edges—not ordered paths (`src/lib/patterns/IslamicStar.js:92-116`).

**Concrete failure:** module C can legally emit one path per graph edge, one path for the whole graph, or attempt strand traversal. Those choices produce different Every-Nth rhythms, Slot restarts, picked-path behavior, and upper/lower Apex counts. If tips lack `pathIndex`, “upper” selects one tip for the entire Girih field. If each edge is a path, every edge run restarts and crossings have ambiguous membership. The PRD’s tests cover role classification but none of these Chain contracts.

**Smallest correct fix:** specify Girih’s path decomposition and metadata before ticketing. If strand traversal is out of scope, say so and define deterministic `pathIndex`, `s`, `closed`, and tip membership for the simpler edge-list behavior; then constrain the Zone stories accordingly.

## 3. Non-blocking findings

### N1 — The stash-host symmetry count is misstated

**What the PRD says:** two of the four stash hosts hardcode symmetry to one (Girih and Module Grid).

**What the code says:** Circle Packing also hardcodes symmetry to one (`src/lib/patterns/CirclePacking.js:214-215`), as do Girih (`src/lib/patterns/IslamicStar.js:139-140`) and Module Grid (`src/lib/patterns/ModuleGrid.js:158-159`). Only Truchet has a real symmetry parameter among those four (`src/lib/patterns/extras/Truchet.js:99-107`, `src/lib/patterns/extras/Truchet.js:183`).

**Concrete failure:** mostly planning confusion: an agent may look for a nonexistent Circle Packing symmetry copy path.

**Smallest correct fix:** say “three hardcode symmetry to one; Truchet replicates.”

### N2 — Voronoi is not a working symmetry-frame precedent

**What the PRD says:** stash geometry should follow existing structural-extractor precedent.

**What the code says:** Voronoi explicitly stashes only base, pre-start-angle geometry and documents that nonzero start angle matches no visible copy (`src/lib/patterns/VoronoiCells.js:106-116`). By contrast, `applySymmetryDraw` translates then rotates each copy (`src/lib/patterns/symmetryUtils.js:10-28`).

**Concrete failure:** an agent copying Voronoi’s stash transform will reproduce a known bug on Truchet.

**Smallest correct fix:** name Grid/Recursive symmetry expansion as the precedent and explicitly state that Voronoi is counterexample/technical debt.

### N3 — Host pattern controls are covered; interactive layer transforms are not

**What the PRD says:** stashed geometry lands in the painted frame, described as start angle, offsets, and symmetry.

**What the code says:** the host probe calls `generateWithContext` without the layer’s node transform (`src/lib/useCanvas.js:296-305`), while the actual paint is wrapped in `applyNodeTransform` (`src/lib/useCanvas.js:554-577`). That transform can move, rotate, and scale about the canvas center (`src/lib/useCanvas.js:51-68`).

**Concrete failure:** moving/rotating/scaling the host layer independently leaves its motif anchors behind unless the motif layer happens to receive the same transform. This is an existing cross-host limitation, not introduced solely by PRD #143, but “painted frame” is too broad as written.

**Smallest correct fix:** explicitly exclude node transforms and file follow-up work, or thread the host transform into geometry resolution and override coordinates.

### N4 — Girih “canvas-edge tips” are actually crop-margin graph tips

**What the PRD says:** tips occur where the skeleton is cut by the canvas edge.

**What the code says:** Girih does not clip edges at the canvas. It keeps an edge if either endpoint lies inside a generous ±55% width/height margin (`src/lib/patterns/IslamicStar.js:127-131`), while the canvas itself ends at ±50%.

**Concrete failure:** degree-one nodes can sit outside the visible canvas and then be rejected by the motif boundary; the surviving tip ring is not literally a canvas-edge termination.

**Smallest correct fix:** describe them as crop-margin graph tips and test how many are in bounds, or implement real segment clipping if canvas-edge tips are required.

### N5 — New anchor identity and metadata are underspecified

**What the PRD says:** modules B–D return the existing anchor shape and add host radius “to metadata,” while earlier prose describes an optional `hostRadius` on the anchor.

**What the code says:** exact ID match wins before spatial rebind (`src/lib/motif/overrides.js:73-100`), and randomized Slots hash `anchor.id` (`src/lib/motif/sequencer.js:117-136`). Existing symmetry-aware cores deliberately preserve/suffix IDs to protect overrides (`src/lib/patterns/gridAnchors.js:124-169`).

**Concrete failure:** two reasonable agents can choose `anchor.hostRadius` vs `anchor.meta.hostRadius` and incompatible ID schemes. Both extractor tests could pass while seed changes, symmetry changes, override reset, and hashed Slot assignment behave differently.

**Smallest correct fix:** make field location and ID/metadata formats normative per host; add stability tests across rerender, symmetry, and non-topological param edits.

### N6 — The proposed placement statistics wording can hide acceptance loss

**What the PRD says:** host sizing changes size, with testing focused on returned placements.

**What the code says:** `placementStats.placed` is initialized to the post-cap candidate count, not the number accepted after no-fit/below-floor/rest rejections (`src/lib/motif/placementEngine.js:286-295`).

**Concrete failure:** an integration test or UI warning using `placementStats.placed` cannot prove every circle/cell got a Glyph; it can report “placed” candidates later rejected.

**Smallest correct fix:** tests must assert `placements.length` and rejection reasons, not `placementStats.placed`; renaming the stat is separate cleanup.

## 4. Unverified claims

### U1 — “Host switching preserves common roles”

I found the stored `hostLayerId` read (`src/lib/motif/motifLayer.js:85-90`) and the add path that writes it (`src/lib/useLayers.js:550-595`), but no user-facing or helper path that reassigns an existing motif to another host. I therefore could not verify story 51 or identify where role preservation is meant to run.

**What would settle it:** identify the host-switch UI/callback and its single document write, or mark story 51 out of scope and remove “host-switch path” from module E.

### U2 — Undo/redo remains one entry for all new-host actions

The geometry and registry work itself is runtime-only, but the PRD does not identify the writes for load repair, host switching, or any unavailable-role correction. Existing Chain edits intentionally migrate and write in one update (`src/lib/motif/motifLayer.js:115-152`), but that does not prove the proposed new lifecycles.

**What would settle it:** integration tests at each actual write seam asserting one history entry, plus an explicit decision for load-time repair (normally no undo history survives a document load).

### U3 — Every new stash is exact under every modulation channel

The four stash patterns currently reseed correctly, and adding assignments alone need not consume RNG. However, only Chladni currently contains an explicit runtime warp branch among the eight proposed hosts. I did not find a normative capability table saying which future modulation channels each stash extractor must mirror.

**What would settle it:** a per-host table of supported runtime modulation channels and capture/stash behavior, with capture-vs-paint geometry tests for every geometry-changing channel.

## 5. Judgment calls I would make differently

These are opinions, not defects.

### J1 — Keep `hostRadius` in proportional mode, but name it as a container constraint

I agree with avoiding a third sizing mode. The current proportional branch already composes layer size, jitter scale, Slot scale, empty-space cap, and margin (`src/lib/motif/placementEngine.js:381-423`), so an optional container constraint is the smaller conceptual change. I would expose it as a typed `containerRadius`/`hostRadius` field at the anchor top level, not bury a placement-critical engine input in open-ended metadata.

### J2 — Stashing Module Grid and Truchet is the right tradeoff

Both patterns build resolved per-cell data after seeded rotation/jitter/orientation decisions (`src/lib/patterns/ModuleGrid.js:80-125`, `src/lib/patterns/extras/Truchet.js:123-140`). Reusing that resolved data is safer than a second params replay. The PRD should still require that adding the stash performs no extra RNG draws.

### J3 — Girih without Cells is a good first boundary

The class exposes a graph, not planar faces (`src/lib/patterns/IslamicStar.js:92-116`). Face traversal is materially different work from graph degree and edge sampling. I would ship Girih’s graph roles separately after fixing the path contract in B10.

### J4 — Role repair should be derived, not a silent load mutation

Because Chain order is document state and old documents are meant to remain byte-stable, I would compute effective available roles at render/UI time, preserve the stored Route, and show a clear “unavailable on this host” repair affordance. Silent load mutation creates an output change that cannot be honestly called byte-identical and is awkward around history.

### J5 — The dash-host exclusion needs a measurable rule

Phyllotaxis Dash is explicitly accepted as an edge host (`src/lib/motif/hostKinds.js:39-48`), while the generic sampler already enforces a 4 px spacing floor (`src/lib/motif/anchors.js:255-267`) and placement has a hard 2,000-candidate cap (`src/lib/motif/placementEngine.js:220-221`, `src/lib/motif/placementEngine.js:286-294`). I would decide dash hosts using measured path/anchor counts and visual fixtures, not the categorical “dash-based is noisy” rationale.

### J6 — Split this into four deliverables, not one sixty-story PRD

The safest slices are:

1. Radial Etch/Hilbert/Lissajous edge capture, plus closure semantics.
2. Chladni separately, because it adds params availability and warp capture.
3. Host-size/container semantics plus Circle Packing, Module Grid, and Truchet cells.
4. Girih graph/path semantics plus role-availability UX and document compatibility.

That split follows the real coupling found in code; it also prevents a registry-only slice from being blocked by migration policy and graph traversal decisions.

## 6. What the PRD gets right

- **Existing anchors can remain inert when no host size is present.** The proportional radius is currently a local `Math.min` result (`src/lib/motif/placementEngine.js:419-425`); a conditional third term or `Infinity` fallback can preserve all anchors that omit the field byte-for-byte. The test must assert exact output shape, not merely approximate radii.
- **Accepted placements can deliberately break their host through a post-placement override.** Once an anchor passes acceptance, scale overrides multiply its finished radius and do not repack neighbors (`src/lib/motif/overrides.js:236-260`, `src/lib/motif/overrides.js:276-284`). B3 is the rejected-anchor exception, not a rejection of this ordering.
- **Record-mode capture already folds pattern transforms and symmetry copies.** `capturePolylines` applies the recorded transform stack (`src/lib/motif/capturePolylines.js:81-112`), and `applySymmetryDraw` records one translated/rotated replay per copy (`src/lib/patterns/symmetryUtils.js:10-28`). Radial Etch, Hilbert, and Lissajous all draw through supported line/vertex operations (`src/lib/patterns/RadialEtch.js:62-74`, `src/lib/patterns/extras/Hilbert.js:94-109`, `src/lib/patterns/extras/Lissajous.js:66-81`).
- **The proposed hosts obey the reseed-at-generate boundary.** Circle Packing, Girih, Module Grid, and Radial Etch reseed before geometry (`src/lib/patterns/CirclePacking.js:37-39`, `src/lib/patterns/IslamicStar.js:53-56`, `src/lib/patterns/ModuleGrid.js:21-24`, `src/lib/patterns/RadialEtch.js:4-8`); all four extras do likewise (`src/lib/patterns/extras/Truchet.js:93-98`, `src/lib/patterns/extras/Hilbert.js:24-29`, `src/lib/patterns/extras/Lissajous.js:18-23`, `src/lib/patterns/extras/Chladni.js:34-39`). A no-extra-draw stash preserves their RNG contracts.
- **SVG export is generically downstream of resolved motif geometry.** `MotifPattern` stores fully resolved SVG instances during generation and does not rerun placement on export (`src/lib/motif/MotifPattern.js:27-30`, `src/lib/motif/MotifPattern.js:213-232`). `buildAllLayersSVG` consumes each layer’s cached instance generically (`src/lib/svgExport.js:203-246`), so new host kinds need no host-specific SVG branch.
- **The 3D material preview uses that same SVG path.** Per-panel mark construction calls `buildAllLayersSVG` over the cached pattern instances (`src/lib/three3d/markTexture.js:344-387`). Motif creation also inherits the host’s panel, avoiding the prior `panelId:null` loss class (`src/lib/useLayers.js:586-592`). Subject to B5/B6 actually producing correct motif geometry, no new 3D host branch is required.

## Review verification

The existing targeted suite passed unchanged: 16 test files / 236 tests covering placement, overrides, Zones, host classification/capture, geometry collection/routing, motif SVG export, and all eight touched pattern classes. That result is useful as a regression baseline, but none of the blocking cases above is exercised by the PRD’s proposed default-only tests.
