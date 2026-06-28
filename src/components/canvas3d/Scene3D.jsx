// ⚠️ THE 3D BOUNDARY (S1, PRD D9). The `canvas3d/*` scene tree (this file and the
// CameraRig / SceneEnvironment / EmissiveBloom primitives it imports) is the ONLY
// place that may statically import three.js / @react-three/*. It is reached ONLY
// through the React.lazy() dynamic import in Canvas3DHost, so Rollup emits it (and
// all of three) as a SEPARATE async chunk — the 2D app bundle never pulls three.
// Do NOT import this file (or its canvas3d/* siblings) statically from any 2D
// render-path module. Pure, three-free logic (e.g. cameraFit) lives under
// src/lib/three3d and stays on the 2D side of the boundary so it can be unit-tested.
import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Selection } from '@react-three/postprocessing';
import CameraRig from './CameraRig.jsx';
import SceneEnvironment from './SceneEnvironment.jsx';
import EmissiveBloom from './EmissiveBloom.jsx';
import Sheets from './Sheets.jsx';
import Marks from './Marks.jsx';
import Relief from './Relief.jsx';
import DrapedMarks from './DrapedMarks.jsx';
import {
  buildSheetSpecs,
  boundsForSheetSpecs,
  clampSpacing,
  SPACING_MIN,
  SPACING_MAX,
  SPACING_DEFAULT,
} from '../../lib/three3d/sheetSpecs.js';
import {
  boundsForRelief,
  defaultExaggeration,
  exaggerationMax,
  clampExaggeration,
  EXAG_MIN,
} from '../../lib/three3d/heightSurface.js';
import { resolveAppearance } from '../../lib/three3d/resolveAppearance.js';
import { saveCanvasPng } from '../../lib/three3d/snapshotExport.js';
import {
  loadPreview3DSettings,
  savePreview3DSettings,
} from '../../lib/three3d/preview3dPersistence.js';

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
  // Surface B (S8): the guide layer's ScalarField, resolved 2D-side and passed
  // across the boundary (ScalarField is three-free). null for Surface A.
  reliefField = null,
  // Surface B (S9): the guide's ACTIVE modulation-target descriptors
  // ({targetId, channel, amount, color, name}), resolved 2D-side by
  // drape.resolveActiveTargets (three-free) and passed across the boundary.
  drapeTargets = [],
  // Material→Appearance (S3, spec §3.5). The user's selected material, threaded
  // LIVE from Studio's Material lens (a sibling to spacing/exaggeration — NOT in
  // designSnapshot, so changing material updates the scene without a Rebuild).
  // null in the Operation lens / when no material is resolved → Sheets falls back
  // to the substrate's intrinsic descriptor (today's behavior).
  selectedMaterial = null,
  designName = 'untitled',
}) {
  const [resetSignal, setResetSignal] = useState(0);
  // Persisted view-prefs (D13/S11), read ONCE on mount. Spacing + exaggeration
  // seed their sliders below; camera is never persisted (always zoom-fits).
  const persisted = useMemo(() => loadPreview3DSettings(), []);
  // Surface-A stack spacing (D11). Seeded from the persisted value (falling back
  // to the `spacing` prop / default), then owned locally so the slider drives the
  // geometry. Changes are persisted below.
  const [spacingMm, setSpacingMm] = useState(() =>
    clampSpacing(persisted.spacing ?? spacing),
  );
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

  // Surface-B vertical exaggeration (D10): persisted value wins (clamped to the
  // live bounds-derived max), else the bounds-relative default (≈ panel-size / 4).
  // Owned locally so the slider drives the relief; changes are persisted below.
  const exagMax = exaggerationMax(boundsW);
  const [exaggerationMm, setExaggerationMm] = useState(() =>
    persisted.exaggeration != null
      ? clampExaggeration(persisted.exaggeration, exagMax)
      : defaultExaggeration(boundsW),
  );

  // Persist spacing + exaggeration (D13/S11). Each is gated to the sub-mode that
  // actually owns its slider: spacing only persists in panel-stack (A), exaggeration
  // only in height-surface (B). Without the gate, an A session would rewrite the
  // exaggeration default (the slider it can't even see) over a previously-saved B
  // value, and vice versa. Own keys, never the document; camera is excluded.
  useEffect(() => {
    if (isPanelStack) savePreview3DSettings({ spacing: spacingMm });
  }, [isPanelStack, spacingMm]);
  useEffect(() => {
    if (!isPanelStack) savePreview3DSettings({ exaggeration: exaggerationMm });
  }, [isPanelStack, exaggerationMm]);

  // Surface-B per-target drape toggles (S9, §3.4). Default ALL-ON: a SET of
  // DISABLED targetIds, so newly-added targets light up without re-seeding.
  // NOT persisted — D13/S11 cover sub-mode/spacing/exaggeration only.
  const [disabledTargets, setDisabledTargets] = useState(() => new Set());
  const enabledMap = useMemo(() => {
    const m = {};
    for (const t of drapeTargets) m[t.targetId] = !disabledTargets.has(t.targetId);
    return m;
  }, [drapeTargets, disabledTargets]);
  const toggleTarget = (id) =>
    setDisabledTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hasTargets = !isPanelStack && reliefField && drapeTargets.length > 0;
  const emptyDrape = !isPanelStack && reliefField && drapeTargets.length === 0;

  // Selected-material appearance (S3, spec §3.5). resolveAppearance is pure +
  // three-free; null-in → null-out so the Operation-lens / no-material fallback
  // (Sheets keeps each slab's intrinsic substrate color) is preserved exactly.
  // Memoized on the live material identity so material switches re-tint without a
  // Rebuild, but unrelated renders don't re-resolve.
  const appearance = useMemo(
    () => (selectedMaterial ? resolveAppearance(selectedMaterial) : null),
    [selectedMaterial],
  );

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

  // Camera-fit box: Surface A from the stacked sheets; Surface B (height-surface)
  // a conservative relief box (width/depth plane × ±exaggeration) so the relief
  // frames correctly the instant B opens, without needing the field here.
  const fitBox = useMemo(() => {
    if (isPanelStack) return boundsForSheetSpecs(sheetSpecs) ?? PLACEHOLDER_BOX;
    return (
      boundsForRelief({ width: boundsW, height: boundsH, exaggeration: exaggerationMm }) ??
      PLACEHOLDER_BOX
    );
  }, [isPanelStack, sheetSpecs, boundsW, boundsH, exaggerationMm]);

  // Surface A degenerate state (§3.1): no visible panels (0 panels, or all panels
  // hidden) → nothing to stack. Show a hint rather than an unexplained empty scene.
  const emptyStack = isPanelStack && sheetSpecs.length === 0;

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
              <Sheets specs={sheetSpecs} appearance={appearance} />
              <Marks specs={sheetSpecs} marksByPanel={marksByPanel ?? {}} />
            </>
          ) : (
            /* Surface B — modulation height-surface relief (S8, D5/D10): the
               guide's ScalarField as a vertex-colored terrain (warm/cool =
               attract/repel), lit by the shared environment. Per-channel target
               drape lands in S9. */
            <>
              <Relief
                field={reliefField}
                exaggeration={exaggerationMm}
                width={boundsW}
                height={boundsH}
              />
              {/* Per-channel target drape (S9, §3.4): active targets as thin
                  emissive LineSegments, one color per target, with per-target
                  toggles below. warp → in-plane displaced grid; density →
                  spacing-varied studs. */}
              <DrapedMarks
                targets={drapeTargets}
                enabled={enabledMap}
                field={reliefField}
                exaggeration={exaggerationMm}
                width={boundsW}
                height={boundsH}
              />
            </>
          )}

          {/* Surface B keeps a gentler bloom: its only emissive element is the
              thin drape lines, and a softer pass avoids any glow leaking onto the
              (now transparent, dimmer) relief. Surface A's marks want the full
              groove glow. */}
          <EmissiveBloom lights={bloomLights} intensity={isPanelStack ? 1.4 : 0.6} />
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

      {/* Surface-B vertical-exaggeration slider (D10): 0…panel-size mm, default
          ≈ panel-size/4. Height-surface only — the relief height scales live. */}
      {!isPanelStack && (
        <label
          data-testid="canvas3d-exaggeration"
          className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
        >
          <span className="whitespace-nowrap">Height</span>
          <input
            type="range"
            min={EXAG_MIN}
            max={exagMax}
            step={1}
            value={exaggerationMm}
            onChange={(e) => setExaggerationMm(clampExaggeration(Number(e.target.value), exagMax))}
            className="h-1 w-32 cursor-pointer accent-violet"
            aria-label="Vertical exaggeration in millimetres"
          />
          <span className="w-12 tabular-nums text-right">{Math.round(exaggerationMm)} mm</span>
        </label>
      )}

      {/* Surface-B per-target drape toggle checklist (S9, §3.4): one row per
          ACTIVE modulation target, colored swatch + on/off checkbox. */}
      {hasTargets && (
        <div
          data-testid="canvas3d-drape-targets"
          className="absolute bottom-3 right-3 flex max-w-[14rem] flex-col gap-1.5 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
        >
          <span className="text-[0.65rem] uppercase tracking-wide text-white/50">Draped targets</span>
          {drapeTargets.map((t) => (
            <label key={t.targetId} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={enabledMap[t.targetId] !== false}
                onChange={() => toggleTarget(t.targetId)}
                className="h-3 w-3 cursor-pointer accent-violet"
                aria-label={`Toggle drape for ${t.name || t.targetId}`}
              />
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: t.color }}
              />
              <span className="truncate">{t.name || t.targetId}</span>
              <span className="ml-auto text-[0.6rem] uppercase text-white/40">{t.channel}</span>
            </label>
          ))}
        </div>
      )}

      {/* Empty state (§3.4): a guide with NO active modulation targets — relief
          only + a hint. Distinct from reliefField === null (no field at all). */}
      {emptyDrape && (
        <div
          data-testid="canvas3d-drape-empty"
          className="absolute bottom-3 right-3 max-w-[16rem] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/60 backdrop-blur"
        >
          This guide has no active modulation targets — showing the field relief only.
        </div>
      )}

      {/* Surface-A empty state (§3.1): no visible panels to stack. Centered hint
          so the dark scene isn't mistaken for a broken/black canvas. */}
      {emptyStack && (
        <div
          data-testid="canvas3d-stack-empty"
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60"
        >
          No visible panels to preview — add a panel or unhide one to see the stacked view.
        </div>
      )}
    </div>
  );
}
