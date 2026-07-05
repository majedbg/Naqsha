import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';
import { warpDisplacement } from '../fields/warp';
import { catmullRomToBezier } from './catmullRomBezier';
import { gridLinePositions } from './gridGeometry';

export default class Grid extends Pattern {
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
    // field. A straight line has only 2 endpoints and cannot warp, so a warped
    // line SUBDIVIDES into K nodes; interior nodes are displaced along the field
    // gradient while the two ENDPOINTS stay pinned (tidy plotter frame). warp
    // consumes NO RNG — the `lines`/jitter build above is untouched, so the
    // unmodulated output stays byte-identical. The SAME {start, segments} feeds
    // both the SVG <path> and the p5 beginShape/bezierVertex draw (canvas == SVG).
    const mod = params?.modulation;
    const warpMod = mod && mod.channel === 'warp' && mod.field ? mod : null;

    const warpPaths = []; // { start, segments } per line, for drawBase

    if (warpMod) {
      const K = Math.max(2, Math.min(24, Math.round(warpNodes)));
      const fmt = (n) => n.toFixed(2);
      for (const l of lines) {
        const nodes = [];
        for (let k = 0; k < K; k++) {
          const t = k / (K - 1);
          const node = { x: l.x1 + (l.x2 - l.x1) * t, y: l.y1 + (l.y2 - l.y1) * t };
          // Pin endpoints: displace only interior nodes k=1..K-2.
          if (k > 0 && k < K - 1) {
            const u = (node.x + canvasW / 2) / canvasW;
            const v = (node.y + canvasH / 2) / canvasH;
            const { dx, dy } = warpDisplacement(warpMod.field, u, v, warpMod);
            node.x += dx;
            node.y += dy;
          }
          nodes.push(node);
        }
        const { start, segments } = catmullRomToBezier(nodes);
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
            ctx.bezierVertex(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.end.x, s.end.y);
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
