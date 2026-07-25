// Built-in single-line (engraving) fonts, registered into the font catalog under
// the "Engraving" category. Each is a Hershey face turned into an opentype-shaped
// adapter (hersheyFont.js) so it flows through the whole text pipeline; the only
// special-casing is that renderers stroke its OPEN polylines instead of filling
// closed contours (font.isSingleLine).
//
// DATA + LICENSE. The vector data is the classic Hershey font set (Dr. A. V.
// Hershey / distributed by USENIX), packaged as JSON by hersheytextjs (MIT). It
// is free to use and embed (including vectorized into exported artwork); credit
// the Hershey source and do not resell the raw font data. See public/fonts/
// LICENSES.md for the umbrella note.

import hersheyData from './hersheyData.json';
import { makeHersheyFont } from './hersheyFont.js';
import { registerFont, getFontMeta } from './fontRegistry.js';

// id → hersheytext data key. Labels come from each entry's `name`.
const BUILTINS = [
  { id: 'engrave-sans', key: 'futural' },
  { id: 'engrave-sans-bold', key: 'futuram' },
  { id: 'engrave-serif', key: 'timesr' },
  { id: 'engrave-script', key: 'scripts' },
  { id: 'engrave-cursive', key: 'cursive' },
  { id: 'engrave-gothic', key: 'gothiceng' },
];

let registered = false;

/**
 * Register the built-in single-line fonts (idempotent — safe to call on every
 * mount). Returns the ids registered (empty on repeat calls).
 * @returns {string[]}
 */
export function registerBuiltInSingleLineFonts() {
  if (registered) return [];
  registered = true;
  const ids = [];
  for (const { id, key } of BUILTINS) {
    const data = hersheyData[key];
    if (!data) continue;
    // Guard against a double-register from a hot-reload / prior partial run.
    if (getFontMeta(id)) continue;
    registerFont({
      id,
      label: data.name || id,
      font: makeHersheyFont(data),
      kind: 'single-line',
      category: 'Engraving',
    });
    ids.push(id);
  }
  return ids;
}

/** Test-only: allow re-registration after _resetRuntimeFonts(). */
export function _resetSingleLineRegistration() {
  registered = false;
}
