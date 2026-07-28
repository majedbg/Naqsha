import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';
import { gridLinePositions, gridWarpCurves } from './gridGeometry';

export default class Grid extends Pattern {
  // WARP-CAPTURE CONTRACT (motif/warpCapture.js): a warp modulation replaces
  // each straight lattice line with a warped bezierVertex curve below, so the
  // motif capture probe must be handed the SAME guide-resolved modulation the
  // paint pass gets — otherwise a warped single-axis grid captures unwarped
  // geometry and its vine floats off the drawn curve (#103 / #111).
  static warpsDrawnGeometry = true;

  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      drawHorizontal = 1,
      drawVertical = 1,
      margin = 20,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
      warpNodes = 6,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Line layout (distribution eases + jitter) is the shared, RNG-injected
    // gridGeometry core so latticeForLayer can reconstruct these exact positions
    // offline. Passing the live p5 `ctx.random` keeps output byte-identical to
    // the pre-extraction inline code (same math, same RNG, same call order).
    const { xJittered, yJittered, totalW, totalH } = gridLinePositions(
      params,
      (min, max) => ctx.random(min, max)
    );

    const halfW = totalW / 2 + margin;
    const halfH = totalH / 2 + margin;
    const lines = [];

    // Vertical lines
    if (drawVertical >= 0.5) {
      for (const x of xJittered) {
        lines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
      }
    }

    // Horizontal lines
    if (drawHorizontal >= 0.5) {
      for (const y of yJittered) {
        lines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });
      }
    }

    // --- WARP modulation (geometry-build time) --------------------------------
    // A guide field supplied via params.modulation (channel:'warp') replaces each
    // straight grid line with a smooth Catmull-Rom bezier <path> that follows the
    // field. The warp-node build + Catmull-Rom curve now lives in the SHARED
    // gridGeometry core (`gridWarpCurves`) so the motif extractor reconstructs
    // the identical curve — exact-to-paint by construction. warp consumes NO RNG,
    // so moving it there keeps the unmodulated (and modulated) output byte-
    // identical. The SAME {start, segments} feeds both the SVG <path> and the p5
    // beginShape/bezierVertex draw (canvas == SVG); formatting stays here.
    const mod = params?.modulation;
    const warpMod = mod && mod.channel === 'warp' && mod.field ? mod : null;

    const warpPaths = []; // { start, segments } per line, for drawBase

    if (warpMod) {
      const fmt = (n) => n.toFixed(2);
      const curves = gridWarpCurves(lines, warpMod, { canvasW, canvasH, warpNodes });
      for (const { start, segments } of curves) {
        let d = `M${fmt(start.x)},${fmt(start.y)}`;
        for (const s of segments) {
          d += ` C${fmt(s.c1.x)},${fmt(s.c1.y)} ${fmt(s.c2.x)},${fmt(s.c2.y)} ${fmt(s.end.x)},${fmt(s.end.y)}`;
        }
        this.svgElements.push(
          `<path d="${d}" stroke="${color}" fill="none" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
        );
        warpPaths.push({ start, segments });
      }
    } else {
      for (const l of lines) {
        this.svgElements.push(
          `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="butt"/>`
        );
      }
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();
      if (warpMod) {
        for (const { start, segments } of warpPaths) {
          ctx.beginShape();
          ctx.vertex(start.x, start.y);
          for (const s of segments) {
            // p5 2.x curve API (BREAKING vs 1.x): a cubic is bezierOrder(3) plus
            // three 1-point bezierVertex calls (c1, c2, end); the anchor is the
            // current position (prior vertex / curve end). The old 6-arg form
            // threw inside endShape() on p5 2.2.3 and blanked the whole canvas.
            ctx.bezierOrder(3);
            ctx.bezierVertex(s.c1.x, s.c1.y);
            ctx.bezierVertex(s.c2.x, s.c2.y);
            ctx.bezierVertex(s.end.x, s.end.y);
          }
          ctx.endShape();
        }
      } else {
        for (const l of lines) {
          ctx.line(l.x1, l.y1, l.x2, l.y2);
        }
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }
}
