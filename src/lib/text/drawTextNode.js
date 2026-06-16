// Render a TextNode onto a p5 instance.
//
// The geometry source-of-truth is opentype.js path commands (the SAME commands
// `textToOutline` serializes for SVG), so on-canvas text matches the exported
// SVG. We split into a PURE command-builder (`textNodeCommands`, node-testable)
// and the p5 draw glue (`drawTextNode`, browser-only, not unit-tested).

import { TextNode } from '../scene/TextNode.js';

/**
 * Pure: build the flat list of opentype path commands for a plain text-node
 * data object, with x/y baked into glyph coordinates exactly as
 * `TextNode.toSVGGroup` does (`line.x + node.x`, `line.baseline + node.y`).
 * Returns `{ commands, pivot }` where pivot is the LOCAL bbox center used by
 * both the canvas center-pivot transform and the SVG export.
 *
 * @param {object} node plain text-node data ({ text, x, y, fontSize, ... })
 * @param {import('opentype.js').Font} font resolved opentype font
 * @returns {{ commands: Array<object>, pivot: {x:number,y:number} }}
 */
export function textNodeCommands(node, font) {
  const tn = new TextNode({ ...node, font });
  const { lines } = tn.layout();
  const local = tn.localBBox();
  // localBBox() is ORIGIN-based ({x:0,y:0,w,h}), but the glyphs are baked at
  // world coords offset by (node.x, node.y). The pivot must therefore be the
  // WORLD bbox center (node.x + w/2, node.y + h/2) — the SAME pivot used by the
  // selectables list, the selection chrome, and the SVG export (textGroups), so
  // rotation/scale of text agrees across hit-test, canvas render and export.
  const pivot = {
    x: local.x + (tn.x || 0) + local.w / 2,
    y: local.y + (tn.y || 0) + local.h / 2,
  };

  // Width-fit cap (plan §5): a single-line area box renders at the SAME
  // effective size layout() used, so the on-canvas glyphs match the box + SVG.
  const fontSize = tn.effectiveFontSize();
  const commands = [];
  for (const line of lines) {
    const path = font.getPath(
      line.text,
      line.x + tn.x,
      line.baseline + tn.y,
      fontSize,
    );
    for (const cmd of path.commands) commands.push(cmd);
  }
  return { commands, pivot };
}

// Translate opentype path commands onto a p5 (v2.x) shape. The first `M` opens
// the shape with `beginShape`; every subsequent `M` opens a CONTOUR (a hole,
// e.g. the counter of 'o'/'e'/'a') inside the same shape so p5 punches it out.
// `Z` closes the current contour.
//
// p5 2.x curve API (BREAKING vs 1.x): `bezierVertex` takes ONE point per call
// and the curve degree is set by `bezierOrder()`. The anchor is the current
// position (the prior vertex/curve end). There is NO `quadraticVertex` — a
// quadratic is `bezierOrder(2)` + 2 `bezierVertex` calls; a cubic is
// `bezierOrder(3)` + 3 calls.
function emitCommands(p, commands) {
  let shapeOpen = false;
  let contourOpen = false; // a non-first sub-path (hole) is open
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (!shapeOpen) {
        p.beginShape();
        shapeOpen = true;
      } else {
        // Close the previous sub-path's contour (if it was a hole) before
        // starting the next, then open a new contour for this sub-path.
        if (contourOpen) p.endContour(p.CLOSE);
        p.beginContour();
        contourOpen = true;
      }
      p.vertex(cmd.x, cmd.y);
    } else if (cmd.type === 'L') {
      p.vertex(cmd.x, cmd.y);
    } else if (cmd.type === 'C') {
      p.bezierOrder(3);
      p.bezierVertex(cmd.x1, cmd.y1);
      p.bezierVertex(cmd.x2, cmd.y2);
      p.bezierVertex(cmd.x, cmd.y);
    } else if (cmd.type === 'Q') {
      p.bezierOrder(2);
      p.bezierVertex(cmd.x1, cmd.y1);
      p.bezierVertex(cmd.x, cmd.y);
    } else if (cmd.type === 'Z') {
      // Glyph sub-paths are always closed. The shape's first (implicit) contour
      // is closed by endShape(CLOSE); inner hole contours close here.
      if (contourOpen) {
        p.endContour(p.CLOSE);
        contourOpen = false;
      }
    }
  }
  if (shapeOpen) p.endShape(p.CLOSE);
}

/**
 * Draw a text node on the p5 instance, wrapped in the SAME center-pivot
 * transform patterns use, so canvas and exported SVG stay consistent.
 *
 * @param {import('p5')} p the p5 instance
 * @param {object} node plain text-node data
 * @param {import('opentype.js').Font} font resolved opentype font
 * @param {object} [transform] the node's transform from the authoritative
 *   transforms map (identity fallback). Text transforms live in the map (keyed
 *   by node id), NOT on the node datum — so undo, which snapshots the map,
 *   covers text moves for free.
 */
export function drawTextNode(p, node, font, transform) {
  if (!font) return;
  const { commands, pivot } = textNodeCommands(node, font);
  if (commands.length === 0) return;

  const t = transform || node.transform || { x: 0, y: 0, rotation: 0, scale: 1 };
  const cx = pivot.x;
  const cy = pivot.y;

  p.push();
  // Center-pivot: translate(x,y) then rotate/scale about (cx,cy). Mirrors
  // transformToSVG's center-pivot form and the pattern render in useCanvas.
  p.translate(t.x || 0, t.y || 0);
  p.translate(cx, cy);
  if (t.rotation) p.rotate(p.radians(t.rotation));
  if (t.scale != null && t.scale !== 1) p.scale(t.scale);
  p.translate(-cx, -cy);

  if (node.renderMode === 'outline') {
    p.noFill();
    p.stroke(node.color);
  } else {
    p.fill(node.color);
    p.noStroke();
  }

  emitCommands(p, commands);
  p.pop();
}
