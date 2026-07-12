// AnchorGhostOverlay — the anchor-ghost canvas overlay + click-to-override for
// motifs. When a MOTIF layer is selected, this draws faint "ghost" dots on the
// canvas at the host pattern's candidate anchor positions: PLACED anchors (a
// motif rule actually put a glyph there) read as filled, un-placed CANDIDATES as
// hollow. Clicking a dot toggles a force-include / force-exclude override that
// the render seam ALREADY honors (the fixed post-chain override step, shared by
// BOTH binding shapes via resolveSelection → overrides.js), so the user can
// hand-correct the automatic layout point-by-point. The overlay is SHAPE-AWARE:
// a chain-form binding stores overrides top-level at `binding.overrides`, a
// legacy binding at `binding.selection.overrides` (see readOverrides below).
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
// SCOPE — this overlay has TWO render paths:
//   • SEMANTIC override overlay (grid / recursive / spiral PLUS voronoi): faint
//     placed/candidate ghosts, click-to-override. Voronoi is GEOMETRY-IN
//     (getSemanticAnchors needs the host's drawn segments), wired via the
//     `patternInstances` prop: the real drawn host instance stashes
//     `motifHostGeometry = {drawnEdges, sites}` during generate(), and RightPanel
//     keeps `patternInstances` in React state (refreshed after every p5 render).
//   • EDGE-HOST PATH PICKER (C4): for a generic edge host (flowfield/wave/…) the
//     dots come from the SAME record-mode polyline capture the render uses
//     (`motifHostGeometry.hostPaths`, also surfaced through `patternInstances`),
//     and render ONLY while the motif's Route card is armed (`motifPick`). This is
//     the once-deferred generic edge ghost, now wired for path picking.
// Pure UI + wiring — the motif core is only CONSUMED, never edited.

import { useMemo } from 'react';
import { isMotifLayer, motifHostId, deepMergeBinding, readChain } from '../../lib/motif/motifLayer';
import { getSemanticAnchors } from '../../lib/motif/semanticAnchors';
import { sampleEdgeAnchors } from '../../lib/motif/anchors';
import { resolveSelection } from '../../lib/motif/compileSelectionToChain';
import { resolvePlacements } from '../../lib/motif/placementEngine';
import { SEMANTIC_MOTIF_HOSTS, isEdgeHost } from '../../lib/motif/hostKinds';

// This overlay previews SEMANTIC anchors only (grid/recursive/spiral are FORMULA
// hosts — anchors from params alone; voronoi is GEOMETRY-IN via the drawn host's
// stashed `motifHostGeometry`, supplied through `patternInstances`). It is
// DELIBERATELY scoped to the semantic set and NOT widened to B2's edge hosts:
// getSemanticAnchors returns null for an edge host (flowfield/wave/…), so adding
// them here would render a silent no-op ghost — a dead affordance. Edge-host
// anchors come from the useCanvas record-mode capture (hostPaths), which this
// overlay cannot reach, so a generic edge-ghost preview is deferred to a
// follow-up rather than shipping an affordance that shows nothing.
const MOTIF_HOSTS = SEMANTIC_MOTIF_HOSTS;

const ACCENT = '#7c3aed'; // violet — placed / included fill
const EXCLUDE_STROKE = '#ef4444'; // red — force-excluded outline

// Keep only string ids (override arrays may legally hold {x,y,role} refs too, but
// this overlay only ever writes/reads id strings).
const strings = (arr) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);

// SHAPE-AWARE READ helpers (D — chain-form vs legacy). A chain-form binding
// (`binding.chain` present) is the C1 shape: `selection` is DROPPED, overrides
// live TOP-LEVEL at `binding.overrides` (the exact slot the render seam reads,
// MotifPattern.js:111). A legacy binding keeps `binding.selection.overrides`.
// Reading the WRONG slot is precisely the D bug (empty overrides on a chain-form
// motif that actually has some), so both call sites route through these.
const isChainForm = (binding) => Array.isArray(binding && binding.chain);

// The effective include/exclude override object for THIS binding shape. Never
// null — returns `{}` so callers can `?.` safely.
const readOverrides = (binding) => {
  if (!binding) return {};
  if (isChainForm(binding)) return binding.overrides || {};
  return binding.selection?.overrides || {};
};

// The anchor ROLES this motif targets, for the display-focus filter (null/empty
// ⇒ "all roles", show everything). Chain-form: intersect the non-null role sets
// of every route block (an anchor must pass ALL of them to ever place); all-null
// ⇒ null (no constraint). Legacy: `binding.selection.roles` verbatim.
const readRoles = (binding) => {
  if (!binding) return null;
  if (isChainForm(binding)) {
    let acc = null;
    for (const block of readChain(binding)) {
      if (block && block.type === 'route' && block.roles != null) {
        const s = new Set(block.roles);
        acc = acc == null ? s : new Set([...acc].filter((r) => s.has(r)));
      }
    }
    return acc ? [...acc] : null;
  }
  return binding.selection?.roles ?? null;
};

export default function AnchorGhostOverlay({
  layers,
  selectedLayerId,
  canvasW,
  canvasH,
  onUpdateLayer = () => {},
  patternInstances = {},
  // Canvas path-picker (C4, #79). `motifPick = {layerId, blockIndex} | null` is
  // the ephemeral Route-card arm target (Studio state). When it names the
  // selected EDGE-host motif, this overlay renders the edge-anchor ghost as a
  // clickable path picker; `onTogglePickedPath(pathIndex)` toggles that path in
  // the armed route block's `pickedPaths` (a ROUTE-BLOCK edit — a wholly separate
  // write from the shape-aware override toggle below, which is scoped to semantic
  // hosts). Both optional.
  motifPick = null,
  onTogglePickedPath = () => {},
}) {
  // ── HOOKS FIRST ──────────────────────────────────────────────────────────
  // Every hook runs on every render (guards live INSIDE the memos, the single
  // early return is at the end). Mounting this overlay unconditionally means a
  // selection change must not change the hook count — Rules of Hooks.
  const motif = useMemo(() => {
    const list = layers || [];
    // PICK MODE takes precedence: the Route card's "Pick on canvas" arm lives in
    // the HOST's inspector, so the HOST (not the motif) is the selected layer
    // while picking. When a pick target is armed, the ARMED motif drives the
    // overlay regardless of selection; otherwise the selected motif does (the
    // semantic override overlay's original behavior).
    if (motifPick && motifPick.layerId) {
      const armed = list.find((l) => l.id === motifPick.layerId && isMotifLayer(l));
      if (armed) return armed;
    }
    return list.find((l) => l.id === selectedLayerId && isMotifLayer(l)) || null;
  }, [layers, selectedLayerId, motifPick]);

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
    if (!host) return null;
    if (MOTIF_HOSTS.has(host.patternType)) {
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
    }
    // C4 — EDGE host (flowfield/wave/…): the dots come from the SAME polyline
    // capture the render uses (hostPaths, surfaced on the drawn instance by
    // useCanvas), resampled with the motif's OWN edgeOpts so the ghost dots land
    // where the glyphs would. Each edge anchor carries meta.pathIndex (the pick
    // key). Absent capture (host not yet probed / hidden) → null → no ghost.
    if (isEdgeHost(host.patternType)) {
      const hostPaths = patternInstances[host.id]?.motifHostGeometry?.hostPaths;
      if (!hostPaths || !hostPaths.length) return null;
      const edgeOpts = motif?.params?.edgeOpts || { spacing: 24 };
      return sampleEdgeAnchors(hostPaths, edgeOpts);
    }
    return null;
  }, [host, canvasW, canvasH, patternInstances, motif]);

  // Placements — run the SAME chain-aware path the real render uses
  // (MotifPattern.generate: resolveSelection → resolvePlacements), so PLACED
  // state here matches what actually draws for BOTH binding shapes. This is the D
  // fix: the old legacy `placeMotifs(anchors, binding)` read `binding.selection`,
  // which is DROPPED on a chain-form binding (C1), producing garbage placedIds.
  // resolveSelection handles chain-form AND legacy, and `binding.overrides` is
  // exactly the slot the render seam threads (MotifPattern.js:111) — undefined on
  // legacy, where resolveSelection's compile path overwrites it with the compiled
  // `selection.overrides` anyway, so this is byte-identical to the real render.
  const placements = useMemo(() => {
    if (!anchors || !motif) return [];
    // Edge-host guard (C4): the edge branch is pick-oriented (colored by
    // pickedPaths), never placed/candidate, so it needs no placements — skip.
    if (host && isEdgeHost(host.patternType)) return [];
    const binding = motif.params.binding || {};
    const { survivors, sequence } = resolveSelection(binding, anchors, {
      canvasW,
      canvasH,
      overrides: binding.overrides,
    });
    const placementConfig = { ...(binding.placement || {}) };
    if (sequence) placementConfig.sequence = sequence;
    const { placements: p } = resolvePlacements(survivors, placementConfig, {
      boundary: { type: 'rect', width: canvasW, height: canvasH },
    });
    return p;
  }, [anchors, motif, canvasW, canvasH, host]);

  // ── SINGLE RENDER GATE ───────────────────────────────────────────────────
  if (!motif || !host || !anchors) return null;

  // ── EDGE-HOST PATH PICKER (C4) ─────────────────────────────────────────────
  // A wholly separate render path from the semantic override overlay below: it
  // reads/writes ONLY the route block's pickedPaths (via onTogglePickedPath) — a
  // ROUTE-BLOCK edit, distinct from the shape-aware include/exclude override
  // toggle below (which is scoped to semantic hosts). Renders ONLY when THIS
  // motif's Route card is armed ("Pick on canvas"), so it's an intentional
  // affordance, not clutter on every edge-host selection (a dense flowfield can
  // emit hundreds of anchors).
  if (isEdgeHost(host.patternType)) {
    const armed = !!motifPick && motifPick.layerId === motif.id;
    if (!armed) return null;
    // Color dots by membership in the ARMED route block's pickedPaths. readChain
    // tolerates both binding shapes (by the time you can arm, scope='picked' has
    // already migrated the binding to chain-form).
    const chain = readChain(motif.params?.binding);
    const routeBlock = chain[motifPick.blockIndex];
    const pickedSet = new Set(
      routeBlock && Array.isArray(routeBlock.pickedPaths) ? routeBlock.pickedPaths : []
    );
    const rE = Math.max(3, Math.min(canvasW, canvasH) * 0.006);
    const strokeWE = Math.max(1, rE * 0.35);
    return (
      <svg
        data-testid="anchor-ghost-overlay"
        data-mode="pick"
        className="pointer-events-none absolute inset-0"
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        aria-label="Motif path picker"
      >
        {anchors.map((a) => {
          const pathIndex = a.meta.pathIndex;
          const isPicked = pickedSet.has(pathIndex);
          return (
            <circle
              key={a.id}
              data-anchor-id={a.id}
              data-path-index={pathIndex}
              data-picked={isPicked ? 'true' : 'false'}
              cx={a.x}
              cy={a.y}
              r={rE}
              fill={isPicked ? ACCENT : 'none'}
              fillOpacity={isPicked ? 0.85 : 0}
              stroke={ACCENT}
              strokeOpacity={isPicked ? 0.95 : 0.35}
              strokeWidth={strokeWE}
              // 'all' so a hollow (unpicked) dot's whole area is clickable — see
              // the semantic overlay's note on visiblePainted vs all.
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onTogglePickedPath(pathIndex);
              }}
            />
          );
        })}
      </svg>
    );
  }

  const binding = motif.params.binding || {};
  const placedIds = new Set(placements.map((p) => p.anchorId));
  // SHAPE-AWARE overrides read: chain-form → binding.overrides; legacy →
  // binding.selection.overrides (see readOverrides). Reading the legacy slot on a
  // chain-form motif was the D bug — existing overrides showed as empty.
  const ov = readOverrides(binding);
  const includeIds = new Set(strings(ov.include));
  const excludeIds = new Set(strings(ov.exclude));

  // Show ghosts only for the anchor ROLES this motif actually targets (keeps the
  // overlay focused instead of drawing every crossing+edge+tip+cell). An
  // overridden anchor stays visible regardless of role so it's always toggleable.
  // roles null/empty ⇒ engine treats as "all roles", so show everything.
  const roles = readRoles(binding);
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

    // SHAPE-AWARE WRITE, NO forced migration (the D spine). deepMergeBinding
    // REPLACES arrays wholesale, so we pass the full new arrays. One onUpdateLayer
    // ⇒ one undo entry, both shapes.
    //   • chain-form → write TOP-LEVEL binding.overrides (the render seam's slot).
    //     Does NOT touch `chain`, does NOT add a `selection` key (C1 intact).
    //   • legacy → write binding.selection.overrides (byte-identical to before).
    //     An anchor toggle is NOT a block edit, so a legacy binding STAYS legacy —
    //     forcing a chain rewrite here would be a surprising, wrong migration.
    const overridesPatch = { include: newInclude, exclude: newExclude };
    const patch = isChainForm(binding)
      ? { overrides: overridesPatch }
      : { selection: { overrides: overridesPatch } };

    onUpdateLayer(motif.id, {
      params: {
        ...motif.params,
        binding: deepMergeBinding(binding, patch),
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
