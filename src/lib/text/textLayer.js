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

/**
 * Derive the geometry of a new text layer from a canvas pointer gesture. A tiny
 * delta (a CLICK) yields a single-line text anchored at the click; a DRAG yields
 * a multi-line (box-wrapped) text whose origin is the min corner and whose box
 * is the absolute drag extent.
 * @param {{x:number,y:number}} start  pointer-down point (canvas space)
 * @param {{x:number,y:number}} end    pointer-up point (canvas space)
 * @returns {{ x:number, y:number, box:{w:number,h:number},
 *             lineMode:'single'|'multi' }}
 */
export function textCreateFromDrag(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
    // A click, not a drag → single-line text at the click point.
    return { x: start.x, y: start.y, box: { w: 0, h: 0 }, lineMode: 'single' };
  }
  // A dragged box → multi-line text wrapping to the box width.
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    box: { w: Math.abs(dx), h: Math.abs(dy) },
    lineMode: 'multi',
  };
}
