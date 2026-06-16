import { useRef, useEffect } from "react";
import { TextNode } from "../../lib/scene/TextNode";

// Hidden/visually-minimal <textarea> that OWNS keystrokes for the node being
// edited (so IME, paste and mobile keyboards work). It is positioned over the
// node's glyphs in CANVAS coordinates — it lives INSIDE the scaled canvas box
// (see RightPanel), so its left/top/width/height inherit `scale(finalScale)`
// and stay aligned with the drawn glyphs at any zoom.
//
// The canvas (useCanvas) draws the live glyphs AND the blinking caret; this
// textarea is near-transparent (its own text is invisible) but FOCUSABLE. Its
// value === the node's text; `onInput` pushes edits up so the canvas repaints.
//
// Enter = newline (multi-line). Escape commits/exits. We do NOT treat Enter as
// commit. Caret index is the textarea's native selectionStart, mirrored to a
// custom event so useCanvas can place the on-canvas caret.
export default function TextEditOverlay({ node, font, onEditText, onExitEdit }) {
  const ref = useRef(null);

  // Focus on mount + place the caret at the END of the text (re-edit lands at
  // the end; a fresh empty node lands at index 0, which is also the end).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      /* setSelectionRange can throw on some input types — ignore */
    }
    emitCaret(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // Broadcast the caret index (selectionStart) so useCanvas can draw the caret
  // at the right glyph offset. A window CustomEvent keeps the wiring loose (no
  // prop drill through useCanvas's many args).
  const emitCaret = (index) => {
    window.dispatchEvent(
      new CustomEvent("text-caret", { detail: { id: node.id, index } })
    );
  };

  const handleInput = (e) => {
    onEditText(node.id, e.target.value);
    emitCaret(e.target.selectionStart ?? e.target.value.length);
  };

  const handleKeyDown = (e) => {
    // Escape commits/exits. Stop propagation so the global keydown handler (which
    // ignores textarea targets anyway) and others don't double-handle it.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onExitEdit();
      return;
    }
    // Enter is a literal newline — let the textarea handle it natively.
    // Allow Cmd/Ctrl+Z to reach the textarea's NATIVE undo while typing (don't
    // let it bubble to the app-level history undo). Selection/caret keys update
    // the caret on keyup.
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.stopPropagation();
    }
  };

  // After any key that may move the caret (arrows, Home/End, typing) or a
  // selection change, mirror the new caret index.
  const handleSelect = () => {
    const el = ref.current;
    if (el) emitCaret(el.selectionStart ?? 0);
  };

  // Position/size the textarea over the node's laid-out glyph box (canvas
  // coords). Use the tight local bbox; a min size keeps an empty node clickable.
  let left = node.x || 0;
  let top = node.y || 0;
  let width = 0;
  let height = 0;
  if (font) {
    const tn = new TextNode({ ...node, font });
    const bb = tn.localBBox();
    width = bb.w;
    height = bb.h;
  }
  // Fallback footprint for an empty node so the textarea exists + is focusable.
  width = Math.max(width, node.fontSize || 48);
  height = Math.max(height, (node.fontSize || 48) * (node.lineHeight || 1.2));

  return (
    <textarea
      ref={ref}
      value={node.text}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      onKeyUp={handleSelect}
      onSelect={handleSelect}
      onClick={handleSelect}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      className="absolute resize-none outline-none border-0 overflow-hidden"
      style={{
        left,
        top,
        width,
        height,
        // The textarea sits ON TOP of the glyphs but is invisible: transparent
        // text/caret/background so the CANVAS-drawn glyphs + caret are what the
        // user sees. It still owns keystrokes/IME/paste.
        color: "transparent",
        caretColor: "transparent",
        background: "transparent",
        // p5 default text uses no padding; match so glyph/textarea origins align.
        padding: 0,
        margin: 0,
        // Keep it above the canvas but below the pointer overlay is fine — it is
        // auto-focused and retains focus for keystrokes.
        zIndex: 5,
        lineHeight: `${node.fontSize * (node.lineHeight || 1.2)}px`,
        fontSize: `${node.fontSize}px`,
        whiteSpace: "pre",
      }}
    />
  );
}
