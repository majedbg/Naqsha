import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class RecursiveGeometry {
  constructor() {
    this.svgElements = [];
    this._polygons = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    this._polygons = [];
    p.randomSeed(seed);

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

      const parts = absVerts.map((v, i) =>
        i === 0
          ? `M${v.x.toFixed(2)} ${v.y.toFixed(2)}`
          : `L${v.x.toFixed(2)} ${v.y.toFixed(2)}`
      );
      parts.push('Z');
      this.svgElements.push({ pathD: parts.join(' '), strokeWeight: sw });

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

    const drawBase = () => {
      p.noFill();
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);

      for (const poly of this._polygons) {
        p.strokeWeight(poly.sw);
        p.beginShape();
        for (const v of poly.verts) {
          p.vertex(v.x, v.y);
        }
        p.endShape(p.CLOSE);
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
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

  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}
