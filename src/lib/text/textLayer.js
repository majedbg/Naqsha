// Layer <-> TextNode bridge (Option B: text objects ARE layers).
//
// Pure module (no React, no p5). It maps between a layer's persisted `params`
// and the plain node-data shape consumed by drawTextNode/textNodeCommands. The
// live opentype Font is NOT persisted and is injected by the renderer — never
// attached here.

import { DEFAULT_FONT_ID } from './fontRegistry';

/** @returns {boolean} true when `layer` is a text layer. */
export function isTextLayer(layer) {
  return layer?.type === 'text';
}

/**
 * The default persisted text params for a new text layer. A fresh object each
 * call (so callers can mutate freely); `box` is its own fresh object too.
 * `overrides` win via a shallow spread.
 * @param {object} [overrides]
 * @returns {object}
 */
export function defaultTextParams(overrides = {}) {
  return {
    text: '',
    fontId: DEFAULT_FONT_ID,
    fontSize: 48,
    align: 'left',
    lineHeight: 1.2,
    box: { w: 0, h: 0 },
    lineMode: 'single',
    renderMode: 'fill',
    color: '#000000',
    x: 0,
    y: 0,
    ...overrides,
  };
}

/**
 * Map a text layer's persisted `params` to the plain node-data object that
 * drawTextNode / textNodeCommands expect. Missing params fall back to
 * defaultTextParams so a partial layer never crashes the renderer. The resolved
 * `font` is injected by the renderer — intentionally NOT attached here.
 * @param {object} layer
 * @returns {object} node data
 */
export function textNodeFromLayer(layer) {
  const p = { ...defaultTextParams(), ...(layer?.params || {}) };
  return {
    id: layer?.id,
    text: p.text,
    fontId: p.fontId,
    fontSize: p.fontSize,
    align: p.align,
    lineHeight: p.lineHeight,
    box: p.box,
    lineMode: p.lineMode,
    renderMode: p.renderMode,
    color: p.color,
    x: p.x,
    y: p.y,
  };
}
