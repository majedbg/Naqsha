/**
 * Edge-glow MATH (S2, plan §3.4). PURE, three.js-free: lives on the 2D side of the
 * dynamic-import boundary so it is unit-testable without WebGL. The R3F layer
 * (Sheets.jsx) feeds these scalars into emissive rim-mesh uniforms; the trig that
 * decides whether the fluorescent edge glows lives here as plain functions.
 *
 * Vectors are plain [x, y, z] arrays. Per plan §3.4 / L4 the formulas assume the
 * inputs are already unit-length (keyLightDir, faceNormal, viewDir, stackAxis are
 * all normalized directions in world space); these helpers do NOT renormalize —
 * they implement the spec formulas verbatim so the GLSL and the tests agree.
 *
 *   edgeIntensity(keyLightDir, faceNormal, edgeGain) = edgeGain * max(0, n·l)
 *   fresnelFactor(viewDir, normal, power=3)          = (1 - max(0, n·v))^power
 *   edgeMaskForBox(faceNormal, stackAxis)            = 1 - |n·axis|
 *
 * This is L4's "incident-light trigonometry" reduced to one dot + one fresnel:
 * the perimeter emissive responds to orbit/lighting (the dot) while broad faces
 * get a grazing fresnel rim; edgeMaskForBox keeps the glow on the slab SIDES
 * (1 on side faces, 0 on the stacked top/bottom faces).
 */

/** Dot product of two [x, y, z] vectors. */
export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Perimeter emissive strength from light incidence.
 * edgeGain × max(0, dot(keyLightDir, faceNormal)). Back-facing edges (dot ≤ 0)
 * contribute nothing, so the glow tracks the key-light direction under orbit.
 */
export function edgeIntensity(keyLightDir, faceNormal, edgeGain) {
  return edgeGain * Math.max(0, dot3(keyLightDir, faceNormal));
}

/**
 * Grazing-angle fresnel factor for the face "internally lit" rim.
 * (1 - max(0, dot(viewDir, normal)))^power. 0 when looking straight on,
 * → 1 at grazing angles. power sharpens the rim (default 3).
 */
export function fresnelFactor(viewDir, normal, power = 3) {
  return Math.pow(1 - Math.max(0, dot3(viewDir, normal)), power);
}

/**
 * Side-face mask for a stacked box: 1 - |dot(faceNormal, stackAxis)|.
 * 1 on faces perpendicular to the stack axis (the slab sides — the cut edges we
 * want to glow), 0 on the top/bottom faces parallel-stacked against neighbours.
 */
export function edgeMaskForBox(faceNormal, stackAxis) {
  return 1 - Math.abs(dot3(faceNormal, stackAxis));
}

/**
 * Normalize an [x, y, z] vector to unit length. A zero-length input returns a
 * zero vector (no NaN/Infinity), so a degenerate light position can never poison
 * the emissive math downstream.
 */
export function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * World-space direction FROM the lit surface TOWARD the key light, normalized —
 * i.e. the Lambert "L" vector. This is the single source of the `keyLightDir`
 * fed into edgeIntensity/sideEmissive (S5, §3.6): the designated directional key
 * light's position (and optional target) determine which slab sides catch the
 * light. `dir = normalize(position − target)`, matching three's directional-light
 * convention (the light shines from `position` toward `target`, so the direction
 * back toward the light is `position − target`).
 *
 * @param {[number,number,number]} position  world position of the key light
 * @param {[number,number,number]} [target]  world point it aims at (default origin)
 */
export function keyLightDirection(position, target = [0, 0, 0]) {
  return normalize3([
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ]);
}

/**
 * Perimeter emissive strength for ONE box side face, combining the light
 * incidence (edgeIntensity) with the side-face mask (edgeMaskForBox) so stacked
 * top/bottom faces never glow. This is the scalar the R3F rim meshes (S5) bake
 * straight into `emissiveIntensity` per side — there is no GLSL uniform left
 * unset, so the per-face value is always concrete and the glow tracks the key
 * light's direction as the per-side asymmetry.
 *
 *   sideEmissive = edgeIntensity(keyLightDir, faceNormal, edgeGain)
 *                  × edgeMaskForBox(faceNormal, stackAxis)
 */
export function sideEmissive(keyLightDir, faceNormal, stackAxis, edgeGain) {
  return (
    edgeIntensity(keyLightDir, faceNormal, edgeGain) *
    edgeMaskForBox(faceNormal, stackAxis)
  );
}
