// Behind the 3D dynamic-import boundary (reached only via Canvas3DHost → Scene3D).
//
// Replacement for @react-three/postprocessing's <Selection> / <Select> context.
//
// WHY this exists (the freeze fix): the library's <Select> registers its meshes
// into the Selection context from a useEffect whose dependency array INCLUDES the
// context value — but the context value's identity changes every time the selection
// set mutates (it is memoized on `selected`). So: add meshes → context identity
// changes → the effect's cleanup fires (removing the meshes) → the effect re-runs
// (re-adding them) → … a perpetual add/remove storm ("Maximum update depth
// exceeded"), compounded by SelectiveBloom rebuilding its Selection each render
// ("Layer out of range, resetting to 2"). With one <Select> per mark/drape that is
// thousands of setStates per second — the laptop freeze.
//
// This store does the same job (collect the emissive objects to bloom) WITHOUT the
// loop: register/unregister are STABLE callbacks, and emissive meshes attach a
// STABLE ref callback (useBloomRef) that React 19 invokes once on mount and whose
// returned cleanup runs on unmount — so re-renders never re-run it. The collected
// array feeds SelectiveBloom's `selection` prop, which (with no <Selection> context
// present) only sets the selection in an effect and never calls setState.
//
// Pure hooks/context (no JSX): the provider is applied directly in Scene3D as
// <BloomSelectionContext.Provider value={register}>.
import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Carries the stable `register(object3d) => cleanup` down to emissive meshes.
export const BloomSelectionContext = createContext(null);

/**
 * Owns the live set of emissive objects to bloom. Returns:
 *   - `selection`: an array (new identity only when MEMBERSHIP changes) for
 *     SelectiveBloom's `selection` prop — stable across spacing/zoom/rotate so the
 *     bloom effect is not re-driven on the hot paths.
 *   - `register`: a stable callback; calling it adds the object and returns an
 *     unregister cleanup.
 * @returns {{ selection: import('three').Object3D[], register: (o: any) => (() => void)|undefined }}
 */
export function useBloomSelectionStore() {
  const setRef = useRef(null);
  if (setRef.current === null) setRef.current = new Set();
  const [selection, setSelection] = useState([]);
  // Snapshot the live Set into a fresh array so React sees a new identity ONLY when
  // membership actually changes (mount/unmount of an emissive mesh), never on every
  // render.
  const sync = useCallback(() => setSelection(Array.from(setRef.current)), []);
  const register = useCallback(
    (obj) => {
      if (!obj) return undefined;
      setRef.current.add(obj);
      sync();
      return () => {
        setRef.current.delete(obj);
        sync();
      };
    },
    [sync],
  );
  return { selection, register };
}

/**
 * Stable ref-callback for an emissive mesh / line. Attach as `ref` on the object
 * you want bloomed. React 19 runs it once on mount (register) and runs the returned
 * cleanup on unmount (unregister); its identity is stable (it only depends on the
 * stable `register`), so re-renders never re-invoke it — no churn, no loop. Safe to
 * call when there is no provider (returns a no-op ref).
 * @returns {(obj: any) => (() => void)|undefined}
 */
export function useBloomRef() {
  const register = useContext(BloomSelectionContext);
  return useCallback(
    (obj) => {
      if (!register || !obj) return undefined;
      return register(obj);
    },
    [register],
  );
}
