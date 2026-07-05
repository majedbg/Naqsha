// AnchorGhostOverlay — the anchor-ghost canvas overlay + click-to-override for
// motifs. When a MOTIF layer is selected, this draws faint "ghost" dots on the
// canvas at the host pattern's candidate anchor positions: PLACED anchors (a
// motif rule actually put a glyph there) read as filled, un-placed CANDIDATES as
// hollow. Clicking a dot toggles a force-include / force-exclude override that
// the placement engine ALREADY honors (selectAnchors' overrides stage), so the
// user can hand-correct the automatic layout point-by-point.
//
// COORDINATES — no conversion. Semantic anchors are already in canvas-pixel
// world space [0..canvasW]×[0..canvasH], exactly where the host pattern draws.
// This overlay renders as a sibling INSIDE the CSS-scaled box (viewBox
// `0 0 canvasW canvasH`), so the parent's transform: scale·translate handles
// zoom/pan for free and a <circle cx={a.x} cy={a.y}> lands on the drawn point.
// Modeled on PlotOverlay.jsx.
//
// EVENTS — the <svg> is pointer-events:none so clicks in empty canvas fall
// through to the select-overlay below; each <circle> re-enables pointer-events so
// a dot click is captured. Because we already know which anchor a circle is (no
// hit-testing), onPointerDown reads data straight off the closure.
//
// SCOPE — semantic hosts (grid / recursive / spiral) PLUS voronoi. Voronoi is
// GEOMETRY-IN (getSemanticAnchors needs the host's drawn segments), now wired via
// the `patternInstances` prop: the real drawn host instance stashes
// `motifHostGeometry = {drawnEdges, sites}` during generate(), and RightPanel
// keeps `patternInstances` in React state (refreshed after every p5 render). GENERIC
// EDGE hosts stay deferred (they need a generic drawn-polyline seam, not yet wired)
// and still render nothing. Pure UI + wiring — the motif core is only CONSUMED, never edited.

import { useMemo } from 'react';
import { isMotifLayer, motifHostId, deepMergeBinding } from '../../lib/motif/motifLayer';
import { getSemanticAnchors } from '../../lib/motif/semanticAnchors';
import { placeMotifs } from '../../lib/motif/placementEngine';

// Hosts with a semantic anchor extractor whose anchors are proven to sit on the
// drawing. grid/recursive/spiral are FORMULA hosts (anchors from params alone).
// voronoi is GEOMETRY-IN: its anchors come from the drawn host's stashed
// `motifHostGeometry`, supplied here via the `patternInstances` prop.
const MOTIF_HOSTS = new Set(['grid', 'recursive', 'spiral', 'voronoi']);

const ACCENT = '#7c3aed'; // violet — placed / included fill
const EXCLUDE_STROKE = '#ef4444'; // red — force-excluded outline

// Keep only string ids (override arrays may legally hold {x,y,role} refs too, but
// this overlay only ever writes/reads id strings).
const strings = (arr) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);

export default function AnchorGhostOverlay({
  layers,
  selectedLayerId,
  canvasW,
  canvasH,
  onUpdateLayer = () => {},
  patternInstances = {},
}) {
  // ── HOOKS FIRST ──────────────────────────────────────────────────────────
  // Every hook runs on every render (guards live INSIDE the memos, the single
  // early return is at the end). Mounting this overlay unconditionally means a
  // selection change must not change the hook count — Rules of Hooks.
  const motif = useMemo(
    () => (layers || []).find((l) => l.id === selectedLayerId && isMotifLayer(l)) || null,
    [layers, selectedLayerId]
  );

  const host = useMemo(
    () => (motif ? (layers || []).find((l) => l.id === motifHostId(motif)) || null : null),
    [layers, motif]
  );

  // Semantic anchors — semantic hosts only; may still be null (e.g. warp/distort
  // modulation refuses to emit). Keyed on the host object ref (updateLayer
  // replaces layer objects immutably) + canvas dims + patternInstances (voronoi
  // geometry).
  //
  // TIMING — for voronoi, geometry comes from `patternInstances`, which useCanvas
  // sets AFTER p5 draws (post-render setState). So on a host-param change the
  // overlay may render one frame against the PREVIOUS geometry, then self-heal
  // when the fresh instances arrive. This is safe because the extractor is
  // deterministic (same seed+params ⇒ same drawnEdges/sites ⇒ same anchor ids +
  // coords), so ghost/glyph agreement is exact once settled. Absent geometry
  // (first frame before p5 draws, or a hidden host) ⇒ null ⇒ overlay renders
  // nothing (graceful).
  const anchors = useMemo(() => {
    if (!host || !MOTIF_HOSTS.has(host.patternType)) return null;
    if (host.patternType === 'voronoi') {
      const geo = patternInstances[host.id]?.motifHostGeometry;
      if (!geo) return null;
      // geo IS the opts object — it carries drawnEdges + sites.
      return getSemanticAnchors('voronoi', host.params, canvasW, canvasH, geo);
    }
    // Thread the host layer seed so grid anchors sit on the LIVE-p5
    // jittered/symmetry lattice — matching MotifPattern's real render, so
    // ghost previews land exactly where the motifs actually place.
    return getSemanticAnchors(host.patternType, host.params, canvasW, canvasH, {
      hostSeed: host.seed,
    });
  }, [host, canvasW, canvasH, patternInstances]);

  // Placements — run the SAME engine the real render uses, so PLACED state here
  // matches what actually draws (overrides already folded in by placeMotifs).
  const placements = useMemo(() => {
    if (!anchors || !motif) return [];
    const { placements: p } = placeMotifs(anchors, motif.params.binding || {}, {
      boundary: { type: 'rect', width: canvasW, height: canvasH },
      canvasW,
      canvasH,
    });
    return p;
  }, [anchors, motif, canvasW, canvasH]);

  // ── SINGLE RENDER GATE ───────────────────────────────────────────────────
  if (!motif || !host || !anchors) return null;

  const placedIds = new Set(placements.map((p) => p.anchorId));
  const ov = motif.params.binding?.selection?.overrides || {};
  const includeIds = new Set(strings(ov.include));
  const excludeIds = new Set(strings(ov.exclude));

  // Show ghosts only for the anchor ROLES this motif actually targets (keeps the
  // overlay focused instead of drawing every crossing+edge+tip+cell). An
  // overridden anchor stays visible regardless of role so it's always toggleable.
  // roles null/empty ⇒ engine treats as "all roles", so show everything.
  const roles = motif.params.binding?.selection?.roles;
  const roleSet = Array.isArray(roles) && roles.length ? new Set(roles) : null;
  const displayAnchors = roleSet
    ? anchors.filter((a) => roleSet.has(a.role) || includeIds.has(a.id) || excludeIds.has(a.id))
    : anchors;

  // Toggle state machine (pure array edits → one onUpdateLayer). Order matters:
  //   excluded  → un-exclude (clear the force-remove)
  //   included  → un-include (clear the force-place)
  //   placed    → exclude    (force-remove a rule-placed motif)
  //   candidate → include    (force-place at a skipped candidate)
  // deepMergeBinding REPLACES arrays wholesale, so we pass the full new arrays.
  const toggleOverride = (anchor) => {
    const id = anchor.id;
    let newInclude = strings(ov.include);
    let newExclude = strings(ov.exclude);

    if (excludeIds.has(id)) {
      newExclude = newExclude.filter((x) => x !== id);
    } else if (includeIds.has(id)) {
      newInclude = newInclude.filter((x) => x !== id);
    } else if (placedIds.has(id)) {
      newExclude = [...newExclude, id];
    } else {
      newInclude = [...newInclude, id];
    }

    onUpdateLayer(motif.id, {
      params: {
        ...motif.params,
        binding: deepMergeBinding(motif.params.binding, {
          selection: { overrides: { include: newInclude, exclude: newExclude } },
        }),
      },
    });
  };

  const r = Math.max(3, Math.min(canvasW, canvasH) * 0.006);
  const strokeW = Math.max(1, r * 0.35);

  const stateOf = (id) => {
    if (excludeIds.has(id)) return 'excluded';
    if (includeIds.has(id)) return 'included';
    if (placedIds.has(id)) return 'placed';
    return 'candidate';
  };

  // Per-state fill/stroke. `included` additionally renders an outer ring; `placed`
  // is a solid accent dot; `candidate` a hollow faint dot; `excluded` a hollow
  // reddish dot. Legible over any artwork, deliberately not fancy.
  const styleFor = (state) => {
    switch (state) {
      case 'placed':
        return { fill: ACCENT, fillOpacity: 0.85, stroke: ACCENT, strokeOpacity: 0.9 };
      case 'included':
        return { fill: ACCENT, fillOpacity: 0.85, stroke: ACCENT, strokeOpacity: 0.9 };
      case 'excluded':
        return { fill: 'none', fillOpacity: 0, stroke: EXCLUDE_STROKE, strokeOpacity: 0.95 };
      case 'candidate':
      default:
        return { fill: 'none', fillOpacity: 0, stroke: ACCENT, strokeOpacity: 0.35 };
    }
  };

  return (
    <svg
      data-testid="anchor-ghost-overlay"
      className="pointer-events-none absolute inset-0"
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      aria-label="Motif anchor ghosts"
    >
      {displayAnchors.map((a) => {
        const state = stateOf(a.id);
        const s = styleFor(state);
        return (
          <g key={a.id}>
            {/* Outer ring marks a force-included anchor (overridden ON). */}
            {state === 'included' && (
              <circle
                cx={a.x}
                cy={a.y}
                r={r * 1.9}
                fill="none"
                stroke={ACCENT}
                strokeOpacity={0.8}
                strokeWidth={strokeW}
                style={{ pointerEvents: 'none' }}
              />
            )}
            <circle
              data-anchor-id={a.id}
              data-state={state}
              cx={a.x}
              cy={a.y}
              r={r}
              fill={s.fill}
              fillOpacity={s.fillOpacity}
              stroke={s.stroke}
              strokeOpacity={s.strokeOpacity}
              strokeWidth={strokeW}
              // 'all' (not 'auto'): SVG 'auto' = visiblePainted, which makes a
              // HOLLOW candidate/excluded dot (fill:none) clickable only on its
              // ~2px ring stroke — a center click falls through to the select
              // overlay below. 'all' hit-tests fill+stroke regardless of paint,
              // so the whole dot is a target. (Found via real-browser clicking.)
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                toggleOverride(a);
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
