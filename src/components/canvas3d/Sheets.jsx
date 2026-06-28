// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure spec builder it
// consumes (lib/three3d/sheetSpecs.js) is three-free and stays on the 2D side.
import { MeshTransmissionMaterial } from '@react-three/drei';
import { resolveSheetMaterial } from '../../lib/three3d/sheetMaterial.js';

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
 * Edge/rim glow (edgeGain/rimGain) and procedural wood grain are NOT here — they
 * land in S5/S6; S4 only sets the base material channels.
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
          <mesh key={spec.panelId} position={[0, 0, spec.zOffset]} castShadow receiveShadow>
            {/* boxGeometry args = [x=width, y=height, z=thickness] */}
            <boxGeometry args={[w, h, spec.thickness]} />
            {mat.mode === 'transmission' ? (
              <MeshTransmissionMaterial
                color={mat.color}
                ior={mat.ior}
                roughness={mat.roughness}
                thickness={spec.thickness}
                transmission={mat.transmission}
                samples={6}
                resolution={256}
                anisotropy={0.1}
                chromaticAberration={0.02}
                backside
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
            ) : (
              <meshStandardMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
              />
            )}
          </mesh>
        );
      })}
    </group>
  );
}
