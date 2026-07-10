# The 3D preview is a fidelity-first material proof, not a stylized render

The 3D preview's job is to show how the finished piece actually looks on a table,
unlit. When fidelity and mark legibility conflict, fidelity wins — the 2D canvas
remains the legibility view. Concretely: marks render as the physical **reaction**
of substrate to process (frosted engraving on acrylic, char on plywood, kerf-thin
cut seam), never as emissive annotations; the previous glow treatment (emissive
marks × `toneMapped=false` × SelectiveBloom, plus a full-slab additive Fresnel
shell) is removed, which is why clear acrylic no longer "glows". Process colors
(red cut / blue score) survive only as an on-hover annotation in 3D.

Rendering stack decisions that follow from the same stance:

- **Tone mapping is Khronos PBR Neutral** (`THREE.NeutralToneMapping`), not the
  R3F ACES default — Neutral is designed for true-to-life product/material color;
  ACES lifts and desaturates brights. Every archetype and environment intensity is
  calibrated against Neutral; do not retune under a different mapper.
- **Material Archetypes are the single source of optics** (roughness, IOR,
  transmission, edge behavior), grounded in measured stock properties (PMMA:
  IOR 1.49, ~92% transmittance @ 3mm, polished-cast roughness ≈ 0.02). The
  `MaterialDescriptor` from `sheetSpecs.js` carries substrate identity only
  (kind, color, thickness) — it no longer holds roughness/IOR.
- **Environments are calibrated per entry**: each HDRI in the registry carries a
  hand-tuned `environmentIntensity` so a reference white sheet reads consistently
  across scenes; the Bright slider styles the backdrop image only and can never
  un-calibrate the lighting.
- **Acrylic edge brightness is an edge-face material** (slightly brighter, faint
  green cast on the slab's side faces) approximating total internal reflection —
  not an additive shell over the whole surface. Exception by the same fidelity
  logic: fluorescent acrylic keeps genuinely emissive edges, because the physical
  material fluoresces.
- **The orbit fallback is ghost-transparent**, not opaque: while the camera moves,
  transmissive sheets swap to a plain transparent physical material (transmission
  0, low opacity) — this still avoids the screen-space-refraction tiling artifact
  (the reason the motion gate exists) without flashing an opaque white card.
- **Bloom mounts on demand** (hover annotation, fluorescent edges, a future
  edge-lit mode); the default view runs with no post-processing.

Acceptance is external, not taste: each archetype is signed off side-by-side
against a reference photo of the physical sheet in a fixed calibration scene.

Rejected: keeping marks emissive-but-dimmer (stylized render drifts from what the
machine produces); a per-scene fidelity/legibility toggle (two truths, more UI);
AgX (more cinematic than ACES — wrong direction for a proof).
