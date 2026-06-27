// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { forwardRef } from 'react';
import { Environment } from '@react-three/drei';

/** Neutral DARK background (spec D12) so emissive glow + acrylic transmission pop. */
export const DARK_BG = '#0b0b10';

/**
 * Shared lighting + image-based environment (spec D12).
 *
 * `<Environment preset="studio">` supplies soft IBL for acrylic reflections /
 * transmission (loaded at runtime from drei's asset CDN; build is unaffected).
 * `background` is left off so the environment lights the scene WITHOUT washing
 * out the dark backdrop — the `<color attach="background">` is the visible bg.
 *
 * The key directional light is forwarded via ref so the selective-bloom pass can
 * register it (postprocessing's SelectiveBloom illuminates its selection through
 * the lights it is handed).
 *
 * @param {{ ambientIntensity?: number, keyIntensity?: number }} props
 */
const SceneEnvironment = forwardRef(function SceneEnvironment(
  { ambientIntensity = 0.35, keyIntensity = 0.8 },
  keyLightRef,
) {
  return (
    <>
      <color attach="background" args={[DARK_BG]} />
      <ambientLight intensity={ambientIntensity} />
      <directionalLight ref={keyLightRef} position={[4, 6, 5]} intensity={keyIntensity} />
      <Environment preset="studio" />
    </>
  );
});

export default SceneEnvironment;
