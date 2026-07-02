// Vectorizer — raster → vector geometry for the extraction pipeline (S0 spine
// issue #49, centerline geometry S6 issue #55; module map in PRD #48).
//
//   vectorize(image, opts) → {
//     fills:   [{ d, role }],   // closed contours; role ∈ 'engrave'|'cut'|'score'
//     strokes: [{ d, role }],   // single centerline paths (skeleton-traced)
//     components: [{            // per-motif BOTH representations, for Review
//       kind: 'stroke'|'fill',  //   default presentation (centerline-default
//       role,                   //   for line-work — locked decision 9)
//       contour: { d },         //   always present (guaranteed floor)
//       centerline: { d }|null, //   null when the skeleton is degenerate
//     }]
//   }
//
// fills/strokes are the DEFAULT presentation derived from components; the
// Review step lets the user flip kind/role per component before the tile is
// built. Stroke-vs-blob classification: skeletonLength / (2·maxInkRadius) —
// a scale-invariant length-to-width ratio (a 3px line scores ~15, a filled
// square ~2.5, a disc ~0).
//
// traceContours(image, opts) → { fills, strokes: [] } is the S0 contour-only
// surface, kept for compatibility (same component grouping).
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

import {
  extractCenterlines,
  inkDistanceTransform,
  pathFromPolyline,
} from './centerline';

export const FABRICATION_ROLES = ['engrave', 'cut', 'score'];

// Locked decision 9: line-work defaults to its centerline, tagged score (a
// laser scores/cuts ALONG a single stroke); closed CONTOURS (solid shapes)
// default to engrave.
export const DEFAULT_CONTOUR_ROLE = 'engrave';
export const DEFAULT_STROKE_ROLE = 'score';

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

// ── contour component tracing ───────────────────────────────────────────────

// Flatten a potrace curve to a polygon (pixel-unit vertices). CURVE segments
// are cubic Béziers (start = previous endpoint, controls c[i3]/c[i3+1], end
// c[i3+2]); CORNER contributes its two vertices directly.
const CURVE_POLY_SAMPLES = 8;
function curveToPolygon(curve) {
  const pts = [];
  let prev = curve.c[(curve.n - 1) * 3 + 2];
  for (let i = 0; i < curve.n; i++) {
    const i3 = i * 3;
    const p0 = curve.c[i3];
    const p1 = curve.c[i3 + 1];
    const p2 = curve.c[i3 + 2];
    if (curve.tag[i] === 'CURVE') {
      for (let s = 1; s <= CURVE_POLY_SAMPLES; s++) {
        const t = s / CURVE_POLY_SAMPLES;
        const u = 1 - t;
        pts.push([
          u * u * u * prev.x + 3 * u * u * t * p0.x + 3 * u * t * t * p1.x + t * t * t * p2.x,
          u * u * u * prev.y + 3 * u * u * t * p0.y + 3 * u * t * t * p1.y + t * t * t * p2.y,
        ]);
      }
    } else {
      pts.push([p1.x, p1.y], [p2.x, p2.y]);
    }
    prev = p2;
  }
  return pts;
}

// Ray-cast point-in-polygon (evenodd).
function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Evenodd containment depth of a point against a component's subpath polygons.
const depthIn = (pt, component) =>
  component.polys.reduce((n, poly) => n + (pointInPolygon(pt, poly) ? 1 : 0), 0);

/**
 * potrace-trace a binarized image and group its contours into top-level ink
 * components by TRUE geometric containment (S6 fix — S0 grouped by bbox
 * containment, which mis-assigns separate motifs whose bounds merely overlap
 * once per-shape roles exist):
 *
 *   - a contour at ODD evenodd depth inside a component is that component's
 *     HOLE → merged as an evenodd subpath;
 *   - a contour at EVEN depth (0 — outside; 2 — an island inside a hole) is
 *     its own component, independently role-taggable.
 *
 * Potrace emits contours in scan order (enclosing before enclosed), so the
 * LAST odd-depth component is the innermost enclosing one — the true owner.
 *
 * @returns {Promise<{d: string, polys: [number,number][][]}[]>}
 */
async function traceComponents(bw, { turdsize = 2 } = {}) {
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

  const components = [];
  for (const path of tracer._pathlist || []) {
    const sub = `${utils.renderCurve(path.curve, 1).trim()} Z`;
    const poly = curveToPolygon(path.curve);
    // Contours never intersect, so any single vertex determines containment.
    const rep = poly[0];
    let owner = null;
    for (const c of components) {
      if (depthIn(rep, c) % 2 === 1) owner = c; // last odd wins (innermost)
    }
    if (owner) {
      owner.d += ` ${sub}`; // hole → evenodd subpath
      owner.polys.push(poly);
    } else {
      components.push({ d: sub, polys: [poly] });
    }
  }
  return components;
}

/**
 * Trace the dark regions of an image into closed contour paths (S0 surface —
 * contours only; the full both-representations pass is `vectorize`).
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
  const components = await traceComponents(bw, { turdsize });
  return { fills: components.map(({ d }) => ({ d, role })), strokes: [] };
}

// ── full vectorize: contours + centerlines, classified per component ────────

/**
 * Vectorize an image into BOTH representations per motif (locked decision 9):
 * every top-level ink component gets its closed contour, plus a centerline
 * (skeleton-traced single-stroke path) when the skeleton is non-degenerate.
 * Line-work components DEFAULT to the centerline presentation tagged
 * `score`; solid components default to the contour tagged `engrave`. A
 * component whose skeleton is unusable always keeps its contour — the
 * guaranteed single-motif floor (locked decision 8).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {object} [opts]
 * @param {number} [opts.threshold=128]      binarization threshold
 * @param {number} [opts.turdsize=2]         potrace speckle suppression
 * @param {number} [opts.simplifyTolerance=1]  RDP tolerance (px)
 * @param {number} [opts.minCenterlineLength=3] discard shorter skeleton bits
 * @param {number} [opts.minStrokeAspect=6]  length/width ratio ≥ this → stroke
 * @param {string} [opts.fillRole]           default role for contours
 * @param {string} [opts.strokeRole]         default role for centerlines
 * @returns {Promise<{fills: {d,role}[], strokes: {d,role}[], components: object[]}>}
 */
export async function vectorize(image, opts = {}) {
  const {
    threshold = 128,
    turdsize = 2,
    simplifyTolerance = 1,
    minCenterlineLength = 3,
    minStrokeAspect = 6,
    fillRole = DEFAULT_CONTOUR_ROLE,
    strokeRole = DEFAULT_STROKE_ROLE,
  } = opts;

  const bw = thresholdImage(image, threshold);
  const contourComponents = await traceComponents(bw, { turdsize });
  const { polylines } = extractCenterlines(bw, {
    tolerance: simplifyTolerance,
    minLength: minCenterlineLength,
  });
  const dist = polylines.length ? inkDistanceTransform(bw) : null;

  // Assign each centerline polyline to the component whose ink contains it
  // (odd evenodd depth; last odd = innermost). Skeleton points are strictly
  // interior to ink, so any polyline point works as the probe.
  const perComponent = contourComponents.map(() => ({
    polylines: [],
    length: 0,
    maxRadius: 0,
  }));
  for (const pl of polylines) {
    const probe = pl.points[Math.floor(pl.points.length / 2)];
    let owner = -1;
    contourComponents.forEach((c, ci) => {
      if (depthIn(probe, c) % 2 === 1) owner = ci;
    });
    if (owner === -1) continue; // its ink was turdsize-suppressed
    const bucket = perComponent[owner];
    bucket.polylines.push(pl);
    bucket.length += pl.length;
    for (const [px, py] of pl.points) {
      const x = Math.min(bw.width - 1, Math.max(0, Math.round(px - 0.5)));
      const y = Math.min(bw.height - 1, Math.max(0, Math.round(py - 0.5)));
      const r = dist[y * bw.width + x];
      if (r > bucket.maxRadius) bucket.maxRadius = r;
    }
  }

  const components = contourComponents.map((c, ci) => {
    const { polylines: pls, length, maxRadius } = perComponent[ci];
    const centerline = pls.length
      ? { d: pls.map(pathFromPolyline).join(' ') }
      : null;
    // Length-to-width ratio: skeleton length vs the widest inscribed stroke.
    const strokeLike =
      !!centerline && maxRadius > 0 && length / (2 * maxRadius) >= minStrokeAspect;
    return {
      kind: strokeLike ? 'stroke' : 'fill',
      role: strokeLike ? strokeRole : fillRole,
      contour: { d: c.d },
      centerline,
    };
  });

  return {
    components,
    fills: components
      .filter((c) => c.kind === 'fill')
      .map((c) => ({ d: c.contour.d, role: c.role })),
    strokes: components
      .filter((c) => c.kind === 'stroke')
      .map((c) => ({ d: c.centerline.d, role: c.role })),
  };
}
