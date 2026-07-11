// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure builder it
// consumes (lib/three3d/markTexture.buildPanelMarkSVGs) is three-free and stays
// on the 2D side.
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { routePanelRenderModes, PROCESS_ANNOTATION_HEX } from '../../lib/three3d/markTexture.js';
import { useProcessAnnotation } from '../../lib/three3d/processAnnotation.js';
import { clampAnisotropy, chooseRasterScale } from '../../lib/three3d/textureFiltering.js';
import { buildRibbonGeometry } from './ribbonGeometry.js';
import { useBloomRef } from './bloomSelection.js';

/**
 * Surface A marks (S5 texture baseline + S10 ribbon enhancement, PRD D3/D6, §3.1;
 * reaction model per ADR 0003).
 *
 * Per panel, markTexture.routePanelRenderModes (pure, 2D-side) picks the render mode
 * from the panel's stroke-path count + device profile (D6): sparse desktop panels
 * (≤PATH_CAP paths, DPR≥1.5, non-mobile) → RIBBON geometry; else → TEXTURE.
 *
 * TEXTURE mode (S5, always-works): each per-process mark SVG (built 2D-side by
 * markTexture.buildPanelMarkSVGs) is rasterized to an offscreen canvas →
 * THREE.CanvasTexture → a plane floated just in front of that sheet's front face.
 *
 * RIBBON mode (S10): the SAME per-process SVG is parsed and stroked into true vector
 * geometry (ribbonGeometry.buildRibbonGeometry) — crisp at any zoom, no raster. If a
 * panel's geometry comes back null (degenerate SVG), that process falls back to its
 * texture plane so marks NEVER silently vanish.
 *
 * MARKS ARE PHYSICAL REACTIONS, NOT ANNOTATIONS (ADR 0003): each per-process layer
 * renders as a matte diffuse surface — roughness 1, normal tone mapping, NO
 * emissive — in the substrate's reaction tint (frosted engraving on acrylic,
 * kerf-dark cut seam, char on wood), with the process depth carried by the layer's
 * `opacity` (cut most present > engrave > score). The old model (emissive tint ×
 * intensity × toneMapped=false × always-on SelectiveBloom) is gone — it is why
 * clear acrylic used to "glow".
 *
 * HOVER ANNOTATION (ADR 0003 #4): pointer-hovering a mark mesh tints it toward its
 * process color (PROCESS_ANNOTATION_HEX — cut red, score blue…) via a bounded
 * emissive highlight, and reports the process to the host (`onHoverProcess`) so the
 * DOM overlay can name it. ONLY while hovered does the mesh register into the bloom
 * selection (useBloomRef, bloomSelection.js) — which is also what mounts the
 * on-demand EffectComposer (Scene3D). An idle scene has zero post-processing.
 */

// High-DPI raster cap (px) on the longest texture edge — keeps marks crisp under
// zoom without an unbounded offscreen canvas (PRD D9 perf budget).
//
// Bumped 2048 → 4096 to fight the RESIDUAL mark moiré on very dense hatches (e.g. a
// spirograph): at 2048 the finest hatch lines land <1px apart in the raster, so the
// 2D canvas rasterizer aliases them into interference BEFORE mipmaps can help — and
// mipmaps can only band-limit what was cleanly resolved to begin with. At 4096 those
// lines get ~2× the raster pixels, so the base raster (and every mip derived from it)
// starts clean. COST: a mark texture is 4096²·RGBA ≈ 67MB (+~33% mips) vs ~22MB at
// 2048 — 4× GPU memory PER (panel × process) layer. Acceptable here because the 3D
// preview is transient (mounted only while the overlay is open) and the mark-layer
// count is small, but if a huge multi-panel design ever strains GPU memory / trips a
// context loss, this single constant is the dial-back knob (3072 ≈ 2.25× is the
// middle ground). WebGL max texture size is ≥8192 on all target GPUs, so 4096 is safe.
const MAX_TEXTURE_EDGE = 4096;
// Raster FLOOR (px) on the longest texture edge. The mark SVG's intrinsic size is
// the DESIGN size (a 200mm panel decodes to ~756px), so on a small/dense design DPR
// alone left the offscreen raster well under the cap — the hatch then under-resolved
// and merged into blocks (directly AND when re-imaged through the translucent slab,
// the reported fluorescent aliasing). Pinning the floor to the cap rasterizes every
// mark texture at one bounded edge regardless of design/display, so the hatch is
// resolved before mipmaps + max-anisotropy filter it. Bounded: floor == cap, so a
// mark texture is never larger than the (now 4096px) perf budget allows.
const MIN_TEXTURE_EDGE = MAX_TEXTURE_EDGE;
// Emissive intensity of the HOVER annotation highlight (ADR 0003 #4) — bounded and
// modest: an inspection affordance, not a mode. Idle marks have NO emissive at all.
const HOVER_EMISSIVE = 0.9;
// Idle emissive: pure black + zero intensity ≡ no emission. Kept as constants (and
// `emissiveMap` kept permanently bound) so hover toggles UNIFORMS only — swapping
// the map/color between null and a value would recompile the shader per hover.
const NO_EMISSIVE = '#000000';
// Tiny z step (mm) so stacked per-process planes layer in a stable order.
const Z_EPSILON = 0.05;
// Base lift (mm) floating every mark just off the sheet's front face so the
// emissive marks are not coplanar with the acrylic surface. Imperceptible at the
// design scale (sub-mm against ~100s-of-mm panels) but it physically pulls the
// marks out of the slab. polygonOffset (below) is the actual z-fight guarantee —
// it biases depth in depth-buffer space so the mark wins the test regardless of
// camera distance, where a fixed mm lift alone is fragile under the wide near/far
// range. The two together: marks sit outside the model AND never shimmer.
const SURFACE_LIFT = 0.2;
// Decal-style depth bias: negative factor/units pull the mark toward the camera in
// depth-buffer space so it beats the coplanar sheet face without moving geometry.
const POLYGON_OFFSET_FACTOR = -2;
const POLYGON_OFFSET_UNITS = -2;

/**
 * Four world-space clipping planes bounding the centered sheet rectangle
 * [-w/2, w/2] × [-h/2, h/2] (mm). Ribbon geometry is parsed straight from the mark
 * SVG, which can carry path points OUTSIDE the canvas viewBox (e.g. a spirograph
 * whose loops spill past the sheet) — texture mode is implicitly cropped because the
 * raster only paints inside the viewBox, but ribbons are not. These planes crop the
 * ribbon (and its bloom halo) to the physical sheet, matching texture mode. World
 * space (not view space) so the crop tracks the sheet as the camera orbits; sheets
 * are xy-centered on the origin (boundsForSheetSpecs), so plane constants are ±half.
 * Requires gl.localClippingEnabled = true (set in Scene3D onCreated).
 */
function useSheetClipPlanes(w, h) {
  return useMemo(() => {
    if (!w || !h) return undefined;
    const hw = w / 2;
    const hh = h / 2;
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), hw), // keep x ≥ -w/2
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw), // keep x ≤ w/2
      new THREE.Plane(new THREE.Vector3(0, 1, 0), hh), // keep y ≥ -h/2
      new THREE.Plane(new THREE.Vector3(0, -1, 0), hh), // keep y ≤ h/2
    ];
  }, [w, h]);
}

/**
 * Rasterize an SVG string to a THREE.CanvasTexture (async via an <img>). Returns
 * the texture through `setTexture` once decoded; disposes the previous texture on
 * change/unmount so the GPU buffer is not leaked.
 */
function useSvgTexture(svg) {
  const [texture, setTexture] = useState(null);
  // The renderer's hardware anisotropy ceiling (typically 16). The mark plane is
  // heavily MINIFIED and tilted at the 3/4 viewing angle — the textbook case where
  // a low anisotropic-sample count stair-steps/shimmers — so sample at the GPU max
  // (was hardcoded 4). Stable across renders, so it never re-runs the effect.
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  useEffect(() => {
    // Parent (<Marks>) only mounts a plane for a truthy svg, so no clear-to-null
    // branch is needed here (avoids a synchronous setState in the effect body).
    if (!svg || typeof document === 'undefined') return undefined;
    let disposed = false;
    let created = null;
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      const w = img.naturalWidth || img.width || 1;
      const h = img.naturalHeight || img.height || 1;
      // Fold DPR in BEFORE clamping into [MIN_TEXTURE_EDGE, MAX_TEXTURE_EDGE]: the
      // cap bounds the FINAL pixels (≤ cap on any display, not cap×DPR) and the floor
      // upscales a small/dense design's intrinsic-sized SVG so the hatch is resolved —
      // chooseRasterScale.
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const scale = chooseRasterScale({
        width: w,
        height: h,
        dpr,
        minEdge: MIN_TEXTURE_EDGE,
        maxEdge: MAX_TEXTURE_EDGE,
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height); // transparent field
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // Trilinear mipmaps + max anisotropy: kills the minification stair-step on the
      // tilted mark plane. (CanvasTexture already defaults generateMipmaps=true /
      // minFilter=LinearMipmapLinear, but pin them so the intent is explicit and a
      // future default change can't silently regress the AA.)
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = clampAnisotropy(maxAnisotropy);
      tex.needsUpdate = true;
      created = tex;
      setTexture(tex);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    return () => {
      disposed = true;
      img.onload = null;
      if (created) created.dispose();
    };
  }, [svg, maxAnisotropy]);

  return texture;
}

/**
 * One physical mark plane (the Reaction surface) for a single process of one sheet.
 * Matte lit diffuse — the texture carries the reaction tint, `opacity` its presence.
 * `annotated` (driven by the left panel's layer-row hover via processAnnotation)
 * tints toward the process-color annotation + joins bloom; the plane itself is
 * NOT pointer-sensitive (ADR 0003 #4, direction inverted — the render never
 * changes under the cursor).
 * @param {{ svg:string, process:string, opacity:number, glow?:number,
 *           glowDrive?:number, size:[number,number], z:number,
 *           annotated?:boolean, visible?:boolean }} props
 */
function MarkPlane({ svg, process, opacity, glow = 0, glowDrive = 1, size, z, visible = true, annotated = false }) {
  const texture = useSvgTexture(svg);
  // Bloom membership (ADR 0003 #5): the left-panel annotation highlight, OR a
  // genuinely glowing fluorescent groove (reaction emissiveIntensity > 0 — the
  // TIR-escape glow). Attaching/detaching the stable ref callback registers/
  // unregisters this mesh, which is what mounts/unmounts the on-demand composer.
  const bloomRef = useBloomRef();
  const glowing = glow > 0;
  const [w = 0, h = 0] = size || [];
  if (!texture || !w || !h) return null;
  const annotation = PROCESS_ANNOTATION_HEX[process] || '#ffffff';
  return (
    <mesh ref={annotated || glowing ? bloomRef : null} position={[0, 0, z]} visible={visible}>
      <planeGeometry args={[w, h]} />
        {/* Lit diffuse decal: `map` carries the reaction tint + alpha (transparent
            field); white base so the texture reads as-is; roughness 1 = matte
            frost/char; NORMAL tone mapping (fidelity, ADR 0003). The emissive
            channel exists solely for the hover annotation and is black/0 idle. */}
        <meshStandardMaterial
          color="#ffffff"
          map={texture}
          // Idle glow (fluorescent grooves only): white emissive × the tinted
          // emissiveMap = the dye color at `glow × glowDrive`. glowDrive is the
          // runtime animation seam (mic-volume sync etc.) — a live uniform,
          // per-frame updatable with zero recompile. The left-panel annotation
          // highlight overrides while a layer row is hovered.
          emissive={annotated ? annotation : glowing ? '#ffffff' : NO_EMISSIVE}
          emissiveMap={texture}
          emissiveIntensity={annotated ? HOVER_EMISSIVE : glowing ? glow * glowDrive : 0}
          transparent
          opacity={opacity ?? 1}
          depthWrite={false}
          // DoubleSide so the mark shows from BEHIND the sheet too — through a
          // transmissive slab you see the groove mirrored (the back of this same
          // plane IS that mirrored view; ribbons are already DoubleSide). Opaque
          // slabs still hide it from behind: the slab body wins the depth test.
          side={THREE.DoubleSide}
          // Bias depth toward the camera so the (coplanar, depthWrite-false) mark
          // wins the test against the sheet face — kills the surface shimmer.
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET_FACTOR}
          polygonOffsetUnits={POLYGON_OFFSET_UNITS}
          roughness={1}
          metalness={0}
        />
    </mesh>
  );
}

/**
 * One physical RIBBON (the Reaction surface as true vector geometry, S10): the
 * per-process mark SVG stroked into geometry, baked into the sheet's centered plane
 * frame (size) so it overlays the texture-mode marks exactly. Matte lit diffuse in
 * the reaction tint with the presence `opacity` (same axes as MarkPlane);
 * `annotated` (left-panel layer-row hover) = the process-color annotation. If the
 * geometry is null (degenerate SVG), render `fallback` (the texture plane) so
 * marks never vanish.
 * @param {{ svg:string, tint:string, process:string, opacity:number,
 *           glow?:number, glowDrive?:number, size:[number,number], z:number,
 *           annotated?:boolean, visible?:boolean,
 *           fallback:React.ReactNode }} props
 */
function RibbonMesh({ svg, tint, process, opacity, glow = 0, glowDrive = 1, size, z, visible = true, annotated = false, fallback }) {
  const [w = 0, h = 0] = size || [];
  const geometry = useMemo(
    () => (svg && w && h ? buildRibbonGeometry(svg, { width: w, height: h }) : null),
    [svg, w, h],
  );
  // Crop the ribbon to the sheet rectangle — ribbon geometry, unlike the
  // viewBox-cropped texture raster, carries any path points that spill past the
  // canvas (e.g. spirograph loops larger than the sheet).
  const clippingPlanes = useSheetClipPlanes(w, h);
  // Bloom membership: hover annotation OR fluorescent groove glow (see MarkPlane).
  const bloomRef = useBloomRef();
  const glowing = glow > 0;
  // Ribbon geometry IS uploaded to the GPU once meshed → dispose on change/unmount.
  useEffect(() => () => geometry?.dispose?.(), [geometry]);
  if (!geometry) return fallback ?? null;
  const annotation = PROCESS_ANNOTATION_HEX[process] || '#ffffff';
  return (
    /* Matte diffuse stroke in the reaction tint (frost/kerf/char) — idle emissive
       ONLY for fluorescent grooves (TIR-escape glow in the dye tint), normal tone
       mapping (ADR 0003). DoubleSide because the SVG→world Y-flip reverses
       winding. */
    <mesh
      ref={annotated || glowing ? bloomRef : null}
      position={[0, 0, z]}
      visible={visible}
      geometry={geometry}
    >
        <meshStandardMaterial
          color={tint || '#ffffff'}
          emissive={annotated ? annotation : glowing ? tint || '#ffffff' : NO_EMISSIVE}
          emissiveIntensity={annotated ? HOVER_EMISSIVE : glowing ? glow * glowDrive : 0}
          transparent
          opacity={opacity ?? 1}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={clippingPlanes}
          // Same decal depth-bias as the texture marks (see MarkPlane): keep the
          // ribbon off the acrylic face in the depth test at any camera distance.
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET_FACTOR}
          polygonOffsetUnits={POLYGON_OFFSET_UNITS}
          roughness={1}
          metalness={0}
        />
    </mesh>
  );
}

// Device profile for the D6 ribbon/texture routing. Read once from the environment
// (stable across renders): high-DPI desktop is ribbon-eligible; mobile / low-DPI
// force texture (markTexture.routePanelRenderModes applies the cap + these flags).
function deviceProfile() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  return { dpr, isMobile };
}

/**
 * All Surface-A marks for the stack: for each sheet spec, its per-process mark layers
 * floated just in front of the sheet's front face (+z), stacked by a tiny epsilon so
 * processes never z-fight. Each panel renders as ribbon geometry (S10) or texture
 * planes (S5) per the D6 route; ribbon panels fall back to texture per-process when a
 * mark SVG yields no geometry.
 *
 * `glowDrive` is the runtime multiplier over each mark's reaction emissive
 * (fluorescent groove glow) — the animation seam: drive it from any live signal
 * (mic volume, beat clock) and every glowing groove follows, uniform-only.
 *
 * BACK-FACE TWIN: each mark renders twice — at the front face and, settled-only,
 * as a twin just behind the BACK face. Three.js excludes `transparent` materials
 * from the shared transmission buffer, so a settled MTM back face has no marks to
 * refract — the twin is the directly-visible stand-in (its rear side reads as the
 * mirrored groove, which is the physically correct back view). Hidden while
 * `isMoving`: ghost mode is plain alpha blending, where the front plane's
 * DoubleSide already shows through and a visible twin would double the image.
 *
 * ANNOTATION (ADR 0003 #4, direction inverted): marks are NOT pointer-sensitive.
 * The left panel's layer-row hover publishes {panelId, process} on the
 * processAnnotation channel; the matching mark(s) here tint toward the process
 * annotation color. Null panelId annotates that process on every sheet.
 *
 * @param {{ specs?: import('../../lib/three3d/sheetSpecs.js').SheetSpec[],
 *           marksByPanel?: Record<string, Array<{process:string,tint:string,opacity:number,emissiveIntensity?:number,svg:string}>>,
 *           glowDrive?: number,
 *           isMoving?: boolean }} props
 */
export default function Marks({ specs = [], marksByPanel = {}, glowDrive = 1, isMoving = false }) {
  const routes = useMemo(
    () => routePanelRenderModes(marksByPanel, deviceProfile()),
    [marksByPanel],
  );
  // Left-panel hover → {panelId, process}|null (re-renders only on real change).
  const annotation = useProcessAnnotation();
  return (
    <group data-testid="mark-stack">
      {specs.map((spec) => {
        const marks = marksByPanel[spec.panelId];
        if (!marks || marks.length === 0) return null;
        const front = spec.zOffset + spec.thickness / 2;
        const back = spec.zOffset - spec.thickness / 2;
        const useRibbon = routes[spec.panelId] === 'ribbon';
        return marks
          .filter((m) => m.svg)
          .flatMap((m, i) => {
            const glow = m.emissiveIntensity ?? 0;
            const annotated =
              !!annotation &&
              annotation.process === m.process &&
              (annotation.panelId == null || annotation.panelId === spec.panelId);
            // One mark surface at the given z (front face, or the settled-only
            // back-face twin — see the component doc).
            const markAt = (z, keySuffix, visible) => {
              const plane = (
                <MarkPlane
                  svg={m.svg}
                  process={m.process}
                  opacity={m.opacity}
                  glow={glow}
                  glowDrive={glowDrive}
                  size={spec.size}
                  z={z}
                  visible={visible}
                  annotated={annotated}
                />
              );
              return useRibbon ? (
                <RibbonMesh
                  key={`${spec.panelId}-${m.process}${keySuffix}`}
                  svg={m.svg}
                  tint={m.tint}
                  process={m.process}
                  opacity={m.opacity}
                  glow={glow}
                  glowDrive={glowDrive}
                  size={spec.size}
                  z={z}
                  visible={visible}
                  annotated={annotated}
                  fallback={plane}
                />
              ) : (
                <MarkPlane
                  key={`${spec.panelId}-${m.process}${keySuffix}`}
                  svg={m.svg}
                  process={m.process}
                  opacity={m.opacity}
                  glow={glow}
                  glowDrive={glowDrive}
                  size={spec.size}
                  z={z}
                  visible={visible}
                  annotated={annotated}
                />
              );
            };
            return [
              // Lift clear of the face (SURFACE_LIFT), then a tiny per-process step
              // so stacked processes keep a stable front-to-back order.
              markAt(front + SURFACE_LIFT + Z_EPSILON * i, '', true),
              markAt(back - SURFACE_LIFT - Z_EPSILON * i, '-back', !isMoving),
            ];
          });
      })}
    </group>
  );
}
