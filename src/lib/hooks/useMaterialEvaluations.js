import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  loadEvaluations,
  submitEvaluation,
} from "../materialEvaluationService";

// useMaterialEvaluations — material-evaluation slice 1
//
// Loads the signed-in user's evaluation submissions (photo-of-Sheet next to
// render screenshot — docs/material-evaluation-VISION.md) and submits a new
// pairing. Mirrors useGlobalMotifLibrary: everything is GRACEFUL when
// logged-out or offline — no user → empty list + submit resolves null; a
// service rejection sets `error` and keeps the app running (the UI treats a
// failed submit as "couldn't submit", not a crash).
//
// State lives in a reducer (not useState) so the mount/user-change fetch can
// dispatch synchronously inside its effect without tripping the repo's
// react-hooks/set-state-in-effect rule (dispatch is exempt; setState is not).

const initialState = { evaluations: [], loading: false, error: null };

function reducer(state, action) {
  switch (action.type) {
    case "reset":
      return { evaluations: [], loading: false, error: null };
    case "loading":
      return { ...state, loading: true, error: null };
    case "loaded":
      return { evaluations: action.evaluations, loading: false, error: null };
    case "loadError":
      return { evaluations: [], loading: false, error: action.error };
    case "prepend":
      return { ...state, evaluations: [action.evaluation, ...state.evaluations] };
    case "submitError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

/**
 * @param {{id:string}|null} user  the signed-in user (from useAuth), or null
 * @returns {{ evaluations: Array, loading: boolean, error: Error|null,
 *            submit: (args:object)=>Promise<object|null>, refresh: ()=>void }}
 */
export default function useMaterialEvaluations(user) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const userId = user?.id ?? null;

  // Sequence guard: only the latest fetch's result may land (prevents a stale
  // response from a prior user/refresh overwriting a fresh one).
  const seqRef = useRef(0);

  const refresh = useCallback(() => {
    if (!userId) {
      seqRef.current++; // invalidate any in-flight fetch
      dispatch({ type: "reset" });
      return;
    }
    const mySeq = ++seqRef.current;
    dispatch({ type: "loading" });
    loadEvaluations(userId)
      .then((list) => {
        if (mySeq !== seqRef.current) return;
        dispatch({ type: "loaded", evaluations: list || [] });
      })
      .catch((error) => {
        if (mySeq !== seqRef.current) return;
        // Graceful: keep the list empty and surface the error; never throw.
        dispatch({ type: "loadError", error });
      });
  }, [userId]);

  // Fetch on mount + whenever the signed-in user changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(
    async (args) => {
      if (!userId) return null; // login gate is enforced in the UI; belt-and-braces
      try {
        const stored = await submitEvaluation({ ...args, userId });
        if (stored) dispatch({ type: "prepend", evaluation: stored });
        return stored;
      } catch (error) {
        dispatch({ type: "submitError", error });
        return null; // graceful — the caller shows "couldn't submit", never crashes
      }
    },
    [userId]
  );

  return {
    evaluations: state.evaluations,
    loading: state.loading,
    error: state.error,
    submit,
    refresh,
  };
}
