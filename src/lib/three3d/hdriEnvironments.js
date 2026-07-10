// HDRI environment registry (pure, three-free — the unit gate for the 3D
// environment picker). The React/three wiring lives in SceneEnvironment.jsx +
// Scene3D.jsx; this module only describes WHICH environments exist and their
// defaults, so it stays node-testable and the scene reads from one source.
//
// Two kinds:
//   - 'preset'  → drei built-in (e.g. 'studio'), loaded from drei's asset CDN;
//                 rendered over the neutral DARK backdrop so emissive glow pops.
//   - 'file'    → a repo-committed equirectangular .hdr in /public/hdri/, shown
//                 AS the background (softened by blur/intensity) and used for IBL.
//
// Files are .hdr (Radiance RGBE), NOT .exr: a 4K .exr is ~92MB (unusable on the
// web); the same scene as a 2K .hdr is ~6MB. Resolution 2K is the sweet spot when
// the HDRI is shown as a (blurred) background. Add new rooms by dropping a 2K .hdr
// in /public/hdri/ and appending a 'file' entry here.

/** Background-softening defaults for file HDRIs (drei Environment props). The
 *  sliders in Scene3D start here; both are user-tunable + persisted. */
export const BG_BLUR_MIN = 0;
export const BG_BLUR_MAX = 1;
export const BG_INTENSITY_MIN = 0;
export const BG_INTENSITY_MAX = 3;
export const DEFAULT_BG_BLURRINESS = 0.35;
export const DEFAULT_BG_INTENSITY = 0.6;

/**
 * Ordered list of selectable environments. `studio` is first + the default so the
 * current dark, glow-first look is preserved and no HDRI is fetched until the user
 * picks a room.
 *
 * `environmentIntensity` (ADR 0003 #9) is each entry's HAND-CALIBRATED IBL scale:
 * HDRIs are captured at wildly different exposures, so a per-entry intensity is
 * what makes a reference white sheet read consistently across scenes (all values
 * tuned under NeutralToneMapping — Scene3D). It scales the LIGHTING only; the
 * user's Bright slider styles the BACKDROP image (backgroundIntensity) and can
 * never un-calibrate the IBL. Current file-HDRI values are PROVISIONAL estimates
 * pending side-by-side calibration against the reference photos
 * (docs/material-references/); studio keeps its long-standing 0.3 (see
 * SceneEnvironment.jsx for why the bright preset is dimmed under the dark
 * backdrop).
 * @type {ReadonlyArray<{id:string,label:string,kind:'preset'|'file',preset?:string,file?:string,background:boolean,environmentIntensity:number}>}
 */
export const HDRI_ENVIRONMENTS = Object.freeze([
  Object.freeze({
    id: 'studio',
    label: 'Studio (dark)',
    kind: 'preset',
    preset: 'studio',
    background: false,
    environmentIntensity: 0.3,
  }),
  Object.freeze({
    id: 'voortrekker-interior',
    label: 'Voortrekker Interior',
    kind: 'file',
    file: '/hdri/voortrekker_interior_2k.hdr',
    background: true,
    environmentIntensity: 0.9,
  }),
  Object.freeze({
    id: 'hospital-room-2',
    label: 'Hospital Room 2',
    kind: 'file',
    file: '/hdri/hospital_room_2_2k.hdr',
    background: true,
    environmentIntensity: 0.85,
  }),
  Object.freeze({
    id: 'pine-attic',
    label: 'Pine Attic',
    kind: 'file',
    file: '/hdri/pine_attic_2k.hdr',
    background: true,
    environmentIntensity: 1.15,
  }),
  Object.freeze({
    id: 'wooden-studio-10',
    label: 'Wooden Studio 10',
    kind: 'file',
    file: '/hdri/wooden_studio_10_2k.hdr',
    background: true,
    environmentIntensity: 1.0,
  }),
  Object.freeze({
    id: 'historic-cloister-passage',
    label: 'Historic Cloister Passage',
    kind: 'file',
    file: '/hdri/historic_cloister_passage_2k.hdr',
    background: true,
    environmentIntensity: 1.2,
  }),
  Object.freeze({
    id: 'blinds',
    label: 'Blinds',
    kind: 'file',
    file: '/hdri/blinds_2k.hdr',
    background: true,
    environmentIntensity: 0.8,
  }),
  Object.freeze({
    id: 'billiard-hall',
    label: 'Billiard Hall',
    kind: 'file',
    file: '/hdri/billiard_hall_2k.hdr',
    background: true,
    environmentIntensity: 1.3,
  }),
]);

/** The default environment id — the dark studio preset (zero download, glow-first). */
export const DEFAULT_ENVIRONMENT_ID = 'studio';

const BY_ID = new Map(HDRI_ENVIRONMENTS.map((e) => [e.id, e]));

/** Every valid environment id (used by persistence validation). */
export const ENVIRONMENT_IDS = Object.freeze(HDRI_ENVIRONMENTS.map((e) => e.id));

/** True if `id` names a real environment. */
export function isEnvironmentId(id) {
  return BY_ID.has(id);
}

/**
 * Resolve an id to its environment descriptor. Unknown/missing id → the default
 * (studio) so a corrupted persisted value can never blank the scene.
 * @param {string} id
 */
export function getEnvironmentById(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_ENVIRONMENT_ID);
}

/** True when the environment is a file HDRI shown as a (tunable) background — i.e.
 *  the blur/intensity sliders are relevant. Preset/dark envs return false. */
export function isFileEnvironment(env) {
  return !!env && env.kind === 'file';
}
