// Vectorizer — raster → vector geometry for the extraction pipeline (S0 spine,
// issue #49; module map in PRD #48).
//
// S0 ships the CONTOUR path only (closed fills via potrace-wasm). The returned
// shape already carries the full data model later slices deepen:
//
//   vectorize/traceContours(image, opts) → {
//     fills:   [{ d, role }],   // closed contours; role ∈ 'engrave'|'cut'|'score'
//     strokes: [{ d, role }],   // centerline strokes — EMPTY until the
//                               // skeleton/centerline slice lands (locked
//                               // decision 9: data model carries role tags now)
//   }
//
// `image` is ImageData-shaped ({ data: Uint8ClampedArray RGBA, width, height })
// so the module runs identically in the browser, in a Web Worker, and headless
// under vitest (no canvas dependency). potrace-wasm is imported lazily so the
// studio bundle only pays for it when an extraction actually runs
// (bundle-conditional).

export const FABRICATION_ROLES = ['engrave', 'cut', 'score'];

// Locked decision 9: centerline is the eventual default for line-work; closed
// CONTOURS (solid shapes) default to engrave.
export const DEFAULT_CONTOUR_ROLE = 'engrave';

/**
 * Binarize an RGBA image to pure black/white (opaque). Luminance < threshold
 * counts as ink; transparent pixels count as paper. Pure + exported so tests
 * and the pipeline can reuse it.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {number} [threshold=128] 0..255 luminance cut
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function thresholdImage(image, threshold = 128) {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    // Rec. 601 luma; transparent → paper.
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const ink = alpha >= 128 && luma < threshold;
    const v = ink ? 0 : 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

// --- potrace-space → image-space normalization ------------------------------
//
// potrace emits path data at 10× scale with a flipped y axis, normally undone
// by a wrapper `<g transform="translate(0,H) scale(0.1,-0.1)">`. We bake that
// transform into the coordinates instead, so the stored `d` strings live in
// image pixel space and can be exported verbatim (the ImportedPath convention).
// potrace's SVG backend only emits M + relative l/c + z, but absolute L/C and
// h/v variants are handled too for safety.

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Bake `translate(0, height) scale(0.1, -0.1)` into a potrace `d` string.
 * Exported for tests.
 */
export function bakePotraceTransform(d, height, scale = 0.1) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const abs = ([x, y]) => [round2(x * scale), round2(height - y * scale)];
  const rel = ([dx, dy]) => [round2(dx * scale), round2(-dy * scale)];

  let out = '';
  let cmd = null;
  let i = 0;
  const read = (n) => {
    const nums = tokens.slice(i, i + n).map(Number);
    i += n;
    return nums;
  };
  const emit = (letter, nums) => {
    out += (out ? ' ' : '') + letter + nums.join(' ');
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
      if (cmd === 'z' || cmd === 'Z') {
        emit('Z', []);
        cmd = null;
        continue;
      }
    }
    if (cmd == null) break; // malformed tail — stop rather than guess
    switch (cmd) {
      case 'M': emit('M', abs(read(2))); cmd = 'L'; break;
      case 'm': emit('m', rel(read(2))); cmd = 'l'; break;
      case 'L': emit('L', abs(read(2))); break;
      case 'l': emit('l', rel(read(2))); break;
      case 'H': emit('H', [round2(read(1)[0] * scale)]); break;
      case 'h': emit('h', [round2(read(1)[0] * scale)]); break;
      case 'V': emit('V', [round2(height - read(1)[0] * scale)]); break;
      case 'v': emit('v', [round2(-read(1)[0] * scale)]); break;
      case 'C': {
        const [x1, y1, x2, y2, x, y] = read(6);
        emit('C', [...abs([x1, y1]), ...abs([x2, y2]), ...abs([x, y])]);
        break;
      }
      case 'c': {
        const [x1, y1, x2, y2, x, y] = read(6);
        emit('c', [...rel([x1, y1]), ...rel([x2, y2]), ...rel([x, y])]);
        break;
      }
      default:
        // Unknown command from a future potrace build — bail out verbatim so
        // nothing silently corrupts; callers still get a drawable path.
        return d;
    }
  }
  return out;
}

let potraceReady = null;

async function loadPotrace() {
  if (!potraceReady) {
    potraceReady = import('esm-potrace-wasm').then(async (mod) => {
      await mod.init();
      return mod;
    });
  }
  return potraceReady;
}

/**
 * Trace the dark regions of an image into closed contour paths.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {object} [opts]
 * @param {number} [opts.threshold=128] binarization threshold
 * @param {number} [opts.turdsize=2]   potrace speckle suppression (px area)
 * @param {string} [opts.role]         fabrication role tag for every contour
 * @returns {Promise<{fills: {d: string, role: string}[], strokes: []}>}
 */
export async function traceContours(image, opts = {}) {
  const {
    threshold = 128,
    turdsize = 2,
    role = DEFAULT_CONTOUR_ROLE,
  } = opts;

  const bw = thresholdImage(image, threshold);
  const { potrace } = await loadPotrace();
  // `pathonly` returns an array of absolute `d` strings, one per traced path.
  // Passing the plain {data,width,height} object skips every canvas/DOM branch
  // inside esm-potrace-wasm, keeping this callable headless and in workers.
  const ds = await potrace(bw, {
    pathonly: true,
    extractcolors: false,
    turdsize,
  });

  const fills = (Array.isArray(ds) ? ds : [])
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter(Boolean)
    .map((d) => ({ d: bakePotraceTransform(d, image.height), role }));

  return { fills, strokes: [] };
}
