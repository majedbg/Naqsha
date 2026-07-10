import { useCallback, useMemo, useState } from "react";
import useGlyphCommits from "./useGlyphCommits";
import { getGlyph, MOTIF_GLYPHS } from "../motif/glyphs.js";
import { importMotif } from "../motif/importMotif.js";

// Synthetic glyph id for a Draft Glyph session (New motif / Duplicate-to-edit):
// the working copy is edited off a transient draft (D6 — never in the store
// until Save) and only written to `customGlyphs` on Save, so `modalProps`
// needs a stable non-null key for the pen editor's preview override without
// ever being a real store entry. Never persisted.
//
// Wave 3 review (motif-session deepening, #77): this sentinel used to live in
// Studio.jsx and get threaded in ad hoc (`glyphId: draftGlyph ? MOTIF_DRAFT_ID
// : glyphId`); the session itself exposed a plain `glyphId: null` for drafts,
// which only rendered correctly because useCanvas.js's preview-override map
// happened to tolerate a `null` key. Owning the sentinel here — and always
// emitting it in `modalProps` for a Draft Glyph session — removes that
// coincidental tolerance as a load-bearing behavior.
export const MOTIF_DRAFT_ID = "__motif_draft__";

// useMotifEditorSession — the Motif Edit Session lifecycle (Wave 2, motif-session
// deepening, #77). CONTEXT.md "Motifs": a Motif Edit Session is the pen-editor
// lifecycle from open to Save / Save as copy / Cancel / Promote, and it OWNS the
// open decision (custom glyph -> edit in place; built-in -> fork a Draft Glyph;
// new -> blank Draft Glyph).
//
// Before this hook the session concept never coalesced into one module — it was
// split three ways: Inspector.openEditorFor (~633, the custom-vs-built-in fork),
// Inspector.handleImportChange (~655, the import read/parse/error/commit flow),
// and a ~55-line IIFE in Studio.jsx (~1972-2026, draft-vs-store glyph resolution
// + Save/SaveAsCopy/Cancel wiring). Deleting any one fragment made its logic
// reappear in the other two — the session concept never coalesced into a
// module. This hook IS that module: it consumes `useGlyphCommits` (Wave 1, the
// write-owner) internally and decides WHEN to call it, so every glyph write a
// motif-edit gesture makes is exactly one undo entry — the sanctioned behavior
// change (grilled decision 2 in docs/motif-session-ORCHESTRATOR.md): draft-Save
// and motif import now cost the user ONE Cmd+Z, matching `placeFromLibrary`'s
// existing one-entry semantics.
//
// D6 (CONTEXT.md "Draft Glyph"): a Draft Glyph is owned by the session ALONE —
// never in the document until Save commits it via `commitNewGlyph`. Cancel
// discards the session with zero document mutation; the session keeps the
// draft only in local React state, so there is nothing to roll back.
//
// Wave 3 wires this hook into Studio.jsx/Inspector.jsx in place of the three
// fragments above; this file does not touch either.
export default function useMotifEditorSession({
  layers,
  customGlyphs,
  addCustomGlyph,
  updateCustomGlyph,
  updateLayer,
  recordBatch,
  parseD,
  anchorsToD,
  previewContext,
  onError,
  canSaveToLibrary = false,
  isLoggedIn = false,
  onSaveToLibrary,
  onRequireSignIn,
}) {
  const glyphCommits = useGlyphCommits({
    addCustomGlyph,
    updateCustomGlyph,
    updateLayer,
    recordBatch,
    layers,
    customGlyphs,
  });

  // `session` is null when closed. `draftGlyph` present => a Draft Glyph session
  // (fork / new, D6: not in the store); absent => editing an existing custom
  // glyph in place, resolved live from `customGlyphs` by `glyphId`.
  const [session, setSession] = useState(null);

  // The fork decision (grilled decision 3, moved verbatim from Inspector's
  // `openEditorFor` ~633): a CUSTOM glyph (not a built-in id, present in this
  // document's customGlyphs) opens in place. A BUILT-IN id or an unresolved ref
  // is read-only, so we fork its geometry into a Draft Glyph and open the editor
  // on that draft instead — the built-in is never written to.
  const open = useCallback(
    (layerId, glyphRef) => {
      const isCustom =
        glyphRef && !MOTIF_GLYPHS[glyphRef] && !!customGlyphs?.[glyphRef];
      if (isCustom) {
        setSession({ glyphId: glyphRef, layerId, initialTool: null, draftGlyph: null });
        return;
      }
      const builtIn = getGlyph(glyphRef, customGlyphs) || MOTIF_GLYPHS.leaf;
      setSession({
        glyphId: null,
        layerId,
        initialTool: null,
        draftGlyph: {
          name: builtIn.name,
          tradition: "custom",
          paths: builtIn.paths,
          viewRadius: builtIn.viewRadius,
          root: builtIn.root ?? { x: 0, y: 0, angle: 0 },
        },
      });
    },
    [customGlyphs]
  );

  // "New motif…" (draw-from-scratch, moved verbatim from Studio's `onNewMotif`
  // ~2234): a blank Draft Glyph, pen tool active so the user draws immediately.
  const openNew = useCallback((layerId) => {
    setSession({
      glyphId: null,
      layerId,
      initialTool: "pen",
      draftGlyph: {
        name: "New motif",
        tradition: "custom",
        paths: [],
        viewRadius: 0,
        root: { x: 0, y: 0, angle: 0 },
      },
    });
  }, []);

  // The full import flow (grilled decision 4, moved verbatim from Inspector's
  // `handleImportChange` ~655): read -> `importMotif` parse -> errors surface
  // through the injected `onError` seam -> ONE atomic Glyph Commit via
  // `glyphCommits.commitNewGlyph` (the other sanctioned behavior change — the
  // old fragment did an unbatched `addCustomGlyph` + `updateLayer`, two undo
  // entries). Independent of any open session: a picker row imports directly
  // onto its own layer without opening the pen editor.
  const importFromFile = useCallback(
    async (file, layerId) => {
      let text;
      try {
        text = await file.text();
      } catch {
        onError?.("Could not read that file.");
        return;
      }
      const result = importMotif(text);
      if (!result.ok) {
        onError?.(result.error || "Could not import this SVG.");
        return;
      }
      glyphCommits.commitNewGlyph(result.glyph, layerId);
    },
    [onError, glyphCommits]
  );

  const close = useCallback(() => setSession(null), []);

  // Save: a Draft Glyph session (fork / new) commits a brand-new glyph + points
  // the target layer's glyphRef, ONE undo entry (the sanctioned change — the old
  // IIFE did `bindLayerTo(addCustomGlyph(...))`, two entries). An existing-custom
  // session commits the new geometry in place — no layer write; `glyphRef`
  // already points at it.
  const save = useCallback(
    (glyph) => {
      if (!session) return;
      if (session.draftGlyph) {
        glyphCommits.commitNewGlyph(glyph, session.layerId);
      } else {
        glyphCommits.updateGlyph(session.glyphId, glyph);
      }
      close();
    },
    [session, glyphCommits, close]
  );

  // Save as copy: ALWAYS forks a new glyph (even when editing an existing
  // custom in place) and points only this session's layer — one undo entry.
  const saveAsCopy = useCallback(
    (glyph) => {
      if (!session) return;
      glyphCommits.commitNewGlyph(glyph, session.layerId);
      close();
    },
    [session, glyphCommits, close]
  );

  // Cancel: discard with zero document mutation (D6) — the session never wrote
  // anything to the store, so closing is the entire operation.
  const cancel = useCallback(() => close(), [close]);

  // Draft-aware glyph resolution (moved verbatim from Studio's IIFE ~1979-1981):
  // a Draft Glyph session resolves from the transient draft; an existing-custom
  // session resolves live from the document. If neither resolves — e.g. the
  // glyphRef was removed out from under an open session — the old IIFE's
  // `if (!editGlyph) return null` becomes `isOpen: false` here: same "render
  // nothing" outcome, expressed as session state instead of a null render.
  const editGlyph = session
    ? session.draftGlyph ?? getGlyph(session.glyphId, customGlyphs)
    : null;
  const isOpen = !!session && !!editGlyph;

  // Everything MotifEditorModal receives today (its prop contract is frozen —
  // see docs/motif-session-ORCHESTRATOR.md). The four promote-gate props pass
  // through verbatim from this hook's own inputs; the gate logic stays in the
  // modal (grilled decision 5).
  const modalProps = useMemo(() => {
    if (!isOpen) return null;
    return {
      // A Draft Glyph session (fork/new) always surfaces the MOTIF_DRAFT_ID
      // sentinel here — never the internal `null` — so the modal (and its
      // preview-override map) get a stable non-null key. `save()` still
      // branches on `session.draftGlyph`, not this value.
      glyphId: session.draftGlyph ? MOTIF_DRAFT_ID : session.glyphId,
      glyph: editGlyph,
      layers,
      targetLayerId: session.layerId,
      initialTool: session.initialTool ?? "direct-select",
      parseD,
      anchorsToD,
      previewContext,
      onSave: save,
      onSaveAsCopy: saveAsCopy,
      onCancel: cancel,
      canSaveToLibrary,
      isLoggedIn,
      onSaveToLibrary,
      onRequireSignIn,
    };
  }, [
    isOpen,
    session,
    editGlyph,
    layers,
    parseD,
    anchorsToD,
    previewContext,
    save,
    saveAsCopy,
    cancel,
    canSaveToLibrary,
    isLoggedIn,
    onSaveToLibrary,
    onRequireSignIn,
  ]);

  return {
    open,
    openNew,
    importFromFile,
    save,
    saveAsCopy,
    cancel,
    isOpen,
    modalProps,
  };
}
