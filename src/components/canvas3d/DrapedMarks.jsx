// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path
// module, or three.js leaks into the 2D bundle (PRD D9). The pure buffer builder
// it consumes (lib/three3d/drape.buildDrapeForTarget) is three-free and stays on
// the 2D side (the unit gate).
import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { Select } from '@react-three/postprocessing';
import { buildDrapeForTarget } from '../../lib/three3d/drape.js';

/**
 * Surface B — per-channel DRAPE of a guide's active modulation targets (S9, PRD
 * D5/§3.4). Each active target is drawn as thin emissive LineSegments in the
 * target layer's color: warp targets as a deformed grid displaced in-plane along
 * ∇f and seated on the relief; density targets as studs whose SPACING (not Z)
 * varies with the field. The pure builder emits the segment buffers; this
 * component only marshals them into a BufferGeometry per target.
 *
 * Bloom (D12): wrapped in <Select enabled> like Marks.jsx so the
 * selection-gated SelectiveBloom glows the drape lines (toneMapped off so the
 * line color is its own emissive).
 *
 * @param {{ targets?: Array<{targetId:string, channel:string, amount:number,
 *           color:string}>, enabled?: Record<string, boolean>, field?: object,
 *           exaggeration?: number, width?: number, height?: number }} props
 */
function DrapeLines({ target, field, exaggeration, width, height }) {
  const positions = useMemo(
    () => buildDrapeForTarget(target, { field, exaggeration, width, height }),
    [target, field, exaggeration, width, height],
  );

  const geomRef = useRef(null);
  useLayoutEffect(() => {
    const g = geomRef.current;
    if (!g) return;
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.attributes.position.needsUpdate = true;
  }, [positions]);

  if (!positions || positions.length === 0) return null;

  return (
    <Select enabled>
      <lineSegments data-testid={`drape-${target.targetId}`}>
        <bufferGeometry ref={geomRef} />
        <lineBasicMaterial color={target.color} toneMapped={false} />
      </lineSegments>
    </Select>
  );
}

export default function DrapedMarks({
  targets = [],
  enabled = null,
  field = null,
  exaggeration = 0,
  width = 200,
  height = 200,
}) {
  if (!field || targets.length === 0) return null;
  return (
    <group data-testid="drape-stack">
      {targets
        .filter((t) => (enabled ? enabled[t.targetId] !== false : true))
        .map((t) => (
          <DrapeLines
            key={t.targetId}
            target={t}
            field={field}
            exaggeration={exaggeration}
            width={width}
            height={height}
          />
        ))}
    </group>
  );
}
