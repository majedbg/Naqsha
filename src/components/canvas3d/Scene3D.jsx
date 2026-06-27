// ⚠️ THE 3D BOUNDARY (S1, PRD D9). The `canvas3d/*` scene tree (this file and the
// CameraRig / SceneEnvironment / EmissiveBloom primitives it imports) is the ONLY
// place that may statically import three.js / @react-three/*. It is reached ONLY
// through the React.lazy() dynamic import in Canvas3DHost, so Rollup emits it (and
// all of three) as a SEPARATE async chunk — the 2D app bundle never pulls three.
// Do NOT import this file (or its canvas3d/* siblings) statically from any 2D
// render-path module. Pure, three-free logic (e.g. cameraFit) lives under
// src/lib/three3d and stays on the 2D side of the boundary so it can be unit-tested.
import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Selection, Select } from '@react-three/postprocessing';
import CameraRig from './CameraRig.jsx';
import SceneEnvironment from './SceneEnvironment.jsx';
import EmissiveBloom from './EmissiveBloom.jsx';

// Placeholder content bounds (S2). Stable identity so CameraRig's zoom-fit effect
// doesn't re-run every render. Replaced by real per-sub-mode bounds downstream.
const PLACEHOLDER_BOX = { min: [-1, -1, -1], max: [1, 1, 1] };

/**
 * Shared R3F scene host (PRD D1/D4/D12): one <Canvas>, one camera rig, one
 * lighting/env setup, one selective-bloom pass — reused by both sub-modes.
 *
 * S2 delivers the reusable scene primitives (camera + OrbitControls + zoom-fit +
 * reset, studio environment, dark bg, emissive-only bloom). Scene CONTENT is
 * still a placeholder (a lit base + a glowing emissive marker that proves the
 * selective bloom works); real Surface A (panel-stack) and Surface B
 * (height-surface) geometry land in later slices.
 *
 * `snapshot` (S3, PRD D14) is the frozen design snapshot the scene reads from;
 * accepted here as plumbing — Surface A geometry consumes it in later slices.
 *
 * @param {{ mode?: string, focusFieldLayerId?: string|null, snapshot?: object|null }} props
 */
// eslint-disable-next-line no-unused-vars -- snapshot is S3 plumbing, consumed by Surface A in S4+
export default function Scene3D({ mode = 'panel-stack', focusFieldLayerId = null, snapshot = null }) {
  const [resetSignal, setResetSignal] = useState(0);
  const keyLightRef = useRef(null);
  // Stable array so the bloom pass doesn't re-register lights every render.
  const bloomLights = useMemo(() => [keyLightRef], []);

  return (
    <div className="absolute inset-0" data-mode={mode} data-focus-field={focusFieldLayerId ?? ''}>
      <Canvas
        data-testid="canvas3d"
        data-mode={mode}
        data-focus-field={focusFieldLayerId ?? ''}
        dpr={[1, 2]}
        camera={{ position: [3, 3, 4], fov: 50, near: 0.01, far: 1000 }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Selection must wrap BOTH the EffectComposer and the scene meshes so
            SelectiveBloom and <Select> share one context. */}
        <Selection>
          <CameraRig fitBox={PLACEHOLDER_BOX} resetSignal={resetSignal} />
          <SceneEnvironment ref={keyLightRef} />

          {/* Lit base — NOT in the selection, so it must NOT bloom. */}
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[1.5, 0.4, 1.5]} />
            <meshStandardMaterial color="#6b5bd6" roughness={0.4} metalness={0.1} />
          </mesh>

          {/* Emissive marker — selected, so it blooms (stands in for engraved/cut
              grooves in later slices). toneMapped off + intensity > 1 to glow. */}
          <Select enabled>
            <mesh position={[0, 0.6, 0]}>
              <torusKnotGeometry args={[0.35, 0.12, 96, 16]} />
              <meshStandardMaterial
                color="#000000"
                emissive="#ff5a3c"
                emissiveIntensity={3}
                toneMapped={false}
              />
            </mesh>
          </Select>

          <EmissiveBloom lights={bloomLights} />
        </Selection>
      </Canvas>

      {/* "Reset view" → re-fit to the default 3/4 framing (spec D4). */}
      <button
        type="button"
        data-testid="canvas3d-reset-view"
        onClick={() => setResetSignal((n) => n + 1)}
        className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
      >
        Reset view
      </button>
    </div>
  );
}
