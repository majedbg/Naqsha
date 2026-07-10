# Motifs / Adorn — Design Research Compendium

*Compiled 2026-07-04 from five parallel research passes (along-path brush UIs, procedural scatter systems, ornament art history, computational-ornament academia, textile/carpet/embroidery CAD). Companion to the grilling session that locked the feature design; feeds the PRD.*

## 0. Locked design (from the grilling session)

- **Mental model**: racked UX (host Inspector "Motif" device beside the Modulator) over a distinct referencing **motif layer** (own operation/color/visibility).
- **Motif anatomy**: static glyphs now; contract is `(anchor context, params) → geometry` from day one.
- **Anchors**: semantic `anchorPoints()` contract with four roles — **Crossings, Edges, Tips, Cells** — on flagship hosts (Voronoi, Recursive, Grid, Spiral); generic path-sampling fallback gives every layer type Edge anchors.
- **Selection**: rules (every-Nth, skip-pattern, seeded density, role filter, field mask) + manual include/exclude overrides with **spatial re-binding** (position+role, tolerance, orphaning).
- **Placement**: per-role orientation, per-anchor seeded jitter, A-B sequences, local-fit sizing, overlap handling.
- **UI**: shared device editor reachable from host or motif layer; anchor ghosts on canvas; "adorns" edges on the relationship rail; canvas drag-attach in v1.
- **Extraction**: fork in the stepper after vectorization (component picker; low-lattice-confidence nudge); `kind:'motif'` in `user_patterns`. Sequenced after S12.
- **Sources**: motif assets + imported SVGs + **live layer-as-source** (any layer instanced by transform).
- **Fabrication**: warn-only straddle-check (badge + highlight + export summary line).
- **Naming**: Motif / "adorns" / Crossings-Edges-Tips-Cells. ~10-motif starter set from public-domain plates. Free at launch. Out of v1: motifs-on-motifs recursion, auto-cull, clip-to-compartment.

## 1. Research-driven spec amendments — ADOPTED 2026-07-04

All 16 amendments below are **adopted into the locked spec** and supersede the corresponding §0 items where they conflict (notably: empty-circle test-before-place sizing replaces §0's greedy place-then-cull; stable anchor IDs become the primary override key with spatial re-binding as fallback). The PRD must reflect §0 as amended by §1.

1. **Local-fit + overlap: switch to test-before-place empty-circle sizing** (Wong/Zongker/Salesin 1998, 88/100; corroborated by Hausner 2001). At each anchor, compute the radius of the largest empty circle (distance field / medial-axis approximation) not intersecting already-placed geometry or the boundary; cap motif scale to it and reject placement outright when below a floor. Replaces the greedy place-then-cull bounding-circle plan — cheaper, no pop-in, and "local-fit sizing" becomes a formula rather than a heuristic. Keep Wilcom's **Proportional vs Fixed** toggle (85/100) as the user-facing mode switch (scale-to-context vs. lock absolute size).
2. **Override identity: stamp stable anchor IDs at generation time** (Blender `Distribute Points on Faces` stable-`id` precedent), with spatial re-binding as the fallback when IDs don't survive a structural change. Grasshopper's index-rot failure mode (Heumann thread; Path Mapper fragility) is the citable justification for never using list indices.
3. **Orientation control: "Relative to: Path / Page" toggle + rotation-offset slider** (Illustrator Scatter Brush, 87/100); consider Procreate's signed −100/0/+100 slider as a v2 refinement. Art-historical mandate: Jones Propositions 11–12 (94/100 — highest-scored item in the whole research) make tangent orientation load-bearing, not cosmetic.
4. **Jitter parameterization: one integer seed + a 0–1 "amount" slider per property** (Substance/Houdini convention), with Procreate's split of **lateral** (perpendicular) vs **linear** (along-path) jitter and **count jitter** where roles make it meaningful. Kaplan's own θ (contact angle) and δ (contact-point split) are the in-family template — his parquet deformations (θ varying smoothly across the field) are the published v2 path to context-driven morphology.
5. **Alternation: identity (A/B) and orientation-flip (in/out, mirror) as two independent controls**, per Persian/Turkish palmette-border practice ("faces alternately inward and outward") and Wilcom's forward/backward motif rows. Do not bundle into one "alternate" toggle.
6. **Field mask UI: source-layer picker + threshold slider + invert toggle** (Substance Tile Sampler blueprint, 86/100). No graph exposure needed; ~one-sprint scope.
7. **Rule presets named with textile repeat vocabulary** (89/100): Straight, Half-drop, Brick, Mirror, Tossed as preset labels over the rate/skip/jitter machinery. Borrow the words, not the rectangular-tile assumption.
8. **Junctions/corners are a real v1 question for Edge sequences.** Illustrator Pattern Brush's tiered corner system (four auto strategies + optional hand-authored corner tile, 86/100) is the deepest precedent; carpet history's resolved-vs-unresolved corner problem (73/100) is the craft framing. V1: ship one auto strategy (Auto-Centered equivalent: center an instance on the junction) plus "skip at junctions"; grow the strategy menu + auto corner-resolution in v2. Architect anchors so corner/boundary anchors are detectable (don't foreclose v2).
9. **Engineering guardrails** (from Illustrator's two never-fixed bugs + Blender's realize-instances lesson):
   - Tangent sampling must be **arc-length parameterized, winding-direction-robust, and independent of host vertex density** from day one.
   - The local-fit footprint must be a **visible, manipulable affordance** (fit-box/handle), never an implicit convention (Illustrator's invisible bounding-rect is its #1 pattern-brush support complaint).
   - **Never bake early**: anchor→motif bindings stay live attribute data until export; realized instances lose per-instance addressability.
10. **Data model: allow ordered rule/binding stacking on one host** (guard-border/main-border hierarchy, 72/100). Multiple bindings per host are already in the design; ensure deterministic ordering and think "primary + accent trim."
11. **Starter-set tracing brief** (Jones Props 8 & 13, 86/100): conventionalized, flat, closed-silhouette forms — reduce, don't render. Tag each motif with **lineage/tradition** (Riegl's lotus→palmette→arabesque migration, 76/100) rather than a single fixed category; surface it in the provenance panel.
12. **Density defaults from Gombrich** (83/100): border/edge anchors default denser and more elaborate than field/cell anchors (graded complication); default rules skip some eligible anchors (the "etc. principle" — 100% saturation reads as mechanical horror-vacui); small jitter exploits the same perceptual completion.
13. **Anchor taxonomy has citable ancestry**: Edges ≈ Kaplan's contact points; Tips ≈ Wong's "signal geometric points"; Crossings ≈ Kaplan's derived star-vertices; Cells ≈ the filled tile/region in both. Quotable in docs: the taxonomy names structures independently identified across three decades of ornament-generation research.
14. **Wong's three-layer architecture** — element / growth-rule / rendering kept separate (84/100) — maps 1:1 onto motif asset / placement rule / render style. Adopt as the internal module split.
15. **v2 growth engine shape**: Wong's explicit rejection of parallel L-systems (rules as *serial, context-querying procedures*, room for a planner) is the blueprint for parametric motifs. "Organized Order in Ornamentation" (Gieseke et al. 2017: guide-stroke vector fields, obstacle routing) is the closest whole-feature prior art and the v2+ field-driven roadmap.
16. **Cultural-sensitivity checklist item**: heritage-aware use of Islamic motifs (MDPI 2024/25) — distinguish integrated vs tokenistic use once users drop motifs onto Islamic star patterns; pairs with the existing tradition/provenance metadata.

## 2. Cross-domain leaderboard (top 12 of 30)

| # | Recommendation | Domain | Score |
|---|---|---|---|
| 1 | Tangent orientation as load-bearing rule (Jones Props 11–12) | Art history | 94 |
| 2 | Textile repeat vocabulary as rule-preset names | Textile CAD | 89 |
| 3 | Empty-circle/MAT test-before-place sizing | Academic | 88 |
| 4 | Kaplan θ/δ as orientation+jitter template; parquet deformation for v2 | Academic | 88 |
| 5 | "Rotation Relative To: Path/Page" toggle | Brush UX | 87 |
| 6 | A/B alternation + orientation-flip as independent params | Art history | 86 |
| 7 | Jones Props 8+13 as starter-set tracing brief | Art history | 86 |
| 8 | Field mask = picker + threshold + invert (Tile Sampler) | Scatter | 86 |
| 9 | Tiered corner/junction solver (auto strategies + override) | Brush UX | 86 |
| 10 | Proportional vs Fixed sizing modes (Wilcom) | Textile CAD | 85 |
| 11 | Base+variance jitter, lateral/linear split (Illustrator+Procreate) | Brush UX | 85 |
| 12 | Wong element/rule/render three-layer architecture | Academic | 84 |

Convergences (independent domains agreeing): tangent orientation (#1, #5, Wilcom motif-run); seed+amount jitter (#4, #11, Substance/Houdini); A/B + flip independence (#6, Wilcom A/B rows); corners as first-class problem (#9, carpet corner history, embroidery border patent US10082776); index-rot avoidance (Grasshopper failure mode ↔ Blender stable IDs ↔ our spatial re-binding).

## 3. In-app linkable resources (shortlist)

**Provenance panel (CC0 scan sources — also the tracing sources for the starter set):**
- Smithsonian Libraries, *The Grammar of Ornament* (explicit CC0): https://library.si.edu/digital-library/book/grammarornament00jone
- Smithsonian Libraries, *Polychromatic Ornament* (Racinet, CC0): https://library.si.edu/digital-library/book/polychromaticor00raci
- Internet Archive Meyer *Handbook of Ornament*: https://archive.org/details/handbookoforname00meyeuoft
- RawPixel Racinet board (per-plate high-res, CC0): https://www.rawpixel.com/board/91958/lornement-polychrome
- Getty high-res Jones scans: https://archive.org/details/gri_33125008700086

**"Learn more" links:**
- V&A, Owen Jones and the Grammar of Ornament: https://www.vam.ac.uk/articles/owen-jones-and-the-grammar-of-ornament
- Met, Grammar of Ornament essay: https://www.metmuseum.org/perspectives/grammar-of-ornament
- Public Domain Review on Racinet: https://publicdomainreview.org/collection/albert-racinet-s-l-ornement-polychrome-1869-73/
- Full 37 Propositions transcription (verify vs primary scan before quoting): https://johncanningco.com/inspired-by-history-owen-jones-and-the-grammar-of-ornament/
- Art of Islamic Pattern, Intro to Islimi: https://artofislamicpattern.com/resources/introduction-to-islimi/
- Getty, *The Topkapı Scroll* full PDF: https://www.getty.edu/publications/resources/virtuallibrary/9780892363353.pdf
- Nazmiyal rug anatomy (border/guard-border tooltip): https://nazmiyalantiquerugs.com/blog/rug-anatomy-what-are-the-different-parts-of-the-area-rug/
- Met carpet object pages (check per-object rights): 446957, 452187, 452296 at metmuseum.org/art/collection/search/

**Papers (open PDFs, citable in docs/ADRs):**
- Wong, Zongker, Salesin 1998, Computer-Generated Floral Ornament: https://grail.cs.washington.edu/projects/ornament/ornament-lowres.pdf
- Kaplan 2005, Islamic Star Patterns from Polygons in Contact: https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf
- Kaplan PhD thesis: https://cs.uwaterloo.ca/~csk/other/phd/kaplan_diss_full_print.pdf
- Hausner 2001, Simulating Decorative Mosaics: https://www.dgp.toronto.edu/papers/ahausner_SIGGRAPH2001.pdf
- Organized Order in Ornamentation (summary page; full text paywalled): https://research.adobe.com/publication/organized-order-in-ornamentation/
- DecoBrush 2014: https://www.connellybarnes.com/work/publications/2014_decobrush.pdf

**ADR citations (justifying decisions):**
- Grasshopper index-rot (Heumann): https://www.grasshopper3d.com/forum/topics/puzzled-over-list-item-component-with-tree-as-index-input
- Blender stable-id attribute: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/point/distribute_points_on_faces.html
- Never-bake-early: https://shahriyarshahrabi.medium.com/modify-realized-instances-and-mesh-islands-individually-in-blender-geometry-nodes-b8e873e47799
- Substance Tile Sampler: https://experienceleague.adobe.com/en/docs/substance-3d-designer/using/substance-graphs/nodes-reference-for-substance-graphs/node-library/texture-generators/patterns/tile-sampler
- Wilcom motif runs/fills: https://wilcom.com/embroiderystudio/elements/motifs
- Procreate jitter taxonomy: https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
- Illustrator invisible-bounding-box footgun: https://community.adobe.com/questions-652/illustrator-pattern-brush-ends-and-corners-too-big-781087
- Illustrator winding-direction rotation bug: https://illustrator.uservoice.com/forums/601447-illustrator-desktop-bugs/suggestions/32425192-scatter-brush-rotation-orientation-to-line
- Sewguide repeat primer (tooltip candidate): https://sewguide.com/fabric-design-pattern-repeat/
- Embroidery border corner patent US10082776 (v2 prior art): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10082776

## 4. Per-domain top-6 score tables

**Along-path brush UIs**: Path/Page rotation toggle 87 · corner solver 86 · base+variance jitter lateral/linear 85 · visible fit-box (anti-pattern lesson) 78 · relax/nudge post-placement tool 71 · winding/density-robust tangent sampling 73.

**Procedural scatter**: field-mask picker+threshold+invert 86 · seed+amount sliders 83 · distribution as small enum (Random/Poisson-min-spacing) 81 · spatial/ID re-binding over indices 75 · fields-as-rule-chips concept 70 · never bake early 64.

**Ornament art history**: Jones Props 11–12 tangent rule 94 · A/B + flip independent 86 · Props 8+13 tracing brief 86 · Gombrich density/jitter defaults 83 · islimi two-layer principle as conceptual frame 82 · Riegl lineage tags 76.

**Computational ornament**: empty-circle sizing 88 · Kaplan θ/δ + parquet deformation 88 · element/rule/render architecture 84 · Organized Order as v2+ blueprint 74 · skeletal strokes for Edge orientation 72 · Wong L-system critique as v2 growth-engine shape 72.

**Textile/carpet/embroidery CAD**: repeat-vocabulary presets 89 · Proportional/Fixed sizing 85 · A/B + dual-overlay motifs (Wilcom) 84 · motif-run tangent + reverse toggle 80 · auto corner resolution (v2 default) 73 · guard-border rule stacking 72.
