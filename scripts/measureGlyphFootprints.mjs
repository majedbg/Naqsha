// Measure, for each glyph: ink area, root-centred disc, tight (Welzl) disc,
// convex hull, and min-area oriented bounding box. All in glyph-local units.
import { MOTIF_GLYPHS } from '../src/lib/motif/glyphs.js';
import { flattenPathD } from '../src/lib/plotter/pathOps.js';

const pts = (g) => {
  const out = [];
  for (const p of g.paths || []) {
    const { points } = flattenPathD(p.d, 0.05);
    for (const q of points) out.push({ x: q[0], y: q[1] });
  }
  return out;
};

// --- Welzl minimal enclosing circle -----------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inCirc = (c, p) => c && dist(c, p) <= c.r + 1e-9;
const circ2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: dist(a, b) / 2 });
function circ3(a, b, c) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}
function welzl(P) {
  const p = P.slice();
  for (let i = p.length - 1; i > 0; i--) { const j = (i * 2654435761) % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  let c = null;
  for (let i = 0; i < p.length; i++) {
    if (inCirc(c, p[i])) continue;
    c = { x: p[i].x, y: p[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inCirc(c, p[j])) continue;
      c = circ2(p[i], p[j]);
      for (let k = 0; k < j; k++) {
        if (inCirc(c, p[k])) continue;
        const t = circ3(p[i], p[j], p[k]);
        if (t) c = t;
      }
    }
  }
  return c;
}

// --- convex hull (monotone chain) -------------------------------------------
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function hull(P) {
  const p = P.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
const polyArea = (P) => {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j].x * P[i].y - P[i].x * P[j].y;
  return Math.abs(a) / 2;
};

// --- min-area OBB via rotating the hull over each edge ----------------------
function obb(H) {
  let best = Infinity, dims = null;
  for (let i = 0, j = H.length - 1; i < H.length; j = i++) {
    const ex = H[i].x - H[j].x, ey = H[i].y - H[j].y;
    const L = Math.hypot(ex, ey); if (L < 1e-12) continue;
    const ux = ex / L, uy = ey / L;
    let m1 = Infinity, M1 = -Infinity, m2 = Infinity, M2 = -Infinity;
    for (const q of H) {
      const a = q.x * ux + q.y * uy, b = -q.x * uy + q.y * ux;
      if (a < m1) m1 = a; if (a > M1) M1 = a;
      if (b < m2) m2 = b; if (b > M2) M2 = b;
    }
    const area = (M1 - m1) * (M2 - m2);
    if (area < best) { best = area; dims = [M1 - m1, M2 - m2]; }
  }
  return { area: best, dims };
}

const ROW = [];
for (const g of Object.values(MOTIF_GLYPHS)) {
  const P = pts(g);
  if (P.length < 3) continue;
  if (hull(P).length < 3) continue;
  const root = g.root || { x: 0, y: 0 };
  const H = hull(P);
  const ink = polyArea(H); // hull area — the honest "actual shape" upper bound
  // true ink = sum of signed subpath areas; approximate with all-paths polygon
  let trueInk = 0;
  for (const p of g.paths || []) { const { points } = flattenPathD(p.d, 0.05); if (points.length >= 3) trueInk += polyArea(points.map((q) => ({ x: q[0], y: q[1] }))); }
  const rootR = Math.max(...P.map((q) => Math.hypot(q.x - root.x, q.y - root.y)));
  const mec = welzl(P);
  const box = obb(H);
  if (!box.dims) continue;
  ROW.push({
    id: g.id,
    n: P.length,
    ink: trueInk,
    hull: ink,
    obb: box.area,
    mec: Math.PI * mec.r * mec.r,
    rootDisc: Math.PI * rootR * rootR,
    viewRadius: g.viewRadius,
    mecR: mec.r,
    rootR,
    offset: Math.hypot(mec.x - root.x, mec.y - root.y),
    aspect: Math.max(...box.dims) / Math.min(...box.dims),
    hn: H.length,
  });
}

const f = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1)).padStart(8);
const r = (a, b) => (a / b).toFixed(2).padStart(6);
console.log('glyph            pts   rootDisc      MEC      OBB     hull      ink | root/MEC MEC/hull MEC/ink OBB/hull aspect');
const show = (rows) => rows.forEach((x) =>
  console.log(
    x.id.padEnd(16), String(x.n).padStart(4), f(x.rootDisc), f(x.mec), f(x.obb), f(x.hull), f(x.ink),
    '|', r(x.rootDisc, x.mec), r(x.mec, x.hull), r(x.mec, x.ink), r(x.obb, x.hull), x.aspect.toFixed(2).padStart(6),
  ));

const core = ROW.filter((x) => ['leaf', 'star', 'flower', 'dot', 'rosette', 'tendril'].includes(x.id));
console.log('\n--- hand-authored core ---');
show(core);

const vec = ROW.filter((x) => !core.includes(x));
console.log(`\n--- vector built-ins: ${vec.length} glyphs, sorted by root/MEC waste ---`);
show(vec.slice().sort((a, b) => b.rootDisc / b.mec - a.rootDisc / a.mec).slice(0, 12));

const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log('\n--- medians over all', ROW.length, 'glyphs ---');
console.log('  root/MEC ', med(ROW.map((x) => x.rootDisc / x.mec)).toFixed(2));
console.log('  MEC/hull ', med(ROW.map((x) => x.mec / x.hull)).toFixed(2));
console.log('  MEC/ink  ', med(ROW.map((x) => x.mec / x.ink)).toFixed(2));
console.log('  OBB/hull ', med(ROW.map((x) => x.obb / x.hull)).toFixed(2));
console.log('  hull/ink ', med(ROW.map((x) => x.hull / x.ink)).toFixed(2));
console.log('  aspect   ', med(ROW.map((x) => x.aspect)).toFixed(2));
console.log('  pts/glyph', med(ROW.map((x) => x.n)).toFixed(0), ' max', Math.max(...ROW.map((x) => x.n)));

console.log('\n--- where a HULL actually pays over the tight circle ---');
const byGain = ROW.slice().sort((a, b) => b.mec / b.hull - a.mec / a.hull);
console.log('  glyphs with MEC/hull > 1.5 :', ROW.filter((x) => x.mec / x.hull > 1.5).length, '/', ROW.length);
console.log('  glyphs with MEC/hull > 2.0 :', ROW.filter((x) => x.mec / x.hull > 2.0).length, '/', ROW.length);
console.log('  glyphs with aspect  > 1.5  :', ROW.filter((x) => x.aspect > 1.5).length, '/', ROW.length);
console.log('  worst 6 by MEC/hull:', byGain.slice(0, 6).map((x) => `${x.id}=${(x.mec / x.hull).toFixed(2)}(ar ${x.aspect.toFixed(1)})`).join(' '));
console.log('  core glyph ids     :', Object.keys(MOTIF_GLYPHS).slice(0, 6).join(' '));
const hulls = ROW.map((x) => x.hn);
console.log('  hull verts median  :', med(hulls), ' max', Math.max(...hulls));

console.log('\n--- the |fc| = fr degeneracy: A = |fc|^2 - fr^2, normalised by fr^2 ---');
const deg = ROW.map((x) => ({ id: x.id, k: x.offset / x.mecR, A: (x.offset ** 2 - x.mecR ** 2) / x.mecR ** 2 }));
console.log('  |fc|/fr : min', Math.min(...deg.map((d) => d.k)).toFixed(4),
            ' median', med(deg.map((d) => d.k)).toFixed(4),
            ' max', Math.max(...deg.map((d) => d.k)).toFixed(4));
console.log('  A > 0 (root OUTSIDE its own MEC):', deg.filter((d) => d.A > 0).length, '/', deg.length,
            deg.filter((d) => d.A > 0).map((d) => `${d.id}=${d.A.toFixed(4)}`).slice(0, 8).join(' '));
console.log('  |A| < 0.01 (near-degenerate)    :', deg.filter((d) => Math.abs(d.A) < 0.01).length, '/', deg.length);
console.log('  |A| < 1e-9 (exactly degenerate) :', deg.filter((d) => Math.abs(d.A) < 1e-9).length, '/', deg.length);
console.log('  closest 8 to degenerate:', deg.slice().sort((a, b) => Math.abs(a.A) - Math.abs(b.A)).slice(0, 8)
  .map((d) => `${d.id}=${d.A.toExponential(2)}`).join(' '));
