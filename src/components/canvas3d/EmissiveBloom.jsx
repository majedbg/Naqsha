// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { memo } from 'react';
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
 *   - Pass the emissive objects to bloom via the `selection` prop (an array of
 *     Object3D, collected by the bloomSelection.jsx store). We DELIBERATELY do NOT
 *     use the `<Selection>`/`<Select>` context: its self-retriggering effect froze
 *     the tab (see bloomSelection.jsx). With no `<Selection>` context present,
 *     SelectiveBloom takes its loop-free branch and only sets `selection` in an
 *     effect (no setState).
 *   - Pass the scene's key light(s) via `lights` so the pass can illuminate the
 *     selection (also silences postprocessing's "requires lights" warning).
 *   - `luminanceThreshold` defaults to 0: everything in the (already emissive)
 *     selection blooms; the gate is the SELECTION, not luminance.
 *
 * Wrapped in React.memo: SelectiveBloom rebuilds its effect (and Selection) on every
 * render of this component (its internal useMemo keys on an unstable rest-props
 * object). Memoizing keeps it from re-rendering on the hot paths (spacing/zoom/
 * rotate, which don't change these props) so the effect is built once per real
 * membership/intensity change, not per frame.
 *
 * @param {{
 *   lights?: Array<object>,
 *   intensity?: number,
 *   luminanceThreshold?: number,
 *   mipmapBlur?: boolean,
 *   selection?: Array<object>,
 * }} props
 */
function EmissiveBloom({
  lights = [],
  intensity = 1.4,
  luminanceThreshold = 0,
  mipmapBlur = true,
  selection = [],
}) {
  return (
    <EffectComposer autoClear={false} multisampling={4}>
      <SelectiveBloom
        selection={selection}
        lights={lights}
        intensity={intensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={0.025}
        mipmapBlur={mipmapBlur}
      />
    </EffectComposer>
  );
}

export default memo(EmissiveBloom);
