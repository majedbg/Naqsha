// MiniPreview — the throttled mini full-canvas preview (WI-P2-5, spec D5).
//
// The editor canvas (PenCanvas) is live + instant for the SINGLE glyph. This
// panel answers a different question: "what does the WHOLE pattern look like with
// my in-progress edits?" It re-stamps the entire canvas through the real render
// pipeline (useCanvas) using a TRANSIENT customGlyphs OVERRIDE — the working
// glyph is injected under its own id, so every layer that references it re-renders
// from the working copy WITHOUT committing anything to the document.
//
// THROTTLE (critical): swapping the override glyph identity re-runs the ENTIRE
// pattern pipeline (all layers, p5). Feeding a fresh working glyph on every
// mousemove would thrash. Instead we keep `throttledGlyph` in state and advance it
// on an rAF tick: each new `workingGlyph` cancels any pending frame and schedules
// one, so a dense drag COALESCES to ≤1 re-stamp per frame. The first paint uses
// the initial glyph immediately (no wait).

import { useEffect, useRef, useState } from 'react';
import useCanvas from '../../lib/useCanvas';

export default function MiniPreview({
  previewContext,
  glyphId,
  workingGlyph,
  // The layer being edited. For a CREATE session (New motif / Duplicate-to-edit)
  // the document layer isn't bound to `glyphId` yet (binding is deferred to Save
  // so Cancel discards cleanly — D6), so the preview transiently rebinds it here.
  // For an EDIT session the layer already references `glyphId`, so this is a no-op.
  targetLayerId = null,
}) {
  const {
    layers = [],
    canvasW = 0,
    canvasH = 0,
    bgColor = '#ffffff',
    operations = [],
    machineProfile = null,
    colorView = null,
    panels = [],
    customGlyphs = {},
    textFont = null,
  } = previewContext || {};

  const containerRef = useRef(null);

  // rAF-coalesced working glyph. Seed with the current glyph so the first frame
  // paints immediately; subsequent updates ride the rAF throttle below.
  const [throttledGlyph, setThrottledGlyph] = useState(workingGlyph);
  const rafRef = useRef(null);
  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setThrottledGlyph(workingGlyph);
    });
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [workingGlyph]);

  // The whole point: the override map = the document's glyphs plus THIS glyph's
  // working copy under its id. The render seam applies it to every layer.
  const overrideGlyphs = { ...customGlyphs, [glyphId]: throttledGlyph };

  // Transiently bind the edited layer to `glyphId` so a create-session preview
  // stamps onto its host (edit sessions are already bound → identity map). This
  // is preview-only — the real document `layers` are never mutated.
  const previewLayers = targetLayerId
    ? layers.map((l) =>
        l?.id === targetLayerId
          ? { ...l, params: { ...l.params, glyphRef: glyphId } }
          : l
      )
    : layers;

  // Same positional threading as RightPanel's canonical useCanvas call, but with
  // transforms={}, selectedNodeId=null, and the override glyph map.
  useCanvas(
    containerRef,
    previewLayers,
    canvasW,
    canvasH,
    bgColor,
    {},
    null,
    textFont,
    operations,
    machineProfile,
    colorView,
    panels,
    overrideGlyphs
  );

  return (
    <div
      data-testid="motif-editor-mini-preview"
      className="pointer-events-none overflow-hidden rounded-xs border border-hairline bg-paper"
      style={{ width: 160, height: 120 }}
      title="Live full-canvas preview of your edits"
    >
      {/* useCanvas draws into this container at canvasW×canvasH; CSS shrinks it to
          fit the thumbnail box (object-fit-style scale-down via max dimensions). */}
      <div
        ref={containerRef}
        data-testid="motif-editor-mini-preview-canvas"
        className="h-full w-full [&>canvas]:!h-full [&>canvas]:!w-full [&>canvas]:object-contain"
      />
    </div>
  );
}
