// SVG import — parse an SVG string into the path data we place as artwork
// (issue #12, C4). Place-as-artwork ONLY: we extract drawable outline geometry
// (the `d` of every <path>) and preserve it verbatim so curves survive export.
// Boundary/mask clipping is explicitly deferred — imported geometry is artwork.
//
// Pure and node-testable: no DOMParser dependency (the test env is `node`), so
// we extract `d` attributes with a tolerant regex in the same spirit as
// plotter/pathOps' tokenizer. Malformed/empty input is rejected with a message
// rather than throwing, so every caller (File>Import, drag-drop, paste) can
// surface a graceful failure.

// Pull the `d` attribute value out of every <path …/> element. Handles single
// or double quotes and arbitrary attribute order/whitespace.
function extractPathDs(svg) {
  const ds = [];
  const pathRe = /<path\b[^>]*?\bd\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = pathRe.exec(svg)) !== null) {
    const d = (m[2] ?? m[3] ?? '').trim();
    if (d) ds.push(d);
  }
  return ds;
}

/**
 * Parse an SVG string into normalized import data.
 *
 * @param {string} svg - raw SVG markup
 * @returns {{ ok: true, paths: string[] } | { ok: false, error: string }}
 *   On success, `paths` is the verbatim `d` data of every <path> (≥1).
 *   On failure, `error` is a human-readable message.
 */
export function parseSVGImport(svg) {
  if (typeof svg !== 'string' || svg.trim() === '') {
    return { ok: false, error: 'Empty SVG — nothing to import.' };
  }
  if (!/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: 'Not a valid SVG file.' };
  }
  const paths = extractPathDs(svg);
  if (paths.length === 0) {
    return { ok: false, error: 'No path data found in this SVG.' };
  }
  return { ok: true, paths };
}
