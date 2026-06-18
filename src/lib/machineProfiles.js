// Document-level machine-profile model (issue #3, A2).
//
// A document targets exactly ONE machine. The active profile drives:
//   (a) which `process` values operations may use,
//   (b) the `machineParams` field schema each process exposes,
//   (c) a default bed size (bed = artboard),
//   (d) whether operation colors are locked to convention or editable.
//
// Profile IDS are LOWERCASE and intentionally match the strings
// `migration.js` already emits for `machineProfile` ('laser' / 'plotter')
// from legacy `outputMode`. The human-facing names ("Laser" / "Pen Plotter"
// / "Drag Cutter") are `label`s, not ids. The third profile — the Silhouette /
// Cameo drag (blade) cutter routed through `naqsha-cutter-bridge` — has no
// legacy `outputMode` and so takes a fresh id, `dragCutter`.
//
// This is a pure data + transform module. It does NOT replace the legacy
// `OUTPUT_MODES` / `applyOutputMode` path (svgExport / useCanvasSize keep their
// `outputMode` plumbing until B7/A4 decommission it); it is the NEW-path model
// that the operation library and Document Setup read.

import { createOperation } from './operations.js';

// Locked laser convention (LightBurn / Glowforge / xTool): pure RGB per process.
const LASER_COLORS = {
  cut: '#FF0000',
  score: '#0000FF',
  engrave: '#000000',
};

// machineParams field schemas. Each field: { key, label, default, min, max, step, unit }.
// Defaults are conservative starting points; the UI tunes them later (#5/#10).
const LASER_PROCESS_SCHEMA = [
  { key: 'power', label: 'Power', default: 80, min: 0, max: 100, step: 1, unit: '%' },
  { key: 'speed', label: 'Speed', default: 100, min: 1, max: 1000, step: 1, unit: 'mm/s' },
  { key: 'passes', label: 'Passes', default: 1, min: 1, max: 20, step: 1, unit: '' },
];

const PEN_PROCESS_SCHEMA = [
  { key: 'penSlot', label: 'Pen #', default: 1, min: 1, max: 8, step: 1, unit: '' },
  { key: 'pressure', label: 'Pressure', default: 50, min: 0, max: 100, step: 1, unit: '%' },
];

const DRAG_CUT_SCHEMA = [
  { key: 'force', label: 'Force', default: 10, min: 1, max: 33, step: 1, unit: 'gf' },
  { key: 'blade', label: 'Blade', default: 3, min: 1, max: 10, step: 1, unit: '' },
  { key: 'passes', label: 'Passes', default: 1, min: 1, max: 10, step: 1, unit: '' },
];

// Bed sizes in mm (the canonical chrome unit — see units.js DEFAULT_UNIT='mm').
// Real-hardware reference points: a common desktop laser bed, AxiDraw V3
// (6×8"), and the Silhouette Cameo (~12"×12" mat).
const MM = (inches) => Math.round(inches * 25.4);

export const MACHINE_PROFILES = {
  laser: {
    id: 'laser',
    label: 'Laser',
    processes: ['cut', 'score', 'engrave'],
    paramSchema: {
      cut: LASER_PROCESS_SCHEMA,
      score: LASER_PROCESS_SCHEMA,
      engrave: LASER_PROCESS_SCHEMA,
    },
    colorsLocked: true,
    lockedColors: LASER_COLORS,
    defaultBed: { width: MM(20), height: MM(12), unit: 'mm' }, // ~508 × 305 mm
    // Generic bed presets for the Document Setup dialog (#14, C6). All in mm.
    // Camp-specific beds are #18 and intentionally NOT here. The first preset
    // mirrors defaultBed so reopening on a fresh document matches a named row.
    bedPresets: [
      { id: 'laser-20x12', label: 'Desktop laser (508 × 305)', width: MM(20), height: MM(12) },
      { id: 'laser-a4', label: 'A4 (297 × 210)', width: 297, height: 210 },
      { id: 'laser-a3', label: 'A3 (420 × 297)', width: 420, height: 297 },
    ],
  },
  plotter: {
    id: 'plotter',
    label: 'Pen Plotter',
    processes: ['pen'],
    paramSchema: {
      pen: PEN_PROCESS_SCHEMA,
    },
    colorsLocked: false,
    lockedColors: {},
    defaultBed: { width: MM(6), height: MM(8), unit: 'mm' }, // AxiDraw V3, 152 × 203 mm
    bedPresets: [
      { id: 'plotter-axidraw-v3', label: 'AxiDraw V3 (152 × 203)', width: MM(6), height: MM(8) },
      { id: 'plotter-a4', label: 'A4 (297 × 210)', width: 297, height: 210 },
      { id: 'plotter-a3', label: 'A3 (420 × 297)', width: 420, height: 297 },
    ],
  },
  dragCutter: {
    id: 'dragCutter',
    label: 'Drag Cutter',
    processes: ['cut'],
    paramSchema: {
      cut: DRAG_CUT_SCHEMA,
    },
    colorsLocked: false,
    lockedColors: {},
    defaultBed: { width: MM(12), height: MM(12), unit: 'mm' }, // Silhouette Cameo, 305 × 305 mm
    bedPresets: [
      { id: 'drag-cameo-12x12', label: 'Cameo mat (305 × 305)', width: MM(12), height: MM(12) },
      { id: 'drag-cameo-12x24', label: 'Cameo long (305 × 610)', width: MM(12), height: MM(24) },
      { id: 'drag-portrait-8x12', label: 'Portrait mat (203 × 305)', width: MM(8), height: MM(12) },
    ],
  },
};

// Stable, deterministic ordering (laser first — it is the historical default
// fabrication target and the locked-color reference profile).
export const PROFILE_IDS = ['laser', 'plotter', 'dragCutter'];

export const DEFAULT_PROFILE_ID = 'laser';

// Resolve an id → profile object. Unknown / absent → the default (laser).
export function getProfile(id) {
  return MACHINE_PROFILES[id] ?? MACHINE_PROFILES[DEFAULT_PROFILE_ID];
}

// The process list a profile supports (copy — callers must not mutate).
export function profileProcesses(id) {
  return [...getProfile(id).processes];
}

// The machineParams field schema for a (profile, process) pair. Empty array
// when the profile does not support that process.
export function paramSchemaFor(id, process) {
  return getProfile(id).paramSchema[process] ?? [];
}

// Build a fresh machineParams object from a (profile, process) schema defaults.
export function defaultMachineParams(id, process) {
  const out = {};
  for (const field of paramSchemaFor(id, process)) {
    out[field.key] = field.default;
  }
  return out;
}

// The profile's default bed size (bed = artboard). Exposed for Document Setup /
// status bar to read (A2-AC3).
export function defaultBedSize(id) {
  return { ...getProfile(id).defaultBed };
}

// The profile's bed PRESETS (named bed sizes) for the Document Setup dialog
// (#14, C6). Filtered to the active machine by construction — each profile owns
// its own list. Returned as fresh copies (callers must not mutate). Dims are mm.
export function bedPresetsFor(id) {
  return (getProfile(id).bedPresets ?? []).map((p) => ({ ...p }));
}

// The locked convention color for a (profile, process) pair, or null when the
// profile leaves colors editable.
export function lockedColorFor(id, process) {
  const profile = getProfile(id);
  if (!profile.colorsLocked) return null;
  return profile.lockedColors[process] ?? null;
}

// Pick the process an operation should carry under the target profile:
// keep its current process if the profile supports it (data-loss-free for
// compatible processes), else fall back to the profile's first process.
function remapProcess(currentProcess, profile) {
  if (profile.processes.includes(currentProcess)) return currentProcess;
  return profile.processes[0];
}

// Re-map an operation library to a target profile's process/param/color
// vocabulary (A2-F4). Names + order are PRESERVED; process is kept when
// compatible, otherwise reassigned to the profile's first process; params are
// rebuilt from the target schema's defaults; laser locks colors to convention
// while plotter/drag-cutter leave the operation's color editable (untouched).
export function remapOperationsToProfile(operations, targetProfileId) {
  const profile = getProfile(targetProfileId);
  const list = Array.isArray(operations) ? operations : [];
  return list.map((op, i) => {
    // Variable-weight band ops (issue #17 / #4 follow-up) carry RESERVED spectrum
    // colors (orange→yellow) and band link markers. They are EXEMPT from the
    // laser color-lock: keep their color AND their bandId/bandLayerId/bandIndex
    // markers (which createOperation would otherwise strip) so the band stays
    // identifiable and re-bucketable after a profile remap.
    if (op && op.bandLayerId != null && op.bandId != null) {
      const process = remapProcess(op.process, profile);
      const base = createOperation({
        id: op.id,
        name: op.name,
        color: op.color,
        process,
        machineParams: defaultMachineParams(profile.id, process),
        order: typeof op.order === 'number' ? op.order : i,
      });
      return { ...base, bandId: op.bandId, bandLayerId: op.bandLayerId, bandIndex: op.bandIndex };
    }
    const process = remapProcess(op.process, profile);
    const locked = lockedColorFor(profile.id, process);
    return createOperation({
      id: op.id,
      name: op.name,
      color: locked ?? op.color,
      process,
      machineParams: defaultMachineParams(profile.id, process),
      order: typeof op.order === 'number' ? op.order : i,
    });
  });
}
