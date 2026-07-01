// Vectorizer — raster → vector geometry for the extraction pipeline (S0 spine,
// issue #49; module map in PRD #48).
//
// S0 ships the CONTOUR path only (closed fills). The returned shape already
// carries the full data model later slices deepen:
//
//   traceContours(image, opts) → {
//     fills:   [{ d, role }],   // closed contours; role ∈ 'engrave'|'cut'|'score'
//     strokes: [{ d, role }],   // centerline strokes — EMPTY until the
//                               // skeleton/centerline slice lands (locked
//                               // decision 9: data model carries role tags now)
//   }
//
// `image` is ImageData-shaped ({ data: Uint8ClampedArray RGBA, width, height })
// so the module runs identically in the browser, in a Web Worker, and headless
// under vitest (no canvas dependency).
//
// TRACER CHOICE (S0 deviation, documented): issue #49 named potrace-wasm, but
// both wasm ports are unusable in practice — esm-potrace-wasm marshals the
// image through emscripten's ~64KB stack (hard-fails above ~127×127 px, found
// during browser verification), and potrace-wasm@1.0.4 doesn't ship its .wasm.
// We use @realness.online/potrace (pinned EXACT 2.1.25) instead: the kilobtye
// potrace JS port — same potrace algorithm, same GPL-2 license posture as the
// wasm build, no input-size ceiling, and it runs in workers + node unchanged.
// Only lib/Potrace + lib/utils are deep-imported (the package main requires
// jimp, which isn't needed or installed). Both are lazy imports so the studio
// bundle only pays for the tracer when an extraction runs (bundle-conditional).
// The dependency's internals we touch (`_pathlist`, `path.sign`,
// `utils.renderCurve`) are stable in the pinned version; revisit on upgrade.

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

let potraceModules = null;

async function loadPotrace() {
  if (!potraceModules) {
    potraceModules = Promise.all([
      import('@realness.online/potrace/lib/Potrace'),
      import('@realness.online/potrace/lib/utils'),
    ]).then(([p, u]) => ({
      Potrace: p.default || p,
      utils: u.default || u,
    }));
  }
  return potraceModules;
}

// Minimal Jimp-shaped duck over an ImageData-like buffer — exactly the surface
// Potrace._processLoadedImage touches (bitmap {data,width,height} + scan).
function jimpLike({ data, width, height }) {
  return {
    bitmap: { data, width, height },
    scan(x0, y0, w, h, cb) {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          cb.call(this, x, y, (y * width + x) * 4);
        }
      }
    },
  };
}

/**
 * Trace the dark regions of an image into closed contour paths. Contours are
 * grouped per top-level component by bbox containment: a contour whose bounds
 * lie inside an existing component joins it as a subpath, so a single evenodd
 * fill renders holes (and alternating nesting) faithfully — evenodd is
 * winding-independent, which matters because this potrace port's xor-based
 * tracing gives every contour the same orientation and sign.
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
  const { Potrace, utils } = await loadPotrace();

  const tracer = new Potrace({
    turdSize: turdsize,
    threshold: 128, // input is already pure black/white
    blackOnWhite: true,
  });
  await new Promise((resolve, reject) => {
    try {
      tracer.loadImage(jimpLike(bw), (err) => (err ? reject(err) : resolve()));
    } catch (err) {
      reject(err);
    }
  });
  // Triggers _bmToPathlist + _processPath; the rendered tag itself is unused.
  tracer.getPathTag('black');

  // Group contours into top-level components. Potrace emits contours in scan
  // order (outers before the contours nested inside them), and every Path
  // carries its integer pixel bounds.
  const components = [];
  const containedIn = (c, p) =>
    p.minX >= c.minX && p.maxX <= c.maxX && p.minY >= c.minY && p.maxY <= c.maxY;
  for (const path of tracer._pathlist || []) {
    const sub = `${utils.renderCurve(path.curve, 1).trim()} Z`;
    const owner = components.find((c) => containedIn(c, path));
    if (owner) {
      owner.d += ` ${sub}`; // nested contour → evenodd subpath
    } else {
      components.push({
        d: sub,
        minX: path.minX,
        maxX: path.maxX,
        minY: path.minY,
        maxY: path.maxY,
      });
    }
  }

  return { fills: components.map(({ d }) => ({ d, role })), strokes: [] };
}
