// TextNode — an interactive, persistable text drawable in the scene graph.
//
// Unlike PatternNode (which approximates its bbox as the whole canvas), a
// TextNode exposes a TIGHT `localBBox()` from its laid-out text, so selection,
// hit-testing and handles get real text bounds (see scene/bbox.js).
//
// Pure: no DOM, no font I/O. The caller supplies a RESOLVED opentype.js `font`
// object (exactly like TextField) and the persistence-only `fontId` so a saved
// design can reload and re-resolve the font without serializing the live glyphs.

import { SceneNode } from './SceneNode.js';
import { transformToSVG } from '../transform/transformOps.js';
import { layoutText } from '../text/textLayout.js';
import { textToOutline } from '../text/textToOutline.js';
import { effectiveFontSize } from '../text/fitText.js';

export class TextNode extends SceneNode {
  /**
   * @param {{
   *   id?: string, text?: string, font: import('opentype.js').Font,
   *   fontId?: string|null, fontSize?: number,
   *   align?: 'left'|'center'|'right', lineHeight?: number,
   *   box?: { w: number, h: number }, lineMode?: 'single'|'multi',
   *   renderMode?: 'fill'|'outline', color?: string,
   *   x?: number, y?: number, transform?: object
   * }} opts
   */
  constructor({
    id,
    text = '',
    font,
    fontId = null,
    fontSize = 48,
    align = 'left',
    lineHeight = 1.2,
    box = { w: 0, h: 0 },
    lineMode = 'single',
    renderMode = 'fill',
    color = '#000000',
    x = 0,
    y = 0,
    transform,
  } = {}) {
    super({ id, type: 'text', transform });
    this.text = text;
    this.font = font;
    this.fontId = fontId;
    this.fontSize = fontSize;
    this.align = align;
    this.lineHeight = lineHeight;
    this.box = box;
    this.lineMode = lineMode;
    this.renderMode = renderMode;
    this.color = color;
    this.x = x;
    this.y = y;
  }

  /**
   * The size text is actually rendered/exported/measured at. For a single-line
   * area box this is the width-fit cap (plan §5) so a long line never bursts
   * past the box; otherwise it is the stored `fontSize`. ALL geometry consumers
   * (layout, SVG, canvas draw, caret) route through this so they stay consistent.
   */
  effectiveFontSize() {
    return effectiveFontSize(this, this.font);
  }

  /** Lay out the text. Multi-line mode wraps to the dragged box width. */
  layout() {
    return layoutText(this.text, {
      font: this.font,
      fontSize: this.effectiveFontSize(),
      align: this.align,
      lineHeight: this.lineHeight,
      wrapWidth: this.lineMode === 'multi' ? this.box.w : null,
    });
  }

  /**
   * Tight LOCAL bbox at the origin (NOT offset by this.x/this.y) — bbox/hitTest/
   * handles layer the node transform on top of this.
   */
  localBBox() {
    const { width, height } = this.layout();
    return { x: 0, y: 0, w: width, h: height };
  }

  /**
   * One `<g id>` wrapping a SINGLE `<path>` that concatenates every laid-out
   * line's glyph outline. x/y are baked into glyph coordinates; the node
   * transform goes on the `<g>` (omitted entirely when identity).
   *
   * `color` is the stored paint (engrave-fill defaults to black). fill =>
   * `fill=color fill-rule=nonzero`; outline => `fill="none" stroke=color`.
   */
  toSVGGroup(pivot) {
    const { lines } = this.layout();
    const fontSize = this.effectiveFontSize();
    const d = lines
      .map((line) =>
        textToOutline(line.text, {
          font: this.font,
          fontSize,
          x: line.x + this.x,
          y: line.baseline + this.y,
        }).pathData,
      )
      .join('');

    const paint =
      this.renderMode === 'outline'
        ? `fill="none" stroke="${this.color}"`
        : `fill="${this.color}" fill-rule="nonzero"`;

    const svgTransform = transformToSVG(this.transform, pivot);
    const open = svgTransform ? `<g id="${this.id}" transform="${svgTransform}">` : `<g id="${this.id}">`;
    return `${open}<path d="${d}" ${paint}/></g>`;
  }

  /** Editable fields only — fontId (string), never the live font object. */
  serialize() {
    return {
      ...super.serialize(),
      text: this.text,
      fontId: this.fontId,
      fontSize: this.fontSize,
      align: this.align,
      lineHeight: this.lineHeight,
      box: this.box,
      lineMode: this.lineMode,
      renderMode: this.renderMode,
      color: this.color,
    };
  }
}
