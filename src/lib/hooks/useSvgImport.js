// useSvgImport — attach drag-drop + paste SVG import gestures to a DOM element
// (issue #12, C4). When an SVG arrives by either gesture, the raw markup is
// handed to `onImport(svgText)`; the caller (Studio) turns it into a layer.
//
// Two of the three entry points live here (drag-drop, paste); File>Import is a
// file picker wired separately in Studio. Kept tiny and dependency-free so it is
// node/jsdom testable and reusable.

import { useEffect } from 'react';

const SVG_MIME = 'image/svg+xml';

function looksLikeSvg(text) {
  return typeof text === 'string' && /<svg[\s>]/i.test(text);
}

// Pick the first SVG out of a FileList-ish (by mime or .svg extension).
function svgFileFrom(files) {
  if (!files) return null;
  for (const f of files) {
    if (!f) continue;
    if (f.type === SVG_MIME || /\.svg$/i.test(f.name || '')) return f;
  }
  return null;
}

/**
 * @param {React.RefObject<HTMLElement>} targetRef - element to attach gestures to
 * @param {(svgText: string) => void} onImport - called with raw SVG markup
 */
export default function useSvgImport(targetRef, onImport) {
  useEffect(() => {
    const el = targetRef?.current;
    if (!el || typeof onImport !== 'function') return undefined;

    // Allow drop by preventing the default (which would otherwise navigate).
    const onDragOver = (e) => e.preventDefault();

    const onDrop = async (e) => {
      const file = svgFileFrom(e.dataTransfer?.files);
      if (!file) return;
      e.preventDefault();
      try {
        const text = await file.text();
        if (looksLikeSvg(text)) onImport(text);
      } catch {
        /* unreadable file — ignored; File>Import surfaces parse errors */
      }
    };

    const onPaste = async (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      // Prefer a real SVG file on the clipboard; else fall back to pasted text.
      const file = svgFileFrom(cd.files);
      if (file) {
        e.preventDefault();
        try {
          const text = await file.text();
          if (looksLikeSvg(text)) onImport(text);
        } catch { /* ignored */ }
        return;
      }
      const text = cd.getData?.('text/plain') ?? '';
      if (looksLikeSvg(text)) {
        e.preventDefault();
        onImport(text);
      }
    };

    // drop/dragover fire on the drop target (the canvas), so bind them to the
    // element. paste, however, dispatches to the focused element / document.body
    // and bubbles up — a non-focusable canvas div would never receive it — so
    // bind paste to `document` to catch a global paste gesture.
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, [targetRef, onImport]);
}
