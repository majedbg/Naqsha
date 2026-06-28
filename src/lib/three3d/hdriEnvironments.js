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
 * @type {ReadonlyArray<{id:string,label:string,kind:'preset'|'file',preset?:string,file?:string,background:boolean}>}
 */
export const HDRI_ENVIRONMENTS = Object.freeze([
  Object.freeze({ id: 'studio', label: 'Studio (dark)', kind: 'preset', preset: 'studio', background: false }),
  Object.freeze({
    id: 'voortrekker-interior',
    label: 'Voortrekker Interior',
    kind: 'file',
    file: '/hdri/voortrekker_interior_2k.hdr',
    background: true,
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
