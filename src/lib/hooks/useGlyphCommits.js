import { useCallback } from "react";
import { sequenceIndex, setSlotGlyphRef } from "../motif/chainEditor";

// useGlyphCommits — the write-owner for glyph commits (Wave 1, motif-session
// deepening, #77). CONTEXT.md "Motifs": a Glyph Commit is writing a glyph into
// the document's `customGlyphs` and pointing a layer's `glyphRef` at it — ALWAYS
// one undo entry. This hook is the single seam every such write funnels through.
//
// Before this hook, Studio's pen-editor modal IIFE (~1972-2026) did
// `bindLayerTo(addCustomGlyph(glyph))` — TWO separate `useLayers` calls, each
// recording its own history entry (`addCustomGlyph` records structurally,
// `updateLayer` records via the edit-coalescing path), so a single "Save a new
// motif" gesture cost the user two ⌘Z presses. `onUseLibraryGlyph` (~2259) got
// this right by wrapping copy + point-glyphRef in `recordBatch`. This hook generalizes
// that pattern to every glyph-write call site (grilled decision 2 in
// docs/motif-session-ORCHESTRATOR.md): `recordBatch` opens a single coalesce
// window (real begin/endCoalesce, not a second history call) so nested
// `record()`s from the wrapped calls are absorbed into one entry — see
// useHistory.js's `record()` early-return while a window is open.
//
// Wave 2 (`useMotifEditorSession`) will be the only consumer that decides WHEN
// to call these; this hook only decides HOW a write is shaped and stays
// atomic.
export default function useGlyphCommits({
  addCustomGlyph,
  updateCustomGlyph,
  updateLayer,
  recordBatch,
  layers,
  customGlyphs,
}) {
  // Add a new glyph to the document AND point `layerId`'s `params.glyphRef` at
  // it, folded into ONE history entry. Returns the new glyph id (mirrors
  // `addCustomGlyph`'s own return contract) so a caller (Save on a Draft
  // Glyph, Save-as-copy) can key off it immediately.
  //
  // Missing-layer choice: if `layerId` isn't in `layers`, we abort BEFORE
  // calling `addCustomGlyph` — no glyph write, no `recordBatch` call, no
  // history entry, `undefined` returned. This mirrors `updateCustomGlyph`'s
  // own guard-before-record discipline (useLayers.js: built-in target →
  // early-return before recording) rather than `updateLayer`'s "record then
  // no-op the mutation" behavior, because letting the glyph write through
  // here would leave a Glyph Commit with nothing pointing at it — a dangling
  // half-commit the "always atomic" invariant is meant to rule out entirely,
  // not just make undoable.
  const commitNewGlyph = useCallback(
    (glyph, layerId) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return undefined;
      let newId;
      recordBatch(() => {
        newId = addCustomGlyph(glyph);
        updateLayer(layerId, { params: { ...layer.params, glyphRef: newId } });
      });
      return newId;
    },
    [layers, addCustomGlyph, updateLayer, recordBatch]
  );

  // Fork a NEW glyph AND point a SEQUENCER SLOT's glyphRef at it (the C3 slot
  // commit-back), folded into ONE history entry. This is the slot-scoped sibling
  // of commitNewGlyph: instead of rebinding the LAYER's base `params.glyphRef`, it
  // rebinds `binding.chain[<sequence>].slots[slotIndex].glyphRef`, so forking a
  // built-in/unresolved slot glyph rebinds ONLY that slot — the base and sibling
  // slots on other refs are untouched.
  //
  // The sequence block index is derived FRESH from the layer's current binding
  // (the sequence is at-most-one and terminal), never captured at session-open
  // time. Aborts BEFORE the glyph write (no dangling half-commit, mirroring
  // commitNewGlyph's missing-layer guard) if the layer is gone, the binding isn't
  // chain-form with a sequence, or slotIndex is out of range.
  const commitNewGlyphToSlot = useCallback(
    (glyph, layerId, slotIndex) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return undefined;
      const binding = layer.params?.binding;
      const chain = binding?.chain;
      const seqIdx = sequenceIndex(chain);
      if (seqIdx === -1) return undefined; // not chain-form / no sequence to rebind
      const slots = chain[seqIdx].slots;
      if (!Array.isArray(slots) || slotIndex < 0 || slotIndex >= slots.length) {
        return undefined; // out-of-range slot → no write
      }
      let newId;
      recordBatch(() => {
        newId = addCustomGlyph(glyph);
        const nextChain = setSlotGlyphRef(chain, seqIdx, slotIndex, newId);
        updateLayer(layerId, {
          params: { ...layer.params, binding: { ...binding, chain: nextChain } },
        });
      });
      return newId;
    },
    [layers, addCustomGlyph, updateLayer, recordBatch]
  );

  // In-place commit of new geometry to an existing custom glyph (Save on one
  // already in the document — no layer write; `glyphRef` already points at it).
  // `updateCustomGlyph` already records its own single structural entry, so no
  // `recordBatch` wrapping is needed here.
  const updateGlyph = useCallback(
    (glyphId, glyph) => {
      updateCustomGlyph(glyphId, glyph);
    },
    [updateCustomGlyph]
  );

  // Idempotent keyed upsert: copying a library glyph into the document is a
  // no-op once it's already present (keyed by `glyph.id`), so re-selecting the
  // same library motif never overwrites a since-edited in-document copy or
  // leaves a redundant history entry.
  const copyGlyphToDoc = useCallback(
    (glyph) => {
      if (customGlyphs?.[glyph.id]) return;
      updateCustomGlyph(glyph.id, glyph);
    },
    [customGlyphs, updateCustomGlyph]
  );

  // Verbatim semantics of Studio's current `onUseLibraryGlyph` (~2259):
  // copy-if-absent + point the layer's params, folded into ONE history entry.
  // Deliberately does NOT guard a missing `layerId` — `updateLayer` no-ops the
  // mutation there today (per useLayers.js's accepted dead-entry note), and
  // the change budget forbids altering this call site's behavior.
  const placeFromLibrary = useCallback(
    (glyph, layerId, params) => {
      recordBatch(() => {
        if (!customGlyphs?.[glyph.id]) {
          updateCustomGlyph(glyph.id, glyph);
        }
        updateLayer(layerId, { params });
      });
    },
    [recordBatch, customGlyphs, updateCustomGlyph, updateLayer]
  );

  return {
    commitNewGlyph,
    commitNewGlyphToSlot,
    updateGlyph,
    copyGlyphToDoc,
    placeFromLibrary,
  };
}
