# P3 — True Cut-Through Gaps (CSG) — Design Doc

> Status: **design only.** No code, no dependency added (per plan §5 / L8). This is the spec for a later build.
> Companion: `docs/material-3d-appearance-plan.md` (§1.P3, §5). Branch context: `feat/material-3d-appearance`.

## 1. Problem & goal

Today, cut/score marks render as **surface decoration**, never as material removal:

- `Marks.jsx` stroked an SVG into **ribbon geometry** (or a baked texture) and lays it on a plane that sits on the
  slab's surface (z-offset, depth-scored intensity). The slab itself stays a solid `boxGeometry` — a "cut" is a glowing
  groove painted on top, not a hole through the acrylic.
- `Sheets.jsx` renders each sheet as one extruded `boxGeometry args=[w, h, thickness]`; nothing subtracts from it.

P3's goal: where the fabrication operation is a **true through-cut** (the laser removes material), the 3D preview should
show a real **gap** — a hole/window through the slab — and the **cut-wall faces** (the newly exposed interior edges)
should carry the same emissive edge material that makes fluorescent acrylic glow at a cut edge (P2/S5). This is the
visual that sells "this is a laser-cut part," not an engraving.

Non-goal: P3 does **not** change the appearance archetypes (P1) or the rim-glow math (P2). It changes **geometry** —
adding interior wall faces — and routes the existing edge-emissive material onto those new faces.

## 2. Which operations create true gaps vs surface marks

The cut-through path applies to a **subset** of marks. The classifier already exists conceptually in the
operation/material lens; P3 needs a clean "is this a through-cut?" predicate per path.

| Operation | Geometry effect | P3 treatment |
|-----------|-----------------|--------------|
| **Through-cut** (laser fully severs the sheet — interior cutouts, windows, the outer perimeter) | Removes material → true gap with interior walls | **CSG subtract** a prism through the full thickness; wall faces get edge-emissive |
| **Score / engrave / etch** (partial-depth groove, raster fill) | No material removed | **Keep today's behavior** — ribbon/texture surface groove (Marks.jsx). NO CSG. |
| **Perimeter outline cut** (the part's silhouette) | Defines the slab's actual outline | Becomes the **extrude profile** of the slab itself (see §3.2), not a subtraction |

Decision rule: a path is a through-cut only when its operation maps to "cut" depth ≥ full sheet thickness (or is flagged
`cut`/`through` by the operation lens). Everything else stays a surface mark. **Mis-classifying a score as a through-cut
is the worst failure** (it punches a hole that should not exist), so the predicate must be conservative: default to
surface-mark unless the operation is explicitly a through-cut.

## 3. Approaches considered

### 3.1 CSG library evaluation — `three-bvh-csg`

**Recommended: [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg)** (by gkjohnson, same author as
`three-mesh-bvh`). Rationale vs the field:

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| **`three-bvh-csg`** | BVH-accelerated (fast even for many ops); actively maintained; supports `SUBTRACTION`/`INTERSECTION`/`UNION` via an `Evaluator`; can run **once at build-time of the geometry** (not per frame); preserves/computes groups so we can assign a **separate material index to the newly-created cut-wall faces** — exactly what we need for the edge-emissive | Pulls in `three-mesh-bvh` as a peer (~tens of kB gzip); produces non-indexed or re-indexed geometry that needs normal/group handling | **Use this** |
| `three-csg-ts` / old `ThreeCSG` | Simple API | Slower (no BVH), less maintained, weaker group/material-index support, known normal artifacts | Reject |
| Manual hole geometry (`THREE.Shape` + holes, `ExtrudeGeometry`) | No dependency; `Shape.holes[]` extrudes a profile **with holes** natively, generating interior wall faces for free; perfectly matches our slabs (already flat extrusions) | Only works when cuts are expressible as 2D profile holes in the extrude plane (they almost always are for laser cut sheets); does NOT handle non-planar boolean cases | **Strongly consider as the v1 path — see §3.2** |

**Key insight:** our slabs are **flat sheets extruded along z**. A laser cut is, by definition, a 2D operation in the
xy plane swept through the full thickness. That means the **dependency-free `THREE.Shape` + `shape.holes[]` +
`ExtrudeGeometry`** route models a true through-cut *natively*, with interior wall faces generated automatically — no
boolean solver needed for the common case. `three-bvh-csg` is the fallback for genuinely non-planar subtractions
(bevels, countersinks, cuts that don't go fully through and need a 3D tool), which v1 likely does not need.

### 3.2 Recommended v1 strategy: extrude-with-holes first, CSG as escape hatch

1. **Perimeter** of the part becomes the `THREE.Shape` outer contour (replacing the rectangular `boxGeometry` in
   `Sheets.jsx` when an outline cut exists).
2. **Through-cut interior paths** become `THREE.Path` entries in `shape.holes[]`.
3. `new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })` produces the slab **with real gaps**
   and **interior wall faces** in one mesh.
4. Add a **second material group** for the wall faces so they can take the edge-emissive material (§4). `ExtrudeGeometry`
   already emits separate groups for the cap faces vs the side/wall faces (`material: [cap, wall]` two-material form) —
   this is the natural seam to route the emissive onto.

Only fall back to `three-bvh-csg` `Evaluator.SUBTRACTION` when a cut cannot be expressed as a planar hole (rare for
sheet goods). This keeps the **dependency cost zero for v1** and quarantines the heavier path.

### 3.3 Dependency / bundle cost (if `three-bvh-csg` is adopted)

- `three-bvh-csg` + `three-mesh-bvh` add roughly **~40–70 kB gzipped** to the **already dynamically-imported 3D
  chunk** (the 3D path is behind `Canvas3DHost`'s dynamic import, so this does **not** hit the initial 2D bundle).
- The repo already ships a **pre-existing >500 kB chunk warning**; adding CSG would grow the 3D chunk further. Mitigate
  by importing the CSG evaluator **lazily inside the 3D boundary only** and ideally only when a through-cut is present.
- **Recommendation:** do NOT add the dependency unless §3.2's extrude-with-holes proves insufficient. If added, gate it
  behind the existing 3D dynamic-import boundary and a feature check.

## 4. Routing the edge-emissive material onto cut-wall faces

The P2 edge glow (S5) currently lives in `EdgeGlow.jsx` as **separate thin emissive rim boxes** hugging the slab's
outer box sides, plus a fresnel shell — because emissive injected into `MeshTransmissionMaterial` via `onBeforeCompile`
is swallowed by the transmission pass. P3 must extend the **same** emissive treatment to the **interior** cut walls.

Two viable wirings:

1. **Multi-material extrude (preferred).** `ExtrudeGeometry` yields two face groups: caps (front/back) and walls
   (perimeter + hole walls). Assign `mesh.material = [capMaterial, wallEmissiveMaterial]`. The cap material stays the
   archetype material (transmissive acrylic etc.); the **wall material** is a `meshStandardMaterial` with
   `emissive = tint`, `emissiveIntensity` driven by the same `edgeIntensity(keyLightDir, faceNormal, edgeGain)` term
   used in S5 (per-face incidence). This automatically covers BOTH the outer perimeter and the interior cut walls in a
   single mesh — no separate rim geometry needed for the cut faces.
   - Caveat: a single `emissiveIntensity` is uniform across the whole wall group, so per-face incidence asymmetry (the
     "glow tracks light" property) would need either (a) an `onBeforeCompile` term computing `dot(keyLightDir, vNormal)`
     in the wall material's fragment shader, or (b) accepting a constant wall glow for v1 and keeping the asymmetric
     per-side bars for the outer edges only. Recommend the `onBeforeCompile`-on-a-standard-material route (the material
     is NOT transmissive, so the S4 "don't inject into MTM" caveat does not apply here).

2. **Separate interior rim geometry** (mirrors today's `EdgeGlow.jsx` approach). Build thin emissive ribbons that trace
   the hole contours through the thickness. More geometry to manage and to keep in sync with the cut paths; only worth it
   if the multi-material extrude can't deliver the asymmetric incidence look.

**Recommendation:** multi-material extrude (option 1) with an `onBeforeCompile` incidence term on the wall material —
one mesh, real walls, asymmetric glow, no MTM injection.

## 5. Interaction with the SelectiveBloom `<Select>` pipeline

The bloom contract (from `EmissiveBloom.jsx`): `SelectiveBloom` glows **only** meshes inside the active drei
`<Selection>` provider that are wrapped in `<Select enabled>`. Luminance threshold is 0 — the gate is **selection
membership**, not brightness. Marks, drape lines, and the S5 rim/fresnel are already registered this way.

P3 requirements:

- The cut-wall emissive must be **registered for bloom** — i.e. the extruded slab mesh (or at least its wall-material
  sub-mesh) must sit inside a `<Select enabled>` so the wall emissive blooms like the outer edge does. **If it isn't
  registered, the cut walls render emissive-but-flat (no bloom) — the "green but no glow" trap from §3.4 of the plan,
  now applied to interior walls.**
- Subtlety: putting the **whole** extruded slab in the Select set would try to bloom the cap (transmissive acrylic)
  faces too, re-introducing the whole-scene-glow that D12 forbids. Because bloom selects per-**object**, not per-face,
  the clean solution is to keep the wall emissive as a **separate mesh/material that can be independently selected** —
  which argues for either the separate-interior-rim approach (§4 option 2) OR splitting the extrude into two child
  meshes (cap mesh not selected, wall mesh selected). **This is the main architectural tension P3 must resolve:**
  per-object bloom selection vs single multi-material mesh. Recommend splitting cap and wall into two meshes sharing one
  `ExtrudeGeometry` (via geometry groups / `addGroup`) so only the wall mesh joins the Select set.

## 6. Re-meshing / normals concerns

- **Normals:** `ExtrudeGeometry` computes correct face normals for caps and walls automatically. If `three-bvh-csg` is
  used instead, the output geometry needs `computeVertexNormals()` and may need `mergeVertices()` — boolean output is
  typically non-indexed with potential seams; flat-shaded walls are usually desirable for cut faces, so **flat normals
  on walls are a feature, not a bug** (sharp cut edges).
- **Winding / inverted faces:** hole paths in `THREE.Shape` must wind **opposite** to the outer contour or the wall
  faces invert (back-face culled → invisible cut wall). The path builder must enforce outer = CCW, holes = CW (or
  `THREE.ShapeUtils.isClockWise`-normalize).
- **Coordinate frame:** marks today are baked into the slab's centered xy plane frame (see `Marks.jsx`). The cut paths
  must be expressed in the **same** centered frame as the extrude `Shape`, or the holes land off-register from the
  scored marks. Reuse the existing mark-frame transform; do NOT introduce a second coordinate convention.
- **Z / thickness:** `ExtrudeGeometry` extrudes +z from 0..depth; the current slabs are centered on z. Translate the
  extruded geometry by `-thickness/2` to match `Sheets.jsx`'s centered convention so the stack spacing/exaggeration live
  props (which position by slab center) stay correct.
- **Performance:** building the extrude/CSG is a `useMemo` on `[shape, thickness]` — done once per geometry change, NOT
  per frame, and disposed on change/unmount (same discipline as `Marks.jsx`'s `geometry.dispose()`). High path counts
  (the device-profile ribbon/texture switch in `Marks.jsx` exists precisely because dense panels are expensive) mean a
  panel with thousands of tiny cutouts could produce a very heavy `Shape` — keep the existing density guard and consider
  falling back to surface-mark rendering above a path-count threshold.

## 7. Open risks & questions

1. **Through-cut classification source of truth.** Where does "this path is a full through-cut vs a score" come from —
   the operation lens, a per-path depth field, or material thickness? Needs a single authoritative predicate before any
   geometry work. Conservative default: surface-mark unless explicitly a through-cut.
2. **Cap vs wall bloom split (§5).** Confirm the two-mesh split (cap unselected, wall selected) actually keeps acrylic
   caps out of the bloom buffer in practice; the alternative is a per-face stencil which is heavier.
3. **Asymmetric incidence on walls (§4).** Decide v1: constant wall glow (cheap, uniform) vs `onBeforeCompile`
   incidence term (matches the "glow tracks light" property of the outer edges). Inconsistent glow between outer edge
   and cut wall would read as a bug.
4. **Transmission through a holed slab.** `MeshTransmissionMaterial` on a slab with real holes — does the transmission
   FBO behave correctly around the gap, or does it sample stale backbuffer through the hole? Needs an in-browser smoke;
   may require `backside` / sampling-config tuning per the existing MTM hard-wired knobs in `Sheets.jsx`.
5. **Dense-panel performance (§6).** Thousands of cutouts → giant `Shape`/CSG cost. Reuse/extend the `Marks.jsx`
   device-profile density guard; define the fallback (surface-mark render) threshold.
6. **Registration the same way the rest of the scene does it** — there is NO `useBloomRef`/`bloomSelection.js` in this
   codebase (a stale-spec premise corrected during S5). New cut-wall meshes must register via drei
   `@react-three/postprocessing` `<Select enabled>`, the same mechanism as `Marks.jsx`/`EdgeGlow.jsx`.
7. **Dependency decision gate.** Default to the **zero-dependency** extrude-with-holes path (§3.2). Only adopt
   `three-bvh-csg` if a real non-planar cut case appears; if adopted, lazy-import it inside the 3D boundary and budget
   the ~40–70 kB against the already-warned 3D chunk.
