// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { forwardRef, Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { KEY_LIGHT_POSITION } from '../../lib/three3d/keyLight.js';
import { getEnvironmentById, isFileEnvironment } from '../../lib/three3d/hdriEnvironments.js';

/**
 * Neutral light-gray seamless backdrop, matching the reference-photo staging the
 * archetypes are calibrated against (Canal Plastics gray/white seamless — see
 * docs/material-references/canal-plastics/STAGING-NOTES.md). Replaces the dark
 * D12 backdrop: its "so emissive glow pops" rationale died with ADR 0003
 * (fidelity-first, no emissive marks), and a dark ground made side-by-side
 * evaluation dishonest — sheets read darker than any reference photo.
 */
export const SEAMLESS_BG = '#d6d7d9';

/**
 * Shared lighting + image-based environment (spec D12, + the HDRI picker;
 * per-entry calibrated IBL per ADR 0003 #9).
 *
 * The directional KEY light + ambient fill are always present (the key is
 * forwarded via ref so the selective-bloom pass can register it). On top of those,
 * the selected `environmentId` decides the image-based environment + backdrop:
 *
 *   - PRESET env (e.g. 'studio'): drei loads soft IBL from its asset CDN over the
 *     neutral SEAMLESS_BG backdrop — the reference-staging default look. (Why the
 *     studio entry is calibrated to 0.3: at full IBL the bright preset fully lights
 *     the flat slab — constant normal, uniform IBL term — and clips it to a
 *     featureless bright block, burying the marks.)
 *   - FILE env (a 2K .hdr in /public/hdri/): the HDRI lights the scene AND is shown
 *     AS the background, softened by `backgroundBlurriness` / `backgroundIntensity`
 *     (user sliders) so the room reads as ambiance. Wrapped in Suspense (seamless
 *     fallback) so first-load / switching never flashes.
 *
 * EVERY environment's IBL strength comes from its registry entry's
 * `environmentIntensity` (hdriEnvironments.js) — the hand-calibrated value that
 * makes a white sheet read consistently across scenes. The Bright slider maps to
 * `backgroundIntensity` ONLY (the backdrop image); it can never scale the IBL, so
 * user styling can't un-calibrate the lighting (ADR 0003 #9).
 *
 * @param {{ environmentId?: string, backgroundBlurriness?: number,
 *           backgroundIntensity?: number, ambientIntensity?: number,
 *           keyIntensity?: number }} props
 */
const SceneEnvironment = forwardRef(function SceneEnvironment(
  {
    environmentId = 'studio',
    backgroundBlurriness = 0.35,
    backgroundIntensity = 0.6,
    ambientIntensity = 0.35,
    keyIntensity = 0.8,
  },
  keyLightRef,
) {
  const env = getEnvironmentById(environmentId);
  const fileEnv = isFileEnvironment(env);
  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight ref={keyLightRef} position={KEY_LIGHT_POSITION} intensity={keyIntensity} />
      {fileEnv ? (
        <Suspense fallback={<color attach="background" args={[SEAMLESS_BG]} />}>
          {/* file env: calibrated IBL from the registry; the Bright slider drives
              backgroundIntensity (backdrop styling) only — never the lighting. */}
          <Environment
            files={env.file}
            background
            backgroundBlurriness={backgroundBlurriness}
            backgroundIntensity={backgroundIntensity}
            environmentIntensity={env.environmentIntensity}
          />
        </Suspense>
      ) : (
        <>
          {/* preset env: IBL only (no `background`), so the seamless backdrop shows.
              The registry-calibrated intensity keeps the bright preset HDRI from
              clipping the flat acrylic slab into a featureless block. */}
          <color attach="background" args={[SEAMLESS_BG]} />
          <Environment preset={env.preset} environmentIntensity={env.environmentIntensity} />
        </>
      )}
    </>
  );
});

export default SceneEnvironment;
