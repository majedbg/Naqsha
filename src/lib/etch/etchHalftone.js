// etchHalftone — the PURE screening kernel behind the Halftone Stage of the Etch
// Stack (Raster Etch S5, issue #84; vocabulary is LAW — CONTEXT.md → Stage,
// ADR-0007). A Halftone Stage is the AMPLITUDE-MODULATED (AM) alternative to
// Dither: instead of scattering fixed-size dots at varying DENSITY (Floyd–
// Steinberg / ordered Bayer), it lays a REGULAR dot lattice at a chosen frequency
// and angle and grows each dot's RADIUS with the local darkness. It reads as the
// most intentional/verifiable screen and is the one that could later vectorize as
// coarse dots (that is future work — this slice rasters like the others).
//
// It is a SCREENING Stage under the SAME S3 semantics as Dither (etchStage): the
// terminal field→1-bit producer, exactly one active at a time. The seam only had
// to learn Halftone is a screening type; everything downstream (the exactly-one
// rule, the rack "Inactive" badge, Highlight Hold's terminal clamp) keeps working.
//
// THE DOT MODEL — a rotated SPOT-FUNCTION threshold screen, pixel-INDEPENDENT
// exactly like ordered Bayer (no neighbour reads → parallel and sub-tile stable):
//   1. cell = DPI / frequency  → the halftone cell side in DEVICE PIXELS. frequency
//      is LINES PER INCH, so the DPI (threaded through screenStage's opts from the
//      Etch layer, default 254) is what converts LPI → device-px. The cell is
//      FLOORED at MIN_HALFTONE_CELL (2): a cell of 1 would put every pixel on a
//      lattice node at axis angles (r = 0), inking the whole field solid for any
//      darkness > 0 — so below the floor the LPI→cell law is clamped, keeping a
//      tone-tracking screen instead of a solid-ink collapse (not a divide-by-zero).
//   2. Rotate the device coordinate by `angle` into screen space and divide by
//      `cell`, so the integer lattice points ARE the dot centres. The offset to the
//      NEAREST centre (each component in [−0.5, 0.5]) is the pixel's position in
//      its cell.
//   3. Distance to that centre sets whether the pixel is inside the dot:
//        • round   → Euclidean (L2); the cell-corner distance is √½.
//        • diamond → Manhattan (L1); the cell-corner distance is 1.
//      Normalising by that corner distance (rMax) puts the farthest in-cell pixel
//      at r = 1, so a full-darkness dot fills the whole cell.
//   4. A pixel inks when  r ≤ darkness · rMax  — i.e. the dot RADIUS is LINEAR in
//      darkness (radius ∝ darkness, the spec's literal mapping). TONE RESPONSE,
//      stated honestly so nobody "fixes" it blind: since a dot's inked AREA (hence
//      etched coverage) grows as radius², coverage scales as darkness² — a 50%
//      midtone inks only ~39% of the cell (round: π·(darkness·√½)² at darkness ½),
//      so midtones reproduce VISIBLY lighter than the source tone, not "a touch"
//      lighter — the flat-field ramp test measures exactly this. This is the
//      deliberate literal reading of "radius ∝ darkness"; a tone-linear / gamma-
//      corrected mapping (radius ∝ √darkness, giving area ∝ darkness) is a
//      considered FUTURE option, not a bug to be silently swapped in here.
//
// JUDGMENT CALL — the global `threshold` param is IGNORED here (mirroring ordered
// Bayer's "the matrix IS the screen"): an AM screen's cut is the dot boundary
// `r ≤ darkness·rMax`, i.e. darkness drives the radius directly. Honouring a
// shifted global threshold would bias every dot's size and stop it being a
// mechanical halftone. `invert` is still honoured (it flips which end is dark).
//
// POLARITY matches globalMask and Dither: dark = ink. `darkness = (255 − v)/255`
// where `v` is the luma, or `255 − luma` when `invert` flips the ramp so the LIGHT
// end etches. Transparent pixels (alpha < 128) are ALWAYS paper — the same
// per-pixel opacity guard the Dither kernel and globalMask honour, applied on top
// of the dot so a maximal (black) dot still never inks a transparent pixel.
//
// PURE typed-array math, no DOM — runs identically on the main thread, inside
// etch.worker, and headless under vitest (matching etchProcess / etchDither).

/** Halftone dot `shape` discriminators (the rack's shape selector). */
export const HALFTONE_ROUND = 'round';
export const HALFTONE_DIAMOND = 'diamond';

/** Default dot shape — round is the classic AM halftone dot. */
export const DEFAULT_HALFTONE_SHAPE = HALFTONE_ROUND;

/** Ordered list for the rack's shape control (value + human label). */
export const HALFTONE_SHAPES = [
  { value: HALFTONE_ROUND, label: 'Round' },
  { value: HALFTONE_DIAMOND, label: 'Diamond' },
];

/**
 * Default screen FREQUENCY in lines/inch. At the 254-DPI Etch default this is a
 * ≈8.5px cell — coarse enough that the AM dots read as intentional (and could one
 * day vectorize), fine enough to hold a gradient.
 */
export const DEFAULT_HALFTONE_FREQUENCY = 30;

/** Default screen ANGLE — 45° is the classic single-screen angle (hides the grid). */
export const DEFAULT_HALFTONE_ANGLE = 45;

/** DPI fallback if the screening opts omit it (keeps the kernel self-sufficient). */
export const DEFAULT_HALFTONE_DPI = 254;

/**
 * Smallest halftone cell in device px. A cell of 1 (or below) makes EVERY pixel
 * land on a lattice node at axis angles → r = 0 → `r ≤ darkness·rMax` inks the
 * whole field for any darkness > 0, collapsing a mid-gray to SOLID INK. Flooring
 * the cell at 2 guarantees each cell always holds pixels with r > 0, so the dot
 * can grow with tone instead of snapping to solid. Unreachable at today's pinned
 * 254 DPI (rack frequency ≤ 120 → cell ≥ 2.12) but `createEtchParams` accepts any
 * dpi > 0, so this floor is the defensive guard for a future low-DPI / high-LPI
 * control. Below it the LPI→cell law is clamped (documented, not a divide-by-zero).
 */
export const MIN_HALFTONE_CELL = 2;

/**
 * Screen a luma field to 1-bit AM halftone dots (1 = ink/dark). The dot lattice is
 * set by `frequency` (LPI, → cell = DPI/frequency device px) and `angle`; each
 * dot's radius grows LINEARLY with local darkness in the chosen `shape`. PURE per
 * pixel — each bit is a function of its own luma and (x,y), so the screen is
 * parallel and a sub-tile screens identically to the whole (like ordered Bayer).
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{frequency?:number, angle?:number, shape?:string}} [params]
 * @param {{threshold?:number, invert?:boolean, dpi?:number}} [opts]
 *   `dpi` converts the LPI frequency into a device-pixel cell; defaults to 254.
 * @returns {Uint8Array} bits, `bits[y*width+x]` ∈ {0,1}
 */
export function halftoneField(field, params = {}, opts = {}) {
  const { gray, alpha, width: w, height: h } = field;
  const dpi = Number(opts.dpi) > 0 ? Number(opts.dpi) : DEFAULT_HALFTONE_DPI;
  const frequency = Number(params.frequency) > 0 ? Number(params.frequency) : DEFAULT_HALFTONE_FREQUENCY;
  // device px per halftone cell (LPI→px via DPI), floored so a tiny cell can never
  // collapse a mid-gray to solid ink (see MIN_HALFTONE_CELL).
  const cell = Math.max(MIN_HALFTONE_CELL, dpi / frequency);
  const angle = ((Number(params.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diamond = params.shape === HALFTONE_DIAMOND;
  // Corner distance in cell units — normaliser so full darkness fills the cell.
  const rMax = diamond ? 1 : Math.SQRT1_2;
  const invert = !!opts.invert;
  const bits = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (alpha[j] < 128) {
        bits[j] = 0; // transparent → paper, whatever the dot decides
        continue;
      }
      const v = invert ? 255 - gray[j] : gray[j];
      const darkness = (255 - v) / 255; // dark → big dot (dark = ink)
      // Rotate the device coord into screen space and tile into cells; the offset
      // to the nearest lattice point (each component in [−0.5, 0.5]) is the pixel's
      // position within its dot cell.
      const u = (x * cos + y * sin) / cell;
      const t = (-x * sin + y * cos) / cell;
      const pu = u - Math.round(u);
      const pv = t - Math.round(t);
      const r = diamond ? Math.abs(pu) + Math.abs(pv) : Math.sqrt(pu * pu + pv * pv);
      // Inside the dot when r ≤ radius; radius = darkness · rMax (radius ∝ darkness).
      bits[j] = r <= darkness * rMax ? 1 : 0;
    }
  }
  return bits;
}
