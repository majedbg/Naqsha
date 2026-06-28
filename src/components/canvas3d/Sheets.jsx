// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure spec builder it
// consumes (lib/three3d/sheetSpecs.js) is three-free and stays on the 2D side.
import { MeshTransmissionMaterial } from '@react-three/drei';

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
 * `appearance` (S3, spec §3.5) is the selected material's resolved AppearanceParams
 * (from resolveAppearance), threaded live from Studio's Material lens. When it's
 * present its `tintHex` overrides the substrate's intrinsic color on every slab;
 * when null (Operation lens / no material) each slab keeps today's substrate
 * descriptor color — byte-identical fallback. The remaining channels
 * (transmission/roughness/metalness, mirror + pearlescent archetypes) are applied
 * by S4; S3 only proves the live tint thread end-to-end.
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
        // Material lens active → tint every slab to the selected material's sheet
        // hex; else fall back to the substrate descriptor's own color (today).
        const color = appearance?.tintHex ?? m.color;
        return (
          <mesh key={spec.panelId} position={[0, 0, spec.zOffset]} castShadow receiveShadow>
            {/* boxGeometry args = [x=width, y=height, z=thickness] */}
            <boxGeometry args={[w, h, spec.thickness]} />
            {m.type === 'transmissive' ? (
              <MeshTransmissionMaterial
                color={color}
                ior={m.ior ?? 1.49}
                roughness={m.roughness ?? 0.15}
                thickness={spec.thickness}
                transmission={1}
                samples={6}
                resolution={256}
                anisotropy={0.1}
                chromaticAberration={0.02}
                backside
              />
            ) : (
              <meshStandardMaterial
                color={color}
                roughness={m.roughness ?? 0.8}
                metalness={0}
              />
            )}
          </mesh>
        );
      })}
    </group>
  );
}
