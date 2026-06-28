// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three — must NEVER be imported from a 2D render-path module (PRD D9). All
// the GRAIN MATH that decides the latewood band intensity is the pure, three-free
// woodGrain.js (S6), unit-tested on the 2D side; this material only MIRRORS those
// formulas in GLSL and injects the result into a standard PBR material. Float-vs-
// double precision means the GLSL and JS are not bit-identical (the look is a
// NEEDS-HUMAN smoke item), but the structure is the same so the unit tests guard
// the behaviour.
//
// Technique (S6, plan §3.2 / L6): the wood slab is OPAQUE, so we inject the grain
// into a plain `meshStandardMaterial` via `onBeforeCompile` — keeping full PBR
// lighting/shadows while multiplying the procedural grain into `diffuseColor`. The
// MTM `onBeforeCompile` discouragement (§3.4) is transmission-pass-specific and does
// NOT apply here. No texture is loaded — `texturePath` is reserved (L6); the grain
// is always procedural in v1.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { resolveWoodGrainParams } from '../../lib/three3d/woodGrain.js';

// GLSL mirror of woodGrain.js: hash2 → valueNoise2 → fbm2 (3 octaves) → woodGrainAt.
// Kept structurally identical to the JS so a reviewer can diff them line-for-line.
const WOOD_FRAG_HEADER = /* glsl */ `
  uniform float uRingFrequency;
  uniform float uTurbulence;
  uniform float uNoiseScale;
  uniform float uGrainContrast;
  uniform vec2 uWoodCenter;
  varying vec2 vWoodUV;

  float woodHash2(vec2 p) {
    float s = sin(p.x * 127.1 + p.y * 311.7) * 43758.5453123;
    return fract(s);
  }
  float woodValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = woodHash2(i);
    float b = woodHash2(i + vec2(1.0, 0.0));
    float c = woodHash2(i + vec2(0.0, 1.0));
    float d = woodHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float woodFbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    vec2 q = p;
    for (int oct = 0; oct < 3; oct++) {
      sum += amp * woodValueNoise(q);
      norm += amp;
      amp *= 0.5;
      q *= 2.0;
    }
    return sum / norm;
  }
  float woodGrain(vec2 uv) {
    vec2 d = uv - uWoodCenter;
    float dist = length(d);
    float turb = (woodFbm(uv * uNoiseScale) - 0.5) * 2.0 * uTurbulence;
    float rings = (dist + turb) * uRingFrequency;
    float frac = fract(rings);
    return abs(frac * 2.0 - 1.0);
  }
`;

/**
 * Procedural wood-grain material for a Surface-A wood slab. Renders a
 * `meshStandardMaterial` whose diffuse colour is modulated by the procedural grain
 * (latewood bands darker by `grainContrast`). Slot directly into a `<mesh>` as its
 * material.
 *
 * @param {{ color?: string, roughness?: number, width?: number, height?: number,
 *           appearance?: import('../../lib/three3d/resolveAppearance.js').AppearanceParams }} props
 */
export default function WoodGrain({ color = '#d8b988', roughness = 0.7, width = 1, height = 1, appearance = null }) {
  const grain = resolveWoodGrainParams(appearance);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness: 0,
    });
    // Normalize the slab so position.xy ∈ [-0.5, 0.5] — the SAME coordinate space
    // the pure woodGrainAt tests sample (slab x/width, y/height).
    const w = width || 1;
    const h = height || 1;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWoodSize = { value: new THREE.Vector2(w, h) };
      shader.uniforms.uRingFrequency = { value: grain.ringFrequency };
      shader.uniforms.uTurbulence = { value: grain.turbulence };
      shader.uniforms.uNoiseScale = { value: grain.noiseScale };
      shader.uniforms.uGrainContrast = { value: grain.grainContrast };
      shader.uniforms.uWoodCenter = { value: new THREE.Vector2(grain.centerU, grain.centerV) };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vWoodUV;\nuniform vec2 uWoodSize;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWoodUV = position.xy / uWoodSize;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${WOOD_FRAG_HEADER}`)
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nfloat wGrain = woodGrain(vWoodUV);\ndiffuseColor.rgb *= (1.0 - uGrainContrast * wGrain);',
        );
    };
    return m;
    // Rebuild on any look-affecting input so a material switch re-tints the grain.
  }, [
    color,
    roughness,
    width,
    height,
    grain.ringFrequency,
    grain.turbulence,
    grain.noiseScale,
    grain.grainContrast,
    grain.centerU,
    grain.centerV,
  ]);

  // Dispose the previous program when inputs change / on unmount (no GPU leak).
  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={material} attach="material" />;
}
