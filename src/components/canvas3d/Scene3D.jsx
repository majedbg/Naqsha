// ⚠️ THE 3D BOUNDARY (S1, PRD D9). This is the ONLY module that may statically
// import three.js / @react-three/*. It is reached ONLY through the React.lazy()
// dynamic import in Canvas3DHost, so Rollup emits it (and all of three) as a
// SEPARATE async chunk — the 2D app bundle never pulls three. Do NOT import this
// file statically from any 2D render-path module.
import { Canvas } from '@react-three/fiber';

/**
 * Shared R3F scene host (PRD D1: one <Canvas>, one camera rig). For the S1
 * foundation slice this renders a placeholder mesh only — real Surface A
 * (panel-stack) and Surface B (height-surface) content lands in later slices.
 *
 * @param {{ mode?: string, focusFieldLayerId?: string|null }} props
 *   `mode`/`focusFieldLayerId` are threaded through now so later slices can swap
 *   scene content per sub-mode without changing the mount wiring.
 */
export default function Scene3D({ mode = 'panel-stack', focusFieldLayerId = null }) {
  return (
    <Canvas
      data-testid="canvas3d"
      data-mode={mode}
      data-focus-field={focusFieldLayerId ?? ''}
      camera={{ position: [0, 0, 5], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={0.8} />
      {/* Placeholder content (S1). Replaced by per-sub-mode geometry downstream. */}
      <mesh>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#6b5bd6" />
      </mesh>
    </Canvas>
  );
}
