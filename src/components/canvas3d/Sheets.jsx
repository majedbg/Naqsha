// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure spec builder it
// consumes (lib/three3d/sheetSpecs.js) is three-free and stays on the 2D side.
import { MeshTransmissionMaterial } from '@react-three/drei';
import { resolveSheetMaterial } from '../../lib/three3d/sheetMaterial.js';
import EdgeGlow from './EdgeGlow.jsx';
import WoodGrain from './WoodGrain.jsx';

/**
 * Surface A slabs (S4, PRD D7/D11). Renders one extruded box per sheet spec
 * (lib/three3d/sheetSpecs.buildSheetSpecs): a slab in the xy design plane,
 * thickness extruded along z, centered on the origin in xy and positioned at
 * `zOffset` along z (the stacking axis). World units are mm (1 unit = 1 mm).
 *
 * Material per descriptor (D7): `transmissive` → drei MeshTransmissionMaterial
 * (acrylic, ior≈1.49, tinted); `standard` → opaque meshStandardMaterial
 * (plywood/mdf/cardstock tinted, "other" neutral) with per-kind roughness.
 *
 * No marks yet — S5 (texture) / S10 (ribbon) drape the engraved/cut grooves onto
 * these sheets using each spec's `layerIds`.
 *
 * `appearance` (S3/S4, spec §3.5) is the selected material's resolved
 * AppearanceParams (from resolveAppearance), threaded live from Studio's Material
 * lens. S4 routes every slab through the pure `resolveSheetMaterial` helper:
 *   - when `appearance` is present the resolved ARCHETYPE drives the material — its
 *     transmission/clearcoat pick the render mode (transmission / standard /
 *     physical), and tint/roughness/metalness/ior/clearcoat come from the
 *     archetype, OVERRIDING the substrate descriptor (so e.g. an opaque material
 *     on an acrylic slab renders opaque, mirror renders metallic, pearlescent
 *     renders with a clearcoat sheen);
 *   - when `appearance` is null (Operation lens / no material) the helper returns
 *     the substrate-descriptor result, byte-identical to the pre-S4 fallback.
 * Edge/rim glow (edgeGain/rimGain) lands in S5 as separate emissive rim meshes
 * (EdgeGlow.jsx, rendered per slab beside the base material); procedural wood grain
 * is S6. S4 only sets the base material channels.
 *
 * @param {{ specs?: import('../../lib/three3d/sheetSpecs.js').SheetSpec[],
 *           appearance?: import('../../lib/three3d/resolveAppearance.js').AppearanceParams|null }} props
 */
export default function Sheets({ specs = [], appearance = null }) {
  return (
    <group data-testid="sheet-stack">
      {specs.map((spec) => {
        const [w = 0, h = 0] = spec.size || [];
        const m = spec.materialDescriptor || {};
        // Pure decision (S4): which three material + appearance channels this slab
        // gets. `appearance` present → archetype drives it; null → byte-identical
        // substrate-descriptor fallback. samples/resolution/chromaticAberration etc.
        // are MTM RENDER config (not appearance) and stay hard-wired below.
        const mat = resolveSheetMaterial({ appearance, descriptor: m });
        return (
          <group key={spec.panelId}>
          <mesh position={[0, 0, spec.zOffset]} castShadow receiveShadow>
            {/* boxGeometry args = [x=width, y=height, z=thickness] */}
            <boxGeometry args={[w, h, spec.thickness]} />
            {mat.mode === 'transmission' ? (
              // transmissionSampler (main's perf fix): all acrylic sheets sample ONE
              // shared scene buffer instead of each rendering the whole scene into its
              // own FBO every frame — the biggest per-frame GPU win for the acrylic
              // stack (kills the bloom freeze / steady-state cost). Values stay
              // archetype-driven (S4 resolveSheetMaterial), so clear vs translucent vs
              // fluorescent keep distinct transmission/tint/roughness/ior.
              <MeshTransmissionMaterial
                transmissionSampler
                color={mat.color}
                ior={mat.ior}
                roughness={mat.roughness}
                thickness={spec.thickness}
                transmission={mat.transmission}
                samples={8}
                // ── Mark-through-slab ANTI-ALIASING (the reported "tiling on orbit") ──
                // The emissive marks are re-imaged through this slab by screen-space
                // refraction sampling a finite buffer. At resolution=128 (the prior
                // value) that buffer was far coarser than the viewport, so the
                // refracted marks resolved into a blocky grid that crawled/tiled as the
                // camera orbited. 1024 fixed normal/moderate angles (512 was measurably
                // insufficient — still blocked), but a TRANSLUCENT material (fluorescent,
                // transmission 0.4) seen at the 3/4 orbit angle still showed the dense
                // hatch merging into hard stair-stepped SOLID blocks (the reported
                // "fluorescent aliasing"): a 1024 screen-space buffer foreshortened across
                // the tilted slab falls well under the DPR-2 viewport, so the
                // high-frequency marks undersample into a texel grid. resolution=2048
                // roughly halves that block size, resolving the hatch through the slab at
                // the usable 3/4 angle. The sheets share ONE buffer (transmissionSampler)
                // re-rendered only during interaction (frameloop="demand"), so the cost
                // stays bounded — a single 2048² FBO on demand, NOT a per-sheet/per-frame
                // FBO (the shape that once froze the tab). 2048 is the cap: 4096 quadruples
                // the buffer for no visible gain at usable angles and reopens perf risk.
                // samples=8 (was 4) keeps the
                // refraction blur from banding. chromaticAberration trimmed 0.02→0.002:
                // the RGB-split sampling added colored fringing that read as colored
                // tiles on the high-frequency marks; near-zero keeps a faint edge tint
                // without the fringe. (NOTE: at an EXTREME edge-on grazing angle the
                // foreshortened slab still shows some residual blocking — an inherent
                // limit of screen-space refraction, where the marks are near-invisible
                // anyway.)
                resolution={2048}
                anisotropy={0.1}
                chromaticAberration={0.002}
              />
            ) : mat.mode === 'physical' ? (
              /* Pearlescent nacre (S4, §3.2): opaque + a clearcoat sheen, which
                 meshStandardMaterial can't do — keeps it distinct from plain
                 opaque-acrylic. */
              <meshPhysicalMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
                clearcoat={mat.clearcoat}
                clearcoatRoughness={0.1}
              />
            ) : appearance?.archetype === 'wood' ? (
              /* Procedural wood grain (S6, §3.2/L6). ONLY on the wood archetype
                 when a material lens is active — the no-material substrate fallback
                 (appearance === null) stays a plain standard material, byte-
                 identical to pre-S4. The grain math is the unit-tested woodGrain.js;
                 this material mirrors it in GLSL. No texture loaded (texturePath
                 reserved). */
              <WoodGrain
                color={mat.color}
                roughness={mat.roughness}
                width={w}
                height={h}
                appearance={appearance}
              />
            ) : (
              <meshStandardMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
              />
            )}
          </mesh>
          {/* Acrylic cut-edge glow (S5, §3.4/§3.6). Only when a material lens is
              active; EdgeGlow self-gates to archetypes with edgeGain/rimGain > 0
              (fluorescent glows hard; opaque/mirror/wood render nothing). Driven by
              the designated key light + registered for bloom via <Select>. */}
          {appearance && <EdgeGlow spec={spec} appearance={appearance} />}
          </group>
        );
      })}
    </group>
  );
}
