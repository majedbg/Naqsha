// ⚠️ THE 3D BOUNDARY (S1, PRD D9). The `canvas3d/*` scene tree (this file and the
// CameraRig / SceneEnvironment / EmissiveBloom primitives it imports) is the ONLY
// place that may statically import three.js / @react-three/*. It is reached ONLY
// through the React.lazy() dynamic import in Canvas3DHost, so Rollup emits it (and
// all of three) as a SEPARATE async chunk — the 2D app bundle never pulls three.
// Do NOT import this file (or its canvas3d/* siblings) statically from any 2D
// render-path module. Pure, three-free logic (e.g. cameraFit) lives under
// src/lib/three3d and stays on the 2D side of the boundary so it can be unit-tested.
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBloomSelectionStore, BloomSelectionContext } from './bloomSelection.js';
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
import { buildSnapshotFilename, downloadDataUrl } from '../../lib/three3d/snapshotExport.js';
import {
  loadPreview3DSettings,
  savePreview3DSettings,
} from '../../lib/three3d/preview3dPersistence.js';
import {
  HDRI_ENVIRONMENTS,
  getEnvironmentById,
  isFileEnvironment,
  BG_BLUR_MIN,
  BG_BLUR_MAX,
  BG_INTENSITY_MIN,
  BG_INTENSITY_MAX,
} from '../../lib/three3d/hdriEnvironments.js';
import { PROCESS_ANNOTATION_HEX } from '../../lib/three3d/markTexture.js';
import { useProcessAnnotation } from '../../lib/three3d/processAnnotation.js';

// Placeholder content bounds (S2). Stable identity so CameraRig's zoom-fit effect
// doesn't re-run every render. Used for height-surface (B, later) + the empty
// panel-stack state; the real panel-stack box is derived from the sheet specs.
const PLACEHOLDER_BOX = { min: [-1, -1, -1], max: [1, 1, 1] };

/**
 * One-shot canvas→PNG capture that runs INSIDE the render loop, at a priority
 * ABOVE the EffectComposer's priority-1 pass, so it reads the fully composited
 * frame (bloom + transmission) straight from the live drawing buffer within the
 * same rAF tick — before the browser clears it. This replaces the global
 * `gl={{ preserveDrawingBuffer: true }}` we used to keep every frame permanently
 * readable: that flag forces a copy-based buffer swap (a per-frame cost, and a
 * flicker contributor) purely to serve the occasional "Save image". Reading one
 * requested frame in-loop needs no such flag. `requestRef.current` is raised by
 * the Save button; we lower it and fire `onCapture` with the data URL.
 */
function SnapshotCapture({ requestRef, onCapture }) {
  const gl = useThree((s) => s.gl);
  useFrame((state) => {
    // REGRESSION GUARD (found by the calibration harness): ANY positive-priority
    // useFrame subscription flips R3F into manual-render mode (internal.priority
    // > 0 disables the automatic gl.render). This component subscribes at
    // priority 2 PERMANENTLY, so once the EffectComposer went on-demand
    // (ADR 0003 #5) an idle scene — composer unmounted, nothing blooming — had
    // NO renderer left and stayed black. When we are the ONLY positive-priority
    // subscriber (internal.priority === 1), render the base frame here; when the
    // composer is mounted (internal.priority > 1) it has already rendered at
    // priority 1 and we must not double-render.
    if (state.internal.priority === 1) state.gl.render(state.scene, state.camera);
    if (!requestRef.current) return;
    requestRef.current = false;
    onCapture(gl.domElement.toDataURL('image/png'));
  }, 2);
  return null;
}

// Default Surface A inter-panel spacing (PRD D11, mm). S6 wires the slider here as
// local state; persistence to localStorage is S11's job (D13).
const DEFAULT_SPACING_MM = SPACING_DEFAULT;
// How long the EffectComposer lingers after the bloom selection empties (ms). The
// selection empties/refills within frames as the pointer skims across marks;
// remounting the composer each time re-allocates its render targets (a visible
// hitch) — so unmount is debounced while mount stays immediate (ADR 0003 #5).
const BLOOM_UNMOUNT_LINGER_MS = 250;

/**
 * True while `selection` is non-empty, holding true for `lingerMs` after it
 * empties — the mount gate for the on-demand EffectComposer (ADR 0003 #5).
 * Mount is immediate (the `nonEmpty ||` term needs no state); only the unmount
 * is deferred, via a timeout that trails the live value (async setState only).
 */
function useLingeringNonEmpty(selection, lingerMs) {
  const nonEmpty = selection.length > 0;
  const [trailingNonEmpty, setTrailingNonEmpty] = useState(nonEmpty);
  useEffect(() => {
    const id = setTimeout(() => setTrailingNonEmpty(nonEmpty), nonEmpty ? 0 : lingerMs);
    return () => clearTimeout(id);
  }, [nonEmpty, lingerMs]);
  return nonEmpty || trailingNonEmpty;
}
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
 * state; the export reads the composited bloom/transmission frame in-loop via
 * <SnapshotCapture> (no global preserveDrawingBuffer) through a pure filename
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
  // Per-panel material choices (panelId → materialId), threaded LIVE from the
  // panels state (like selectedMaterial — NOT snapshot-frozen) so editing a
  // panel's material in the left panel re-tints an open preview without a
  // Rebuild. A panel with an entry here overrides the document-level material.
  panelMaterials = null,
  designName = 'untitled',
  // Close the 3D preview overlay. Wired Studio → RightPanel → Canvas3DHost; routes
  // through lensEntry.exit3D so it cleanly closes BOTH Surface A (panel-stack) and
  // Surface B (height-surface) back to sub-mode 'off', restoring the prior 2D view.
  // Surface B is launched from the Inspector (not the lens), so this "✕" is the
  // in-canvas way out. Optional → the button no-ops when unwired (standalone).
  onClose = null,
  // Material evaluation (docs/material-evaluation-VISION.md, slice 1): routes a
  // <SnapshotCapture> frame to an evaluation submission instead of a download.
  // Optional; the "Evaluate material" button renders only when this is wired
  // AND a material is selected (the pairing needs a Material Archetype).
  onEvaluationCapture = null,
}) {
  const [resetSignal, setResetSignal] = useState(0);
  // Camera-in-motion flag (S?, refraction-tiling bypass). True while the user is
  // orbiting/panning/zooming (through the damping tail); CameraRig owns the
  // debounced detection. Surface A's acrylic drops its screen-space refraction
  // while this is true — the marks re-imaged through the slab alias into a tiling
  // grid at grazing angles (a screen-space-refraction limit, empirically confirmed),
  // so we render the slab opaque during motion and restore the glass on settle, when
  // the user is actually studying it. See Sheets.jsx `isMoving`.
  const [isInteracting, setIsInteracting] = useState(false);
  // Annotation (ADR 0003 #4, direction inverted): {panelId, process}|null from
  // the LEFT PANEL's hovered layer row via the processAnnotation channel. Drives
  // the process-color badge below — the ONLY place the laser color convention
  // appears in 3D. Marks subscribe to the same channel for their highlight.
  const annotation = useProcessAnnotation();
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
  // "Save image" request flag. The button (outside the R3F tree) raises it; the
  // in-tree <SnapshotCapture> reads the composited canvas on the next frame and
  // downloads it. A ref (not state) so raising it never triggers a React render.
  const captureRequest = useRef(false);
  // Where the NEXT captured frame goes: 'download' (Save image, D8) or
  // 'evaluate' (material evaluation, routed to onEvaluationCapture). A ref, not
  // state — set at click time alongside captureRequest, consumed once.
  const captureTarget = useRef('download');
  const handleCapture = useCallback(
    (dataUrl) => {
      if (captureTarget.current === 'evaluate') {
        captureTarget.current = 'download';
        onEvaluationCapture?.(dataUrl);
        return;
      }
      downloadDataUrl(dataUrl, buildSnapshotFilename({ designName }));
    },
    [designName, onEvaluationCapture],
  );
  // Stable array so the bloom pass doesn't re-register lights every render.
  const bloomLights = useMemo(() => [keyLightRef], []);
  // Bloom selection store (replaces the looping postprocessing <Selection>/<Select>
  // — see bloomSelection.jsx). Emissive marks/drape lines register via useBloomRef;
  // `bloomSelection` (membership-stable) feeds SelectiveBloom's `selection` prop.
  const { selection: bloomSelection, register: registerBloom } = useBloomSelectionStore();
  // On-demand post-processing (ADR 0003 #5): the composer exists only while
  // something actually blooms (hover annotation, fluorescent edges, drape lines).
  const bloomActive = useLingeringNonEmpty(bloomSelection, BLOOM_UNMOUNT_LINGER_MS);

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
  // Debounced (250ms): a slider drag fires this effect per tick, and each
  // savePreview3DSettings does a synchronous getItem+parse+stringify+setItem. Only
  // the settled value needs persisting, so coalesce the drag into one write.
  useEffect(() => {
    if (!isPanelStack) return undefined;
    const id = setTimeout(() => savePreview3DSettings({ spacing: spacingMm }), 250);
    return () => clearTimeout(id);
  }, [isPanelStack, spacingMm]);
  useEffect(() => {
    if (isPanelStack) return undefined;
    const id = setTimeout(() => savePreview3DSettings({ exaggeration: exaggerationMm }), 250);
    return () => clearTimeout(id);
  }, [isPanelStack, exaggerationMm]);

  // HDRI environment picker. Seeded from persisted prefs; owned locally so the
  // dropdown + blur/intensity sliders drive the backdrop live. Unlike spacing/
  // exaggeration this is NOT sub-mode-gated (the environment applies to both
  // surfaces). Debounced-persisted like the others.
  const [environmentId, setEnvironmentId] = useState(() => persisted.environmentId);
  const [bgBlurriness, setBgBlurriness] = useState(() => persisted.bgBlurriness);
  const [bgIntensity, setBgIntensity] = useState(() => persisted.bgIntensity);
  // Blur/intensity sliders are only meaningful for a file HDRI shown as background.
  const envIsFile = isFileEnvironment(getEnvironmentById(environmentId));
  useEffect(() => {
    const id = setTimeout(
      () => savePreview3DSettings({ environmentId, bgBlurriness, bgIntensity }),
      250,
    );
    return () => clearTimeout(id);
  }, [environmentId, bgBlurriness, bgIntensity]);

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
        // Supersample the render (SSAA) up to 3× to stabilize the emissive/bloom
        // GLOW under camera motion. The marks/edge-glow are HDR (toneMapped=false),
        // so thin/sub-pixel glow features flicker as the camera moves — a pixel
        // catches a bright feature one frame, misses it the next (firefly shimmer);
        // MSAA only smooths polygon EDGES and mipmaps can't touch the edge-glow
        // GEOMETRY, so neither helps. Rendering above display resolution gives each
        // bright feature more coverage so it stops popping frame-to-frame. Cost:
        // fill-rate every frame (now frameloop="always"); 3 is a middle ground (on a
        // 2× retina display ≈1.5× linear SSAA). Dial back to [1, 2] if a heavy design
        // + the 4096px mark textures strain the GPU.
        dpr={[1, 3]}
        camera={{ position: [3, 3, 4], fov: 50, near: 0.01, far: 1000 }}
        // Render continuously while the preview overlay is mounted. `frameloop="demand"`
        // is incompatible with the @react-three/postprocessing EffectComposer here:
        // the composer ping-pongs between two internal render targets each pass, and
        // under demand its sparse, isolated frames (damping tail, pointer-move/hover
        // invalidations) can present a stale buffer — read as flicker that runs while
        // frames are pumped and settles when they stop. The Canvas only MOUNTS while
        // the 3D overlay is open (Canvas3DHost lazy boundary), so "always" costs GPU
        // only during active preview, not for the whole 2D app.
        frameloop="always"
        // Khronos PBR Neutral (ADR 0003 #8): designed for true-to-life product/
        // material color — the R3F ACES default lifts and desaturates brights,
        // which is the wrong direction for a material proof. Every archetype and
        // environment intensity is calibrated against Neutral. EmissiveBloom's
        // trailing ToneMapping effect applies the SAME curve while the on-demand
        // composer is mounted, so the base image never shifts.
        gl={{ toneMapping: THREE.NeutralToneMapping }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          // Surface-A ribbon marks crop to the sheet rectangle via per-material
          // clipping planes (Marks.jsx useSheetClipPlanes); local clipping must be
          // enabled on the renderer for those planes to take effect.
          gl.localClippingEnabled = true;
        }}
      >
        {/* The bloom provider wraps the scene meshes so emissive marks/drape lines
            can register into the selection (replaces postprocessing's looping
            <Selection>/<Select> — see bloomSelection.jsx). The collected
            `bloomSelection` is handed to EmissiveBloom's `selection` prop below. */}
        <BloomSelectionContext.Provider value={registerBloom}>
          <SnapshotCapture requestRef={captureRequest} onCapture={handleCapture} />
          <CameraRig
            fitBox={fitBox}
            resetSignal={resetSignal}
            onInteractingChange={setIsInteracting}
          />
          <SceneEnvironment
            ref={keyLightRef}
            environmentId={environmentId}
            backgroundBlurriness={bgBlurriness}
            backgroundIntensity={bgIntensity}
          />

          {isPanelStack ? (
            /* Surface A — stacked substrate slabs (S4) + texture-mode emissive
               marks floated in front of each sheet (S5). Ribbon marks land in S10. */
            <>
              <Sheets
                specs={sheetSpecs}
                appearance={appearance}
                panelMaterials={panelMaterials}
                isMoving={isInteracting}
              />
              <Marks
                specs={sheetSpecs}
                marksByPanel={marksByPanel ?? {}}
                isMoving={isInteracting}
              />
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

          {/* On-demand bloom (ADR 0003 #5): mounted only while the selection is
              non-empty (with a short unmount linger) — the default Surface-A view
              runs with zero post-processing. Surface A blooms only the hover
              annotation / fluorescent edges; Surface B keeps a gentler pass for
              its thin emissive drape lines. */}
          {bloomActive && (
            <EmissiveBloom
              lights={bloomLights}
              intensity={isPanelStack ? 1.4 : 0.6}
              selection={bloomSelection}
            />
          )}
        </BloomSelectionContext.Provider>
      </Canvas>

      {/* Top-right controls: Reset view (D4) + Save image PNG snapshot (D8) +
          Close (✕). Close is the in-canvas way out of the preview — Surface B is
          launched from the Inspector (not the lens), so without this there is no
          way to exit it from the canvas. Routes to onClose (lensEntry.exit3D),
          which closes BOTH surfaces back to the prior 2D view. */}
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
          onClick={() => {
            // Raise the flag; <SnapshotCapture> reads the composited canvas on the
            // next frame (frameloop="always" guarantees one lands promptly).
            // Reset the target too: an unconsumed Evaluate click must not
            // hijack this download (review finding: two-click misroute).
            captureTarget.current = 'download';
            captureRequest.current = true;
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
        >
          Save image
        </button>
        {selectedMaterial && onEvaluationCapture && (
          <button
            type="button"
            data-testid="canvas3d-evaluate-material"
            title={`Evaluate ${selectedMaterial.name} against your sheet`}
            onClick={() => {
              // Same one-frame capture as Save image, routed to the evaluation
              // flow (photo-vs-render side-by-side) instead of a download.
              captureTarget.current = 'evaluate';
              captureRequest.current = true;
            }}
            className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
          >
            Evaluate material
          </button>
        )}
        <button
          type="button"
          data-testid="canvas3d-close"
          aria-label="Close 3D preview"
          title="Close 3D preview"
          onClick={() => onClose?.()}
          className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Environment (HDRI) picker — applies to BOTH surfaces, so pinned bottom-
          RIGHT (the spacing/amplitude sliders own bottom-left). A dropdown swaps the
          backdrop; for a file HDRI shown as background, two sliders soften it
          (blurriness + intensity) so the room reads as ambiance without washing out
          the emissive glow. The dark 'Studio' preset keeps the glow-first look. */}
      <div
        data-testid="canvas3d-environment"
        className="absolute bottom-3 right-3 flex flex-col items-end gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
      >
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Scene</span>
          <select
            data-testid="canvas3d-environment-select"
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.target.value)}
            className="cursor-pointer rounded border border-white/10 bg-black/40 px-1.5 py-1 text-white/90 outline-none focus:border-violet"
            aria-label="3D scene environment"
          >
            {HDRI_ENVIRONMENTS.map((env) => (
              <option key={env.id} value={env.id} className="bg-neutral-900 text-white">
                {env.label}
              </option>
            ))}
          </select>
        </label>
        {envIsFile && (
          <>
            <label className="flex w-full items-center gap-2">
              <span className="w-14 whitespace-nowrap text-white/60">Blur</span>
              <input
                type="range"
                min={BG_BLUR_MIN}
                max={BG_BLUR_MAX}
                step={0.01}
                value={bgBlurriness}
                onChange={(e) => setBgBlurriness(Number(e.target.value))}
                className="h-1 w-28 cursor-pointer accent-violet"
                aria-label="Background blurriness"
              />
            </label>
            <label className="flex w-full items-center gap-2">
              <span className="w-14 whitespace-nowrap text-white/60">Bright</span>
              <input
                type="range"
                min={BG_INTENSITY_MIN}
                max={BG_INTENSITY_MAX}
                step={0.05}
                value={bgIntensity}
                onChange={(e) => setBgIntensity(Number(e.target.value))}
                className="h-1 w-28 cursor-pointer accent-violet"
                aria-label="Background intensity"
              />
            </label>
          </>
        )}
      </div>

      {/* Annotation badge (ADR 0003 #4, direction inverted): names the process of
          the LEFT PANEL's hovered layer row (processAnnotation channel) in its
          convention color (cut red / score blue / …). Marks themselves render as
          physical reactions and are not pointer-sensitive — this badge (+ the
          annotated mesh's emissive highlight) is the only 3D surface where
          process identity shows. Bottom-CENTER: spacing owns bottom-left,
          environment bottom-right. */}
      {isPanelStack && annotation && (
        <div
          data-testid="canvas3d-process-annotation"
          className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur"
        >
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: PROCESS_ANNOTATION_HEX[annotation.process] || '#ffffff' }}
          />
          <span className="capitalize">{annotation.process}</span>
        </div>
      )}

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

      {/* Surface-B vertical-exaggeration ("Amplitude") slider (D10): 0…panel-size
          mm, default ≈ panel-size/4. Height-surface only — the relief height
          scales live. Labeled "Amplitude" (the user's term — it stretches the
          relief in/out); the underlying state is the exaggeration factor. Pinned
          bottom-LEFT; the per-target drape checklist sits TOP-right so the two can
          never collide on a narrow panel. */}
      {!isPanelStack && (
        <label
          data-testid="canvas3d-exaggeration"
          className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
        >
          <span className="whitespace-nowrap">Amplitude</span>
          <input
            type="range"
            min={EXAG_MIN}
            max={exagMax}
            step={1}
            value={exaggerationMm}
            onChange={(e) => setExaggerationMm(clampExaggeration(Number(e.target.value), exagMax))}
            className="h-1 w-32 cursor-pointer accent-violet"
            aria-label="Relief amplitude in millimetres"
          />
          <span className="w-12 tabular-nums text-right">{Math.round(exaggerationMm)} mm</span>
        </label>
      )}

      {/* Surface-B per-target drape toggle checklist (S9, §3.4): one row per
          ACTIVE modulation target, colored swatch + on/off checkbox. Pinned
          TOP-right (below the Reset/Save/✕ control row) so it stays clear of the
          bottom-left Amplitude slider at any panel width. */}
      {hasTargets && (
        <div
          data-testid="canvas3d-drape-targets"
          className="absolute right-3 top-14 z-10 flex max-w-[14rem] flex-col gap-1.5 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur"
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
          className="absolute right-3 top-14 z-10 max-w-[16rem] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/60 backdrop-blur"
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
