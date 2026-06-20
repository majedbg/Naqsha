// TextField — a text render object that mirrors the Pattern.toSVGGroup(id,
// color, opacity) contract so it drops straight into buildLayerSVG / the cutter
// export path with no pipeline changes. Unlike Pattern it does NOT apply radial
// symmetry; text is placed, not tiled.

import { textToOutline } from './textToOutline.js';

export class TextField {
  /**
   * @param {{ text: string, font: import('opentype.js').Font, fontSize: number,
   *           x?: number, y?: number, renderMode?: 'fill'|'outline',
   *           strokeWidth?: number }} opts
   */
  constructor({ text, font, fontSize, x = 0, y = 0, renderMode = 'fill', strokeWidth = 1 }) {
    this.text = text;
    this.font = font;
    this.fontSize = fontSize;
    this.x = x;
    this.y = y;
    this.renderMode = renderMode;
    this.strokeWidth = strokeWidth;
  }

  /** Mirrors Pattern.toSVGGroup. `color` is the role/layer color; engrave = black. */
  toSVGGroup(layerId, color, opacity = 100) {
    const { pathData } = textToOutline(this.text, {
      font: this.font,
      fontSize: this.fontSize,
      x: this.x,
      y: this.y,
    });
    const paint =
      this.renderMode === 'outline'
        ? `fill="none" stroke="${color}" stroke-width="${this.strokeWidth}"`
        : `fill="${color}" fill-rule="nonzero"`;
    const op = opacity != null && opacity < 100 ? ` opacity="${(opacity / 100).toFixed(2)}"` : '';
    return `<g id="${layerId}"${op}>\n    <path d="${pathData}" ${paint}/>\n  </g>`;
  }
}
