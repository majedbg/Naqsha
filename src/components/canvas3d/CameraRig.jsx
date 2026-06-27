// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { computeZoomToFit } from '../../lib/three3d/cameraFit.js';

/**
 * Shared camera rig (spec D4): a damped drei OrbitControls plus zoom-to-fit /
 * reset framing driven by the PURE `computeZoomToFit` helper.
 *
 * The pure math lives in `lib/three3d/cameraFit.js` (unit-tested); this thin R3F
 * wrapper only applies the result to the live camera + controls. It reframes:
 *   - on mount,
 *   - whenever `fitBox` changes (a new design/field snapshot),
 *   - whenever `resetSignal` increments ("Reset view" button → default 3/4 fit).
 *
 * @param {{
 *   fitBox?: { min:[number,number,number], max:[number,number,number] } | null,
 *   resetSignal?: number,
 * }} props
 */
export default function CameraRig({ fitBox = null, resetSignal = 0 }) {
  const controls = useRef(null);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const aspect = height > 0 ? width / height : 1;
    const fov = typeof camera.fov === 'number' ? camera.fov : undefined;
    const { position, target } = computeZoomToFit({ box: fitBox, fov, aspect });

    camera.position.set(position[0], position[1], position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();

    if (controls.current) {
      controls.current.target.set(target[0], target[1], target[2]);
      controls.current.update();
    }
  }, [fitBox, resetSignal, camera, width, height]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableZoom
      enableRotate
    />
  );
}
