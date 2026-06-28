// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { forwardRef, Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { KEY_LIGHT_POSITION } from '../../lib/three3d/keyLight.js';
import { getEnvironmentById, isFileEnvironment } from '../../lib/three3d/hdriEnvironments.js';

/** Neutral DARK background (spec D12) so emissive glow + acrylic transmission pop. */
export const DARK_BG = '#0b0b10';

/**
 * Shared lighting + image-based environment (spec D12, + the HDRI picker).
 *
 * The directional KEY light + ambient fill are always present (the key drives the
 * acrylic edge-glow incidence term and is forwarded via ref so the selective-bloom
 * pass can register it). On top of those, the selected `environmentId` decides the
 * image-based environment + backdrop:
 *
 *   - PRESET env (e.g. 'studio'): drei loads soft IBL from its asset CDN and we keep
 *     the neutral DARK `<color>` backdrop — the glow-first default look.
 *   - FILE env (a 2K .hdr in /public/hdri/): the HDRI lights the scene AND is shown
 *     AS the background, softened by `backgroundBlurriness` / `backgroundIntensity`
 *     (user sliders) so the room reads as ambiance without washing out the glow.
 *     Wrapped in Suspense (dark fallback) so first-load / switching never flashes.
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
          <Environment
            files={env.file}
            background
            backgroundBlurriness={backgroundBlurriness}
            backgroundIntensity={backgroundIntensity}
          />
        </Suspense>
      ) : (
        <>
          {/* preset env: IBL only (no `background`), so the dark backdrop shows */}
          <color attach="background" args={[DARK_BG]} />
          <Environment preset={env.preset} />
        </>
      )}
    </>
  );
});

export default SceneEnvironment;
