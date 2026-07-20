import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  loadUserMotifs,
  saveUserMotif,
  deleteUserMotif,
} from "../userMotifService";

// useGlobalMotifLibrary — P4-3 (svg-motif-editor DECISIONS D1)
//
// Loads the signed-in user's GLOBAL motif library and promotes a document
// glyph into it ("Save to my library"). Everything is GRACEFUL when logged-out
// or offline: no user → empty list + promote resolves null; a service rejection
// (offline / RLS) sets `error` and keeps the app running — it never throws to
// the caller (the UI treats a failed promote as "couldn't save", not a crash).
//
// COPY-on-use: the returned motifs carry a `glyph` re-keyed to their DB uuid;
// the picker copies that glyph into the document's customGlyphs on place (the
// document stays self-contained — see the P4 orchestrator doc).
//
// State lives in a reducer (not useState) so the mount/user-change fetch can
// dispatch synchronously inside its effect without tripping the repo's
// react-hooks/set-state-in-effect rule (dispatch is exempt; setState is not).

const initialState = { motifs: [], loading: false, error: null };

function reducer(state, action) {
  switch (action.type) {
    case "reset":
      return { motifs: [], loading: false, error: null };
    case "loading":
      return { ...state, loading: true, error: null };
    case "loaded":
      return { motifs: action.motifs, loading: false, error: null };
    case "loadError":
      return { motifs: [], loading: false, error: action.error };
    case "prepend":
      return { ...state, motifs: [action.motif, ...state.motifs] };
    case "removed":
      return { ...state, motifs: state.motifs.filter((m) => m.id !== action.id) };
    case "promoteError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

/**
 * @param {{id:string}|null} user  the signed-in user (from useAuth), or null
 * @returns {{ motifs: Array, loading: boolean, error: Error|null,
 *            promote: (glyph:object)=>Promise<object|null>, refresh: ()=>void }}
 */
export default function useGlobalMotifLibrary(user) {
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
    loadUserMotifs(userId)
      .then((list) => {
        if (mySeq !== seqRef.current) return;
        dispatch({ type: "loaded", motifs: list || [] });
      })
      .catch((error) => {
        if (mySeq !== seqRef.current) return;
        // Graceful: keep the library empty and surface the error; never throw.
        dispatch({ type: "loadError", error });
      });
  }, [userId]);

  // Fetch on mount + whenever the signed-in user changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const promote = useCallback(
    async (glyph) => {
      if (!userId) return null; // login gate is enforced in the UI; belt-and-braces
      try {
        const saved = await saveUserMotif(userId, glyph);
        if (saved) dispatch({ type: "prepend", motif: saved });
        return saved;
      } catch (error) {
        dispatch({ type: "promoteError", error });
        return null; // graceful — the caller shows "couldn't save", never crashes
      }
    },
    [userId]
  );

  // Remove a library row (motif-shell, D — the library panel's delete). Same
  // graceful contract as promote: optimistic-after-success, never throws to
  // the caller; a service rejection lands in `error` and the row stays.
  const remove = useCallback(
    async (motifId) => {
      if (!userId) return false;
      try {
        await deleteUserMotif(motifId, userId);
        dispatch({ type: "removed", id: motifId });
        return true;
      } catch (error) {
        dispatch({ type: "promoteError", error });
        return false;
      }
    },
    [userId]
  );

  return {
    motifs: state.motifs,
    loading: state.loading,
    error: state.error,
    promote,
    remove,
    refresh,
  };
}
