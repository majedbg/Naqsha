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
