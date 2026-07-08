// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
// Imports three/@react-three/* — must NEVER be imported from a 2D render-path module.
import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { computeZoomToFit } from '../../lib/three3d/cameraFit.js';

// How long (ms) after the LAST controls 'change' event to consider the camera
// settled. OrbitControls (enableDamping) keeps firing 'change' every frame through
// the damping tail AFTER pointer-up, so a plain 'end' handler would fire while the
// camera is still gliding. We debounce on 'change' instead: motion is "active" from
// the first change until changes stop for this long. Sized just above the damping
// tail at dampingFactor=0.08 (a few frames) so the acrylic refraction restores the
// instant the glide actually stops, not a beat too early (which would flash the
// tiling) nor too late (a sticky opaque slab).
const SETTLE_MS = 160;

/**
 * Shared camera rig (spec D4): a damped drei OrbitControls plus zoom-to-fit /
 * reset framing driven by the PURE `computeZoomToFit` helper.
 *
 * The pure math lives in `lib/three3d/cameraFit.js` (unit-tested); this thin R3F
 * wrapper only applies the result to the live camera + controls. It reframes:
 *   - on mount,
 *   - whenever `fitBox` changes (a new design/field snapshot),
 *   - whenever `resetSignal` increments ("Reset view" button → default 3/4 fit).
 *
 * `onInteractingChange` (optional) reports camera-motion transitions: `true` the
 * moment an orbit/pan/zoom begins, `false` once it settles (debounced past the
 * damping tail). Surface A uses it to drop acrylic refraction while moving —
 * screen-space refraction of the marks through the slab tiles at grazing angles
 * (see Sheets.jsx). We `invalidate()` on each transition so the on-demand frameloop
 * renders the restored (glass) frame even though the settle fires after the damping
 * tail has stopped pumping frames.
 *
 * @param {{
 *   fitBox?: { min:[number,number,number], max:[number,number,number] } | null,
 *   resetSignal?: number,
 *   onInteractingChange?: ((interacting: boolean) => void) | null,
 * }} props
 */
export default function CameraRig({ fitBox = null, resetSignal = 0, onInteractingChange = null }) {
  const controls = useRef(null);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);

  // Debounced interaction signal. `interactingRef` mirrors the last value we
  // reported so we only notify on real transitions (the 'change' event fires every
  // damped frame). `settleTimer` flips us back to idle once changes go quiet.
  const interactingRef = useRef(false);
  const settleTimer = useRef(null);

  const setInteracting = useCallback(
    (next) => {
      if (interactingRef.current === next) return;
      interactingRef.current = next;
      onInteractingChange?.(next);
      // On-demand frameloop: the settle transition lands after the damping tail has
      // stopped requesting frames, so force one render to paint the restored glass.
      invalidate();
    },
    [onInteractingChange, invalidate],
  );

  // Any controls 'change' (drag, pan, zoom, or a damped frame) marks motion active
  // and re-arms the settle timer; when changes stop for SETTLE_MS we go idle.
  const handleControlsChange = useCallback(() => {
    setInteracting(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setInteracting(false), SETTLE_MS);
  }, [setInteracting]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  useEffect(() => {
    const aspect = height > 0 ? width / height : 1;
    const fov = typeof camera.fov === 'number' ? camera.fov : undefined;
    const { position, target } = computeZoomToFit({ box: fitBox, fov, aspect });

    camera.position.set(position[0], position[1], position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(target[0], target[1], target[2]);

    // Scene scale, derived from the fit box so clip planes + zoom caps track the
    // actual design size (world units = mm) instead of a fixed guess. `radius` is
    // half the box diagonal (a safe over-estimate for the flat, thin-in-z slab
    // stack); `fitDist` is how far the fit put the camera from the target.
    const [minX, minY, minZ] = fitBox?.min || [-1, -1, -1];
    const [maxX, maxY, maxZ] = fitBox?.max || [1, 1, 1];
    const radius = 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const fitDist =
      Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) ||
      radius * 3;

    if (controls.current) {
      controls.current.target.set(target[0], target[1], target[2]);
      // Zoom-out CAP (the user's "don't keep shrinking past a limit"): OrbitControls
      // stops dollying past maxDistance. Sized to a generous multiple of the fit
      // distance so you can pull way back for context, then it holds. minDistance
      // keeps the camera from diving through the slab. Both scale with the design.
      controls.current.minDistance = Math.max(radius * 0.3, 0.1);
      controls.current.maxDistance = fitDist * 10;
    }

    // Clip planes sized to the ALLOWED zoom range (+ margin) so the panel never
    // clips / vanishes at the far plane when zoomed out — the reported bug (old
    // static far=1000mm clipped past ~1m). near stays small relative to the scene so
    // close inspection doesn't clip, but far larger than the old 0.01 so the huge
    // near/far ratio (which starves depth precision) is tightened, not widened.
    const maxDist = controls.current ? controls.current.maxDistance : fitDist * 10;
    // three.js exposes near/far as plain writable fields (no setter method), so direct
    // assignment is the documented API — same in-place camera mutation as the
    // position/up/projection updates above; the immutability lint is a false positive
    // for three interop here.
    /* eslint-disable react-hooks/immutability */
    camera.near = Math.max(radius * 0.02, 0.05);
    camera.far = maxDist + radius * 3;
    /* eslint-enable react-hooks/immutability */
    camera.updateProjectionMatrix();

    if (controls.current) controls.current.update();
  }, [fitBox, resetSignal, camera, width, height]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableZoom
      enableRotate
      onChange={handleControlsChange}
    />
  );
}
