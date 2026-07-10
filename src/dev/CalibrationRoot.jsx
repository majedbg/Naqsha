// DEV-ONLY material-calibration harness (render-vs-photo, ADR 0003).
//
// Reached ONLY from main.jsx's `import.meta.env.DEV && ?calibration=<id>` branch —
// the branch is statically false in production builds, so Rollup drops this whole
// chunk from the shipped bundle. As a belt-and-braces guard the component also
// renders nothing outside DEV.
//
// What it does: renders ONE standardized specimen sheet (A5 landscape, 3mm) of a
// DEFAULT_PREVIEW_MATERIALS material through the REAL rendering stack —
// Canvas3DHost → Scene3D → Sheets/Marks/SceneEnvironment/CameraRig — with a fixed
// programmatic artwork (engrave test pattern + cut frame/hole + score fold lines),
// the deterministic zoom-fit 3/4 camera (35° elevation / 45° azimuth, cameraFit.js),
// and the environment chosen via `?scene=<envId>` (seeded through the same
// localStorage prefs Scene3D reads — NO forked scene code, no new Scene3D props).
// All Scene3D DOM chrome (buttons, sliders, pickers) is hidden by CSS so a
// headless screenshot shows only the scene. scripts/calibration-capture.mjs
// drives this page; scripts/calibration-compose.mjs builds the side-by-side
// comparison HTML against the Canal Plastics reference photos.
import { useMemo } from 'react';
import Canvas3DHost from '../components/canvas3d/Canvas3DHost.jsx';
import { DEFAULT_PREVIEW_MATERIALS } from '../lib/materialPreview.js';
import { reactionForProcess } from '../lib/three3d/markTexture.js';
import { PREVIEW3D_STORAGE_KEY } from '../lib/three3d/preview3dPersistence.js';
import { isEnvironmentId, DEFAULT_ENVIRONMENT_ID } from '../lib/three3d/hdriEnvironments.js';

// ── Standard specimen sheet: A5 landscape, 3mm stock (world units are mm). ─────
const SPECIMEN_W = 210;
const SPECIMEN_H = 148;
const SPECIMEN_THICKNESS = 3;
const PANEL_ID = 'calibration-sheet';

// SVG raster hint (×4 the mm size) so the <img> decode gets a sane intrinsic
// size; Marks.jsx re-rasters to its 4096px floor regardless.
const PX_SCALE = 4;

/**
 * The standard specimen artwork, one SVG per process (same shape contract as
 * markTexture.buildPanelMarkSVGs output: stroked in the process's REACTION tint
 * on a transparent field). Recognizable + coverage of the three mark kinds:
 *   engrave — concentric-ring target, diagonal hatch swatch, dot row;
 *   cut     — inset rounded-rect frame + one circular cutout;
 *   score   — vertical fold line + chevron.
 */
function specimenSvg(tint, shapes) {
  const w = SPECIMEN_W;
  const h = SPECIMEN_H;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX_SCALE}" height="${h * PX_SCALE}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    `<g fill="none" stroke="${tint}">${shapes}</g></svg>`
  );
}

const ENGRAVE_SHAPES = [
  // Concentric-ring target (left).
  '<circle cx="60" cy="74" r="10" stroke-width="1.4"/>',
  '<circle cx="60" cy="74" r="20" stroke-width="1.4"/>',
  '<circle cx="60" cy="74" r="30" stroke-width="1.4"/>',
  '<line x1="24" y1="74" x2="96" y2="74" stroke-width="0.8"/>',
  '<line x1="60" y1="38" x2="60" y2="110" stroke-width="0.8"/>',
  // Diagonal hatch swatch (upper right) — engraved-area stand-in.
  ...Array.from({ length: 14 }, (_, i) => {
    const x = 118 + i * 4.5;
    return `<line x1="${x}" y1="24" x2="${x - 24}" y2="72" stroke-width="1.6"/>`;
  }),
  // Dot row (lower right).
  ...Array.from({ length: 6 }, (_, i) => `<circle cx="${120 + i * 13}" cy="112" r="3.5" stroke-width="1.4"/>`),
].join('');

const CUT_SHAPES = [
  // Sheet-inset cut frame.
  '<rect x="7" y="7" width="196" height="134" rx="8" stroke-width="0.6"/>',
  // One circular cutout.
  '<circle cx="30" cy="118" r="10" stroke-width="0.6"/>',
].join('');

const SCORE_SHAPES = [
  // Vertical fold line.
  '<line x1="103" y1="14" x2="103" y2="134" stroke-width="0.5"/>',
  // Chevron fold.
  '<polyline points="150,132 170,88 190,132" stroke-width="0.5"/>',
].join('');

const SHAPES_BY_PROCESS = { cut: CUT_SHAPES, engrave: ENGRAVE_SHAPES, score: SCORE_SHAPES };
// Deepest → faintest, matching markTexture.PROCESS_ORDER.
const SPECIMEN_PROCESSES = ['cut', 'engrave', 'score'];

/** Substrate identity for a preview material (sheetSpecs branches on kind). */
function substrateFor(material) {
  return {
    kind: material.type === 'plywood' ? 'plywood' : 'acrylic',
    thickness: SPECIMEN_THICKNESS,
    color: material.hex,
  };
}

/** Per-process mark layers via the REAL reaction core (substrate-aware tints). */
function buildSpecimenMarks(substrate) {
  return SPECIMEN_PROCESSES.map((process) => {
    const { tint, opacity } = reactionForProcess(process, substrate);
    return { process, tint, opacity, svg: specimenSvg(tint, SHAPES_BY_PROCESS[process]) };
  });
}

// Seed the persisted 3D prefs Scene3D reads ONCE on mount, so the scene comes up
// in the requested environment at the standard spacing — same mechanism as a user
// pick, zero Scene3D changes. (App defaults for blur/intensity keep the file-HDRI
// backdrop styling at its shipped look.)
function seedScenePrefs(environmentId) {
  try {
    localStorage.setItem(
      PREVIEW3D_STORAGE_KEY,
      JSON.stringify({ spacing: 12, environmentId, bgBlurriness: 0.35, bgIntensity: 0.6 }),
    );
  } catch {
    /* disabled storage → Scene3D falls back to its defaults */
  }
}

// Hide every piece of Scene3D DOM chrome so screenshots carry ONLY the scene.
const HIDE_CHROME_CSS = `
  [data-testid="canvas3d-reset-view"],
  [data-testid="canvas3d-save-image"],
  [data-testid="canvas3d-close"],
  [data-testid="canvas3d-environment"],
  [data-testid="canvas3d-spacing"],
  [data-testid="canvas3d-process-annotation"] { display: none !important; }
`;

export default function CalibrationRoot({ materialId, sceneId }) {
  const material = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === materialId) || null;
  const environmentId = isEnvironmentId(sceneId) ? sceneId : DEFAULT_ENVIRONMENT_ID;

  // Seed BEFORE Scene3D mounts (its lazy chunk resolves after this first render).
  useMemo(() => seedScenePrefs(environmentId), [environmentId]);

  const { snapshot, boundsMm, marksByPanel } = useMemo(() => {
    if (!material) return { snapshot: null, boundsMm: null, marksByPanel: null };
    const substrate = substrateFor(material);
    return {
      snapshot: {
        panels: [{ id: PANEL_ID, visible: true, order: 0, substrate }],
        layers: [],
      },
      boundsMm: { width: SPECIMEN_W, height: SPECIMEN_H },
      marksByPanel: { [PANEL_ID]: buildSpecimenMarks(substrate) },
    };
  }, [material]);

  // Belt-and-braces: this component is only reachable in DEV (main.jsx guard).
  if (!import.meta.env.DEV) return null;

  if (!material) {
    return (
      <div data-calibration-error style={{ padding: 24, fontFamily: 'monospace' }}>
        Unknown calibration material “{materialId}”. Valid ids:{' '}
        {DEFAULT_PREVIEW_MATERIALS.map((m) => m.id).join(', ')}
      </div>
    );
  }

  return (
    <div
      data-calibration-material={material.id}
      data-calibration-scene={environmentId}
      style={{ position: 'fixed', inset: 0, background: '#d6d7d9' }}
    >
      <style>{HIDE_CHROME_CSS}</style>
      <Canvas3DHost
        mode="panel-stack"
        snapshot={snapshot}
        boundsMm={boundsMm}
        marksByPanel={marksByPanel}
        selectedMaterial={material}
        designName={`calibration-${material.id}`}
      />
    </div>
  );
}
