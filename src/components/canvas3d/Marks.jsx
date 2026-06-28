// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure builder it
// consumes (lib/three3d/markTexture.buildPanelMarkSVGs) is three-free and stays
// on the 2D side.
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { routePanelRenderModes } from '../../lib/three3d/markTexture.js';
import { buildRibbonGeometry } from './ribbonGeometry.js';
import { useBloomRef } from './bloomSelection.js';

/**
 * Surface A marks (S5 texture baseline + S10 ribbon enhancement, PRD D3/D6, §3.1).
 *
 * Per panel, markTexture.routePanelRenderModes (pure, 2D-side) picks the render mode
 * from the panel's stroke-path count + device profile (D6): sparse desktop panels
 * (≤1500 paths, DPR≥1.5, non-mobile) → RIBBON geometry; everything else → TEXTURE.
 *
 * TEXTURE mode (S5, always-works): each per-process emissive SVG (built 2D-side by
 * markTexture.buildPanelMarkSVGs) is rasterized to an offscreen canvas →
 * THREE.CanvasTexture → an emissive plane floated just in front of that sheet's
 * front face.
 *
 * RIBBON mode (S10): the SAME per-process SVG is parsed and stroked into true vector
 * geometry (ribbonGeometry.buildRibbonGeometry) and lit emissive — crisp at any zoom,
 * no raster. If a panel's geometry comes back null (degenerate SVG), that process
 * falls back to its texture plane so marks NEVER silently vanish.
 *
 * Either way there is one layer PER PROCESS so each carries its own emissiveIntensity
 * (depth score) — cut glows strongest, then engrave, then score (D3). Hue
 * (cut≈red / score≈blue / engrave≈neutral) is the texture tint / the ribbon emissive.
 *
 * Bloom (D12): every mark mesh registers into the bloom selection via a stable ref
 * (useBloomRef, bloomSelection.jsx) so the selection-gated SelectiveBloom
 * (EmissiveBloom.jsx) glows ONLY the marks — never the transmissive sheet. (This
 * replaces the @react-three/postprocessing <Select>/<Selection> context, whose
 * self-retriggering effect froze the tab — see bloomSelection.jsx.) Texture marks
 * have a TRANSPARENT field and ribbons are bare stroke geometry, so only groove
 * pixels exist in the bloom buffer.
 */

// High-DPI raster cap (px) on the longest texture edge — keeps marks crisp under
// zoom without an unbounded offscreen canvas (PRD D9 perf budget).
const MAX_TEXTURE_EDGE = 2048;
// Global emissive multiplier; the per-process depth score scales it per plane.
const BASE_EMISSIVE = 2.4;
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
      // Fold DPR in BEFORE clamping so MAX_TEXTURE_EDGE caps the FINAL pixels
      // (longest raster edge ≤ cap on any display, not cap×DPR).
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const longest = Math.max(w, h) * dpr;
      const scale = (longest > MAX_TEXTURE_EDGE ? MAX_TEXTURE_EDGE / longest : 1) * dpr;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height); // transparent field
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
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
  }, [svg]);

  return texture;
}

/**
 * One emissive mark plane for a single process of one sheet.
 * @param {{ svg:string, intensity:number, size:[number,number], z:number }} props
 */
function MarkPlane({ svg, intensity, size, z }) {
  const texture = useSvgTexture(svg);
  // Opt this emissive plane into the SelectiveBloom selection (D12) without the
  // looping <Select> wrapper — see bloomSelection.jsx.
  const bloomRef = useBloomRef();
  const [w = 0, h = 0] = size || [];
  if (!texture || !w || !h) return null;
  return (
    <mesh ref={bloomRef} position={[0, 0, z]}>
      <planeGeometry args={[w, h]} />
        {/* color black so the lit diffuse contributes nothing; `map` carries the
            alpha (transparent field), `emissiveMap` carries the glow, scaled by the
            process depth score so the depth ORDER holds across planes (D3). */}
        <meshStandardMaterial
          color="#000000"
          map={texture}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={BASE_EMISSIVE * (intensity ?? 1)}
          transparent
          depthWrite={false}
          // Bias depth toward the camera so the (coplanar, depthWrite-false) mark
          // wins the test against the sheet face — kills the surface shimmer.
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET_FACTOR}
          polygonOffsetUnits={POLYGON_OFFSET_UNITS}
          toneMapped={false}
          roughness={1}
          metalness={0}
        />
    </mesh>
  );
}

/**
 * One emissive RIBBON for a single process of one sheet (S10): the per-process mark
 * SVG stroked into true vector geometry, baked into the sheet's centered plane frame
 * (size) so it overlays the texture-mode marks exactly. emissive = the process tint,
 * scaled by the depth-score intensity (same axes as MarkPlane). If the geometry is
 * null (degenerate SVG), render `fallback` (the texture plane) so marks never vanish.
 * @param {{ svg:string, tint:string, intensity:number, size:[number,number],
 *           z:number, fallback:React.ReactNode }} props
 */
function RibbonMesh({ svg, tint, intensity, size, z, fallback }) {
  const [w = 0, h = 0] = size || [];
  const geometry = useMemo(
    () => (svg && w && h ? buildRibbonGeometry(svg, { width: w, height: h }) : null),
    [svg, w, h],
  );
  // Crop the ribbon (and its bloom halo) to the sheet rectangle — ribbon geometry,
  // unlike the viewBox-cropped texture raster, carries any path points that spill
  // past the canvas (e.g. spirograph loops larger than the sheet).
  const clippingPlanes = useSheetClipPlanes(w, h);
  // Opt this emissive ribbon into the SelectiveBloom selection (D12) without the
  // looping <Select> wrapper — see bloomSelection.jsx.
  const bloomRef = useBloomRef();
  // Ribbon geometry IS uploaded to the GPU once meshed → dispose on change/unmount.
  useEffect(() => () => geometry?.dispose?.(), [geometry]);
  if (!geometry) return fallback ?? null;
  return (
    /* color black so lit diffuse contributes nothing; the glow is pure emissive in
       the process tint, scaled by the depth score so the cut>engrave>score order
       holds. DoubleSide because the SVG→world Y-flip reverses winding. */
    <mesh ref={bloomRef} position={[0, 0, z]} geometry={geometry}>
        <meshStandardMaterial
          color="#000000"
          emissive={tint || '#ffffff'}
          emissiveIntensity={BASE_EMISSIVE * (intensity ?? 1)}
          toneMapped={false}
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
 * @param {{ specs?: import('../../lib/three3d/sheetSpecs.js').SheetSpec[],
 *           marksByPanel?: Record<string, Array<{process:string,tint:string,intensity:number,svg:string}>> }} props
 */
export default function Marks({ specs = [], marksByPanel = {} }) {
  const routes = useMemo(
    () => routePanelRenderModes(marksByPanel, deviceProfile()),
    [marksByPanel],
  );
  return (
    <group data-testid="mark-stack">
      {specs.map((spec) => {
        const marks = marksByPanel[spec.panelId];
        if (!marks || marks.length === 0) return null;
        const front = spec.zOffset + spec.thickness / 2;
        const useRibbon = routes[spec.panelId] === 'ribbon';
        return marks
          .filter((m) => m.svg)
          .map((m, i) => {
            // Lift clear of the face (SURFACE_LIFT), then a tiny per-process step so
            // stacked processes keep a stable front-to-back order (cut/engrave/score).
            const z = front + SURFACE_LIFT + Z_EPSILON * i;
            const plane = (
              <MarkPlane svg={m.svg} intensity={m.intensity} size={spec.size} z={z} />
            );
            return useRibbon ? (
              <RibbonMesh
                key={`${spec.panelId}-${m.process}`}
                svg={m.svg}
                tint={m.tint}
                intensity={m.intensity}
                size={spec.size}
                z={z}
                fallback={plane}
              />
            ) : (
              <MarkPlane
                key={`${spec.panelId}-${m.process}`}
                svg={m.svg}
                intensity={m.intensity}
                size={spec.size}
                z={z}
              />
            );
          });
      })}
    </group>
  );
}
