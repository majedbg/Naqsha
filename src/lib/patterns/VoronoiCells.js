import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class VoronoiCells {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);

    const {
      cellCount = 80,
      jitter = 40,
      drawMode = 'outlines',
      relaxationSteps = 2,
      strokeWeight = 1,
      symmetry = 'none',
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const halfW = canvasW / 2;
    const halfH = canvasH / 2;

    // --- 1. Generate seed points centered at (0,0) ---
    let points = [];
    const jitterFactor = jitter / 100;

    if (jitterFactor >= 0.8) {
      // Fully random placement
      for (let i = 0; i < cellCount; i++) {
        points.push({
          x: p.random(-halfW, halfW),
          y: p.random(-halfH, halfH),
        });
      }
    } else {
      // Grid-based with jitter
      const cols = Math.ceil(Math.sqrt(cellCount * (canvasW / canvasH)));
      const rows = Math.ceil(cellCount / cols);
      const spacingX = canvasW / cols;
      const spacingY = canvasH / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (points.length >= cellCount) break;
          const bx = -halfW + (c + 0.5) * spacingX;
          const by = -halfH + (r + 0.5) * spacingY;
          points.push({
            x: bx + p.random(-spacingX * 0.5, spacingX * 0.5) * jitterFactor,
            y: by + p.random(-spacingY * 0.5, spacingY * 0.5) * jitterFactor,
          });
        }
      }
    }

    // --- 2. Lloyd's relaxation ---
    for (let step = 0; step < relaxationSteps; step++) {
      const triangles = bowyerWatson(points, halfW, halfH);
      const cells = computeVoronoiCells(points, triangles, halfW, halfH);
      for (let i = 0; i < points.length; i++) {
        const cell = cells[i];
        if (cell && cell.length >= 3) {
          let ax = 0, ay = 0;
          for (const v of cell) { ax += v.x; ay += v.y; }
          ax /= cell.length;
          ay /= cell.length;
          // Clamp to bounds
          points[i] = {
            x: Math.max(-halfW, Math.min(halfW, ax)),
            y: Math.max(-halfH, Math.min(halfH, ay)),
          };
        }
      }
    }

    // --- 3. Compute final Delaunay + Voronoi ---
    const triangles = bowyerWatson(points, halfW, halfH);
    const voronoiEdges = computeVoronoiEdges(triangles, halfW, halfH);
    const delaunayEdges = computeDelaunayEdges(points, triangles);

    // Collect line segments to draw based on mode
    const lines = [];

    if (drawMode === 'outlines' || drawMode === 'both') {
      for (const e of voronoiEdges) {
        lines.push(e);
      }
    }

    if (drawMode === 'delaunay' || drawMode === 'both') {
      for (const e of delaunayEdges) {
        lines.push(e);
      }
    }

    if (drawMode === 'spokes') {
      // Draw lines from each seed point to its Voronoi cell vertices
      const cells = computeVoronoiCells(points, triangles, halfW, halfH);
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const cell = cells[i];
        if (cell) {
          for (const v of cell) {
            lines.push({ x1: pt.x, y1: pt.y, x2: v.x, y2: v.y });
          }
        }
      }
    }

    // Build SVG elements
    for (const ln of lines) {
      const pathD = `M${ln.x1.toFixed(2)},${ln.y1.toFixed(2)} L${ln.x2.toFixed(2)},${ln.y2.toFixed(2)}`;
      this.svgElements.push({ pathD, strokeWeight });
    }

    // Draw on p5 canvas
    const drawBase = () => {
      p.noFill();
      const c = p.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      p.stroke(c);
      p.strokeWeight(strokeWeight);

      for (const ln of lines) {
        p.line(ln.x1, ln.y1, ln.x2, ln.y2);
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const paths = this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight}" stroke-linecap="round"/>`
      )
      .join('\n');
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      paths,
      this._lastParams?.symmetry || 'none',
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

// ============================================================
// Bowyer-Watson Delaunay Triangulation
// ============================================================

function circumcircle(p1, p2, p3) {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cxx = p3.x, cyy = p3.y;

  const D = 2 * (ax * (by - cyy) + bx * (cyy - ay) + cxx * (ay - by));
  if (Math.abs(D) < 1e-10) {
    return { x: 0, y: 0, r: Infinity };
  }

  const ux = ((ax * ax + ay * ay) * (by - cyy) +
              (bx * bx + by * by) * (cyy - ay) +
              (cxx * cxx + cyy * cyy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cxx - bx) +
              (bx * bx + by * by) * (ax - cxx) +
              (cxx * cxx + cyy * cyy) * (bx - ax)) / D;

  const dx = ax - ux;
  const dy = ay - uy;
  return { x: ux, y: uy, r: Math.sqrt(dx * dx + dy * dy) };
}

function bowyerWatson(points, halfW, halfH) {
  // Super-triangle large enough to contain all points
  const margin = Math.max(halfW, halfH) * 4;
  const st0 = { x: 0, y: -margin * 2, _super: true };
  const st1 = { x: -margin * 2, y: margin * 2, _super: true };
  const st2 = { x: margin * 2, y: margin * 2, _super: true };

  let triangles = [{ v: [st0, st1, st2], cc: circumcircle(st0, st1, st2) }];

  for (const pt of points) {
    // Find all triangles whose circumcircle contains the point
    const badTriangles = [];
    const goodTriangles = [];

    for (const tri of triangles) {
      const dx = pt.x - tri.cc.x;
      const dy = pt.y - tri.cc.y;
      if (dx * dx + dy * dy <= tri.cc.r * tri.cc.r + 1e-6) {
        badTriangles.push(tri);
      } else {
        goodTriangles.push(tri);
      }
    }

    // Find the boundary polygon (edges that are not shared by two bad triangles)
    const polygon = [];
    for (const tri of badTriangles) {
      for (let i = 0; i < 3; i++) {
        const e0 = tri.v[i];
        const e1 = tri.v[(i + 1) % 3];
        let shared = false;
        for (const other of badTriangles) {
          if (other === tri) continue;
          if (hasEdge(other, e0, e1)) {
            shared = true;
            break;
          }
        }
        if (!shared) {
          polygon.push([e0, e1]);
        }
      }
    }

    // Re-triangulate the hole
    triangles = goodTriangles;
    for (const [e0, e1] of polygon) {
      const cc = circumcircle(e0, e1, pt);
      triangles.push({ v: [e0, e1, pt], cc });
    }
  }

  // Remove triangles connected to super-triangle vertices
  return triangles.filter(
    (tri) => !tri.v.some((v) => v._super)
  );
}

function hasEdge(tri, a, b) {
  for (let i = 0; i < 3; i++) {
    const v0 = tri.v[i];
    const v1 = tri.v[(i + 1) % 3];
    if ((v0 === a && v1 === b) || (v0 === b && v1 === a)) return true;
  }
  return false;
}

// ============================================================
// Voronoi Edges from Delaunay triangulation
// ============================================================

function edgeKey(a, b) {
  // Create a unique key for an undirected edge using object identity
  const idA = a._super ? 's' : `${a.x},${a.y}`;
  const idB = b._super ? 's' : `${b.x},${b.y}`;
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function computeVoronoiEdges(triangles, halfW, halfH) {
  // For each pair of adjacent triangles sharing an edge,
  // the Voronoi edge connects their circumcenters
  const edgeMap = new Map();
  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    for (let e = 0; e < 3; e++) {
      const a = tri.v[e];
      const b = tri.v[(e + 1) % 3];
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }
      edgeMap.get(key).push(i);
    }
  }

  const edges = [];
  for (const [, triIndices] of edgeMap) {
    if (triIndices.length === 2) {
      const cc1 = triangles[triIndices[0]].cc;
      const cc2 = triangles[triIndices[1]].cc;
      // Clip to canvas bounds
      const clipped = clipLine(cc1.x, cc1.y, cc2.x, cc2.y, halfW, halfH);
      if (clipped) {
        edges.push(clipped);
      }
    }
  }
  return edges;
}

function computeDelaunayEdges(points, triangles) {
  const seen = new Set();
  const edges = [];
  for (const tri of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = tri.v[i];
      const b = tri.v[(i + 1) % 3];
      const key = edgeKey(a, b);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }
  return edges;
}

// ============================================================
// Voronoi cells (ordered vertices) for Lloyd's relaxation & spokes
// ============================================================

function computeVoronoiCells(points, triangles, halfW, halfH) {
  // Map each original point to the triangles it belongs to
  const pointTriMap = new Map();
  for (const pt of points) {
    pointTriMap.set(pt, []);
  }
  for (const tri of triangles) {
    for (const v of tri.v) {
      if (pointTriMap.has(v)) {
        pointTriMap.get(v).push(tri);
      }
    }
  }

  const cells = [];
  for (const pt of points) {
    const tris = pointTriMap.get(pt);
    if (!tris || tris.length < 2) {
      cells.push(null);
      continue;
    }

    // Collect circumcenters and sort them by angle around the point
    const verts = tris.map((tri) => ({
      x: tri.cc.x,
      y: tri.cc.y,
      angle: Math.atan2(tri.cc.y - pt.y, tri.cc.x - pt.x),
    }));
    verts.sort((a, b) => a.angle - b.angle);

    // Clip vertices to canvas bounds
    const clipped = verts.map((v) => ({
      x: Math.max(-halfW, Math.min(halfW, v.x)),
      y: Math.max(-halfH, Math.min(halfH, v.y)),
    }));

    cells.push(clipped);
  }
  return cells;
}

// ============================================================
// Cohen-Sutherland line clipping
// ============================================================

function clipLine(x1, y1, x2, y2, halfW, halfH) {
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
  const xmin = -halfW, xmax = halfW, ymin = -halfH, ymax = halfH;

  function code(x, y) {
    let c = INSIDE;
    if (x < xmin) c |= LEFT;
    else if (x > xmax) c |= RIGHT;
    if (y < ymin) c |= TOP;
    else if (y > ymax) c |= BOTTOM;
    return c;
  }

  let c1 = code(x1, y1);
  let c2 = code(x2, y2);

  for (let iter = 0; iter < 20; iter++) {
    if (!(c1 | c2)) {
      return { x1, y1, x2, y2 };
    }
    if (c1 & c2) {
      return null;
    }

    const cOut = c1 ? c1 : c2;
    let x, y;

    if (cOut & TOP) {
      x = x1 + (x2 - x1) * (ymin - y1) / (y2 - y1);
      y = ymin;
    } else if (cOut & BOTTOM) {
      x = x1 + (x2 - x1) * (ymax - y1) / (y2 - y1);
      y = ymax;
    } else if (cOut & RIGHT) {
      y = y1 + (y2 - y1) * (xmax - x1) / (x2 - x1);
      x = xmax;
    } else {
      y = y1 + (y2 - y1) * (xmin - x1) / (x2 - x1);
      x = xmin;
    }

    if (cOut === c1) {
      x1 = x; y1 = y;
      c1 = code(x1, y1);
    } else {
      x2 = x; y2 = y;
      c2 = code(x2, y2);
    }
  }

  return null;
}
