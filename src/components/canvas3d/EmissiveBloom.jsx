// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { EffectComposer, SelectiveBloom } from '@react-three/postprocessing';

/**
 * Selective bloom on EMISSIVE materials only (spec D12) — NOT whole-scene bloom.
 *
 * Why selection-gated rather than a luminance-threshold Bloom: under
 * `<Environment preset="studio">` (D12) plus `MeshTransmissionMaterial` acrylic
 * (D7), bright HDR specular highlights can exceed any luminance threshold and
 * bloom too — that is the whole-scene glow D12 forbids. `SelectiveBloom` glows
 * ONLY the objects in the active Selection regardless of their HDR luminance, so
 * "emissive only" holds by construction.
 *
 * CONTRACT (how callers feed this):
 *   - Render this INSIDE a drei/postprocessing `<Selection>` provider.
 *   - Wrap the emissive groove meshes in `<Select enabled>`; SelectiveBloom reads
 *     that Selection context automatically (its `u.selected` path overrides the
 *     `selection` prop).
 *   - Pass the scene's key light(s) via `lights` so the pass can illuminate the
 *     selection (also silences postprocessing's "requires lights" warning).
 *   - `luminanceThreshold` defaults to 0: everything in the (already emissive)
 *     selection blooms; the gate is the SELECTION, not luminance.
 *
 * @param {{
 *   lights?: Array<object>,
 *   intensity?: number,
 *   luminanceThreshold?: number,
 *   mipmapBlur?: boolean,
 * }} props
 */
export default function EmissiveBloom({
  lights = [],
  intensity = 1.4,
  luminanceThreshold = 0,
  mipmapBlur = true,
}) {
  return (
    <EffectComposer autoClear={false} multisampling={4}>
      <SelectiveBloom
        lights={lights}
        intensity={intensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={0.025}
        mipmapBlur={mipmapBlur}
      />
    </EffectComposer>
  );
}
