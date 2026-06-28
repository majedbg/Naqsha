// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). All the trig that decides
// HOW BRIGHT each edge glows is the pure, three-free edgeGlow.js (S2), unit-tested
// on the 2D side; this component only marshals those scalars into emissive meshes.
import { useMemo } from 'react';
import * as THREE from 'three';
import { Select } from '@react-three/postprocessing';
import { keyLightDirection, sideEmissive } from '../../lib/three3d/edgeGlow.js';
import { KEY_LIGHT_POSITION, KEY_LIGHT_TARGET } from '../../lib/three3d/keyLight.js';

/**
 * Surface-A acrylic EDGE GLOW (S5, spec §3.4 / L4 / §3.6 — the "incident-light
 * trigonometry" effect). Fluorescent (and faintly clear/translucent) acrylic
 * glows at its CUT EDGES in a way that responds to the key light.
 *
 * TWO mandated facts make this actually appear (both are the §3.4/§3.6
 * "green-but-no-glow" traps):
 *
 *  (1) KEY LIGHT (§3.6). The glow is driven by the scene's DESIGNATED directional
 *      key light, whose normalized world direction is `KEY_LIGHT_DIR` (computed
 *      from the SAME exported KEY_LIGHT_POSITION the <directionalLight> uses, so
 *      the light and the glow can never disagree). Per side face we bake
 *      edgeGlow.sideEmissive(keyLightDir, faceNormal, stackAxis, edgeGain) straight
 *      into `emissiveIntensity` — a concrete JS number, NOT an unset GLSL uniform.
 *      The per-face asymmetry (the +Y/+X sides brighter than the shadowed −Y/−X
 *      sides under this oblique light) is what reads as "the glow tracks the light"
 *      as the user orbits.
 *
 *  (2) BLOOM MEMBERSHIP (D12). Emissive that is NOT in the SelectiveBloom
 *      selection does not bloom (EmissiveBloom.jsx glows ONLY `<Select>` members,
 *      exactly like Marks/DrapedMarks). So every rim mesh AND the fresnel shell are
 *      wrapped in `<Select enabled>`. NOTE: this codebase has no `useBloomRef` /
 *      `bloomSelection.js` — `<Select enabled>` from @react-three/postprocessing IS
 *      the registration mechanism (see Marks.jsx).
 *
 * These rim meshes are SEPARATE thin emissive geometry (plain emissive
 * meshStandardMaterial), NOT emissive injected into the slab's drei
 * MeshTransmissionMaterial via onBeforeCompile — the transmission pass can swallow
 * that, and you cannot cleanly bloom "just the edges" of MTM (§3.4, discouraged).
 *
 * The marks/ribbons (Marks.jsx) are untouched and render independently.
 *
 * @param {{ spec: import('../../lib/three3d/sheetSpecs.js').SheetSpec,
 *           appearance: import('../../lib/three3d/resolveAppearance.js').AppearanceParams }} props
 */

// Surface-A slabs always stack along view-depth (z); the side faces are ±x / ±y.
const STACK_AXIS = [0, 0, 1];

// Normalized world direction toward the designated key light — single-sourced from
// SceneEnvironment so the wired glow and the actual light are the same direction.
const KEY_LIGHT_DIR = keyLightDirection(KEY_LIGHT_POSITION, KEY_LIGHT_TARGET);

// The four box SIDE faces (perimeter), each with its outward world normal and the
// axis it runs along. edgeMaskForBox(±x/±y, z) = 1 for all of these (they are the
// cut edges we want to glow); the top/bottom (±z) stacked faces are excluded.
const SIDE_FACES = [
  { id: '+x', normal: [1, 0, 0], axis: 'x' },
  { id: '-x', normal: [-1, 0, 0], axis: 'x' },
  { id: '+y', normal: [0, 1, 0], axis: 'y' },
  { id: '-y', normal: [0, -1, 0], axis: 'y' },
];

// Tames the raw sideEmissive (fluorescent edgeGain=6 × incidence ≈ 4) into the
// marks' emissive ballpark (~2–3 peak). A hotter value saturates every side to
// white and ERASES the directional asymmetry that is the whole point.
const RIM_BASE = 0.6;

// Fresnel "internally lit" face rim (rimGain). Mirrors edgeGlow.fresnelFactor in
// GLSL (power 3): 0 looking straight on → 1 at grazing silhouette. Additive shell,
// so front-facing pixels (f≈0) add nothing and the slab face stays clear.
const FRESNEL_VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRESNEL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRimGain;
  uniform float uPower;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float f = pow(1.0 - max(0.0, dot(viewDir, vWorldNormal)), uPower);
    float a = uRimGain * f;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export default function EdgeGlow({ spec, appearance }) {
  const [w = 0, h = 0] = spec?.size || [];
  const thickness = spec?.thickness ?? 0;
  const edgeGain = appearance?.edgeGain ?? 0;
  const rimGain = appearance?.rimGain ?? 0;
  const tint = appearance?.tintHex || '#ffffff';

  // Thin emissive strip hugging each cut edge — scaled to the slab so it reads as a
  // bright outline, not a fat frame. Clamped so tiny panels still show an edge.
  const rimW = Math.max(0.5, Math.min(w, h) * 0.012);

  // Fresnel shell uniforms — memoized on the look inputs so a material switch
  // actually re-tints the rim instead of carrying a silently-stale color.
  const fresnelUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(tint) },
      uRimGain: { value: rimGain },
      uPower: { value: 3 },
    }),
    [tint, rimGain],
  );

  const showRim = edgeGain > 0 && w > 0 && h > 0 && thickness > 0;
  const showFresnel = rimGain > 0 && w > 0 && h > 0 && thickness > 0;
  if (!showRim && !showFresnel) return null;

  return (
    <group position={[0, 0, spec.zOffset]} data-testid={`edge-glow-${spec.panelId}`}>
      {showRim && (
        // Perimeter rim bars. <Select enabled> = bloom membership (D12) — without
        // it the emissive renders with zero bloom and looks dead.
        <Select enabled>
          {SIDE_FACES.map((face) => {
            // Per-face emissive strength from the key-light incidence (the §3.6
            // term). 0 on shadowed sides → those bars stay dark, giving the
            // direction-tracking asymmetry.
            const intensity = RIM_BASE * sideEmissive(KEY_LIGHT_DIR, face.normal, STACK_AXIS, edgeGain);
            const pos =
              face.axis === 'x'
                ? [face.normal[0] * (w / 2), 0, 0]
                : [0, face.normal[1] * (h / 2), 0];
            const size = face.axis === 'x' ? [rimW, h, thickness] : [w, rimW, thickness];
            return (
              <mesh key={face.id} position={pos}>
                <boxGeometry args={size} />
                {/* Black base so the lit diffuse adds nothing; the glow is pure
                    emissive in the material tint, scaled per-face. toneMapped off
                    so the beauty pass doesn't attenuate it (matches Marks.jsx). */}
                <meshStandardMaterial
                  color="#000000"
                  emissive={tint}
                  emissiveIntensity={intensity}
                  toneMapped={false}
                  roughness={1}
                  metalness={0}
                />
              </mesh>
            );
          })}
        </Select>
      )}

      {showFresnel && (
        // Face fresnel "internally lit" rim — a view-dependent additive shell
        // hugging the slab. Also a bloom member so the grazing rim glows.
        <Select enabled>
          <mesh>
            <boxGeometry args={[w, h, thickness]} />
            <shaderMaterial
              vertexShader={FRESNEL_VERT}
              fragmentShader={FRESNEL_FRAG}
              uniforms={fresnelUniforms}
              transparent
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Select>
      )}
    </group>
  );
}
