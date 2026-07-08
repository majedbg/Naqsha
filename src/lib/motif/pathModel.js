// pathModel — pure, headless, DOM-free bridge between an SVG path `d` string and
// an editable cubic-bézier ANCHOR model for a pen editor.
//
// Two functions:
//   parseDToAnchors(d) -> { subpaths: [ { anchors: [Anchor], closed } ] }
//   anchorsToD(model)  -> d string
//
// Anchor = { x, y, in: {x,y}|null, out: {x,y}|null, type: 'corner'|'smooth' }
//   `in`  = incoming control-point handle position, ABSOLUTE coords (or null).
//   `out` = outgoing control-point handle position, ABSOLUTE coords (or null).
//   A null handle means the segment on that side is straight (no bézier arm).
//   `type` is an INTERACTION HINT ONLY (how the editor should drag the handles).
//   It MUST NEVER influence the geometry emitted by anchorsToD.
//
// Every curve command is NORMALIZED to cubic anchors:
//   L/H/V  -> straight segment: null handle on the straight side.
//   C/S    -> handles taken directly (S reflects the previous cubic control pt).
//   Q/T    -> ELEVATED to cubic exactly (cp1 = p0 + 2/3(qc-p0),
//                                        cp2 = p3 + 2/3(qc-p3)).
//   A      -> approximated as one-or-more cubics via arc math (the ONLY lossy
//             normalization — lossy on representation, faithful on shape).
//
// This module always round-trips SHAPE faithfully (parse -> serialize -> flatten
// matches the original within tolerance). Verbatim-`d` preservation for UNEDITED
// glyphs is a later editor concern, NOT this module's job — no passthrough here.
//
// Command-parsing conventions are kept CONSISTENT with the shipped flattener in
// ../plotter/pathOps.js (flattenPathD): same tokenizer number regex, implicit-L
// after M, and the lowercase-as-absolute quirk (true relative commands are NOT
// supported — lowercase m/l/c/s/q/t/a are read as ABSOLUTE, exactly as the
// flattener reads them, so the fidelity round-trip stays self-consistent).

// Tokenize a path-d string into command letters and numeric strings. Same number
// regex as pathOps.js; recognises the full curve command set including H/V.
function tokenize(d) {
  return d.match(/[MLHVZCSQTAmlhvzcsqta]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
}

// 2/3 elevation weight for quadratic -> cubic.
const Q2C = 2 / 3;

function elevateQuad(p0, qc, p3) {
  return {
    cp1: [p0[0] + Q2C * (qc[0] - p0[0]), p0[1] + Q2C * (qc[1] - p0[1])],
    cp2: [p3[0] + Q2C * (qc[0] - p3[0]), p3[1] + Q2C * (qc[1] - p3[1])],
  };
}

// Convert an SVG elliptical-arc command to a list of cubic segments. Follows the
// endpoint -> centre parameterization of the SVG spec (F.6.5) with the radii
// out-of-range correction (F.6.6) — mirrors flattenArc() in pathOps.js — then
// splits the swept angle into <=90-degree pieces, each approximated by a cubic
// with control-arm length k = (4/3)·tan(dθ/4). Returns [{ cp1, cp2, end }, ...]
// in ABSOLUTE coords. Degenerate cases collapse to a single straight segment.
function arcToCubics(p0, rx, ry, phiDeg, largeArc, sweep, p) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  // Coincident endpoints => no arc. Zero radius => straight line to endpoint.
  if (p0[0] === p[0] && p0[1] === p[1]) return [];
  if (rx === 0 || ry === 0) return [{ cp1: null, cp2: null, end: [p[0], p[1]] }];

  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (p0[0] - p[0]) / 2;
  const dy = (p0[1] - p[1]) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const num = rxSq * rySq - rxSq * y1 * y1 - rySq * x1 * x1;
  const den = rxSq * y1 * y1 + rySq * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cosP * cxp - sinP * cyp + (p0[0] + p[0]) / 2;
  const cy = sinP * cxp + cosP * cyp + (p0[1] + p[1]) / 2;
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dTheta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Map a parametric angle on the (un-rotated) ellipse to an absolute point and
  // its tangent (derivative), then rotate into place.
  const pointAt = (t) => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy];
  };
  const tangentAt = (t) => {
    const ex = -rx * Math.sin(t);
    const ey = ry * Math.cos(t);
    return [cosP * ex - sinP * ey, sinP * ex + cosP * ey];
  };

  const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segCount;
  const k = (4 / 3) * Math.tan(delta / 4);
  const out = [];
  let t = theta1;
  for (let i = 0; i < segCount; i++) {
    const t2 = t + delta;
    const pA = pointAt(t);
    const pB = pointAt(t2);
    const dA = tangentAt(t);
    const dB = tangentAt(t2);
    out.push({
      cp1: [pA[0] + k * dA[0], pA[1] + k * dA[1]],
      cp2: [pB[0] - k * dB[0], pB[1] - k * dB[1]],
      end: pB,
    });
    t = t2;
  }
  // Pin the final endpoint exactly (guard against float drift in pointAt).
  if (out.length) out[out.length - 1].end = [p[0], p[1]];
  return out;
}

// Collinearity / mirror-length tolerances for `type` inference (hint only).
const COLLINEAR_TOL = 0.02; // |sin(angle-between-arms)|; ~1.1 degrees off straight
const MIRROR_TOL = 0.08;    // relative arm-length mismatch |a-b| / max(a,b)

// Infer the interaction hint for an anchor from its two handles. 'smooth' when
// the in/out arms are roughly COLLINEAR THROUGH the anchor (antiparallel) AND
// roughly mirror-length; otherwise 'corner'. A null handle is always 'corner'.
function inferType(x, y, hIn, hOut) {
  if (!hIn || !hOut) return 'corner';
  // Arms measured FROM the anchor outward to each handle.
  const ax = hIn.x - x;
  const ay = hIn.y - y;
  const bx = hOut.x - x;
  const by = hOut.y - y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 'corner';
  // Antiparallel arms => in/out point opposite ways through the anchor.
  const dot = ax * bx + ay * by;
  if (dot >= 0) return 'corner';
  const cross = ax * by - ay * bx;
  const sinBetween = Math.abs(cross) / (la * lb);
  if (sinBetween > COLLINEAR_TOL) return 'corner';
  if (Math.abs(la - lb) / Math.max(la, lb) > MIRROR_TOL) return 'corner';
  return 'smooth';
}

// Finalize an anchor: attach its inferred `type` and freeze handle shape. Called
// once per anchor after both its in/out handles are known.
function finalizeAnchor(a) {
  a.type = inferType(a.x, a.y, a.in, a.out);
  return a;
}

export function parseDToAnchors(d) {
  if (!d || typeof d !== 'string') return { subpaths: [] };
  const tokens = tokenize(d);
  const subpaths = [];
  let sub = null;       // current { anchors, closed }
  let cur = null;       // current on-curve anchor object (segment start)
  let cmd = null;       // current command letter (uppercased)
  let prevCubicC2 = null; // previous C/S 2nd control point (for S reflection)
  let prevQuadC = null;   // previous Q/T control point (for T reflection)
  let i = 0;

  const num = (k) => parseFloat(tokens[i + k]);

  // Begin a fresh anchor at (x,y) with no handles yet, append to current sub.
  const startAnchor = (x, y) => {
    const a = { x, y, in: null, out: null, type: 'corner' };
    sub.anchors.push(a);
    cur = a;
    return a;
  };

  // Extend from `cur` to a new anchor at end, wiring the segment's handles:
  //   cur.out = outHandle, newAnchor.in = inHandle (either may be null).
  const extend = (outHandle, inHandle, endX, endY) => {
    cur.out = outHandle ? { x: outHandle[0], y: outHandle[1] } : null;
    const a = { x: endX, y: endY, in: inHandle ? { x: inHandle[0], y: inHandle[1] } : null, out: null, type: 'corner' };
    sub.anchors.push(a);
    cur = a;
    return a;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[Zz]$/.test(tok)) {
      if (sub) sub.closed = true;
      cmd = null; prevCubicC2 = null; prevQuadC = null;
      i++;
      continue;
    }
    if (/^[MLHVCSQTAmlhvcsqta]$/.test(tok)) { cmd = tok.toUpperCase(); i++; continue; }

    const c = cmd || 'L';
    if (c === 'M') {
      const x = num(0), y = num(1);
      // A new M always opens a NEW subpath.
      sub = { anchors: [], closed: false };
      subpaths.push(sub);
      if (Number.isFinite(x) && Number.isFinite(y)) startAnchor(x, y);
      prevCubicC2 = null; prevQuadC = null;
      cmd = 'L'; // extra coordinate pairs after M are implicit L
      i += 2;
    } else if (c === 'L') {
      const x = num(0), y = num(1);
      if (Number.isFinite(x) && Number.isFinite(y)) extend(null, null, x, y);
      prevCubicC2 = null; prevQuadC = null;
      i += 2;
    } else if (c === 'H') {
      const x = num(0);
      if (Number.isFinite(x)) extend(null, null, x, cur.y);
      prevCubicC2 = null; prevQuadC = null;
      i += 1;
    } else if (c === 'V') {
      const y = num(0);
      if (Number.isFinite(y)) extend(null, null, cur.x, y);
      prevCubicC2 = null; prevQuadC = null;
      i += 1;
    } else if (c === 'C') {
      const c1x = num(0), c1y = num(1), c2x = num(2), c2y = num(3), ex = num(4), ey = num(5);
      if ([c1x, c1y, c2x, c2y, ex, ey].every(Number.isFinite)) {
        extend([c1x, c1y], [c2x, c2y], ex, ey);
        prevCubicC2 = [c2x, c2y];
        prevQuadC = null;
      }
      i += 6;
    } else if (c === 'S') {
      const c2x = num(0), c2y = num(1), ex = num(2), ey = num(3);
      if ([c2x, c2y, ex, ey].every(Number.isFinite)) {
        // cp1 = reflection of previous cubic 2nd control about current point; if
        // the previous command was not C/S it coincides with the current point.
        const c1 = prevCubicC2
          ? [2 * cur.x - prevCubicC2[0], 2 * cur.y - prevCubicC2[1]]
          : [cur.x, cur.y];
        extend(c1, [c2x, c2y], ex, ey);
        prevCubicC2 = [c2x, c2y];
        prevQuadC = null;
      }
      i += 4;
    } else if (c === 'Q') {
      const qcx = num(0), qcy = num(1), ex = num(2), ey = num(3);
      if ([qcx, qcy, ex, ey].every(Number.isFinite)) {
        const { cp1, cp2 } = elevateQuad([cur.x, cur.y], [qcx, qcy], [ex, ey]);
        extend(cp1, cp2, ex, ey);
        prevQuadC = [qcx, qcy];
        prevCubicC2 = null;
      }
      i += 4;
    } else if (c === 'T') {
      const ex = num(0), ey = num(1);
      if ([ex, ey].every(Number.isFinite)) {
        // Quadratic control = reflection of previous Q/T control about current
        // point; if the previous command was not Q/T it coincides with current.
        const qc = prevQuadC
          ? [2 * cur.x - prevQuadC[0], 2 * cur.y - prevQuadC[1]]
          : [cur.x, cur.y];
        const { cp1, cp2 } = elevateQuad([cur.x, cur.y], qc, [ex, ey]);
        extend(cp1, cp2, ex, ey);
        prevQuadC = qc;
        prevCubicC2 = null;
      }
      i += 2;
    } else if (c === 'A') {
      const rx = num(0), ry = num(1), rot = num(2), laf = num(3), sf = num(4), ex = num(5), ey = num(6);
      if ([rx, ry, rot, laf, sf, ex, ey].every(Number.isFinite)) {
        const segs = arcToCubics([cur.x, cur.y], rx, ry, rot, laf !== 0, sf !== 0, [ex, ey]);
        for (const s of segs) extend(s.cp1, s.cp2, s.end[0], s.end[1]);
        prevCubicC2 = null; prevQuadC = null;
      }
      i += 7;
    } else {
      i++;
    }
  }

  // Attach interaction hints once the whole path is built (every anchor's in/out
  // handles are now final). Geometry is already frozen; type never feeds back.
  for (const s of subpaths) for (const a of s.anchors) finalizeAnchor(a);
  return { subpaths };
}

// Format a coordinate the way pathOps.js serializers do (2dp). Sub-0.01px, far
// below the fidelity tolerance.
function fmt(n) {
  return Number(n).toFixed(2);
}

export function anchorsToD(model) {
  if (!model || !Array.isArray(model.subpaths)) return '';
  const parts = [];
  for (const sub of model.subpaths) {
    const anchors = sub.anchors || [];
    if (anchors.length === 0) continue;
    const a0 = anchors[0];
    parts.push(`M${fmt(a0.x)},${fmt(a0.y)}`);
    for (let i = 1; i < anchors.length; i++) {
      const p = anchors[i - 1];
      const q = anchors[i];
      if (!p.out && !q.in) {
        // Both bounding handles null => genuinely straight segment.
        parts.push(`L${fmt(q.x)},${fmt(q.y)}`);
      } else {
        // Mixed or full cubic. Synthesize the missing arm at its anchor position
        // so a half-straight/half-curved segment still emits a valid cubic.
        const c1 = p.out || { x: p.x, y: p.y };
        const c2 = q.in || { x: q.x, y: q.y };
        parts.push(`C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(q.x)},${fmt(q.y)}`);
      }
    }
    if (sub.closed) parts.push('Z');
  }
  return parts.join(' ');
}
