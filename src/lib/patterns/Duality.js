import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TWO_PI = Math.PI * 2;

function normAngle(a) {
  a = a % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

function angleInArc(theta, start, end) {
  theta = normAngle(theta);
  start = normAngle(start);
  end = normAngle(end);
  if (start <= end) return theta >= start && theta <= end;
  return theta >= start || theta <= end;
}

export default class Duality {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    const {
      innerRadius: innerR = 15, outerRadius: outerR = 450,
      spiralTurns = 8, spiralGrowth = 1.0,
      dashCount = 400, dashLength = 18, dashLenJitter = 0.4,
      dashSparsity = 0.12, angleJitter = 0.2,
      dashStrokeWeight = 1.2,
      arcCount = 14, arcSpacingNL = 1.8, arcRadiusJitter = 3,
      arcMinAngle = 40, arcMaxAngle = 260, arcMaxLength = 700,
      arcAngleJitter = 1.0, arcStrokeWeight = 0.8,
      overlapGap = 5, overlapPriority = 0.0,
      originX = 0.5, originY = 0.5, symmetry = 1, startAngle = 0,
      offsetX = 0, offsetY = 0,
    } = params || {};

    const rng = mulberry32(seed);
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const ox = originX * canvasW - cx;
    const oy = originY * canvasH - cy;
    const innerRadius = Math.max(4, innerR);
    const outerRadius = Math.max(innerRadius + 20, outerR);
    const radialRange = outerRadius - innerRadius;
    const arcMinRad = (Math.max(10, arcMinAngle) * Math.PI) / 180;
    const arcMaxRad = (Math.min(358, Math.max(arcMinAngle, arcMaxAngle)) * Math.PI) / 180;
    const gapHalf = overlapGap / 2;
    const minSeg = 1;

    // ============================================================
    // STEP 1: Spiral dash placement
    // ============================================================
    // The spiral maps index i ∈ [0, dashCount) to (r, theta).
    // r grows from innerRadius to outerRadius.
    // theta advances by spiralTurns full rotations total.
    // spiralGrowth controls how r increases: 1=linear, >1=tighter center.
    //
    // Pre-consume all PRNG in deterministic order:
    //   1. dash sparsity rolls
    //   2. dash length jitter
    //   3. dash angle jitter

    const sparsityRolls = [];
    for (let i = 0; i < dashCount; i++) sparsityRolls.push(rng());
    const lenJitters = [];
    for (let i = 0; i < dashCount; i++) lenJitters.push(rng());
    const angJitters = [];
    for (let i = 0; i < dashCount; i++) angJitters.push(rng());

    // Dashes: { r, theta, rStart, rEnd } (polar, centered on origin offset)
    const dashes = [];

    for (let i = 0; i < dashCount; i++) {
      // Skip?
      if (dashSparsity > 0 && sparsityRolls[i] < dashSparsity) continue;

      const t = i / Math.max(dashCount - 1, 1); // 0..1

      // Radius: non-linear growth
      const r = innerRadius + radialRange * Math.pow(t, spiralGrowth);

      // Angle: smooth spiral + jitter
      const baseAngle = t * spiralTurns * TWO_PI;
      const jitterAmount = angleJitter * (TWO_PI / Math.max(1, spiralTurns * 2));
      const theta = baseAngle + (angJitters[i] - 0.5) * 2 * jitterAmount;

      // Dash length with jitter — grows proportionally with r for natural scaling
      const radiusScale = r / ((innerRadius + outerRadius) / 2); // ~1 at midpoint
      let len = dashLength * radiusScale;
      if (dashLenJitter > 0) {
        len *= 1 + (lenJitters[i] * 2 - 1) * dashLenJitter;
      }
      len = Math.max(2, len);

      const halfLen = len / 2;
      const rStart = Math.max(innerRadius, r - halfLen);
      const rEnd = Math.min(outerRadius + dashLength, r + halfLen);

      if (rEnd - rStart >= minSeg) {
        dashes.push({ r, theta: normAngle(theta), rStart, rEnd });
      }
    }

    // ============================================================
    // STEP 2: Arc placement (shared radial range)
    // ============================================================
    // Arcs are placed between innerRadius and outerRadius — same space as dashes.
    // Pre-consume PRNG: radius jitter, then span + start angle.

    const arcRJitters = [];
    for (let j = 0; j < arcCount; j++) arcRJitters.push(rng());
    const arcSpanRolls = [];
    for (let j = 0; j < arcCount; j++) arcSpanRolls.push(rng());
    const arcStartRolls = [];
    for (let j = 0; j < arcCount; j++) arcStartRolls.push(rng());

    const arcs = [];
    for (let j = 0; j < arcCount; j++) {
      const t = arcCount > 1 ? j / (arcCount - 1) : 0.5;
      let rj = innerRadius + radialRange * Math.pow(t, arcSpacingNL);
      rj += (arcRJitters[j] - 0.5) * 2 * arcRadiusJitter;
      rj = Math.max(innerRadius, Math.min(outerRadius, rj));

      const maxAngleFromLen = rj > 0 ? arcMaxLength / rj : arcMaxRad;
      let effMax = Math.min(arcMaxRad, maxAngleFromLen);
      effMax = Math.max(arcMinRad, effMax);
      // Hard cap: never exceed 355° (≈6.196 rad) — prevents full circles
      const maxAllowed = (355 * Math.PI) / 180;
      effMax = Math.min(effMax, maxAllowed);
      const span = arcMinRad + arcSpanRolls[j] * Math.max(0, effMax - arcMinRad);
      const startAngle = arcStartRolls[j] * TWO_PI * arcAngleJitter;

      arcs.push({ r: rj, startAngle, endAngle: startAngle + span });
    }

    // ============================================================
    // STEP 3: Intersection processing
    // ============================================================

    // 3a. Find all intersections between dashes and arcs
    const intersections = [];
    for (let di = 0; di < dashes.length; di++) {
      const dash = dashes[di];
      for (let ai = 0; ai < arcs.length; ai++) {
        const arc = arcs[ai];
        // Does the arc's radius cross the dash's radial extent?
        if (arc.r >= dash.rStart && arc.r <= dash.rEnd) {
          // Does the dash's angle fall within the arc's angular span?
          if (angleInArc(dash.theta, arc.startAngle, arc.endAngle)) {
            intersections.push({ di, ai, rIntersect: arc.r, thetaIntersect: dash.theta });
          }
        }
      }
    }

    // 3b. Priority assignment
    const pArcWins = (1 - overlapPriority) / 2;
    for (const ix of intersections) {
      ix.arcWins = rng() < pArcWins;
    }

    // 3c. Cut gaps into dashes (where arcs win)
    const finalDashes = [];
    for (let di = 0; di < dashes.length; di++) {
      const dash = dashes[di];
      const cuts = intersections
        .filter((ix) => ix.di === di && ix.arcWins)
        .map((ix) => ix.rIntersect)
        .sort((a, b) => a - b);

      let segs = [{ rStart: dash.rStart, rEnd: dash.rEnd }];
      for (const cutR of cuts) {
        const next = [];
        for (const s of segs) {
          if (cutR - gapHalf >= s.rEnd || cutR + gapHalf <= s.rStart) {
            next.push(s);
          } else {
            if (cutR - gapHalf > s.rStart && cutR - gapHalf - s.rStart >= minSeg)
              next.push({ rStart: s.rStart, rEnd: cutR - gapHalf });
            if (s.rEnd > cutR + gapHalf && s.rEnd - (cutR + gapHalf) >= minSeg)
              next.push({ rStart: cutR + gapHalf, rEnd: s.rEnd });
          }
        }
        segs = next;
      }
      for (const s of segs) {
        finalDashes.push({ theta: dash.theta, rStart: s.rStart, rEnd: s.rEnd });
      }
    }

    // 3d. Cut gaps into arcs (where dashes win)
    const finalArcs = [];
    for (let ai = 0; ai < arcs.length; ai++) {
      const arc = arcs[ai];
      const angGapHalf = arc.r > 0 ? gapHalf / arc.r : 0;
      const minAngSeg = arc.r > 0 ? minSeg / arc.r : 0.01;

      const cuts = intersections
        .filter((ix) => ix.ai === ai && !ix.arcWins)
        .map((ix) => normAngle(ix.thetaIntersect))
        .sort((a, b) => a - b);

      let subSegs = [{ start: arc.startAngle, end: arc.endAngle }];
      for (const cutTheta of cuts) {
        const next = [];
        for (const sub of subSegs) {
          if (!angleInArc(cutTheta, sub.start, sub.end)) {
            next.push(sub);
            continue;
          }
          const leftSpan = normAngle(cutTheta - angGapHalf - sub.start);
          if (leftSpan >= minAngSeg) {
            next.push({ start: sub.start, end: cutTheta - angGapHalf });
          }
          const rightSpan = normAngle(sub.end - (cutTheta + angGapHalf));
          if (rightSpan >= minAngSeg) {
            next.push({ start: cutTheta + angGapHalf, end: sub.end });
          }
        }
        subSegs = next;
      }
      for (const sub of subSegs) {
        finalArcs.push({ r: arc.r, startAngle: sub.start, endAngle: sub.end });
      }
    }

    // ============================================================
    // Build line elements
    // ============================================================
    const dashLines = [];
    const arcLines = [];

    // Dash lines (radial segments relative to origin)
    for (const seg of finalDashes) {
      dashLines.push({
        x1: ox + seg.rStart * Math.cos(seg.theta),
        y1: oy + seg.rStart * Math.sin(seg.theta),
        x2: ox + seg.rEnd * Math.cos(seg.theta),
        y2: oy + seg.rEnd * Math.sin(seg.theta),
      });
    }

    // Arc chord polylines
    for (const seg of finalArcs) {
      const r = seg.r;
      const chordErr = 0.5;
      const cosArg = 1 - (chordErr * chordErr) / (2 * r * r);
      const arcStep = cosArg >= -1 && cosArg <= 1 ? Math.acos(cosArg) : 0.05;
      const step = Math.max(0.005, Math.min(0.2, arcStep));
      let span = seg.endAngle - seg.startAngle;
      if (span < 0) span += TWO_PI;
      // Cap at 355° — never draw a full circle
      const maxArcSpan = (355 * Math.PI) / 180;
      if (span > maxArcSpan) span = maxArcSpan;
      const nSteps = Math.max(1, Math.ceil(span / step));
      const actualStep = span / nSteps;

      for (let k = 0; k < nSteps; k++) {
        const a1 = seg.startAngle + k * actualStep;
        const a2 = seg.startAngle + (k + 1) * actualStep;
        arcLines.push({
          x1: ox + r * Math.cos(a1), y1: oy + r * Math.sin(a1),
          x2: ox + r * Math.cos(a2), y2: oy + r * Math.sin(a2),
        });
      }
    }

    // ============================================================
    // SVG elements
    // ============================================================
    this.svgElements = [];
    for (const l of dashLines) {
      this.svgElements.push(
        `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${dashStrokeWeight}" stroke-linecap="round"/>`
      );
    }
    for (const l of arcLines) {
      this.svgElements.push(
        `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${arcStrokeWeight}" stroke-linecap="butt"/>`
      );
    }

    // ============================================================
    // p5 canvas drawing
    // ============================================================
    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      p.noFill();

      const dc = p.color(color);
      dc.setAlpha(alpha);
      p.stroke(dc);
      p.strokeWeight(dashStrokeWeight);
      for (const l of dashLines) p.line(l.x1, l.y1, l.x2, l.y2);

      const ac = p.color(color);
      ac.setAlpha(alpha);
      p.stroke(ac);
      p.strokeWeight(arcStrokeWeight);
      for (const l of arcLines) p.line(l.x1, l.y1, l.x2, l.y2);
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const content = this.svgElements.map((el) => `    ${el}`).join('\n');
    return wrapSVGSymmetry(
      layerId, color, opacity, content,
      this._lastParams?.symmetry || 1, this._lastCx, this._lastCy,
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
