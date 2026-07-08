// MotifEditorModal — the pen-editor shell (WI-P2-2).
//
// A large, centred editing "sheet" in the Naqsha design language: cream naqsheh
// paper with a faint graticule (the loom-cartoon anchor), the motif's path drawn
// as a thin violet ornamental outline, and a distinct jewel-madder ⊕ marking the
// root (sprout point) — never mistakable for a path anchor.
//
// This slice renders the path READ-ONLY. It establishes the working-copy chrome:
// an editable name, the "used by N layers" badge (custom motifs are a shared
// asset — Save restamps every layer; Save as copy forks one), an inert Preview
// checkbox (wired to the mini full-canvas preview in WI-P2-5), and the
// focus-trap / Escape-to-cancel / overlay-close idioms shared with the studio's
// other modals. Interactivity (anchors, handles, root drag) arrives in later WIs.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import useMotifEditor, {
  usedByCount,
  boundsFromWorkingCopy,
} from './useMotifEditor';
import PenCanvas from './PenCanvas';
// MiniPreview is LAZY-loaded: it statically imports the real render pipeline
// (useCanvas → p5 → the gifenc CJS/ESM hazard). A static import here would pull
// that whole chain into every module that imports this modal — notably Studio —
// so unrelated Studio/StudioRoute tests (which shield themselves by mocking
// RightPanel, the OTHER useCanvas path) would break at import time. Lazy() keeps
// useCanvas OUT of the static graph; it loads only when Preview is actually
// toggled on. See docs/svg-motif-editor-P2-ORCHESTRATOR.md run log (WI-P2-5).
const MiniPreview = lazy(() => import('./MiniPreview'));
import { deleteAnchors } from './penMachine';

/** viewBox string with proportional padding; guards against a degenerate box. */
function viewBoxFor(working) {
  const { minX, minY, maxX, maxY } = boundsFromWorkingCopy(working);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.14 || 1;
  return {
    box: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
    span: Math.max(w, h) + pad * 2,
  };
}

// The editor's tools (Illustrator-faithful). Keys P/A/V + Shift+C switch them.
const TOOLS = [
  { id: 'pen', label: 'Pen', hint: 'P', testid: 'motif-tool-pen' },
  { id: 'direct-select', label: 'Select', hint: 'A', testid: 'motif-tool-select' },
  { id: 'move', label: 'Move', hint: 'V', testid: 'motif-tool-move' },
  { id: 'convert', label: 'Convert', hint: '⇧C', testid: 'motif-tool-convert' },
];

export default function MotifEditorModal({
  glyphId,
  glyph,
  layers = [],
  onSave,
  onSaveAsCopy,
  onCancel,
  // The tool the editor opens with. "New motif…" (draw-from-scratch) opens with
  // 'pen'; editing an existing glyph opens with 'direct-select'.
  initialTool = 'direct-select',
  // Injected pathModel ops (parseD / anchorsToD). Optional in this slice — the
  // read-only render consumes neither; later WIs wire pathModel.js through here.
  parseD,
  anchorsToD,
  // The live full-canvas render inputs (layers/operations/machineProfile/…),
  // assembled by Studio, threaded into the mini Preview so it re-stamps the whole
  // pattern through the SAME pipeline as the real canvas. Null → Preview still
  // renders but with an empty canvas (harmless; Studio always supplies it).
  previewContext = null,
  // The layer being edited — forwarded to MiniPreview so a create-session preview
  // (New motif / Duplicate-to-edit, not yet bound in the document) still stamps on
  // its host. Edit sessions are already bound → no effect.
  targetLayerId = null,
  // ── P4: promote to the user's GLOBAL library ("Save to my library", D1) ──────
  // TWO distinct gates: (1) premium entitlement `canSaveToLibrary` — the scaffold
  // ships ON-for-all (Studio passes canUseGlobalLibrary()=true), and when false
  // the button is HIDDEN (flip-to-premium later hides it for un-entitled tiers);
  // (2) the LOGIN gate `isLoggedIn` — logged-out shows the button but it prompts
  // sign-in (onRequireSignIn) instead of promoting. onSaveToLibrary receives the
  // serialized working glyph (verbatim d), same as Save.
  canSaveToLibrary = false,
  isLoggedIn = false,
  onSaveToLibrary,
  onRequireSignIn,
}) {
  const {
    working,
    setName,
    serialize,
    previewPaths,
    applyEdit,
    previewRoot,
    applyRoot,
    undo,
    redo,
    selection,
    setSelection,
  } = useMotifEditor(glyph, {
    parseD,
    anchorsToD,
  });
  // Preview is INERT this slice — state settles the layout; WI-P2-5 wires it to
  // the throttled mini full-canvas preview.
  const [preview, setPreview] = useState(false);

  // Active tool + the pen's "active subpath" being drawn (null = not mid-draw).
  // penDraft is the single source of truth for mid-draw state (drives Esc/Enter
  // finish + PenCanvas's close/extend branching).
  const [tool, setTool] = useState(initialTool);
  const [penDraft, setPenDraft] = useState(null);

  // Switching tools finishes any in-progress pen path (deselect the draft).
  const changeTool = useCallback((next) => {
    setTool(next);
    setPenDraft(null);
  }, []);

  const dialogRef = useRef(null);
  // Establish the trap now: focus the frame on open so keyboard lands inside it
  // (full tab-cycle trapping folds in with the pen tools in later WIs).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Delete the currently-selected anchors and clear the selection. A commit
  // (applyEdit → one undo step); if nothing is selected it's a no-op.
  const deleteSelected = useCallback(() => {
    if (!selection || selection.length === 0) return;
    applyEdit(deleteAnchors(working.paths, selection));
    setSelection([]);
  }, [selection, working.paths, applyEdit, setSelection]);

  // Keyboard is SCOPED to the editor: EVERY handled key stops propagation +
  // prevents default so the editor's Undo/Delete never leak to the app's GLOBAL
  // shortcuts (global Delete removes LAYERS; global ⌘Z is document undo). Escape
  // → cancel; ⌘/Ctrl+Z → modal undo; ⇧⌘Z / Ctrl+Y → modal redo; Delete/Backspace
  // → delete selected anchor(s).
  const handleKeyDown = useCallback(
    (e) => {
      e.stopPropagation(); // never leak to global app shortcuts, from anywhere
      // Esc/Enter FINISH a mid-draw pen path first (Illustrator); with no draft,
      // Esc cancels the modal and Enter is inert.
      if (e.key === 'Escape') {
        e.preventDefault();
        if (penDraft) setPenDraft(null);
        else onCancel?.();
        return;
      }
      if (e.key === 'Enter' && penDraft) {
        e.preventDefault();
        setPenDraft(null);
        return;
      }
      // Never hijack keys a text field owns (Backspace deletes chars, ⌘Z is
      // native text-undo, letters type) — the name input is a descendant here.
      const el = e.target;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (!mod && (e.key === 'c' || e.key === 'C') && e.shiftKey) {
        // Shift+C → Convert Anchor tool.
        e.preventDefault();
        changeTool('convert');
      } else if (!mod && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        changeTool('pen');
      } else if (!mod && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        changeTool('direct-select');
      } else if (!mod && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        changeTool('move');
      }
    },
    [onCancel, undo, redo, deleteSelected, penDraft, changeTool]
  );

  const n = usedByCount(layers, glyphId);
  const { box, span } = viewBoxFor(working);
  const gridStep = span / 12;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit motif"
        tabIndex={-1}
        data-testid="motif-editor-dialog"
        className="flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-md border border-card-border bg-panel outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header — editable name, shared-asset badge, inert preview, close. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
          <input
            data-testid="motif-editor-name"
            aria-label="Motif name"
            value={working.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled motif"
            className="min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink outline-none hover:border-hairline focus:border-violet"
          />
          {n > 0 && (
            <span
              data-testid="motif-editor-usedby"
              className="shrink-0 rounded-xs bg-paper-warm px-2 py-0.5 text-[11px] text-ink-soft"
              title="Saving updates every layer that uses this motif"
            >
              Used by {n} {n === 1 ? 'layer' : 'layers'}
            </span>
          )}
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-soft">
            <input
              type="checkbox"
              data-testid="motif-editor-preview"
              checked={preview}
              onChange={(e) => setPreview(e.target.checked)}
            />
            <span>Preview</span>
          </label>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="shrink-0 px-1 text-lg leading-none text-ink-soft transition-colors hover:text-ink"
          >
            &times;
          </button>
        </div>

        {/* Tool strip — Pen / Select / Move / Convert. Compact, Naqsha chrome;
            the active tool is filled. Keys P/A/V + Shift+C mirror these. */}
        <div
          data-testid="motif-toolbar"
          className="flex shrink-0 items-center gap-1 border-b border-hairline px-4 py-1.5"
        >
          {TOOLS.map((t) => {
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={t.testid}
                aria-pressed={active}
                aria-label={`${t.label} tool (${t.hint})`}
                title={`${t.label} (${t.hint})`}
                onClick={() => changeTool(t.id)}
                className={`rounded-xs px-2 py-0.5 text-[11px] font-medium outline-none transition-colors ${
                  active
                    ? 'bg-violet text-paper'
                    : 'text-ink-soft hover:bg-paper-warm hover:text-ink'
                }`}
              >
                {t.label}
                <span className="ml-1 text-[10px] opacity-60">{t.hint}</span>
              </button>
            );
          })}
        </div>

        {/* Editing sheet — naqsheh paper + faint graticule. PenCanvas owns the
            <svg> (keeps the motif-editor-canvas testid) + the tool furniture; the
            modal wires its edit/undo/selection/pen-draft/root seams. When Preview
            is on, the throttled mini full-canvas floats in a corner (unobtrusive,
            Naqsha tokens) so edits are read against the whole pattern. */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-paper p-4">
          <PenCanvas
            working={working}
            box={box}
            span={span}
            gridStep={gridStep}
            selection={selection}
            tool={tool}
            penDraft={penDraft}
            anchorsToD={anchorsToD}
            onPreview={previewPaths}
            onCommit={applyEdit}
            onSelectionChange={setSelection}
            onPenDraftChange={setPenDraft}
            onRootPreview={previewRoot}
            onRootCommit={applyRoot}
          />
          {preview && (
            <div className="absolute bottom-4 right-4 z-10">
              <Suspense fallback={null}>
                <MiniPreview
                  previewContext={previewContext}
                  glyphId={glyphId}
                  workingGlyph={serialize()}
                  targetLayerId={targetLayerId}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Footer — discard / fork / commit. Hierarchy: Save is the load-bearing
            saffron fill; Save as copy is the secondary violet outline; Cancel is
            a quiet ghost. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-3">
          {/* Promote to the global library — left-aligned, distinct from the
              document commit actions. Hidden when the premium scaffold is flipped
              off for this tier; logged-out prompts sign-in instead of saving. */}
          <div className="flex items-center">
            {canSaveToLibrary && (
              <button
                type="button"
                data-testid="motif-editor-save-library"
                onClick={() =>
                  isLoggedIn ? onSaveToLibrary?.(serialize()) : onRequireSignIn?.()
                }
                title={
                  isLoggedIn
                    ? 'Save this motif to your global library'
                    : 'Sign in to save this motif to your library'
                }
                className="rounded-xs border border-hairline px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-violet hover:text-ink"
              >
                {isLoggedIn ? 'Save to my library' : 'Sign in to save to library'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="motif-editor-cancel"
            onClick={onCancel}
            className="rounded-xs px-3 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="motif-editor-save-copy"
            onClick={() => onSaveAsCopy?.(serialize())}
            className="rounded-xs border border-violet px-3 py-1.5 text-xs font-medium text-violet transition-colors hover:bg-violet/10"
          >
            Save as copy
          </button>
          <button
            type="button"
            data-testid="motif-editor-save"
            onClick={() => onSave?.(serialize())}
            className="rounded-xs bg-saffron px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-saffron-hover"
          >
            Save
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
