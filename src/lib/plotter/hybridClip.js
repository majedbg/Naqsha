// hybridClip — hybrid Sheet clipping for the FILE export (#73 merge blocker).
//
// WHY THIS EXISTS
// The Export Receipt and the Run Plan both derive from runPlanModel, whose
// pipeline clips extracted geometry to the Sheet (clipToSheet) when the
// cropToSheet Export preference is on. The file export, however, emitted each
// instance's native markup (curves, roles, text outlines) and never clipped —
// so the Receipt said "N paths cropped at sheet edge" while the exported file
// still contained them. The receipt lied about the one artifact the machine
// actually consumes.
//
// THE HYBRID DECISION (product owner, binding)
// Re-emitting the WHOLE design as clipped polylines would fix honesty but
// destroy curve fidelity for every path — including the vast majority that
// never leave the Sheet. So: only paths that actually CROSS or fall OUTSIDE
// the Sheet boundary are routed through the clip pipeline and re-emitted as
// clipped polyline fragments; every path fully inside the Sheet keeps its
// existing native markup byte-untouched. Receipt, plan, and file then agree on
// the crop count.
//
// REUSE, DON'T REIMPLEMENT
// The geometry half is entirely borrowed:
//   - extractRenderedPaths (pipeline.js): final-space polylines per drawable,
//     transforms and symmetry copies flattened — the SAME extraction
//     runPlanModel clips, so the classification basis is shared.
//   - clipToSheet (clipToSheet.js): the ONE classification + trim. Its return
//     contract IS the classification: an original kept BY REFERENCE is fully
//     inside; replaced by new fragment objects is cropped (counts once); absent
//     from `kept` is dropped. No intersection math lives here.
// This module adds only STRING SURGERY: locate each drawable element's source
// range, keep inside ones verbatim, cut cropped/dropped ones out, and append
// the clipped fragments in a sibling group.
//
// WHY FRAGMENTS ARE HOISTED (not swapped in place)
// clipToSheet returns fragments in FINAL (Sheet) space, but a crossing element
// may sit under <g transform> wrappers (symmetry copies, the layer's placement
// transform). Swapping fragments in place would re-transform — i.e. corrupt —
// them, unless we inverse-mapped every point back to local space. Instead the
// fragments are emitted in a sibling <g data-cropped-at-sheet="true"
// data-cropped-paths="N"> OUTSIDE every wrapper, where their Sheet-space
// coordinates are already correct. Each fragment carries its source element's
// non-geometry attributes (stroke-width, data-role, …) plus the stroke it
// EFFECTIVELY had (clipToSheet preserves the inherited color), so hoisting out
// of a styling <g> never silently restyles a stroke. Known cosmetic loss: a
// hoisted fragment no longer inherits group opacity — irrelevant to
// fabrication, which reads geometry + color. The data- attributes double as
// the machine-greppable crop stamp (manifest tradition) the agreement tests
// read.
//
// DEGENERATE PATHS (<2 points) are non-fabricable no-ops: clipToSheet would
// cull them, but the export keeps their native markup untouched so a
// fully-inside document stays byte-identical whether the preference is on or
// off. They never count as cropped in either model.

import { extractRenderedPaths } from './pipeline.js';
import { clipToSheet } from './clipToSheet.js';
import { pathDFromPoints } from './pathOps.js';

// Drawable element occurrences, in document order — the same three tags
// extractRenderedPaths emits polylines for. Handles the self-closing form our
// emitters produce plus the empty paired form, defensively.
const DRAWABLE_RE = /<(path|line|polyline)\b([^>]*?)(?:\/>|>\s*<\/\1\s*>)/g;

// Attributes that ARE the geometry (replaced by the fragment's d) or would
// re-transform hoisted Sheet-space coordinates. Everything else is carried
// forward onto fragments.
const GEOM_ATTRS_RE = /\s*\b(?:d|points|x1|y1|x2|y2|transform)="[^"]*"/g;

function attrOf(attrs, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs || '');
  return m ? m[1] : null;
}

// Mirror extractRenderedPaths' ADMISSION rules — which elements yield a
// polyline — so occurrence i in the string aligns with extracted[i]. Only the
// admission predicate is mirrored; geometry math stays in pipeline.js /
// clipToSheet.js.
function isAdmitted(tag, attrs) {
  if (tag === 'path') return true; // paths always emit (even with an empty d)
  if (tag === 'line') {
    return ['x1', 'y1', 'x2', 'y2'].every((n) =>
      Number.isFinite(parseFloat(attrOf(attrs, n)))
    );
  }
  // polyline: at least two finite coordinate pairs (odd trailing value ignored,
  // matching SVG's tolerance and pipeline.js exactly).
  const raw = (attrOf(attrs, 'points') || '')
    .trim().split(/[\s,]+/).map(parseFloat).filter(Number.isFinite);
  return Math.floor(raw.length / 2) >= 2;
}

function scanDrawables(markup) {
  const out = [];
  DRAWABLE_RE.lastIndex = 0;
  let m;
  while ((m = DRAWABLE_RE.exec(markup)) !== null) {
    if (!isAdmitted(m[1], m[2])) continue;
    out.push({ start: m.index, end: m.index + m[0].length, attrs: m[2] });
  }
  return out;
}

// Fragment attributes: the source element's attrs minus geometry/transform,
// with the EFFECTIVE stroke ensured (hoisting leaves any styling ancestors
// behind) and fill="none" ensured (a clipped fragment is always an open
// stroke; SVG's default fill is black).
function fragmentAttrs(sourceAttrs, color) {
  let attrs = (sourceAttrs || '')
    .replace(GEOM_ATTRS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/\bstroke="/.test(attrs)) attrs += `${attrs ? ' ' : ''}stroke="${color || '#888'}"`;
  if (!/\bfill="/.test(attrs)) attrs += ' fill="none"';
  return ` ${attrs}`;
}

function renderFragment(frag, attrs) {
  return `<path d="${pathDFromPoints(frag.points, false)}"${attrs}/>`;
}

function fragmentGroup(fragments, croppedPathCount) {
  return (
    `<g data-cropped-at-sheet="true" data-cropped-paths="${croppedPathCount}">\n` +
    `    ${fragments.join('\n    ')}\n  </g>`
  );
}

/**
 * Hybrid-clip one placed layer markup string against the Sheet.
 *
 * `markup` must be in the SAME coordinate space as `sheetRect` at its OUTER
 * level (svgExport passes the fully placed layer group, post layer-transform).
 *
 * @returns {{ changed: boolean, markup: string,
 *             croppedPathCount: number, droppedPathCount: number }}
 *   changed=false → `markup` is the input string, byte-identical.
 *   croppedPathCount matches clipToSheet semantics: originals TRIMMED at an
 *   edge (the Receipt's number); fully-outside originals are dropped, not
 *   cropped.
 */
export function hybridClipMarkup(markup, sheetRect) {
  // Same loud failure as buildPlottableLayers: without DOMParser the
  // extraction silently falls back to PRE-transform coordinates — clipping in
  // that space would trim the wrong geometry. Never do that.
  if (typeof DOMParser === 'undefined') {
    throw new Error(
      'hybridClipMarkup requires DOMParser (final-space extraction). ' +
      'Run in a DOM environment; tests must use `// @vitest-environment jsdom`.'
    );
  }
  const unchanged = { changed: false, markup, croppedPathCount: 0, droppedPathCount: 0 };
  if (!markup) return unchanged;

  const extracted = extractRenderedPaths(markup);
  if (extracted.length === 0) return unchanged;

  // Classify each drawable via clipToSheet — one call per path so each
  // source's fragments stay unambiguously grouped. clipToSheet is per-path
  // independent, so the summed counts equal the aggregate call runPlanModel
  // makes: the agreement contract.
  let croppedPathCount = 0;
  let droppedPathCount = 0;
  const classes = extracted.map((p) => {
    if (!p.points || p.points.length < 2) return { kind: 'inside' }; // degenerate no-op (header note)
    const { kept, croppedPathCount: c } = clipToSheet([p], sheetRect);
    if (c === 0 && kept.length === 1 && kept[0] === p) return { kind: 'inside' };
    if (kept.length === 0) {
      droppedPathCount += 1;
      return { kind: 'dropped' };
    }
    croppedPathCount += 1;
    return { kind: 'cropped', fragments: kept };
  });

  if (croppedPathCount === 0 && droppedPathCount === 0) return unchanged;

  const occurrences = scanDrawables(markup);
  if (occurrences.length !== extracted.length) {
    // DEFENSIVE FALLBACK: the source scan could not be aligned 1:1 with the
    // extraction (an element form the scanner doesn't recognize, or drawable
    // text inside comments). Replace the whole slot with the clipped
    // polylines instead: curve fidelity is lost for THIS layer, but the file
    // stays honest — geometry within the Sheet, crop count preserved. Export
    // must never block (ADR 0001), and a pretty file that lies is worse than
    // a flattened one that doesn't.
    const keptAll = [];
    extracted.forEach((p, i) => {
      const c = classes[i];
      if (c.kind === 'cropped') keptAll.push(...c.fragments);
      else if (c.kind === 'inside' && p.points && p.points.length >= 2) keptAll.push(p);
    });
    const body = keptAll.map((p) =>
      `<path d="${pathDFromPoints(p.points, !!p.closed)}" stroke="${p.color || '#888'}" fill="none"/>`
    );
    return {
      changed: true,
      markup: fragmentGroup(body, croppedPathCount),
      croppedPathCount,
      droppedPathCount,
    };
  }

  // Aligned surgery: copy the source verbatim, cutting out cropped/dropped
  // elements (plus their leading indent) — fully-inside elements pass through
  // byte-identical inside the copied spans.
  let edited = '';
  let cursor = 0;
  const fragments = [];
  occurrences.forEach((occ, i) => {
    const cls = classes[i];
    if (cls.kind === 'inside') return;
    let cutStart = occ.start;
    while (cutStart > cursor && /[ \t\r\n]/.test(markup[cutStart - 1])) cutStart--;
    edited += markup.slice(cursor, cutStart);
    cursor = occ.end;
    if (cls.kind === 'cropped') {
      for (const f of cls.fragments) {
        fragments.push(renderFragment(f, fragmentAttrs(occ.attrs, f.color)));
      }
    }
  });
  edited += markup.slice(cursor);

  const out = fragments.length
    ? `${edited}\n  ${fragmentGroup(fragments, croppedPathCount)}`
    : edited;
  return { changed: true, markup: out, croppedPathCount, droppedPathCount };
}
