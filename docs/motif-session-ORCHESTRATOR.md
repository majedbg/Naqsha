# Motif Edit Session — Orchestrator Prompt

> **STATUS: READY (not yet executed)**
> **Generated:** 2026-07-09 · grilled from candidate 7 of the 2026-07-09 architecture review
> **Spec:** this file + `CONTEXT.md` (Motifs section — canonical vocabulary, added in the same grilling)
> **Usage:** paste everything below the divider into a fresh session as the opening prompt.
> **Pre-condition:** branch off `main`, working tree clean. Do NOT branch off
> `feat/preview-fidelity` (unpushed ADR-0003 work) — this edit is independent of it.

---

You are the ORCHESTRATOR for the Motif Edit Session deepening in Naqsha. Work
autonomously; only stop for the pre-flight check or a genuine spec contradiction.

## Why (one paragraph)

"What does Save / Cancel / Import mean" for a motif edit is currently split three ways:
`Inspector.openEditorFor` (~line 633: custom-vs-builtin fork, duplicate-to-edit draft),
`Inspector.handleImportChange` (~line 655: file read → parse → error banner → stamp +
rebind), and a ~55-line IIFE in `Studio.jsx` (~1972–2026: draft-vs-store resolution,
Save/SaveAsCopy/Cancel wiring). Deleting any one fragment makes its logic reappear in
the other two — the session concept never coalesced into a module. Additionally, the
shared "write glyph + point layer at it" gesture has inconsistent undo semantics:
`onUseLibraryGlyph` (Studio ~2259) batches copy+rebind into ONE ⌘Z entry, but draft-Save
(Studio ~2005) and import (Inspector ~673) produce TWO entries for the same gesture.

## Grilled decisions (binding — do not relitigate)

1. **Two modules.** `useGlyphCommits` (the write-owner: every `customGlyphs` +
   `glyphRef` write in the app goes through it) and `useMotifEditorSession` (the
   editor lifecycle, consuming glyph commits internally).
2. **Glyph Commit is always atomic.** Create/copy + rebind = one history entry,
   guaranteed inside `useGlyphCommits` via `recordBatch`. This is the ONLY permitted
   behavior change (see Change budget).
3. **The session owns the open decision.** `open(layerId, glyphRef)` decides: custom
   glyph → edit in place; built-in/unresolved → fork a Draft Glyph (D6: never in the
   store until Save); `openNew(layerId)` → blank Draft Glyph, pen tool active.
   Inspector loses all fork logic.
4. **The whole import flow moves into the session.** `importFromFile(file, layerId)`
   owns read → `importMotif` parse → error reporting through one `onError` seam →
   glyph commit. Inspector keeps only the `<input type=file>` arming/click wiring.
5. **Hook + dumb modal.** Studio renders `<MotifEditorModal {...session.modalProps}/>`;
   `MotifEditorModal`'s prop contract is UNCHANGED (its tests must survive untouched).
   The promote/sign-in gate stays in the modal — the session merely passes through
   `canSaveToLibrary`, `isLoggedIn`, `onSaveToLibrary`, `onRequireSignIn` in modalProps.
6. **Naming: "commit", never "bind"/"stamp"/"rebind".** Binding is reserved for how a
   motif attaches to host path anchors (see CONTEXT.md Motifs section). Update legacy
   comment language in the lines you touch; leave untouched files alone.

## Change budget (hard rule)

The ONLY behavior change: draft-Save and motif import become one ⌘Z entry (matching
use-from-library). Everything else — modal UX, D6 draft semantics, error copy, library
gating, prop contracts — pixel-identical. Existing tests must pass unmodified EXCEPT
any that assert the old two-step undo; update those deliberately and list each in the
final report.

## Ground rules

- TDD: failing vitest first, implement to green. Tests colocate next to source.
- CONTEXT.md vocabulary exactly: Glyph, Binding, Glyph Commit, Draft Glyph, Motif Edit
  Session — in code comments, test names, and identifiers.
- Match surrounding idiom: header comments explaining WHY, same density as
  `useOptimizations.js` / the shell suites.
- One conventional commit per wave on green: `refactor(motif): <summary>`.
- `npm test` + `npm run lint` fully green at every wave boundary.

## WAVE 1 — the write-owner (one agent)

### `src/lib/hooks/useGlyphCommits.js` + `.test.js` (new)

Takes `{ addCustomGlyph, updateCustomGlyph, updateLayer, recordBatch, layers,
customGlyphs }`; returns:

- `commitNewGlyph(glyph, layerId)` — add + point `glyphRef`, one batch entry; returns
  the new id. (Replaces Studio's `bindLayerTo(addCustomGlyph(...))` — currently TWO
  undo entries; becomes one.)
- `updateGlyph(glyphId, glyph)` — in-place restamp (Save on an existing custom glyph).
- `copyGlyphToDoc(glyph)` — idempotent keyed upsert (library copy; skip if present).
- `placeFromLibrary(glyph, layerId, params)` — copy-if-absent + layer params, one
  batch entry (verbatim semantics of Studio's current `onUseLibraryGlyph` ~2259).

TDD: atomicity (each commit = exactly one history entry — model on
`recordSites.integration.test.jsx`), idempotent copy, commit returns id, missing
layer no-ops safely.

## WAVE 2 — the session (one agent, needs Wave 1)

### `src/lib/hooks/useMotifEditorSession.js` + `.test.js` (new)

Consumes `useGlyphCommits` internally. Surface:

- `open(layerId, glyphRef)` — the fork decision (grilled decision 3). Move the
  custom-vs-builtin test from `Inspector.openEditorFor` (~633) and the
  `MOTIF_DRAFT_ID`/draft resolution from Studio's IIFE (~1978) in here.
- `openNew(layerId)` — blank Draft Glyph, `initialTool: "pen"` (from Studio ~2234).
- `importFromFile(file, layerId)` — full flow per grilled decision 4; errors go to the
  injected `onError` (Studio wires `showImportError`, same banner as today).
- `save(glyph)` / `saveAsCopy(glyph)` / `cancel()` — draft → `commitNewGlyph`,
  existing → `updateGlyph`; copy always commits new; cancel discards (D6).
- `isOpen`, `modalProps` — everything `MotifEditorModal` receives today (glyph
  resolution incl. draft, `parseD`/`anchorsToD`, `previewContext`, target layer,
  initial tool, the four promote-gate props passed through).

TDD: open forks built-ins but not customs, D6 (cancel after openNew/fork mutates
nothing), save-draft commits once, import error path commits nothing, modalProps
shape matches the modal's current contract.

## WAVE 3 — rewiring (one agent, needs Wave 2)

Owns `src/pages/Studio.jsx`, `src/components/shell/Inspector.jsx`.

- Studio: delete the `motifEditor` useState (~598), the IIFE (~1972–2026), the
  `onEditGlyph`/`onNewMotif` inline handlers (~2224–2247); mount the session hook once;
  render `{session.isOpen && <MotifEditorModal {...session.modalProps}/>}`. Replace
  `onCopyLibraryGlyph`/`onUseLibraryGlyph` bodies with `copyGlyphToDoc`/
  `placeFromLibrary` from `useGlyphCommits`.
- Inspector: `openEditorFor` becomes a one-line call to the session-open prop;
  `handleImportChange` shrinks to file-input mechanics + `importFromFile` (grilled
  decision 4 preview). `MotifDevice` stops receiving `addCustomGlyph`.
- Existing suites (`Inspector.motif.test.jsx`, `MotifEditorModal.test.jsx`,
  `InspectorEditButton.test.jsx`, `StudioRoute.*.test.jsx`) green per the change
  budget.

## Final gate

1. Full `npm test` + `npm run lint` green.
2. Drive the real flow in the dev server: add motif → edit built-in (duplicate-to-edit)
   → Save → ONE ⌘Z reverts glyph+rebind together → New motif → draw → Cancel (nothing
   in doc) → import an SVG motif → ONE ⌘Z → use a library motif → ONE ⌘Z.
3. Report: what shipped per wave, test counts, every test deliberately updated for the
   atomicity change, anything needing human eyes.

Do not merge; leave the branch pushed with the issue linked in the final commit body.
