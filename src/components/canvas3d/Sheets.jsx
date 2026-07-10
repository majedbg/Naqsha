// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure builders it
// consumes (lib/three3d/sheetSpecs.js, sheetMaterial.js, edgeFace.js) are
// three-free and stay on the 2D side.
import { MeshTransmissionMaterial } from '@react-three/drei';
import { resolveSheetMaterial } from '../../lib/three3d/sheetMaterial.js';
import { resolveEdgeFace } from '../../lib/three3d/edgeFace.js';
import { useBloomRef } from './bloomSelection.js';
import WoodGrain from './WoodGrain.jsx';

/**
 * Surface A slabs (S4, PRD D7/D11; edge + orbit model per ADR 0003). Renders one
 * extruded box per sheet spec (lib/three3d/sheetSpecs.buildSheetSpecs): a slab in
 * the xy design plane, thickness extruded along z, centered on the origin in xy
 * and positioned at `zOffset` along z (the stacking axis). World units are mm
 * (1 unit = 1 mm) — spec.thickness is physical.
 *
 * Face material per the pure `resolveSheetMaterial` (S4, §3.5): when `appearance`
 * is present the resolved ARCHETYPE drives the material (transmission / standard /
 * physical mode + all optics); when null, the substrate descriptor's IDENTITY
 * (type/kind/color) plus the archetypes' substrate-fallback optics decide it.
 *
 * EDGE-FACE MATERIAL (ADR 0003 #6): a transmissive slab's four SIDE faces carry
 * their own lit, tone-mapped material (edgeFace.resolveEdgeFace) — slightly
 * brighter than the face, faint green cast for colorless PMMA, the concentrated
 * tint for colored acrylic — approximating the total-internal-reflection edge
 * brightness of a real sheet. This replaced the additive Fresnel shell + emissive
 * rim bars (EdgeGlow, deleted): non-additive, non-bloomed, no post-processing.
 * Mechanically: TWO coincident multi-material boxes per transmissive slab — the
 * face mesh renders slots 4/5 (±z) with the transmission material and hides its
 * side slots; the edge mesh renders slots 0–3 (±x/±y) and hides its face slots —
 * so every box face is drawn exactly once (no z-fighting) and the edge mesh stays
 * a SEPARATE object. That separation matters for the one exception: FLUORESCENT
 * acrylic really fluoresces at its cut edges, so its edge mesh carries a modest
 * genuine emissive (archetype edgeGain) and registers into the bloom selection —
 * one of the triggers that mounts the on-demand composer (Scene3D, #5).
 *
 * GHOST-TRANSPARENT ORBIT FALLBACK (ADR 0003 #7): while `isMoving` (CameraRig →
 * Scene3D), the MTM face mesh hides and a coincident GHOST TWIN face mesh shows —
 * a real transparent meshPhysicalMaterial (transmission 0, opacity GHOST_OPACITY).
 * The motion gate exists because screen-space refraction re-images the marks into
 * a tiling grid at grazing orbit angles; a NON-transmissive transparent material
 * avoids that artifact without flashing an opaque card. The twin (not uniform
 * toggles on the mounted MTM, the first attempt) is load-bearing: drei's MTM
 * fragment override does not honor `opacity` once its transmission path is
 * bypassed, so the uniform-toggle ghost rendered as SOLID diffuse — visibly
 * opaque sheets during orbit on saturated tints (fluorescent). Both twins stay
 * mounted (visibility flip only — no recompile, no FBO churn); the edge faces
 * ghost in step so a solid frame never hangs on a see-through sheet.
 *
 * @param {{ specs?: import('../../lib/three3d/sheetSpecs.js').SheetSpec[],
 *           appearance?: import('../../lib/three3d/resolveAppearance.js').AppearanceParams|null,
 *           isMoving?: boolean }} props
 */

// Ghost opacity while the camera moves (ADR 0003 #7): present enough to keep the
// stack readable, sparse enough that the marks behind it stay inspectable.
const GHOST_OPACITY = 0.25;
// boxGeometry material-slot order: +x, -x, +y, -y (the four cut edges)…
const SIDE_SLOTS = [0, 1, 2, 3];
// …then +z, -z (the sheet's front/back faces).
const FACE_SLOTS = [4, 5];
// Idle emissive constants (uniform-only hover-free variant of Marks.jsx's pattern):
// black + 0 ≡ no emission without swapping the emissive map/color type.
const NO_EMISSIVE = '#000000';

/** Invisible filler for the box slots another mesh owns (skipped by the renderer,
 *  including in the shadow pass — three checks per-group material visibility). */
function HiddenSlots({ slots }) {
  return slots.map((i) => (
    <meshBasicMaterial key={i} attach={`material-${i}`} visible={false} />
  ));
}

/**
 * One transmissive (acrylic-family) slab: coincident face + edge meshes (see the
 * component doc). `mat` is the resolved face material, `edge` the resolved
 * edge-face material.
 */
function TransmissiveSlab({ spec, mat, edge, isMoving }) {
  // Bloom membership for the fluorescent edge mesh ONLY (real fluorescence —
  // ADR 0003 exception). Non-emissive edges never join the selection.
  const bloomRef = useBloomRef();
  const [w = 0, h = 0] = spec.size || [];
  const emissiveEdges = !!edge.emissive && edge.emissiveIntensity > 0;
  return (
    <group>
      {/* Front/back faces — the settled transmission material. Hidden (not
          unmounted) during motion so its compiled program + shared buffer hookup
          survive the orbit. */}
      <mesh position={[0, 0, spec.zOffset]} castShadow receiveShadow visible={!isMoving}>
        {/* boxGeometry args = [x=width, y=height, z=thickness] */}
        <boxGeometry args={[w, h, spec.thickness]} />
        <HiddenSlots slots={SIDE_SLOTS} />
        {FACE_SLOTS.map((i) => (
          // transmissionSampler (main's perf fix): all acrylic faces sample ONE
          // shared scene buffer instead of each rendering the scene into its own
          // FBO per frame. Values stay archetype-driven (resolveSheetMaterial).
          <MeshTransmissionMaterial
            key={i}
            attach={`material-${i}`}
            transmissionSampler
            color={mat.color}
            ior={mat.ior}
            roughness={mat.roughness}
            thickness={spec.thickness}
            transmission={mat.transmission}
            // Fluorescent body re-emission (faceGlow, LSC model): faint, tinted,
            // NON-bloomed — the face mesh never joins the bloom selection.
            emissive={mat.faceGlow > 0 ? mat.color : NO_EMISSIVE}
            emissiveIntensity={mat.faceGlow ?? 0}
            samples={8}
            // The settled-glass tuning (see git history for the full derivation):
            // samples=8 keeps the refraction blur from banding; chromatic
            // aberration stays near-zero so the marks re-imaged through the slab
            // don't fringe into colored tiles.
            anisotropy={0.1}
            chromaticAberration={0.002}
          />
        ))}
      </mesh>
      {/* Ghost twin faces — the orbit fallback (#7). A REAL transparent
          meshPhysicalMaterial: drei's MTM ignores `opacity` when its transmission
          path is off, so the ghost must be its own material, not MTM uniforms. */}
      <mesh position={[0, 0, spec.zOffset]} visible={isMoving}>
        <boxGeometry args={[w, h, spec.thickness]} />
        <HiddenSlots slots={SIDE_SLOTS} />
        {FACE_SLOTS.map((i) => (
          <meshPhysicalMaterial
            key={i}
            attach={`material-${i}`}
            color={mat.color}
            ior={mat.ior}
            roughness={mat.roughness}
            transparent
            opacity={GHOST_OPACITY}
            depthWrite={false}
          />
        ))}
      </mesh>
      {/* The four cut edges — the edge-face material (lit, tone-mapped,
          non-additive). Registered for bloom only when genuinely emissive
          (fluorescent). */}
      <mesh position={[0, 0, spec.zOffset]} ref={emissiveEdges ? bloomRef : null}>
        <boxGeometry args={[w, h, spec.thickness]} />
        {SIDE_SLOTS.map((i) => (
          <meshStandardMaterial
            key={i}
            attach={`material-${i}`}
            color={edge.color}
            roughness={edge.roughness}
            metalness={edge.metalness}
            emissive={emissiveEdges ? edge.emissive : NO_EMISSIVE}
            emissiveIntensity={emissiveEdges ? edge.emissiveIntensity : 0}
            transparent={isMoving}
            opacity={isMoving ? GHOST_OPACITY : 1}
          />
        ))}
        <HiddenSlots slots={FACE_SLOTS} />
      </mesh>
    </group>
  );
}

export default function Sheets({ specs = [], appearance = null, isMoving = false }) {
  return (
    <group data-testid="sheet-stack">
      {specs.map((spec) => {
        const [w = 0, h = 0] = spec.size || [];
        const m = spec.materialDescriptor || {};
        // Pure decisions (S4 + ADR 0003): which three material the faces get, and
        // whether/how the side faces differ.
        const mat = resolveSheetMaterial({ appearance, descriptor: m });
        const edge = resolveEdgeFace({ appearance, descriptor: m });
        if (mat.mode === 'transmission' && edge.distinct) {
          return (
            <TransmissiveSlab
              key={spec.panelId}
              spec={spec}
              mat={mat}
              edge={edge}
              isMoving={isMoving}
            />
          );
        }
        // Opaque slabs: sides share the face material — one plain box.
        return (
          <mesh key={spec.panelId} position={[0, 0, spec.zOffset]} castShadow receiveShadow>
            {/* boxGeometry args = [x=width, y=height, z=thickness] */}
            <boxGeometry args={[w, h, spec.thickness]} />
            {mat.mode === 'physical' ? (
              /* Pearlescent nacre (S4, §3.2): opaque + a clearcoat sheen, which
                 meshStandardMaterial can't do — keeps it distinct from plain
                 opaque-acrylic. */
              <meshPhysicalMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
                clearcoat={mat.clearcoat}
                clearcoatRoughness={0.1}
              />
            ) : appearance?.archetype === 'wood' ? (
              /* Procedural wood grain (S6, §3.2/L6). ONLY on the wood archetype
                 when a material lens is active — the no-material substrate fallback
                 (appearance === null) stays a plain standard material. The grain
                 math is the unit-tested woodGrain.js; this material mirrors it in
                 GLSL. No texture loaded (texturePath reserved). */
              <WoodGrain
                color={mat.color}
                roughness={mat.roughness}
                width={w}
                height={h}
                appearance={appearance}
              />
            ) : (
              <meshStandardMaterial
                color={mat.color}
                roughness={mat.roughness}
                metalness={mat.metalness}
              />
            )}
          </mesh>
        );
      })}
    </group>
  );
}
