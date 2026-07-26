import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';
import { buildSkeleton } from './spaceColonizationSkeleton';

/**
 * Branch — one rooted plant with many termini, grown by SPACE COLONIZATION
 * (Runions/Lane/Prusinkiewicz 2007). Attractors are scattered inside an envelope
 * and the tree grows to consume them, so the envelope IS the silhouette and the
 * page fills by construction.
 *
 * This is the DRAWING half of the pair described in docs/vine-scaffolds-PLAN.md
 * §2. All geometry comes from the pure, shared core
 * `spaceColonizationSkeleton.buildSkeleton`, which the `branch` semantic anchor
 * extractor (semanticAnchors.js) runs a SECOND time with the identical RNG to
 * anchor motifs on this exact skeleton. Nothing geometric may be computed here
 * that the core does not own, or the two computations drift apart.
 *
 * RNG: `ctx.randomSeed(seed)` at the top (the reseed half of the host contract —
 * a capture/ghost probe must not perturb the painted output), then the core is
 * driven by the ZERO-ARG `() => ctx.random()`. The extractor drives it with
 * `makeP5Random(hostSeed)`, a byte-exact port of p5's seeded LCG, so both land
 * on the same stream. Nothing else may consume `ctx.random` in between.
 *
 * MARKS: one OPEN polyline per main-branch path — whole root→tip stems, NOT one
 * line per segment (the FractalTree/Dendrite confetti failure mode). That is what
 * makes it read as stems for a user who never touches motifs, and it is what
 * gives the extractor paths to arc-length sample. Paths partition the edge set,
 * so no segment is drawn (or plotted) twice.
 *
 * The path list is built ONCE, in origin-centred coords; `drawBase` replays it
 * via `ctx` and the SVG <polyline>s are emitted from the SAME array, so
 * canvas == SVG. Symmetry is a real param (like Feather/Spiral/DifferentialGrowth):
 * applySymmetryDraw replays the base draw per fold, and toSVGGroup is INHERITED
 * so wrapSVGSymmetry mirrors it in the export.
 */
export default class Branch extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const skeleton = buildSkeleton(params || {}, canvasW, canvasH, () => ctx.random());
    const paths = skeleton.paths;

    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    for (const path of paths) {
      const pts = path.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      this.svgElements.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      for (const path of paths) {
        ctx.beginShape();
        for (const p of path.points) ctx.vertex(p.x, p.y);
        ctx.endShape(); // no CLOSE — a stem is an OPEN path with a root and a tip.
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, (startAngle * Math.PI) / 180, offsetX, offsetY);
  }

  // Plain join (mirrors DifferentialGrowth/Feather). toSVGGroup is INHERITED so
  // the real `symmetry` param flows through wrapSVGSymmetry for free.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
