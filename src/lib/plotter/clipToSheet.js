// clipToSheet — trim extracted path polylines to the Sheet before a Run.
//
// WHY THIS EXISTS
// The Run Plan promises the maker that what they see is what the machine will
// do. Geometry that spills past the Sheet (the physical material the machine
// works on) cannot be fabricated: a pen plotter would drive its carriage off
// the paper, a laser would fire past the stock. So an Optimization step clips
// every Operation's polylines to the Sheet rect, and the Export Receipt reports
// the outcome as "N paths cropped at sheet edge".
//
// WHY POLYLINE-ONLY (no boolean region ops)
// Per ADR-0001 the whole fabrication pipeline is stroke polylines, never filled
// regions. Clipping is therefore a per-segment operation (Liang–Barsky) applied
// to each polyline edge, NOT a polygon-vs-rectangle boolean. A closed ring
// clipped by this module yields OPEN interior arcs — we trim strokes at the
// edge, we do not re-fill an intersected area. This mirrors how the machine
// actually behaves: it draws the stroke that stays on the Sheet and lifts where
// the stroke leaves it.
//
// SHEET RECT CONTRACT (Wave 2 MUST conform to this)
//   sheetRect = { x, y, width, height }  — in the SAME px space as path points.
//   The pattern classes draw relative to the canvas origin, so x/y default to 0
//   (top-left of the Sheet at the origin). Boundaries are INCLUSIVE: a point or
//   segment lying exactly on an edge is inside the Sheet, not cropped — a stroke
//   drawn right at the paper edge is still fabricable.
//
// RETURN CONTRACT (Wave 2 consumes this exact shape)
//   clipToSheet(paths, sheetRect) -> {
//     kept: Array<{ points, closed, color? }>,  // fabricable fragments, in px
//     dropped: Array<original path object>,      // culled originals (see below)
//     croppedPathCount: number,                  // originals trimmed at an edge
//   }
//   - A path fully INSIDE the Sheet is kept UNCHANGED: the ORIGINAL object is
//     passed through (closed flag and points intact) and does NOT count as
//     cropped. "Unchanged" is literal — same reference.
//   - A path CROSSING an edge is split into one-or-more interior fragments. Each
//     surviving fragment is a NEW object with closed:false (a clipped ring is an
//     open arc) and the source `color` preserved. The original counts EXACTLY
//     ONCE toward croppedPathCount no matter how many fragments it yields.
//   - A path fully OUTSIDE (no interior span at all) is culled: the ORIGINAL
//     object goes to `dropped` and does NOT count as cropped. croppedPathCount
//     means "geometry trimmed at the edge" — matching the receipt copy — not
//     "removed entirely", so a fully-gone path is not a cropped path.
//   - A DEGENERATE path (<2 points) is malformed and never fabricable: the
//     ORIGINAL goes to `dropped`, is never kept, and never counts as cropped.
//     (Free choice per the lane spec; documented here so the Receipt's cropped
//     number stays "geometry trimmed at the edge" only.)

// True when (x, y) is inside the Sheet OR exactly on one of its edges. Inclusive
// on all four sides so an edge-aligned stroke is never spuriously cropped.
function isInsideOrOn(x, y, minX, minY, maxX, maxY) {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

// True when (x, y) is STRICTLY outside the Sheet (beyond an edge, not merely on
// it). Used to find a safe seam vertex when re-walking a crossing closed ring.
function isStrictlyOutside(x, y, minX, minY, maxX, maxY) {
  return x < minX || x > maxX || y < minY || y > maxY;
}

// Liang–Barsky clip of the segment (x0,y0)->(x1,y1) against the Sheet rect.
// Returns { t0, t1 } for the visible sub-span (0 <= t0 <= t1 <= 1), or null if
// the segment lies wholly outside. Boundaries are inclusive (q < 0 is strict),
// so a segment lying exactly on an edge, or a zero-length "segment" at a point
// on the boundary, survives. t0/t1 let the caller lerp the exact clip endpoints;
// when t0 === 0 the clipped start equals (x0,y0) EXACTLY, which the fragment
// assembly relies on to chain interior segments without duplicate vertices.
function clipSegment(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  // p/q pairs for the four half-planes: left, right, top, bottom.
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      // Segment parallel to this boundary: cull only if it is on the outside.
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        // Entering this half-plane at r; tighten the near end.
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        // Leaving this half-plane at r; tighten the far end.
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return { t0, t1 };
}

// Append a point to the current fragment, skipping an exact duplicate of the
// last vertex. Interior segments chain end-to-start (shared vertex), and a
// zero-length visible span yields A === B; deduping keeps fragments clean.
function pushPoint(frag, pt) {
  const n = frag.length;
  if (n > 0 && frag[n - 1][0] === pt[0] && frag[n - 1][1] === pt[1]) return;
  frag.push(pt);
}

// Walk an ordered segment list (already ring-normalized for closed paths) and
// assemble the interior spans into fragments. A fragment is finalized whenever
// the polyline breaks contact with the Sheet — either a fully-outside segment,
// or a segment whose visible span starts partway in (it entered from outside).
// Fragments shorter than 2 points are dropped: a lone corner-touch is not a
// fabricable stroke.
function assembleFragments(segments, minX, minY, maxX, maxY) {
  const fragments = [];
  let current = [];
  const finalize = () => {
    if (current.length >= 2) fragments.push(current);
    current = [];
  };
  for (const [x0, y0, x1, y1] of segments) {
    const span = clipSegment(x0, y0, x1, y1, minX, minY, maxX, maxY);
    if (!span) {
      // No interior span: the stroke is off the Sheet here — break contact.
      finalize();
      continue;
    }
    const { t0, t1 } = span;
    const a = [x0 + t0 * (x1 - x0), y0 + t0 * (y1 - y0)];
    const b = [x0 + t1 * (x1 - x0), y0 + t1 * (y1 - y0)];
    if (t0 > 0) {
      // Entered the Sheet partway along this segment: previous contact (if any)
      // ended outside, so start a fresh fragment at the entry point.
      finalize();
      pushPoint(current, a);
    } else if (current.length === 0) {
      // Segment starts inside/on the edge and we are between fragments.
      pushPoint(current, a);
    }
    // else: t0 === 0 and `a` equals the previous segment's end — already last.
    pushPoint(current, b);
    if (t1 < 1) {
      // Left the Sheet partway along this segment: this fragment ends here.
      finalize();
    }
  }
  finalize();
  return fragments;
}

export function clipToSheet(paths, sheetRect) {
  const kept = [];
  const dropped = [];
  let croppedPathCount = 0;

  // Defensive, untested guard (outside the lane spec): a missing or zero-area
  // Sheet has no fabricable region, so every path is culled rather than crash.
  const rect = sheetRect || {};
  const minX = Number.isFinite(rect.x) ? rect.x : 0;
  const minY = Number.isFinite(rect.y) ? rect.y : 0;
  const width = Number.isFinite(rect.width) ? rect.width : 0;
  const height = Number.isFinite(rect.height) ? rect.height : 0;
  const maxX = minX + width;
  const maxY = minY + height;
  const hasArea = width > 0 && height > 0;

  for (const path of paths || []) {
    const pts = path && path.points;

    // Degenerate: malformed, never fabricable — cull the original.
    if (!pts || pts.length < 2 || !hasArea) {
      dropped.push(path);
      continue;
    }

    // Fully inside the Sheet: every vertex is inside-or-on, and the rect is
    // convex so the connecting strokes are too. Pass the ORIGINAL through
    // unchanged — not a crossing, not counted as cropped.
    let allInside = true;
    for (const [x, y] of pts) {
      if (!isInsideOrOn(x, y, minX, minY, maxX, maxY)) { allInside = false; break; }
    }
    if (allInside) {
      kept.push(path);
      continue;
    }

    // Build the segment list. For a CLOSED path the polyline is a ring, so the
    // wrap segment (last -> first) is included. To avoid a spurious split where
    // the ring's seam vertex is interior, rotate the ring to START at a strictly
    // outside vertex: a crossing closed path always has one (else it would be
    // fully inside by convexity), and starting there keeps the seam in an
    // exterior span so no fragment straddles it.
    let ring = pts;
    const segments = [];
    if (path.closed) {
      // Drop an explicit closure duplicate (last === first) so the wrap segment
      // is not zero-length; both hand-built (duplicated) and parsePathD (not
      // duplicated) closed paths reach us, so handle either.
      const last = pts[pts.length - 1];
      const first = pts[0];
      const verts = (last[0] === first[0] && last[1] === first[1])
        ? pts.slice(0, -1)
        : pts.slice();
      let start = 0;
      for (let i = 0; i < verts.length; i++) {
        const [x, y] = verts[i];
        if (isStrictlyOutside(x, y, minX, minY, maxX, maxY)) { start = i; break; }
      }
      ring = start === 0 ? verts : verts.slice(start).concat(verts.slice(0, start));
      for (let i = 0; i < ring.length; i++) {
        const cur = ring[i];
        const nxt = ring[(i + 1) % ring.length]; // wrap closes the ring
        segments.push([cur[0], cur[1], nxt[0], nxt[1]]);
      }
    } else {
      for (let i = 0; i < ring.length - 1; i++) {
        segments.push([ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]]);
      }
    }

    const fragments = assembleFragments(segments, minX, minY, maxX, maxY);

    if (fragments.length === 0) {
      // No interior span survived: the stroke never actually reaches the Sheet
      // (bounding boxes may overlap, but the polyline stays outside) — cull it.
      dropped.push(path);
      continue;
    }

    // Geometry was trimmed at the edge: the original counts once as cropped, and
    // each fragment becomes an OPEN stroke carrying the source path's color (and
    // any other metadata) forward.
    croppedPathCount += 1;
    for (const points of fragments) {
      kept.push({ ...path, points, closed: false });
    }
  }

  return { kept, dropped, croppedPathCount };
}
