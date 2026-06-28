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
 * @param {{ specs?: import('../../lib/three3d/sheetSpecs.js').SheetSpec[] }} props
 */
export default function Sheets({ specs = [] }) {
  return (
    <group data-testid="sheet-stack">
      {specs.map((spec) => {
        const [w = 0, h = 0] = spec.size || [];
        const m = spec.materialDescriptor || {};
        return (
          <mesh key={spec.panelId} position={[0, 0, spec.zOffset]} castShadow receiveShadow>
            {/* boxGeometry args = [x=width, y=height, z=thickness] */}
            <boxGeometry args={[w, h, spec.thickness]} />
            {m.type === 'transmissive' ? (
              // transmissionSampler: all acrylic sheets sample ONE shared scene
              // buffer instead of each rendering the whole scene into its own FBO
              // every frame — an N-sheet stack went from ~N (×2 with backside)
              // full-scene renders per frame to one. Paired with lower
              // resolution/samples and dropping backside, this is the biggest
              // per-frame GPU win for the acrylic stack (zoom/rotate cost).
              <MeshTransmissionMaterial
                transmissionSampler
                color={m.color}
                ior={m.ior ?? 1.49}
                roughness={m.roughness ?? 0.15}
                thickness={spec.thickness}
                transmission={1}
                samples={4}
                resolution={128}
                anisotropy={0.1}
                chromaticAberration={0.02}
              />
            ) : (
              <meshStandardMaterial
                color={m.color}
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
