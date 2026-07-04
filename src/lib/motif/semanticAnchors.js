// Semantic anchor extractors — derive Anchors of the four-role taxonomy
// (Crossings / Edges / Tips / Cells; docs/motif-adorn-research.md §1 #13) from a
// pattern's OWN structural math, not from generic path sampling. Unlike
// sampleEdgeAnchors (anchors.js), which needs only a polyline, a semantic
// extractor knows a pattern's geometry and can name where its meaningful
// structures live.
//
// Contract: getSemanticAnchors(patternType, params, canvasW, canvasH) returns
// Anchor[] for pattern types with an extractor, or null for the rest (the
// caller then falls back to generic edge anchors). Deterministic: identical
// params ⇒ identical anchors. Pure ESM — no p5/DOM/React.
//
// ── GRID extractor ──────────────────────────────────────────────────────────
// Faithful to src/lib/patterns/Grid.js `generate()`:
//   • Line positions come from distribute(count, totalSpan) (Grid.js:49-61):
//     count+1 positions, eased by power (gamma from `nonLinear`) then gain
//     (k=3^`nonLinearGain`), mirrored about center, spanning [-totalSpan/2,
//     +totalSpan/2]. This module replicates that math EXACTLY (see distribute
//     below) so anchors track the pattern's real, possibly-nonuniform spacing.
//   • totalW = cols*spacing, totalH = rows*spacing (Grid.js:63-64).
//   • Vertical lines at x=xPositions, spanning y∈[-halfH,halfH]; horizontal at
//     y=yPositions, spanning x∈[-halfW,halfW]; halfW=totalW/2+margin,
//     halfH=totalH/2+margin (Grid.js:72-88). Params read: cols, rows, spacing,
//     nonLinear, nonLinearGain, margin, drawHorizontal, drawVertical, offsetX,
//     offsetY (same defaults as Grid.js).
//
// Grid draws in a CENTERED frame that is then translated by (cx+offsetX,
// cy+offsetY) via applySymmetryDraw / wrapSVGSymmetry (symmetryUtils.js). We
// emit anchors in WORLD (canvas-pixel) coords = centered + (cx+offsetX,
// cy+offsetY), because the placement engine's field mask samples
// field.sampleNorm(x/canvasW, y/canvasH) — only meaningful for x∈[0,canvasW].
//
// DELIBERATE LIMITATIONS (documented, honesty-gated):
//   • symmetry>1 copies and startAngle rotation are NOT replicated — anchors
//     describe the single base copy at the default orientation. (A rotated /
//     N-fold layout would need the same transform applied per copy; deferred.)
//   • jitter>0 perturbs each drawn line by an RNG amount this extractor cannot
//     reproduce without the pattern's RNG stream. Anchors sit on the IDEAL
//     (pre-jitter) lattice; they drift from the drawing by up to ±jitter px.
//     The task explicitly greenlights degrade-and-document for jittered
//     variants; the divergence guard runs with jitter=0 for exact coincidence.
//   • warp modulation (params.modulation.channel==='warp') displaces interior
//     line nodes by an arbitrary field, so interior crossings can diverge
//     arbitrarily far from the straight lattice. We CANNOT verify coincidence,
//     so we return null (never ship anchors we can't tie to the drawing).

import { anchorId, sampleEdgeAnchors } from './anchors.js';

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/**
 * Replicate Grid.js distribute() EXACTLY (Grid.js:43-61): count+1 positions
 * across [-totalSpan/2, +totalSpan/2], eased by power (gamma) then gain (k).
 * @param {number} count
 * @param {number} totalSpan
 * @param {number} gamma
 * @param {number} gainK
 * @returns {number[]}
 */
function distribute(count, totalSpan, gamma, gainK) {
  const gain = (x, k) => {
    const a = 0.5 * Math.pow(2 * (x < 0.5 ? x : 1 - x), k);
    return x < 0.5 ? a : 1 - a;
  };
  const positions = [];
  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0.5;
    const centered = t - 0.5;
    const sign = centered >= 0 ? 1 : -1;
    const mag = Math.abs(centered) * 2;
    const eased = gain(Math.pow(mag, gamma), gainK);
    const tt = 0.5 + sign * eased * 0.5;
    positions.push(-totalSpan / 2 + tt * totalSpan);
  }
  return positions;
}

/**
 * Grid semantic extractor. See module header for the full role/limitation
 * contract. Emission order is fixed (crossings, edges, tips, cells) for
 * determinism.
 * @returns {Array<object>|null}
 */
function gridAnchors(params, canvasW, canvasH) {
  const {
    cols = 12,
    rows = 12,
    spacing = 40,
    nonLinear = 0,
    nonLinearGain = 0,
    margin = 20,
    drawHorizontal = 1,
    drawVertical = 1,
    offsetX = 0,
    offsetY = 0,
  } = params || {};

  // Warp displaces interior nodes off the straight lattice by an arbitrary
  // field — unverifiable, so refuse to emit (see module header).
  const mod = params && params.modulation;
  if (mod && mod.channel === 'warp' && mod.field) return null;

  const hasV = drawVertical >= 0.5;
  const hasH = drawHorizontal >= 0.5;
  if (!hasV && !hasH) return []; // nothing drawn ⇒ no anchors.

  const gamma = nonLinear >= 0 ? 1 + nonLinear : 1 / (1 + Math.abs(nonLinear));
  const gainK = Math.pow(3, nonLinearGain);

  const totalW = cols * spacing;
  const totalH = rows * spacing;
  const xPositions = distribute(cols, totalW, gamma, gainK); // cols+1
  const yPositions = distribute(rows, totalH, gamma, gainK); // rows+1
  const halfW = totalW / 2 + margin;
  const halfH = totalH / 2 + margin;

  // World-space origin (base copy; symmetry/rotation not applied — see header).
  const ox = canvasW / 2 + offsetX;
  const oy = canvasH / 2 + offsetY;

  const anchors = [];

  // ── CROSSINGS: every (vertical, horizontal) line intersection. tangent=+x,
  //    normal=+y (fixed convention). Interior crossings (strictly inside the
  //    lattice, not on its outer boundary row/col) are junctions, so the
  //    placement engine's junction policy can act on them. Requires both
  //    families drawn (an intersection needs one of each).
  if (hasV && hasH) {
    for (let i = 0; i < xPositions.length; i++) {
      for (let j = 0; j < yPositions.length; j++) {
        const interior = i > 0 && i < cols && j > 0 && j < rows;
        anchors.push({
          id: anchorId('crossing', i, j),
          role: 'crossing',
          x: xPositions[i] + ox,
          y: yPositions[j] + oy,
          tangent: 0,
          normal: HALF_PI,
          s: 0,
          meta: { row: j, col: i, junction: interior },
        });
      }
    }
  }

  // ── EDGES: midpoint of each inter-crossing segment along a grid line.
  //    tangent = line direction; normal = tangent + PI/2 (fixed convention).
  //    s = arc length from the line's start endpoint to the midpoint. "Between
  //    crossings" needs the perpendicular family to define the crossings, so
  //    vertical-line edges require horizontal lines, and vice versa.
  if (hasV && hasH) {
    // Vertical-line edges: line i, segment between rows j and j+1.
    for (let i = 0; i < xPositions.length; i++) {
      const x = xPositions[i] + ox;
      for (let j = 0; j < yPositions.length - 1; j++) {
        const midCentered = (yPositions[j] + yPositions[j + 1]) / 2;
        anchors.push({
          id: anchorId('edge', 'v', i, j),
          role: 'edge',
          x,
          y: midCentered + oy,
          tangent: HALF_PI, // line runs -halfH → +halfH (increasing y)
          normal: HALF_PI + HALF_PI, // = PI
          s: midCentered + halfH, // arc length from top endpoint (y=-halfH)
          meta: { orientation: 'v', line: i, segment: j },
        });
      }
    }
    // Horizontal-line edges: line j, segment between cols i and i+1.
    for (let j = 0; j < yPositions.length; j++) {
      const y = yPositions[j] + oy;
      for (let i = 0; i < xPositions.length - 1; i++) {
        const midCentered = (xPositions[i] + xPositions[i + 1]) / 2;
        anchors.push({
          id: anchorId('edge', 'h', j, i),
          role: 'edge',
          x: midCentered + ox,
          y,
          tangent: 0, // line runs -halfW → +halfW (increasing x)
          normal: HALF_PI,
          s: midCentered + halfW, // arc length from left endpoint (x=-halfW)
          meta: { orientation: 'h', line: j, segment: i },
        });
      }
    }
  }

  // ── TIPS: the two actual endpoints of every drawn line (verticals stop at
  //    y=±halfH, horizontals at x=±halfW). NOTE: these are the REAL line ends,
  //    not the abstract bounding-box corners (±halfW,±halfH) — no line ever
  //    reaches those, so anchoring there would be a fiction. tangent = line
  //    direction; normal = outward along the line axis (away from center); s =
  //    arc length (0 at the start endpoint, full length at the end).
  if (hasV) {
    for (let i = 0; i < xPositions.length; i++) {
      const x = xPositions[i] + ox;
      // end 0 = top (y=-halfH): outward is -y ⇒ normal -PI/2, s=0.
      anchors.push({
        id: anchorId('tip', 'v', i, 0),
        role: 'tip',
        x,
        y: -halfH + oy,
        tangent: HALF_PI,
        normal: -HALF_PI,
        s: 0,
        meta: { orientation: 'v', line: i, end: 0 },
      });
      // end 1 = bottom (y=+halfH): outward is +y ⇒ normal +PI/2, s=length.
      anchors.push({
        id: anchorId('tip', 'v', i, 1),
        role: 'tip',
        x,
        y: halfH + oy,
        tangent: HALF_PI,
        normal: HALF_PI,
        s: 2 * halfH,
        meta: { orientation: 'v', line: i, end: 1 },
      });
    }
  }
  if (hasH) {
    for (let j = 0; j < yPositions.length; j++) {
      const y = yPositions[j] + oy;
      // end 0 = left (x=-halfW): outward is -x ⇒ normal PI, s=0.
      anchors.push({
        id: anchorId('tip', 'h', j, 0),
        role: 'tip',
        x: -halfW + ox,
        y,
        tangent: 0,
        normal: Math.PI,
        s: 0,
        meta: { orientation: 'h', line: j, end: 0 },
      });
      // end 1 = right (x=+halfW): outward is +x ⇒ normal 0, s=length.
      anchors.push({
        id: anchorId('tip', 'h', j, 1),
        role: 'tip',
        x: halfW + ox,
        y,
        tangent: 0,
        normal: 0,
        s: 2 * halfW,
        meta: { orientation: 'h', line: j, end: 1 },
      });
    }
  }

  // ── CELLS: center of each grid cell (bounded by x-lines i,i+1 and y-lines
  //    j,j+1). A filled region, so tangent/normal follow the crossing
  //    convention (tangent=+x, normal=+y); s=0. Requires both families.
  if (hasV && hasH) {
    for (let i = 0; i < xPositions.length - 1; i++) {
      const cxCell = (xPositions[i] + xPositions[i + 1]) / 2 + ox;
      for (let j = 0; j < yPositions.length - 1; j++) {
        const cyCell = (yPositions[j] + yPositions[j + 1]) / 2 + oy;
        anchors.push({
          id: anchorId('cell', i, j),
          role: 'cell',
          x: cxCell,
          y: cyCell,
          tangent: 0,
          normal: HALF_PI,
          s: 0,
          meta: { row: j, col: i },
        });
      }
    }
  }

  return anchors;
}

// ── RECURSIVE extractor ──────────────────────────────────────────────────────
// Faithful to src/lib/patterns/RecursiveGeometry.js `generate()`:
//   • The drawing is a TREE of closed regular n-gons. recurse(cx,cy,r,rot,level)
//     (RecursiveGeometry.js:75-104) pushes ONE polygon, then — if level>0 —
//     spawns a CONCENTRIC child (same center, radius*getEffectiveScale(level),
//     level-1) and — if level>=2 — a BRANCH child at EVERY vertex (level-2). A
//     child is pruned (no polygon) when level<0 or radius<1.
//   • Vertices: getVertices(r,rot) = regular numSides-gon, vertex i at angle
//     rot + 2πi/numSides (RecursiveGeometry.js:48-58). numSides from `shape`
//     (triangle3/square4/pentagon5/hexagon6/circle72, default 4).
//   • startRadius = min(W,H)*(startScale/200); clampedDepth = clamp(depth,1,8);
//     nextRotation adds rotationPerLevel°. getEffectiveScale replicated exactly
//     (RecursiveGeometry.js:60-65). Geometry is fully param-determined (SEEDLESS)
//     — ctx.random is never used for positions — so this extractor is reproducible.
//
// Coordinate frame: recurse starts at the ORIGIN (0,0) and drawBase is wrapped by
// applySymmetryDraw, which for symmetry=1 translate()s by (cx+offsetX,cy+offsetY).
// So WORLD = centered + (canvasW/2+offsetX, canvasH/2+offsetY), matching Grid.
//
// ROLE MAPPING (all four roles map onto real drawn geometry):
//   • crossing = every polygon VERTEX (a star-vertex). meta.junction=true iff a
//     branch child was ACTUALLY drawn from that vertex (radius-pruning aware —
//     NOT a bare level>=2 test), so junction truth equals "a polygon is centered
//     there" in the recording.
//   • edge = midpoint of every polygon SIDE. tangent = side direction; s = the
//     perimeter arc length from vertex 0.
//   • cell = center of EVERY polygon (each is a closed filled region). Fixed
//     convention (tangent=+x, normal=+y), matching the Grid cell role.
//   • tip = center of every LEAF polygon (a branch terminus that spawned no drawn
//     child). Normal points outward from the global center (0 at the origin, the
//     concentric-chain terminus, where outward is undefined). Tips are a subset of
//     cell positions but a distinct role.
//
// DELIBERATE LIMITATIONS (documented, honesty-gated), mirroring the Grid
// extractor:
//   • symmetry>1 copies and startAngle rotation are NOT replicated — anchors
//     describe the single base copy at the default orientation.
//   • warp modulation (params.modulation.channel==='warp') displaces every vertex
//     by an arbitrary field, so anchors cannot be tied to the drawing. We return
//     null (never ship anchors we can't verify).

/** Sides per shape — mirrors RecursiveGeometry.sidesForShape (RecursiveGeometry.js:35-44). */
function sidesForShape(s) {
  switch (s) {
    case 'triangle': return 3;
    case 'square': return 4;
    case 'pentagon': return 5;
    case 'hexagon': return 6;
    case 'circle': return 72;
    default: return 4;
  }
}

/**
 * Recursive semantic extractor. See the block header for the role/limitation
 * contract. Emission order is fixed (crossings, edges, tips, cells) and iterates
 * polygons in the pattern's exact DFS pre-order for determinism.
 * @returns {Array<object>|null}
 */
function recursiveAnchors(params, canvasW, canvasH) {
  const {
    shape = 'hexagon',
    depth = 5,
    rotationPerLevel = 15,
    scaleFactor = 0.7,
    scaleNonLinearity = 0,
    startScale = 70,
    offsetX = 0,
    offsetY = 0,
  } = params || {};

  // Warp displaces every vertex by an arbitrary field — unverifiable, so refuse
  // to emit (see block header).
  const mod = params && params.modulation;
  if (mod && mod.channel === 'warp' && mod.field) return null;

  const clampedDepth = Math.max(1, Math.min(8, depth));
  const numSides = sidesForShape(shape);
  const startRadius = Math.min(canvasW, canvasH) * (startScale / 200);

  // Replicate RecursiveGeometry.getEffectiveScale EXACTLY (RecursiveGeometry.js:60-65).
  const getEffectiveScale = (level) => {
    if (scaleNonLinearity === 0 || clampedDepth <= 1) return scaleFactor;
    const progress = 1 - level / clampedDepth;
    const eased = Math.pow(scaleFactor, 1 + scaleNonLinearity * progress * 2);
    return Math.max(0.1, Math.min(0.98, eased));
  };

  // Regular polygon vertices, computed with the SAME float ops as the pattern
  // (centerX + radius*cos(angle)) so positions are bit-for-bit on the drawing.
  const getVertices = (centerX, centerY, radius, rotationRad) => {
    const verts = [];
    for (let i = 0; i < numSides; i++) {
      const angle = rotationRad + (Math.PI * 2 * i) / numSides;
      verts.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
    return verts;
  };

  // Enumerate polygons in the pattern's exact DFS pre-order (self, concentric,
  // then branch children per vertex). Track, per vertex, whether a branch child
  // was actually drawn (radius>=1) → junction truth; and whether the polygon
  // produced ANY child → leaf truth.
  const polys = [];
  const recurse = (centerX, centerY, radius, rotationRad, level) => {
    if (level < 0 || radius < 1) return false; // pruned — no polygon drawn
    const verts = getVertices(centerX, centerY, radius, rotationRad);
    const poly = {
      center: { x: centerX, y: centerY },
      radius,
      rotationRad,
      level,
      verts,
      isLeaf: true,
      vertexHasBranch: new Array(numSides).fill(false),
    };
    polys.push(poly);
    if (level > 0) {
      const effScale = getEffectiveScale(level);
      const nextRadius = radius * effScale;
      const nextRotation = rotationRad + (rotationPerLevel * Math.PI) / 180;
      let hasChild = false;
      if (recurse(centerX, centerY, nextRadius, nextRotation, level - 1)) hasChild = true;
      if (level >= 2) {
        const vertScale = getEffectiveScale(level - 1);
        for (let k = 0; k < verts.length; k++) {
          const v = verts[k];
          if (recurse(v.x, v.y, nextRadius * vertScale, nextRotation, level - 2)) {
            hasChild = true;
            poly.vertexHasBranch[k] = true;
          }
        }
      }
      if (hasChild) poly.isLeaf = false;
    }
    return true;
  };
  recurse(0, 0, startRadius, 0, clampedDepth);

  const ox = canvasW / 2 + offsetX;
  const oy = canvasH / 2 + offsetY;
  const anchors = [];

  // ── CROSSINGS: every polygon vertex. normal = outward radial (vertex angle);
  //    tangent = perpendicular. junction = a branch child was actually drawn here.
  for (let p = 0; p < polys.length; p++) {
    const poly = polys[p];
    for (let k = 0; k < poly.verts.length; k++) {
      const v = poly.verts[k];
      const vertexAngle = poly.rotationRad + (Math.PI * 2 * k) / numSides;
      anchors.push({
        id: anchorId('crossing', p, k),
        role: 'crossing',
        x: v.x + ox,
        y: v.y + oy,
        tangent: vertexAngle + HALF_PI,
        normal: vertexAngle,
        s: 0,
        meta: { poly: p, vertex: k, level: poly.level, junction: poly.vertexHasBranch[k] },
      });
    }
  }

  // ── EDGES: midpoint of every polygon side. tangent = side direction; normal =
  //    tangent+PI/2; s = perimeter arc length from vertex 0 (equal-length sides).
  for (let p = 0; p < polys.length; p++) {
    const poly = polys[p];
    const n = poly.verts.length;
    const sideLen = 2 * poly.radius * Math.sin(Math.PI / n);
    for (let k = 0; k < n; k++) {
      const a = poly.verts[k];
      const b = poly.verts[(k + 1) % n];
      const tangent = Math.atan2(b.y - a.y, b.x - a.x);
      anchors.push({
        id: anchorId('edge', p, k),
        role: 'edge',
        x: (a.x + b.x) / 2 + ox,
        y: (a.y + b.y) / 2 + oy,
        tangent,
        normal: tangent + HALF_PI,
        s: (k + 0.5) * sideLen,
        meta: { poly: p, side: k, level: poly.level },
      });
    }
  }

  // ── TIPS: center of every LEAF polygon (branch terminus). normal points
  //    outward from the global center; 0 at the origin (outward undefined there).
  for (let p = 0; p < polys.length; p++) {
    const poly = polys[p];
    if (!poly.isLeaf) continue;
    const outward =
      poly.center.x === 0 && poly.center.y === 0
        ? 0
        : Math.atan2(poly.center.y, poly.center.x);
    anchors.push({
      id: anchorId('tip', p),
      role: 'tip',
      x: poly.center.x + ox,
      y: poly.center.y + oy,
      tangent: outward + HALF_PI,
      normal: outward,
      s: 0,
      meta: { poly: p, level: poly.level },
    });
  }

  // ── CELLS: center of every polygon (a closed filled region). Fixed convention.
  for (let p = 0; p < polys.length; p++) {
    const poly = polys[p];
    anchors.push({
      id: anchorId('cell', p),
      role: 'cell',
      x: poly.center.x + ox,
      y: poly.center.y + oy,
      tangent: 0,
      normal: HALF_PI,
      s: 0,
      meta: { poly: p, level: poly.level },
    });
  }

  return anchors;
}

// ── SPIRAL extractor ─────────────────────────────────────────────────────────
// Faithful to src/lib/patterns/Spiral.js `generate()`:
//   • Draws `armCount` open arms. Arm `arm` is sampled at i=0..totalSteps
//     (totalSteps = round(turns*stepsPerTurn)) with t=i/totalSteps:
//       r     = innerRadius + (outerRadius-innerRadius) * t^growth      (Spiral.js:53)
//       angle = t*turns*2π + (arm/armCount)*2π  [+ wobble]              (Spiral.js:56-61)
//       x = r*cos(angle) [+dx],  y = r*sin(angle) [+dy]                 (Spiral.js:91-92)
//     Wobble is a pure sin() of t (no RNG). This extractor replays those EXACT
//     float ops (armPoint below) so ideal vertices are bit-for-bit on the drawing.
//
// THE SEED. Spiral is NOT seedless, but the seed touches geometry ONLY through the
// distort branch (Spiral.js:65-89): when distortAmount>0, each vertex is displaced
// by dx,dy = (ctx.noise(...)-0.5)*2*amt (Spiral.js:87-88). ctx.noise∈[0,1) ⇒
// |dx|,|dy| ≤ amt ⇒ euclidean drift ≤ amt*√2, for ANY noise implementation — a
// noise-agnostic bound, not an artifact of the test harness's RNG. So:
//   • distortAmount===0 → geometry fully param-determined → anchors bit-exact.
//   • distortAmount>0, no distort field → amt=distortAmount; anchors sit on the
//     IDEAL (undistorted) curve and drift from the drawing by ≤ distortAmount*√2.
//     The divergence guard asserts coincidence within that documented tolerance.
//   • distortAmount>0 WITH a distort modulation field → amt = distortAmount*mask
//     where mask = max(0, modulationTransfer(...)) is UNBOUNDED (Spiral.js:83-85),
//     so no finite tolerance holds → return null (mirrors the grid/recursive
//     warp→null branch: never ship anchors we can't tie to the drawing).
//
// Coordinate frame: the arm points are built in a CENTERED frame (origin 0,0) and
// drawBase is wrapped by applySymmetryDraw, which for symmetry=1 translate()s by
// (cx+offsetX, cy+offsetY). So WORLD = centered + (canvasW/2+offsetX,
// canvasH/2+offsetY), matching Grid/Recursive.
//
// ROLE MAPPING (only roles that map onto a spiral's REAL structure):
//   • tip = the endpoints of each arm — the signal terminus. Outer end (i=totalSteps)
//     always; inner end (i=0) only when the arm actually STARTS off the origin
//     (startR≠0). normal points radially outward from the global center.
//   • edge = arc-length samples ALONG each arm (interior, endpoints excluded so they
//     don't duplicate tips), via sampleEdgeAnchors — a spiral arm IS a path. tangent
//     = arm direction.
//   • crossing = the center HUB, emitted ONLY when armCount>1 AND every arm starts
//     at the origin (startR===0), i.e. the arms genuinely share that vertex. This is
//     the one place multiple arms provably meet. junction=true.
//   • NO crossings otherwise: a single arm (r and angle both monotonic in t) never
//     self-crosses, and for multi-arm spirals with startR≠0 the inter-arm
//     intersections that exist geometrically are NOT enumerated (they'd need numeric
//     root-finding) — we do not fabricate them.
//   • NO cells: a spiral arm is an OPEN curve enclosing no region.
//
// DELIBERATE LIMITATIONS (documented, honesty-gated), mirroring Grid/Recursive:
//   • symmetry>1 copies and startAngle rotation are NOT replicated — anchors
//     describe the single base copy at the default orientation.
//   • A single arm that starts exactly at the origin (armCount===1, startR===0)
//     leaves that origin endpoint unanchored: no hub (needs armCount>1) and no
//     inner tip (needs startR≠0). Deliberate — we do not ship a wrong anchor there.

/**
 * Spiral semantic extractor. See the block header for the role/limitation
 * contract. Emission order is fixed (crossings, edges, tips) for determinism.
 * @returns {Array<object>|null}
 */
function spiralAnchors(params, canvasW, canvasH) {
  const {
    armCount = 3,
    turns = 8,
    innerRadius = 5,
    outerRadius = 400,
    growth = 1.0,
    distortAmount = 0,
    wobbleAmp = 0,
    wobbleFreq = 8,
    stepsPerTurn = 120,
    offsetX = 0,
    offsetY = 0,
    edgeSamplesPerArm = 24,
  } = params || {};

  // A distort modulation field scales the noise by an unbounded mask — the drawn
  // vertices can't be tied to the ideal curve within any finite tolerance, so
  // refuse to emit (see block header).
  const mod = params && params.modulation;
  if (distortAmount > 0 && mod && mod.channel === 'distort' && mod.field) return null;

  const totalSteps = Math.round(turns * stepsPerTurn);
  if (armCount < 1 || totalSteps < 1) return []; // nothing drawn ⇒ no anchors.

  const radialRange = outerRadius - innerRadius;
  const ox = canvasW / 2 + offsetX;
  const oy = canvasH / 2 + offsetY;

  // Ideal (undistorted) arm point in CENTERED coords, replaying Spiral.generate's
  // exact float ops (dx/dy omitted — that's the seed-driven drift the header bounds).
  const armPoint = (arm, i) => {
    const armOffset = (arm / armCount) * TWO_PI;
    const t = i / totalSteps;
    const r = innerRadius + radialRange * Math.pow(t, growth);
    let angle = t * turns * TWO_PI + armOffset;
    if (wobbleAmp > 0) angle += wobbleAmp * Math.sin(t * wobbleFreq * TWO_PI) * (Math.PI / 180);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  };

  // Start radius decides whether arms share the origin. Note Math.pow(0,growth) is
  // 0 for growth>0 but 1 for growth===0 (arms start at the rim), so derive it from
  // the actual math — NOT from `innerRadius===0`.
  const startR = innerRadius + radialRange * Math.pow(0, growth);

  const anchors = [];

  // ── CROSSINGS: the center hub, iff multiple arms provably meet at the origin.
  if (armCount > 1 && startR === 0) {
    anchors.push({
      id: anchorId('crossing', 'hub'),
      role: 'crossing',
      x: ox,
      y: oy,
      tangent: 0,
      normal: HALF_PI,
      s: 0,
      meta: { hub: true, junction: true },
    });
  }

  // ── EDGES: interior arc-length samples along each arm (world coords). Endpoints
  //    excluded so they never duplicate the tips. tangent = arm direction (from
  //    sampleEdgeAnchors). ids: edge:<arm>:<sampleIndex>.
  const armPaths = [];
  for (let arm = 0; arm < armCount; arm++) {
    const pts = [];
    for (let i = 0; i <= totalSteps; i++) {
      const p = armPoint(arm, i);
      pts.push({ x: p.x + ox, y: p.y + oy });
    }
    armPaths.push(pts);
  }
  const edges = sampleEdgeAnchors(armPaths, {
    count: edgeSamplesPerArm,
    includeEndpoints: false,
    idPrefix: 'edge',
  });
  for (const e of edges) {
    anchors.push({ ...e, meta: { ...e.meta, arm: e.meta.pathIndex } });
  }

  // ── TIPS: arm endpoints. Outer terminus always; inner terminus only when the
  //    arm starts off the origin. normal = radial outward from the global center.
  for (let arm = 0; arm < armCount; arm++) {
    const outer = armPoint(arm, totalSteps);
    const oAng = outer.x === 0 && outer.y === 0 ? 0 : Math.atan2(outer.y, outer.x);
    anchors.push({
      id: anchorId('tip', arm, 'outer'),
      role: 'tip',
      x: outer.x + ox,
      y: outer.y + oy,
      tangent: oAng + HALF_PI,
      normal: oAng,
      s: 0,
      meta: { arm, end: 'outer' },
    });
    if (startR !== 0) {
      const inner = armPoint(arm, 0);
      const iAng = Math.atan2(inner.y, inner.x);
      anchors.push({
        id: anchorId('tip', arm, 'inner'),
        role: 'tip',
        x: inner.x + ox,
        y: inner.y + oy,
        tangent: iAng + HALF_PI,
        normal: iAng,
        s: 0,
        meta: { arm, end: 'inner' },
      });
    }
  }

  // ── CELLS: none — a spiral arm is an open curve enclosing no region.

  return anchors;
}

/**
 * Return semantic anchors for a pattern, or null when no extractor exists (the
 * caller falls back to generic edge anchors from anchors.js).
 * @param {string} patternType
 * @param {object} params
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Array<object>|null}
 */
export function getSemanticAnchors(patternType, params, canvasW, canvasH) {
  switch (patternType) {
    case 'grid':
      return gridAnchors(params, canvasW, canvasH);
    case 'recursive':
      return recursiveAnchors(params, canvasW, canvasH);
    case 'spiral':
      return spiralAnchors(params, canvasW, canvasH);
    // Extractors for these hosts are deferred to later slices.
    case 'voronoi':
    default:
      return null;
  }
}
