/**
 * fbm — shared fractional-Brownian-motion sampler with optional domain warp.
 *
 * Lifted VERBATIM from the `fbm(wx,wy)` closure inside
 *   src/lib/patterns/TopographicContours.generate()
 * with one change: the noise source is INJECTED as `noise2D(x,y)` instead of
 * closing over `ctx.noise`. Every magic constant and the exact octave +
 * domain-warp structure are preserved byte-for-byte (octave count rounding,
 * amplitude halving, frequency doubling, the warp displacement formula, the
 * frequency offsets), so routing the pattern through this helper changes ONLY
 * the noise source — never the fBm algebra. Pure and headless.
 *
 * NOTE: the warp displacement formula `wx + (wnx - 0.5) * 2 * amp` was written
 * for a [0,1]-valued noise (p5 Perlin). With a simplex source in [-1,1] the
 * recentering is no longer symmetric, so warp carries a small directional bias.
 * This is intentional — the spec requires the arithmetic stay byte-identical and
 * the field is renormalized to [0,1] downstream, so the bias is harmless.
 *
 * @param {(x:number, y:number) => number} noise2D - injected noise sampler
 * @param {number} wx - world x (origin-centered)
 * @param {number} wy - world y (origin-centered)
 * @param {object} o
 * @param {number} o.baseFreq - base spatial frequency (noiseScale / longest)
 * @param {number} o.octaves - octave count (rounded, min 1)
 * @param {number} o.warp - domain-warp amount (0 → no displacement)
 * @param {number} o.longest - longest canvas axis (warp amplitude scale)
 * @returns {number} unnormalized fBm value (roughly amplitude-normalized)
 */
export function fbm(noise2D, wx, wy, { baseFreq, octaves, warp, longest }) {
  const octCount = Math.max(1, Math.round(octaves));
  let wpx = wx;
  let wpy = wy;
  // Domain warp: displace the sample point by a low-frequency noise lookup.
  if (warp > 0) {
    const wf = baseFreq * 0.5;
    const wnx = noise2D(wx * wf + 11.3, wy * wf + 4.7);
    const wny = noise2D(wx * wf + 31.7, wy * wf + 71.1);
    const amp = warp * longest * 0.25;
    wpx = wx + (wnx - 0.5) * 2 * amp;
    wpy = wy + (wny - 0.5) * 2 * amp;
  }
  let sum = 0;
  let amp = 1;
  let freq = baseFreq;
  let norm = 0;
  for (let o = 0; o < octCount; o++) {
    sum += amp * noise2D(wpx * freq + 100, wpy * freq + 100);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm; // normalized by amplitude sum
}

export default fbm;
