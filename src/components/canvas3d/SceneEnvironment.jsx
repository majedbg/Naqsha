// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { forwardRef, Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { KEY_LIGHT_POSITION } from '../../lib/three3d/keyLight.js';
import { getEnvironmentById, isFileEnvironment } from '../../lib/three3d/hdriEnvironments.js';

/** Neutral DARK background (spec D12) so emissive glow + acrylic transmission pop. */
export const DARK_BG = '#0b0b10';

/**
 * Shared lighting + image-based environment (spec D12, + the HDRI picker;
 * per-entry calibrated IBL per ADR 0003 #9).
 *
 * The directional KEY light + ambient fill are always present (the key is
 * forwarded via ref so the selective-bloom pass can register it). On top of those,
 * the selected `environmentId` decides the image-based environment + backdrop:
 *
 *   - PRESET env (e.g. 'studio'): drei loads soft IBL from its asset CDN and we keep
 *     the neutral DARK `<color>` backdrop — the glow-first default look. (Why the
 *     studio entry is calibrated to 0.3: at full IBL the bright preset fully lights
 *     the flat slab — constant normal, uniform IBL term — and clips it to a
 *     featureless bright block against the dark backdrop, burying the marks.)
 *   - FILE env (a 2K .hdr in /public/hdri/): the HDRI lights the scene AND is shown
 *     AS the background, softened by `backgroundBlurriness` / `backgroundIntensity`
 *     (user sliders) so the room reads as ambiance. Wrapped in Suspense (dark
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
        <Suspense fallback={<color attach="background" args={[DARK_BG]} />}>
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
          {/* preset env: IBL only (no `background`), so the dark backdrop shows.
              The registry-calibrated intensity keeps the bright preset HDRI from
              clipping the flat acrylic slab into a featureless block. */}
          <color attach="background" args={[DARK_BG]} />
          <Environment preset={env.preset} environmentIntensity={env.environmentIntensity} />
        </>
      )}
    </>
  );
});

export default SceneEnvironment;
