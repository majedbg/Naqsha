import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * ModuleGrid — a lattice of repeating line/arc modules (P.2-Shape port).
 *
 * Per-cell motifs adapted from the Generative Gestaltung sketches:
 *   sideSweep — lines from cell center to a point walking the cell perimeter
 *               (P_2_1_3_02).
 *   fan       — lines fanning from a single apex to points along every edge
 *               (P_2_1_3_03, drawMode 3).
 *   rings     — eccentric nested circles, diameter ramping inward (P_2_1_3_01).
 *   chevron   — stacked V's spanning the cell (P_2_1_1_03).
 *
 * Each cell's geometry is built ONCE in absolute, origin-centered coordinates
 * (rotation + jitter already baked in). `drawBase` replays that same array, and
 * the SVG strings are emitted from it too, so canvas == SVG and the whole thing
 * is seed-deterministic. This pattern has NO symmetry control — symmetry is
 * hardcoded to 1.
 */
export default class ModuleGrid extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      module = 'sideSweep',
      tilesX = 10,
      tilesY = 10,
      lineCount = 10,
      rotateMode = 'seeded',
      jitter = 0,
      strokeCap = 'round',
      strokeWeight = 0.6,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
      // Universal per-cell scale (multiplies module size around the cell
      // center; >1 overflows into neighbors and is NOT clipped).
      scale = 1,
      scaleMode = 'uniform',
      // Per-module knobs — each is read ONLY by its own module, with a
      // harmless default so every other module is byte-identical.
      sweepCurve = 0,        // sideSweep: 0 straight bundle → 1 bowed sweep
      fanSpread = 180,       // fan: angle subtended in degrees
      fanApex = 'center',    // fan: 'center' | 'corner'
      ringEccentricity = 0,  // rings: 0 circle → 1 ellipse
      ringSpacing = 0,       // rings: -1..1 spacing nonlinearity
      chevronDepth = 1,      // chevron: V steepness multiplier
      diamondAspect = 1,     // diamond: width/height ratio (1 = square diamond)
      diamondNesting = 0,    // diamond: -1..1 spacing curve of nested rhombi
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Square cells that fill the canvas.
    const tileSize = Math.min(canvasW / tilesX, canvasH / tilesY);
    const half = tileSize / 2;
    const TWO_PI = Math.PI * 2;
    const count = Math.max(1, Math.round(lineCount));

    // Collected absolute, origin-centered primitives. Lines and circles are
    // kept separate so both the canvas replay and the SVG emit can iterate them.
    const lines = [];   // { x1, y1, x2, y2 }
    const circles = []; // { cx, cy, r }

    // Rotate a local cell-point (lx, ly) by `rot` then translate to (gx, gy).
    const place = (lx, ly, rot, gx, gy) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return { x: gx + lx * c - ly * s, y: gy + lx * s + ly * c };
    };
    const addLine = (ax, ay, bx, by, rot, gx, gy) => {
      const a = place(ax, ay, rot, gx, gy);
      const b = place(bx, by, rot, gx, gy);
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    };

    for (let row = 0; row < tilesY; row++) {
      for (let col = 0; col < tilesX; col++) {
        // Cell center, origin-centered grid.
        const baseX = (col - (tilesX - 1) / 2) * tileSize;
        const baseY = (row - (tilesY - 1) / 2) * tileSize;

        // Per-cell rotation. Every random draw comes from the seeded RNG.
        let rot;
        if (rotateMode === 'gradient') {
          rot = (col / tilesX + row / tilesY) * Math.PI; // 0..2π across the grid
        } else if (rotateMode === 'aligned') {
          rot = 0;
        } else {
          rot = ctx.random(0, TWO_PI); // 'seeded'
        }

        // Positional jitter (seeded). Pull both offsets ALWAYS-or-NEVER so the
        // RNG stream stays in lock-step regardless of cell index.
        let gx = baseX;
        let gy = baseY;
        if (jitter > 0) {
          gx += ctx.random(-jitter, jitter) * half;
          gy += ctx.random(-jitter, jitter) * half;
        }

        // Per-cell scale → effective half. The module geometry is built at
        // `effectiveHalf` while grid spacing + jitter stay on the TRUE half, so
        // scale>1 overflows the cell (not clipped) without amplifying jitter.
        //   uniform  — every cell = scale (no RNG pull).
        //   gradient — scale * smooth ramp across the grid (no RNG pull).
        //   seeded   — scale * a per-cell seeded factor in [0.5, 1.5].
        // Only 'seeded' touches the RNG, and it pulls exactly once per cell, so
        // uniform/gradient leave the stream byte-identical to the old behavior.
        let cellScale = scale;
        if (scaleMode === 'gradient') {
          const ramp = (col / tilesX + row / tilesY) / 2; // 0..1 across grid
          cellScale = scale * (0.5 + ramp);               // 0.5×..1.5× of scale
        } else if (scaleMode === 'seeded') {
          cellScale = scale * ctx.random(0.5, 1.5);
        }
        const effectiveHalf = half * cellScale;

        buildModule(
          module, count, effectiveHalf, rot, gx, gy, addLine, circles, ctx,
          { sweepCurve, fanSpread, fanApex, ringEccentricity, ringSpacing, chevronDepth, diamondAspect, diamondNesting }
        );
      }
    }

    // SVG strings (origin-centered; the group wrapper translates to canvas
    // center and applies startAngle/offset — see inherited toSVGGroup).
    for (const l of lines) {
      this.svgElements.push(
        `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="${strokeCap}"/>`
      );
    }
    for (const cc of circles) {
      this.svgElements.push(
        `<circle cx="${cc.cx.toFixed(2)}" cy="${cc.cy.toFixed(2)}" r="${cc.r.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" fill="none"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.strokeCap(strokeCap);
      ctx.noFill();
      for (const l of lines) {
        ctx.line(l.x1, l.y1, l.x2, l.y2);
      }
      for (const cc of circles) {
        // p5 ellipse takes diameters; SVG <circle r> is the radius.
        ctx.ellipse(cc.cx, cc.cy, cc.r * 2, cc.r * 2);
      }
    };

    // Symmetry hardcoded to 1 (this pattern has no symmetry control).
    applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // SVG content: one element per line, no symmetry duplication beyond the
  // single group the inherited toSVGGroup wraps (symmetry defaults to 1 since
  // there is no `symmetry` param). Joined plainly, mirroring Feather.
  contentFor() {
    return this.svgElements.join('\n');
  }
}

/**
 * Build one cell's primitives in LOCAL cell coordinates, rotate+translate them
 * into absolute origin-centered coords, and append to `lines` / `circles`.
 *
 * Local cell space is [-half, half] on both axes, centered at (0,0).
 */
function buildModule(module, count, half, rot, gx, gy, addLine, circles, ctx, knobs = {}) {
  const size = half * 2;
  const {
    sweepCurve = 0,
    fanSpread = 180,
    fanApex = 'center',
    ringEccentricity = 0,
    ringSpacing = 0,
    chevronDepth = 1,
    diamondAspect = 1,
    diamondNesting = 0,
  } = knobs;

  // Draw a (possibly curved) spoke from (0,0) to (ex,ey). When `bow` is 0 this
  // is a single straight segment — byte-identical to the old addLine spoke. For
  // bow != 0 the spoke is approximated by short segments displaced sideways by a
  // sine bulge (peaks at midpoint), so the canvas line[] / SVG <line> path is
  // reused unchanged (no new primitive type, no canvas==SVG drift).
  const SWEEP_SEGS = 8;
  const addSpoke = (ex, ey, bow) => {
    if (!bow) {
      addLine(0, 0, ex, ey, rot, gx, gy);
      return;
    }
    // Perpendicular to the spoke direction, magnitude = bow * half.
    const px = -ey;
    const py = ex;
    const plen = Math.hypot(px, py) || 1;
    const nx = px / plen;
    const ny = py / plen;
    let prevX = 0;
    let prevY = 0;
    for (let s = 1; s <= SWEEP_SEGS; s++) {
      const t = s / SWEEP_SEGS;
      const bulge = Math.sin(t * Math.PI) * bow * half;
      const cx2 = ex * t + nx * bulge;
      const cy2 = ey * t + ny * bulge;
      addLine(prevX, prevY, cx2, cy2, rot, gx, gy);
      prevX = cx2;
      prevY = cy2;
    }
  };

  // Apply a power bias to a normalized step t in [0,1], used for the inward
  // ramp of nested rings/diamonds. Here t grows from 0 (outermost element) to
  // ~1 (innermost), and radius = full*(1 - tt). To make:
  //   bias>0 → steps SPREAD outward (inner elements pushed toward the rim),
  //   bias<0 → steps CLUSTER inward (inner elements crowd the center),
  //   bias 0 → linear,
  // we raise t to exp = 2^(bias*2): bias +1 → exp 4 (slow start → larger
  // radii held longer → spread out), bias -1 → exp 0.25 (fast start → cluster).
  const biasStep = (t, bias) => {
    if (!bias) return t;
    const p = Math.pow(2, bias * 2);
    return Math.pow(t, p);
  };

  switch (module) {
    case 'fan': {
      // Converging Fan (P_2_1_3_03): lines fanning from a single apex to points
      // spread across an arc of `fanSpread` degrees. fanApex picks the apex:
      // 'center' (default) keeps the original 4-edge converging fan; 'corner'
      // moves the apex to the top-left corner so the fan opens diagonally.
      const apexX = fanApex === 'corner' ? -half : 0;
      const apexY = fanApex === 'corner' ? -half : 0;
      const spread = (fanSpread * Math.PI) / 180;
      // Aim the fan at the cell center's opposite side; for center apex the base
      // direction faces +y (down), matching the old edge-spanning feel.
      const baseDir = fanApex === 'corner' ? Math.PI / 4 : Math.PI / 2;
      const reach = fanApex === 'corner' ? size : half;
      for (let i = 0; i <= count; i++) {
        const a = baseDir + (i / count - 0.5) * spread;
        const ex = apexX + Math.cos(a) * reach;
        const ey = apexY + Math.sin(a) * reach;
        addLine(apexX, apexY, ex, ey, rot, gx, gy);
      }
      break;
    }

    case 'rings': {
      // Nested Rings (P_2_1_3_01): concentric circles whose diameter ramps from
      // the full cell down to ~0, with a growing eccentric offset so the rings
      // crowd to one side. ringSpacing biases the diameter steps (nonlinear
      // nesting). ringEccentricity squashes the rings into ellipses — emitted as
      // segmented polylines (via addLine) so the canvas/SVG path stays unified.
      const endOffset = half * 0.6;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const ry = 1 - Math.max(0, Math.min(1, ringEccentricity)) * 0.85; // y-squash
      for (let i = 0; i < count; i++) {
        // baseT = i/count reproduces the original ramp EXACTLY at ringSpacing=0
        // (diameter size→~0, offset 0→endOffset); biasStep curves it otherwise.
        const baseT = i / count;
        const tt = biasStep(baseT, ringSpacing);
        const diameter = size * (1 - tt); // size → ~0
        const offset = endOffset * baseT;
        const ox = gx + offset * c;
        const oy = gy + offset * s;
        const r = diameter / 2;
        if (ringEccentricity > 0) {
          // Ellipse as a 24-gon polyline in cell-local space, then placed.
          const SEG = 24;
          let px = r;
          let py = 0;
          for (let k = 1; k <= SEG; k++) {
            const ang = (k / SEG) * Math.PI * 2;
            const qx = Math.cos(ang) * r;
            const qy = Math.sin(ang) * r * ry;
            // Place relative to the (already rotated/translated) ring center.
            addLine(px + offset, py, qx + offset, qy, rot, gx, gy);
            px = qx;
            py = qy;
          }
        } else {
          circles.push({ cx: ox, cy: oy, r });
        }
      }
      break;
    }

    case 'chevron': {
      // Chevron (P_2_1_1_03): count stacked V's spanning the cell width.
      // chevronDepth multiplies how far the V dips below each band (steepness).
      const step = size / count;
      for (let i = 0; i < count; i++) {
        const yTop = -half + i * step;
        const yBot = yTop + step * chevronDepth;
        addLine(-half, yTop, 0, yBot, rot, gx, gy);
        addLine(0, yBot, half, yTop, rot, gx, gy);
      }
      break;
    }

    case 'diamond': {
      // Nested Diamonds: `count` concentric rhombi centered in the cell — the
      // rhombus sibling of Nested Rings. diamondAspect sets width/height ratio
      // (1 = square diamond); diamondNesting biases the radius steps (same curve
      // family as ringSpacing). Each rhombus is 4 line segments via addLine, so
      // canvas == SVG with no new primitive type.
      const aspect = Math.max(0.05, diamondAspect);
      for (let i = 0; i < count; i++) {
        // Largest diamond outermost (r = half); ramp the radius down toward the
        // center. baseT = i/count keeps the innermost diamond non-degenerate
        // (never r=0, so all `count` rhombi are visible). diamondNesting curves
        // the spacing of the nested rhombi.
        const baseT = i / count;
        const tt = biasStep(baseT, diamondNesting);
        const r = half * (1 - tt); // half → ~0
        const rx = r * aspect;
        const ry = r;
        // 4 vertices: top, right, bottom, left.
        addLine(0, -ry, rx, 0, rot, gx, gy);
        addLine(rx, 0, 0, ry, rot, gx, gy);
        addLine(0, ry, -rx, 0, rot, gx, gy);
        addLine(-rx, 0, 0, -ry, rot, gx, gy);
      }
      break;
    }

    case 'sideSweep':
    default: {
      // Side Sweep (P_2_1_3_02): lines from the cell center to a point that
      // walks the four sides of the cell perimeter (count steps per side).
      // sweepCurve bows each spoke (0 = straight bundle, →1 = curved sweep).
      let ex = -half; // perimeter walker, starts at top-left corner
      let ey = -half;
      const stepX = size / count;
      const stepY = size / count;
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < count; i++) {
          switch (side) {
            case 0: ex += stepX; ey = -half; break; // top edge L→R
            case 1: ex = half; ey += stepY; break;  // right edge T→B
            case 2: ex -= stepX; ey = half; break;  // bottom edge R→L
            case 3: ex = -half; ey -= stepY; break; // left edge B→T
          }
          addSpoke(ex, ey, sweepCurve);
        }
      }
      break;
    }
  }
}
