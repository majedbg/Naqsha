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
import Sheets from './Sheets.jsx';
import Marks from './Marks.jsx';
import {
  buildSheetSpecs,
  boundsForSheetSpecs,
  clampSpacing,
  SPACING_MIN,
  SPACING_MAX,
  SPACING_DEFAULT,
} from '../../lib/three3d/sheetSpecs.js';
import { saveCanvasPng } from '../../lib/three3d/snapshotExport.js';

// Placeholder content bounds (S2). Stable identity so CameraRig's zoom-fit effect
// doesn't re-run every render. Used for height-surface (B, later) + the empty
// panel-stack state; the real panel-stack box is derived from the sheet specs.
const PLACEHOLDER_BOX = { min: [-1, -1, -1], max: [1, 1, 1] };

// Default Surface A inter-panel spacing (PRD D11, mm). S6 wires the slider here as
// local state; persistence to localStorage is S11's job (D13).
const DEFAULT_SPACING_MM = SPACING_DEFAULT;
// Default canvas mm-bounds when the host doesn't supply real ones (keeps the
// scene non-degenerate in isolation; RightPanel passes the true design size).
const DEFAULT_BOUNDS_MM = { width: 200, height: 200 };

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
 * S4 builds Surface A (panel-stack): stacked, thickness-extruded substrate slabs
 * from the snapshot's panels (materials per `substrate.kind`, D7). Marks land in
 * S5/S10. Surface B (height-surface) is still the S2 placeholder until S8.
 *
 * S5 drapes the engraved/cut marks: per-panel, per-process emissive SVGs
 * (built 2D-side, passed in as `marksByPanel`) are rasterized to CanvasTextures
 * and floated as emissive mark planes in front of each sheet (texture mode, D3/D6).
 *
 * S6 adds the Surface-A stack-spacing slider (0–60mm, default 12mm; D11) and the
 * "Save image" PNG snapshot (D8): the slider drives the sheet z-layout via local
 * state; the export reads the live renderer canvas (preserveDrawingBuffer keeps
 * the last composited bloom/transmission frame readable) through a pure filename
 * builder. The 2D SVG/ZIP fabrication export is untouched.
 *
 * @param {{ mode?: string, focusFieldLayerId?: string|null, snapshot?: object|null,
 *           spacing?: number, boundsMm?: {width:number,height:number},
 *           marksByPanel?: object, designName?: string }} props
 */
export default function Scene3D({
  mode = 'panel-stack',
  focusFieldLayerId = null,
  snapshot = null,
  spacing = DEFAULT_SPACING_MM,
  boundsMm = DEFAULT_BOUNDS_MM,
  marksByPanel = null,
  designName = 'untitled',
}) {
  const [resetSignal, setResetSignal] = useState(0);
  // Surface-A stack spacing (D11). Seeded from the `spacing` prop, then owned
  // locally so the slider drives the geometry. Persistence is S11 (D13).
  const [spacingMm, setSpacingMm] = useState(() => clampSpacing(spacing));
  const keyLightRef = useRef(null);
  // Live WebGL renderer captured at Canvas creation (onCreated) so the "Save
  // image" overlay — which lives OUTSIDE the R3F tree — can read its canvas.
  const glRef = useRef(null);
  // Stable array so the bloom pass doesn't re-register lights every render.
  const bloomLights = useMemo(() => [keyLightRef], []);

  const isPanelStack = mode === 'panel-stack';
  // Depend on the PRIMITIVE bounds (not the object identity, which the host
  // recreates every render) so the memo — and CameraRig's fitBox — stay stable.
  const boundsW = boundsMm?.width;
  const boundsH = boundsMm?.height;

  // Surface A sheet specs (S4). Memoized on the snapshot + spacing + bounds so the
  // geometry — and the derived fitBox handed to CameraRig — keep stable identity
  // across renders (a fresh box each render would re-run zoom-fit every frame).
  const sheetSpecs = useMemo(() => {
    if (!isPanelStack || !snapshot) return [];
    return buildSheetSpecs({
      panels: snapshot.panels,
      layers: snapshot.layers,
      spacing: spacingMm,
      bounds: { width: boundsW, height: boundsH },
    });
  }, [isPanelStack, snapshot, spacingMm, boundsW, boundsH]);

  const fitBox = useMemo(
    () => boundsForSheetSpecs(sheetSpecs) ?? PLACEHOLDER_BOX,
    [sheetSpecs],
  );

  return (
    <div className="absolute inset-0" data-mode={mode} data-focus-field={focusFieldLayerId ?? ''}>
      <Canvas
        data-testid="canvas3d"
        data-mode={mode}
        data-focus-field={focusFieldLayerId ?? ''}
        dpr={[1, 2]}
        camera={{ position: [3, 3, 4], fov: 50, near: 0.01, far: 1000 }}
        style={{ width: '100%', height: '100%' }}
        // preserveDrawingBuffer keeps the last COMPOSITED frame (post-bloom /
        // transmission) readable so the "Save image" PNG (D8) isn't black.
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          glRef.current = gl;
        }}
      >
        {/* Selection must wrap BOTH the EffectComposer and the scene meshes so
            SelectiveBloom and <Select> share one context. */}
        <Selection>
          <CameraRig fitBox={fitBox} resetSignal={resetSignal} />
          <SceneEnvironment ref={keyLightRef} />

          {isPanelStack ? (
            /* Surface A — stacked substrate slabs (S4) + texture-mode emissive
               marks floated in front of each sheet (S5). Ribbon marks land in S10. */
            <>
              <Sheets specs={sheetSpecs} />
              <Marks specs={sheetSpecs} marksByPanel={marksByPanel ?? {}} />
            </>
          ) : (
            /* Surface B placeholder until S8: a lit base + a glowing emissive
               marker that proves the selective bloom still works. */
            <>
              <mesh position={[0, -0.1, 0]}>
                <boxGeometry args={[1.5, 0.4, 1.5]} />
                <meshStandardMaterial color="#6b5bd6" roughness={0.4} metalness={0.1} />
              </mesh>
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
            </>
          )}

          <EmissiveBloom lights={bloomLights} />
        </Selection>
      </Canvas>

      {/* Top-right controls: Reset view (D4) + Save image PNG snapshot (D8). */}
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          data-testid="canvas3d-reset-view"
          onClick={() => setResetSignal((n) => n + 1)}
          className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
        >
          Reset view
        </button>
        <button
          type="button"
          data-testid="canvas3d-save-image"
          onClick={() => saveCanvasPng(glRef.current?.domElement, { designName })}
          className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
        >
          Save image
        </button>
      </div>

      {/* Surface-A stack-spacing slider (D11): 0–60mm, default 12mm. Panel-stack
          only — height-surface (B) has no inter-panel gap. */}
      {isPanelStack && (
        <label
          data-testid="canvas3d-spacing"
          className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
        >
          <span className="whitespace-nowrap">Spacing</span>
          <input
            type="range"
            min={SPACING_MIN}
            max={SPACING_MAX}
            step={1}
            value={spacingMm}
            onChange={(e) => setSpacingMm(clampSpacing(Number(e.target.value)))}
            className="h-1 w-32 cursor-pointer accent-violet"
            aria-label="Inter-panel spacing in millimetres"
          />
          <span className="w-12 tabular-nums text-right">{spacingMm} mm</span>
        </label>
      )}
    </div>
  );
}
