// AnchorGhostOverlay — the anchor-ghost canvas overlay + click-to-override for
// motifs. When a MOTIF layer is selected, this draws faint "ghost" dots on the
// canvas at the host pattern's candidate anchor positions: PLACED anchors (a
// motif rule actually put a glyph there) read as filled, un-placed CANDIDATES as
// hollow. Clicking a dot toggles a force-show / force-hide override RECORD
// (#136: `overrides.records = [{ref, hidden?, scale?, angle?}]`) that the
// render seam ALREADY honors (the fixed post-chain override step, shared by
// BOTH binding shapes via resolveSelection → overrides.js), so the user can
// hand-correct the automatic layout point-by-point. Legacy include/exclude
// overrides are migrate-on-READ (normalizeOverrides) and migrate-on-WRITE (this
// overlay always writes records). The overlay is SHAPE-AWARE:
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
// SCOPE — this overlay has TWO render paths, split by whether the motif's Route
// card is ARMED for path picking, not by host kind:
//   • OVERRIDE overlay (`data-mode="override"`) — every host kind, unarmed.
//     Semantic hosts (grid / recursive / spiral PLUS voronoi) show the full
//     placed/candidate ghost field; EDGE hosts (#141) show PLACED-ONLY dots (see
//     the edge display rule below). Click = per-glyph popover, double-click =
//     quick hide. Voronoi is GEOMETRY-IN (getSemanticAnchors needs the host's
//     drawn segments), wired via the `patternInstances` prop: the real drawn host
//     instance stashes `motifHostGeometry = {drawnEdges, sites}` during
//     generate(), and RightPanel keeps `patternInstances` in React state
//     (refreshed after every p5 render).
//   • EDGE-HOST PATH PICKER (C4, `data-mode="pick"`) — an edge host whose Route
//     card is armed (`motifPick`). Dots come from the SAME record-mode polyline
//     capture the render uses (`motifHostGeometry.hostPaths`, also surfaced
//     through `patternInstances`), show EVERY sample tinted by pickedPaths, and a
//     click means togglePickedPath. A dot therefore has exactly ONE meaning at
//     any instant; arming closes an open glyph popover (#141) so the two gestures
//     can never overlap.
// Pure UI + wiring — the motif core is only CONSUMED, never edited.

import { useMemo, useRef, useState } from 'react';
import { isMotifLayer, motifHostId, readChain } from '../../lib/motif/motifLayer';
import {
  clearGlyphRecord,
  editBindingOverrides,
  findGlyphRecord,
  isChainFormBinding,
  normalizeOverrides,
  patchGlyphRecord,
  readBindingOverrides,
  toggleGlyphHidden,
} from '../../lib/motif/overrides';
import { copyGlyphSettings, readGlyphClipboard } from '../../lib/motif/glyphClipboard';
import GlyphPopover from './GlyphPopover';
import { glyphScreenRect } from './glyphPopoverPlacement';
import { getSemanticAnchors } from '../../lib/motif/semanticAnchors';
import { sampleEdgeAnchors } from '../../lib/motif/anchors';
import { resolveSelection } from '../../lib/motif/compileSelectionToChain';
import { coerceEdgeRoles } from '../../lib/motif/edgeRoles';
import { resolvePlacements } from '../../lib/motif/placementEngine';
import { SEMANTIC_MOTIF_HOSTS, isEdgeHost } from '../../lib/motif/hostKinds';

// The hosts whose anchors come from a SEMANTIC extractor (grid/recursive/spiral
// are FORMULA hosts — anchors from params alone; voronoi is GEOMETRY-IN via the
// drawn host's stashed `motifHostGeometry`, supplied through `patternInstances`).
// getSemanticAnchors returns null for an edge host, so this set gates only WHICH
// extractor runs — edge hosts take the hostPaths branch below and, since #141,
// reach the same override overlay.
const MOTIF_HOSTS = SEMANTIC_MOTIF_HOSTS;

const ACCENT = '#7c3aed'; // violet — placed / included fill
const EXCLUDE_STROKE = '#ef4444'; // red — force-excluded outline

// String-keyed record refs only (records may legally hold {x,y,role} refs too,
// but this overlay only ever writes/reads id strings — spatial refs stay the
// engine's business).
const stringRefIds = (records, hiddenVal) =>
  new Set(
    records.filter((r) => r.hidden === hiddenVal && typeof r.ref === 'string').map((r) => r.ref)
  );

// SHAPE-AWARE READ helpers (D — chain-form vs legacy) now live in overrides.js
// as `isChainFormBinding` / `readBindingOverrides`, shared with the per-glyph
// popover (#139) so the dot and the popover can never disagree about which slot
// a motif's overrides live in. Aliased here to keep the call sites reading the
// way they always have.
const isChainForm = isChainFormBinding;
const readOverrides = readBindingOverrides;

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
  // Closes any OPEN history coalesce window (#139). Live per-glyph edits ride
  // the normal 400ms coalescing so the canvas updates throughout a drag, and
  // this is what turns each GESTURE into exactly one undo entry: flushed once
  // before a gesture's first write (so it cannot join a preceding Inspector
  // burst on the same layer, which carries an identical signature) and once
  // when the gesture commits. Defaults to a no-op so every existing test and
  // caller keeps working unchanged.
  onFlushHistory = () => {},
}) {
  // ── HOOKS FIRST ──────────────────────────────────────────────────────────
  // The per-glyph popover's open anchor, and the screen rect of the dot it
  // hangs off. Screen-space, captured from the clicked <circle> — the overlay
  // itself lives inside a CSS-scaled box, so its own coordinates are useless
  // for positioning chrome.
  const [openGlyph, setOpenGlyph] = useState(null); // { anchorId, rect } | null
  // Open across a gesture's live writes; see onFlushHistory above.
  const gestureOpen = useRef(false);
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
  // (first frame before p5 draws) ⇒ null ⇒ overlay renders nothing (graceful).
  // A HIDDEN host is NOT the absent case (#140): useCanvas still generates
  // hidden layers through the no-draw adapter, which stashes motifHostGeometry
  // like any drawn frame — so dots and the glyph popover survive "hide the
  // scaffold, keep the ornament". Locked by AnchorGhostOverlay.hiddenHost.test.
  const anchors = useMemo(() => {
    if (!host) return null;
    // A single-axis grid is a params-aware EDGE host (hostKinds) — route it to the
    // edge branch below so the ghost dots land ALONG each line, matching the real
    // render, instead of the semantic extractor's 2 tip dots per line.
    const edgeMode = isEdgeHost(host.patternType, host.params);
    if (!edgeMode && MOTIF_HOSTS.has(host.patternType)) {
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
    // key). Absent capture (host not yet probed) → null → no ghost; a HIDDEN
    // host still has capture — the useCanvas prepass probes visibility-blind
    // (#140).
    if (edgeMode) {
      const hostPaths = patternInstances[host.id]?.motifHostGeometry?.hostPaths;
      if (!hostPaths || !hostPaths.length) return null;
      // edgeOpts fallback is `{}` — the RENDER's fallback (MotifPattern), which
      // samples NOTHING without a spacing/count. A friendlier default here (it
      // used to be {spacing:24}) would draw dots claiming "placed" over a canvas
      // where no glyph drew. createMotifParams gives every real motif
      // {spacing:24}, so this only ever bites a hand-rolled/legacy params blob —
      // exactly the case where agreeing with the render matters.
      return sampleEdgeAnchors(hostPaths, motif?.params?.edgeOpts || {});
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
    // EDGE hosts run the same pipeline (#141) — placed/candidate is what the
    // override dots are made of. The one extra step is the render's own role
    // coercion: resolveMotifHost forces anchorMode:'edge' on an edge host, and
    // MotifPattern then un-bakes any stale non-edge route roles. Skipping it here
    // would filter every edge anchor out and draw an EMPTY overlay over a canvas
    // full of glyphs — so the coercion is imported, never re-implemented.
    const raw = motif.params.binding || {};
    const binding = host && isEdgeHost(host.patternType, host.params) ? coerceEdgeRoles(raw) : raw;
    const { survivors, sequence } = resolveSelection(binding, anchors, {
      canvasW,
      canvasH,
      overrides: binding.overrides,
    });
    const placementConfig = { ...(binding.placement || {}) };
    if (sequence) placementConfig.sequence = sequence;
    // `overrideRecords` (the post-placement per-glyph scale/angle map, #137) is
    // deliberately NOT threaded here: this overlay reads only `anchorId` off the
    // placements (to compute `placedIds` below), and per-glyph scale/angle change
    // neither which anchors are placed nor their x/y. Thread it if this overlay
    // ever starts drawing footprints at their real radius/rotation.
    const { placements: p } = resolvePlacements(survivors, placementConfig, {
      boundary: { type: 'rect', width: canvasW, height: canvasH },
    });
    return p;
  }, [anchors, motif, canvasW, canvasH, host]);

  // Is THIS motif's Route card armed for path picking on an EDGE host? That is
  // the ONE thing that decides which of the two render paths runs — and it also
  // has to close an open glyph popover, so it is computed at hook level rather
  // than inside the render branch below.
  const edgeMode = !!host && isEdgeHost(host.patternType, host.params);
  const pickArmed = edgeMode && !!motif && !!motifPick && motifPick.layerId === motif.id;

  // Arming pick force-closes the per-glyph popover (#141). Without this the card
  // would merely be hidden behind the early return below and RESURRECT on
  // disarm, pointing at a glyph the user has since stopped editing. One meaning
  // per dot, one card at a time.
  //
  // Adjusted DURING render (React's "resetting state when a prop changes"
  // pattern) rather than in an effect: the popover must never paint for the
  // frame in which pick arms, and a setState-in-effect would render it once
  // first, then blank it.
  const [prevPickArmed, setPrevPickArmed] = useState(pickArmed);
  if (prevPickArmed !== pickArmed) {
    setPrevPickArmed(pickArmed);
    if (pickArmed) setOpenGlyph(null);
  }

  // ── SINGLE RENDER GATE ───────────────────────────────────────────────────
  if (!motif || !host || !anchors) return null;

  // ── EDGE-HOST PATH PICKER (C4) ─────────────────────────────────────────────
  // A wholly separate render path from the override overlay below: it
  // reads/writes ONLY the route block's pickedPaths (via onTogglePickedPath) — a
  // ROUTE-BLOCK edit, distinct from the per-glyph override records below. Renders
  // ONLY when THIS motif's Route card is armed ("Pick on canvas"): it shows EVERY
  // sample (a dense flowfield can emit thousands), which is right for choosing
  // paths and wrong for editing glyphs — hence the hard split from the unarmed
  // override path, which draws placed glyphs only.
  if (pickArmed) {
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
  // NORMALIZED to the #136 record shape (migrate-on-read): a legacy
  // include/exclude object on disk reads as hidden:false/true records here.
  const norm = normalizeOverrides(readOverrides(binding)) || { records: [] };
  const records = norm.records;
  const includeIds = stringRefIds(records, false); // hidden:false = force-show pin
  const excludeIds = stringRefIds(records, true); // hidden:true = force-hide
  // EVERY string-ref'd anchor, whatever the record says — the edge display rule
  // below needs scale/angle-only records too, which carry no `hidden` and so
  // appear in neither set above.
  const recordIds = new Set(
    records.filter((r) => typeof r.ref === 'string').map((r) => r.ref)
  );

  // Show ghosts only for the anchor ROLES this motif actually targets (keeps the
  // overlay focused instead of drawing every crossing+edge+tip+cell). An
  // overridden anchor stays visible regardless of role so it's always toggleable.
  // roles null/empty ⇒ engine treats as "all roles", so show everything.
  const roles = readRoles(binding);
  const roleSet = Array.isArray(roles) && roles.length ? new Set(roles) : null;
  const semanticDisplay = roleSet
    ? anchors.filter((a) => roleSet.has(a.role) || includeIds.has(a.id) || excludeIds.has(a.id))
    : anchors;

  // EDGE DISPLAY RULE (#141) — PLACED ∪ every record's anchor.
  //   • PLACED-ONLY, because everything here is role:'edge' (the role-focus
  //     filter above has no edge equivalent) and the sampler emits hundreds to
  //     thousands of candidates on a real flowfield. One dot per GLYPH reads as
  //     "my ornament"; one dot per SAMPLE reads as the sampler's grid — the
  //     clutter #139 refused. The knowing cost: force-SHOW (clicking a candidate
  //     to pin a glyph onto it) is unavailable on edge hosts.
  //   • ∪ records, because hiding a glyph UN-PLACES it: a naive placed-only set
  //     would delete the very dot that could un-hide it, and would strand a
  //     scale/angle record whose anchor the rules later stop placing. Anything
  //     the user has touched keeps a clickable dot, always. Such a stranded dot
  //     reads as a CANDIDATE — the third state an edge host can show, and the
  //     one narrow case where force-show IS reachable here (its popover eye
  //     writes hidden:false).
  // Bounded by MAX_PLACEMENTS (placementEngine), not by the sample count.
  const displayAnchors = edgeMode
    ? anchors.filter((a) => placedIds.has(a.id) || recordIds.has(a.id))
    : semanticDisplay;

  // EMPTY STATE — an edge host whose rules place nothing draws nothing. The
  // Route card is where "0 glyphs placed" belongs; a canvas full of hollow
  // sample dots would be a second, noisier place to say it.
  if (edgeMode && displayAnchors.length === 0) return null;

  // Toggle state machine (#136 — pure RECORD edits → one onUpdateLayer). Same
  // spirit as the old include/exclude arrays, but record-PRESERVING: un-hiding
  // removes ONLY the `hidden` field, so a record still carrying scale/angle
  // survives ("rules decide" visibility again); a bare record is dropped. Order:
  //   excluded  → remove `hidden` (clear the force-hide; keep scale/angle record)
  //   included  → remove `hidden` (clear the force-show pin; ditto)
  //   placed    → hidden:true  (merge into that ref's record, else append)
  //   candidate → hidden:false (merge/append likewise)
  // The state machine and the shape-aware write both live in overrides.js now
  // (`toggleGlyphHidden` / `editBindingOverrides`), shared verbatim with the
  // per-glyph popover so a dot click and the popover's eye-toggle can never
  // disagree — including on the case a naive `hidden: !hidden` gets backwards,
  // where a glyph the rules already hide is force-SHOWN.
  // ONE write path for every per-glyph edit — the dot's double-click, the
  // popover's eye, its scale and angle, paste and reset. `edit` is a pure
  // records→records function from overrides.js.
  //
  // `commit` says whether this write ENDS a gesture. Live drag frames pass
  // false: they ride the normal 400ms coalescing so the canvas updates
  // throughout, all folding into the window opened by the gesture's first
  // write. A committing write closes that window, so the next gesture is a
  // separate undo entry. The flush BEFORE the first write matters just as much:
  // an Inspector slider burst on the same layer carries an identical
  // `${id}:params` signature and would otherwise swallow the gesture.
  const applyGlyphEdit = (edit, { commit = true } = {}) => {
    const newBinding = editBindingOverrides(binding, edit);
    if (newBinding === binding) return; // no-op — never a phantom undo entry
    if (!gestureOpen.current) {
      onFlushHistory();
      gestureOpen.current = true;
    }
    onUpdateLayer(motif.id, {
      params: {
        ...motif.params,
        binding: newBinding,
      },
    });
    if (commit) {
      onFlushHistory();
      gestureOpen.current = false;
    }
  };

  const toggleOverride = (anchor) => {
    const id = anchor.id;
    applyGlyphEdit((recs) => toggleGlyphHidden(recs, id, placedIds.has(id)));
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

  /* ---------------------------------------------------- per-glyph popover */
  // Everything the card shows is RESOLVED state — what the glyph is actually
  // doing — not the raw record. The angle in particular seeds from the glyph's
  // current resolved rotation so opening the card never jumps it (charting
  // decision 3: "first touch converts to absolute"); a candidate that is not
  // placed has no rotation to read, so it seeds at 0.
  const openAnchor = openGlyph && displayAnchors.find((a) => a.id === openGlyph.anchorId);
  const openPlacement =
    openAnchor && placements.find((p) => p.anchorId === openGlyph.anchorId);
  const openRecord = openAnchor ? findGlyphRecord(records, openGlyph.anchorId) : undefined;

  const closePopover = () => setOpenGlyph(null);

  const glyphEdit = (patch, opts) =>
    applyGlyphEdit((recs) => patchGlyphRecord(recs, openGlyph.anchorId, patch), opts);

  const resolvedScale = openRecord?.scale ?? 1;
  const resolvedAngle = openRecord?.angle ?? openPlacement?.rotation ?? 0;

  const popover = openAnchor ? (
    <GlyphPopover
      anchorRect={openGlyph.rect}
      glyphRect={glyphScreenRect(openGlyph.rect, r, openPlacement?.radius)}
      // Effective visibility, matching what the dot draws: an excluded glyph is
      // hidden; a pinned one is shown; otherwise the rules decide.
      hidden={excludeIds.has(openGlyph.anchorId) ||
        (!placedIds.has(openGlyph.anchorId) && !includeIds.has(openGlyph.anchorId))}
      scale={resolvedScale}
      angle={resolvedAngle}
      label={motif.name || 'Glyph'}
      // Live frames: the canvas updates throughout, all folded into this
      // gesture's single undo entry.
      onPreview={(patch) => glyphEdit(patch, { commit: false })}
      onCommitScale={(v) => glyphEdit({ scale: v })}
      onCommitAngle={(v) => glyphEdit({ angle: v })}
      onToggleHidden={() => toggleOverride(openAnchor)}
      onCopy={() => copyGlyphSettings({ scale: resolvedScale, angle: resolvedAngle })}
      // Paste overwrites scale + angle and leaves `hidden` alone — copying a
      // hidden glyph's settings must not make the target vanish.
      onPaste={() => {
        const buf = readGlyphClipboard();
        if (buf) glyphEdit({ scale: buf.scale, angle: buf.angle });
      }}
      // Reset clears the WHOLE record, `hidden` included — the deliberate
      // asymmetry with paste.
      onReset={() => applyGlyphEdit((recs) => clearGlyphRecord(recs, openGlyph.anchorId))}
      onClose={closePopover}
    />
  ) : null;

  const ghosts = (
    <svg
      data-testid="anchor-ghost-overlay"
      data-mode="override"
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
              // Pointer-down only stops the canvas select overlay underneath
              // from stealing the gesture; the meaning lives on click/dblclick.
              onPointerDown={(e) => e.stopPropagation()}
              // CLICK = select + open the popover, anchored at this dot. It is
              // IDEMPOTENT, not a toggle: a double-click delivers two clicks
              // before dblclick fires, and the spec requires the popover to stay
              // up while the eye visibly flips.
              onClick={(e) => {
                e.stopPropagation();
                setOpenGlyph({ anchorId: a.id, rect: e.currentTarget.getBoundingClientRect() });
              }}
              // DOUBLE-CLICK = quick hide. Same state machine as the popover's
              // eye, so the two can never disagree about a candidate anchor.
              onDoubleClick={(e) => {
                e.stopPropagation();
                toggleOverride(a);
              }}
            />
          </g>
        );
      })}
    </svg>
  );

  return (
    <>
      {ghosts}
      {popover}
    </>
  );
}
