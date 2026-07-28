import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';
import { Pattern } from './drawingContext';
import { buildWarpedPolygon } from './recursiveSides';

export default class RecursiveGeometry extends Pattern {
  // WARP-CAPTURE CONTRACT (motif/warpCapture.js): a warp modulation warps the
  // recursive polygons below (corners, and whole sides at warpNodes ≥ 3).
  // BEHAVIOURALLY INERT TODAY — recursive is a SEMANTIC motif host, never an
  // edge host, so the capture prepass never records it and the prepass guard
  // short-circuits before consulting this flag. It is declared because the flag
  // states a fact about the PATTERN, not about the current host list: its
  // anchors already come from the shared warped-geometry core (recursiveSides),
  // and a future ticket routing recursive through capture inherits the right
  // answer instead of rediscovering #103.
  static warpsDrawnGeometry = true;

  constructor() {
    super();
    this._polygons = [];
  }

  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    this._polygons = [];
    ctx.randomSeed(seed);

    const {
      shape = 'hexagon',
      depth = 5,
      rotationPerLevel = 15,
      scaleFactor = 0.7,
      scaleNonLinearity = 0,
      startScale = 70,
      strokeWeight = 1,
      strokeDepthDecay = 0,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
      // Bend slider (ticket #116). Default 2 — NOT grid's 6 — so enabling warp
      // keeps today's straight-corner behaviour (K=2, byte-identical); the artist
      // raises it to bend the edges. K<3 is the only runtime gate (see below).
      warpNodes = 2,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const clampedDepth = Math.max(1, Math.min(8, depth));

    const sidesForShape = (s) => {
      switch (s) {
        case 'triangle': return 3;
        case 'square': return 4;
        case 'pentagon': return 5;
        case 'hexagon': return 6;
        case 'circle': return 72;
        default: return 4;
      }
    };

    const numSides = sidesForShape(shape);

    const getVertices = (radius, rotationRad) => {
      const verts = [];
      for (let i = 0; i < numSides; i++) {
        const angle = rotationRad + (Math.PI * 2 * i) / numSides;
        verts.push({
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        });
      }
      return verts;
    };

    const getEffectiveScale = (level) => {
      if (scaleNonLinearity === 0 || clampedDepth <= 1) return scaleFactor;
      const progress = 1 - level / clampedDepth;
      const eased = Math.pow(scaleFactor, 1 + scaleNonLinearity * progress * 2);
      return Math.max(0.1, Math.min(0.98, eased));
    };

    const strokeAtLevel = (level) => {
      if (strokeDepthDecay === 0) return strokeWeight;
      const progress = 1 - level / clampedDepth;
      return Math.max(0.1, strokeWeight * (1 - strokeDepthDecay * progress));
    };

    const startRadius = Math.min(canvasW, canvasH) * (startScale / 200);

    const recurse = (centerX, centerY, radius, rotationRad, level) => {
      if (level < 0 || radius < 1) return;

      const localVerts = getVertices(radius, rotationRad);
      const sw = strokeAtLevel(level);

      const absVerts = localVerts.map((v) => ({
        x: centerX + v.x,
        y: centerY + v.y,
      }));

      this._polygons.push({ verts: absVerts, sw });

      if (level > 0) {
        const effScale = getEffectiveScale(level);
        const nextRadius = radius * effScale;
        const nextRotation = rotationRad + (rotationPerLevel * Math.PI) / 180;

        recurse(centerX, centerY, nextRadius, nextRotation, level - 1);

        if (level >= 2) {
          const vertScale = getEffectiveScale(level - 1);
          for (const v of absVerts) {
            recurse(v.x, v.y, nextRadius * vertScale, nextRotation, level - 2);
          }
        }
      }
    };

    recurse(0, 0, startRadius, 0, clampedDepth);

    // --- WARP modulation (geometry-build time) --------------------------------
    // A guide field supplied via params.modulation (channel:'warp') warps the
    // recursive polygons, AFTER the full recursion and BEFORE both the SVG-path
    // build and drawBase, so canvas and SVG warp identically. The subdivision +
    // curve build lives in the SHARED recursive core (recursiveSides.js) that the
    // recursive extractor will also call, so reconstructed anchors are exact-to-
    // paint by construction. Two modes, gated ONLY on warpNodes K:
    //   K = 2 → vertices-only: corners warp, sides stay STRAIGHT (poly.verts is
    //           replaced with the warped corners; the M/L/Z + vertex/CLOSE emit
    //           below is byte-identical to the pre-bendable warp behaviour).
    //   K ≥ 3 → bendable edges: each side becomes a Catmull-Rom curve through K
    //           warped nodes (poly.sides), drawn as C-segments / bezierVertex.
    // The geometry is origin-centered (recurse starts at 0,0). When warpMod is
    // null nothing is touched → byte-identical to the unmodulated path.
    const mod = params?.modulation;
    const warpMod = mod && mod.channel === 'warp' && mod.field ? mod : null;
    if (warpMod) {
      // Phase 2b: vector-SUM every warp source (N=1 → single, byte-identical).
      const warpSources = warpMod.sources ?? [warpMod];
      for (const poly of this._polygons) {
        const built = buildWarpedPolygon(poly.verts, {
          warpSources,
          canvasW,
          canvasH,
          warpNodes,
        });
        if (built.mode === 'vertices') poly.verts = built.verts;
        else poly.sides = built.sides;
      }
    }

    // Build SVG path strings from the (possibly warped) polygon geometry. Bendable
    // polygons (poly.sides) emit one continuous curved <path>: M at the first
    // side's start, then every side's C-segments in order (adjacent sides share
    // their warped corner, so no intermediate M is needed), closed with Z.
    for (const poly of this._polygons) {
      let pathD;
      if (poly.sides) {
        const f = (n) => n.toFixed(2);
        const { start } = poly.sides[0];
        let d = `M${f(start.x)} ${f(start.y)}`;
        for (const side of poly.sides) {
          for (const s of side.segments) {
            d += ` C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.end.x)} ${f(s.end.y)}`;
          }
        }
        pathD = `${d} Z`;
      } else {
        const parts = poly.verts.map((v, i) =>
          i === 0
            ? `M${v.x.toFixed(2)} ${v.y.toFixed(2)}`
            : `L${v.x.toFixed(2)} ${v.y.toFixed(2)}`
        );
        parts.push('Z');
        pathD = parts.join(' ');
      }
      this.svgElements.push({ pathD, strokeWeight: poly.sw });
    }

    const drawBase = () => {
      ctx.noFill();
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);

      for (const poly of this._polygons) {
        ctx.strokeWeight(poly.sw);
        if (poly.sides) {
          // Bendable: one closed shape, start vertex then every side's cubic
          // bezierVertex triples (same {start, segments} that drive the SVG C
          // string → canvas == SVG). p5 2.x cubic API: bezierOrder(3) + three
          // 1-point bezierVertex calls (c1, c2, end); anchor is the prior point.
          ctx.beginShape();
          ctx.vertex(poly.sides[0].start.x, poly.sides[0].start.y);
          for (const side of poly.sides) {
            for (const s of side.segments) {
              ctx.bezierOrder(3);
              ctx.bezierVertex(s.c1.x, s.c1.y);
              ctx.bezierVertex(s.c2.x, s.c2.y);
              ctx.bezierVertex(s.end.x, s.end.y);
            }
          }
          ctx.endShape(ctx.CLOSE);
        } else {
          ctx.beginShape();
          for (const v of poly.verts) {
            ctx.vertex(v.x, v.y);
          }
          ctx.endShape(ctx.CLOSE);
        }
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const paths = this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight.toFixed(2)}" stroke-linecap="round"/>`
      )
      .join('\n');
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      paths,
      this._lastParams?.symmetry || 'single',
      this._lastCx,
      this._lastCy,
      this._lastParams?.startAngle || 0,
      this._lastParams?.offsetX || 0,
      this._lastParams?.offsetY || 0
    );
  }

}
