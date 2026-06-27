import { lazy, Suspense } from 'react';

// THE dynamic-import boundary (PRD D9). Scene3D is the only module that imports
// three.js/@react-three/*; reaching it via React.lazy keeps three out of the 2D
// bundle (Rollup emits a separate async chunk). This host file MUST stay
// three-free — it may import ONLY React + the lazy() of Scene3D.
const Scene3D = lazy(() => import('./Scene3D.jsx'));

/**
 * Lazy host for the 3D preview scene. Mounted by RightPanel only when a 3D
 * sub-mode is active (panel-stack | height-surface). While the three.js chunk
 * downloads/initialises, the Suspense fallback shows a "Building preview…"
 * indicator (PRD D14).
 *
 * `snapshot` is the frozen design snapshot (S3, PRD D14) the scene reads from.
 * `boundsMm` is the design's canvas size in mm (Surface A slab size, S4).
 * `marksByPanel` is the per-panel, per-process emissive mark SVGs (S5, built
 * 2D-side from the snapshot + pattern instances) the scene rasterizes onto sheets.
 * `reliefField` is the Surface-B guide ScalarField (S8), resolved 2D-side from the
 * focus layer and passed across the boundary (ScalarField is three-free).
 * `drapeTargets` are the guide's ACTIVE modulation-target descriptors (S9),
 * resolved 2D-side (three-free) for the per-channel drape + toggle checklist.
 *
 * @param {{ mode?: string, focusFieldLayerId?: string|null, snapshot?: object|null,
 *           boundsMm?: {width:number,height:number}, marksByPanel?: object|null,
 *           reliefField?: object|null, drapeTargets?: object[] }} props
 */
export default function Canvas3DHost({
  mode,
  focusFieldLayerId,
  snapshot = null,
  boundsMm,
  marksByPanel = null,
  reliefField = null,
  drapeTargets = [],
  // Close the overlay (Studio → RightPanel → here → Scene3D's "✕"). Optional.
  onClose = null,
}) {
  return (
    <Suspense
      fallback={
        <div
          data-testid="canvas3d-fallback"
          className="absolute inset-0 flex items-center justify-center text-ink-soft text-sm bg-surface"
        >
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet" />
            </span>
            Building preview…
          </span>
        </div>
      }
    >
      <Scene3D
        mode={mode}
        focusFieldLayerId={focusFieldLayerId}
        snapshot={snapshot}
        boundsMm={boundsMm}
        marksByPanel={marksByPanel}
        reliefField={reliefField}
        drapeTargets={drapeTargets}
        onClose={onClose}
      />
    </Suspense>
  );
}
