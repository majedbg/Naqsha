// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { memo } from 'react';
import { EffectComposer, SelectiveBloom, ToneMapping } from '@react-three/postprocessing';

// postprocessing's ToneMappingMode.NEUTRAL (Khronos PBR Neutral). A literal because
// `postprocessing` is a transitive dep of @react-three/postprocessing (not hoisted,
// not directly importable); the enum is stable in the pinned build. MUST match the
// renderer's THREE.NeutralToneMapping (Scene3D) — see the ToneMapping note below.
const TONE_MAPPING_MODE_NEUTRAL = 8;

/**
 * Selective bloom on EMISSIVE materials only (spec D12) — NOT whole-scene bloom.
 *
 * MOUNTED ON DEMAND (ADR 0003 #5): Scene3D renders this component ONLY while the
 * bloom selection is non-empty (a hovered mark's annotation highlight, fluorescent
 * acrylic edges, Surface B drape lines, a future edge-lit mode). The default
 * Surface-A view runs with ZERO post-processing — fidelity first.
 *
 * Why selection-gated rather than a luminance-threshold Bloom: under
 * `<Environment preset="studio">` (D12) plus `MeshTransmissionMaterial` acrylic
 * (D7), bright HDR specular highlights can exceed any luminance threshold and
 * bloom too — that is the whole-scene glow D12 forbids. `SelectiveBloom` glows
 * ONLY the objects in the active Selection regardless of their HDR luminance, so
 * "emissive only" holds by construction.
 *
 * TONE-MAPPING PARITY: while mounted, the EffectComposer forces
 * `gl.toneMapping = NoToneMapping` (verified in @react-three/postprocessing) so
 * the beauty pass renders linear HDR into its buffers. Without a closing tone-map
 * the scene would visibly SHIFT every time bloom mounts/unmounts. The trailing
 * <ToneMapping mode=NEUTRAL> re-applies the same Khronos PBR Neutral curve the
 * renderer uses when the composer is absent (Scene3D's THREE.NeutralToneMapping),
 * so mounting bloom changes only the glow, never the base image.
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
  // multisampling drives MSAA for the WHOLE pass: with an EffectComposer active the
  // canvas-level `antialias` is bypassed, so THIS is what smooths polygon EDGES (the
  // jagged sheet perimeter + ribbon strokes). 8 samples noticeably de-jaggies those
  // edges; cost is trivial under frameloop="demand". (Texture-interior mark blockiness
  // is a separate axis — fixed by mipmaps+anisotropy in Marks.jsx, not here.)
  // NOTE: autoClear is left at its default (true). We previously passed
  // autoClear={false} — residue from the old two-composer selective-bloom
  // technique — which set renderer.autoClear=false for the whole composer pass;
  // combined with continuous/sparse frames that left the default framebuffer
  // uncleared between frames and read as flicker. A single SelectiveBloom needs no
  // such suppression, so we let the RenderPass clear normally.
  return (
    <EffectComposer multisampling={8}>
      <SelectiveBloom
        selection={selection}
        lights={lights}
        intensity={intensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={0.025}
        mipmapBlur={mipmapBlur}
      />
      {/* Close the pass with the SAME Khronos PBR Neutral curve the bare renderer
          uses (tone-mapping parity — see the component doc). Must come AFTER the
          bloom so the glow is added in linear HDR, then mapped once. */}
      <ToneMapping mode={TONE_MAPPING_MODE_NEUTRAL} />
    </EffectComposer>
  );
}

export default memo(EmissiveBloom);
