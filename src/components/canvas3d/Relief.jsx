// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure buffer builder
// it consumes (lib/three3d/heightSurface.js) is three-free and stays on the 2D side.
import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { buildHeightmap } from '../../lib/three3d/heightSurface.js';

/**
 * Surface B relief mesh (S8, PRD D5/D10). Renders a guide layer's ScalarField as a
 * vertex-colored 3D terrain: a grid lifted along Y by the signed field value ×
 * exaggeration, tinted by the diverging colormap (warm/cool = attract/repel).
 *
 * The buffers are built by the pure heightSurface.buildHeightmap (the unit gate);
 * this component only marshals them into a BufferGeometry and computes vertex
 * normals so the shared SceneEnvironment lighting (D1/D12) shades the surface.
 *
 * Deliberately NOT wrapped in the bloom <Select> — bloom is emissive-only (D12).
 * The relief is a lit, vertex-colored surface rendered TRANSPARENT: the colormap
 * alpha (a≈0.12 at the neutral midrange → 1 at the saturated lobes) makes flat
 * regions recede over the dark backdrop so peaks/valleys read, instead of blowing
 * to flat white. depthWrite stays on so it occludes cleanly (a dim solid, not a
 * see-through mesh) and DoubleSide keeps backfaces from going black when orbiting.
 *
 * @param {{ field?: import('../../lib/three3d/heightSurface.js').buildHeightmap,
 *           exaggeration?: number, width?: number, height?: number,
 *           segCap?: number }} props
 */
export default function Relief({ field, exaggeration = 0, width = 200, height = 200, segCap }) {
  const meshData = useMemo(
    () => buildHeightmap({ field, exaggeration, width, height, segCap }),
    [field, exaggeration, width, height, segCap],
  );

  const geomRef = useRef(null);
  useLayoutEffect(() => {
    const g = geomRef.current;
    if (!g || !meshData) return;
    g.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    g.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    // itemSize 4 = RGBA: the alpha channel drives per-vertex transparency so the
    // neutral midrange recedes (~12%) and the saturated lobes stay solid.
    g.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 4));
    g.computeVertexNormals();
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }, [meshData]);

  if (!meshData) return null;

  return (
    <mesh data-testid="relief-mesh" castShadow receiveShadow>
      <bufferGeometry ref={geomRef} />
      <meshStandardMaterial
        vertexColors
        transparent
        depthWrite
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0}
      />
    </mesh>
  );
}
