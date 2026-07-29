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
//     Semantic hosts show the full placed/candidate ghost field; EDGE hosts
//     (#141) show PLACED-ONLY dots (see the edge display rule below). Click =
//     per-glyph popover, double-click = quick hide. STASH hosts are GEOMETRY-IN
//     (their anchors cannot be derived from params), wired via the
//     `patternInstances` prop: the real drawn host instance stashes
//     `motifHostGeometry` during generate() — voronoi `{drawnEdges, sites}`,
//     circlepacking `{circles}` — and RightPanel keeps `patternInstances` in
//     React state (refreshed after every p5 render). Since #149 the overlay names
//     no host: it asks the SHARED resolver (lib/motif/hostAnchors.js), the same
//     module the render path calls, so a new stash host inherits dots by
//     registering in hostKinds rather than by editing this file.
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
import { resolveHostAnchors } from '../../lib/motif/hostAnchors';
import { resolveSelection } from '../../lib/motif/compileSelectionToChain';
import { coerceRoles } from '../../lib/motif/edgeRoles';
import { resolvePlacements } from '../../lib/motif/placementEngine';
import { isEdgeHost, hostHasPathStructure } from '../../lib/motif/hostKinds';
import { useFootprintReveal } from '../shell/footprintRevealContext';
import { firstSequenceIndex, placementsForSlotScope, captorDisc } from './footprintScope';

const ACCENT = '#7c3aed'; // violet — placed / included fill
const EXCLUDE_STROKE = '#ef4444'; // red — force-excluded outline
// The dot whose popover is OPEN. Reads the app's own interactive fill (the same
// token the Inspector uses for a live control) rather than a fourth hardcoded
// hex, so it tracks light/dark like every other saffron surface. SELECTION WINS
// over placed / hidden / candidate — the card's eye says whether the glyph is
// hidden; the dot says which glyph you are editing — but the filled-vs-hollow
// SHAPE is left alone, so the state is still legible underneath.
const SELECTED = 'var(--saffron)';

// FOOTPRINT OVERLAY (#189, decision 14). Two rings per glyph on the hovered
// slot: SOLID at `packedRadius` (what was RESERVED into the packer — the circle
// that pushes neighbours around) and DASHED at `drawnRadius` (what was actually
// DRAWN). They coincide at `hold 0`; their separation as the drag proceeds IS
// the feature made visible, which is why one ring would not do — a single ring
// draws the circle that is NOT the packing circle and teaches the wrong model at
// exactly the moment the control is being learned.
//
// WHICH RING TAKES THE HEAVY STROKE is `capBy` read straight off the canvas, no
// legend (decision 14). `capBy` names what bound `drawnRadius` — the radius the
// user SEES (decision 15b) — so:
//   'neighbour'          → the SOLID ring. The reserve is the lerp's floor, and
//                          the neighbour is what set it.
//   'boundary' | 'host'  → the DASHED ring, which is sitting exactly ON the hard
//                          cap (`drawnRadius === hardCap`, an exact equality by
//                          construction — placementEngine.js:617).
//   'natural'            → NEITHER. Nothing is capping this glyph; two light
//                          rings is the honest reading, and it is also the only
//                          thing distinguishing "at hold 0, uncapped" from "at
//                          hold 0, neighbour-capped", where the rings coincide
//                          either way.
// THAT MAPPING IS THE SATURATION ANSWER (story 25, decision 2b): as `hold`
// climbs with `neighbourCap < hardCap < naturalTarget`, `capBy` is 'neighbour'
// until `lerp > hardCap`, at which instant `drawnRadius` pins to `hardCap` and
// `capBy` flips to the hard term — so the heavy stroke visibly JUMPS from the
// solid ring to the dashed one at the moment the drag stops responding. The
// canvas rect is deliberately NOT drawn (decision 17): the page edge is already
// on screen, and drawing a second one over the artwork being judged buys
// nothing.
const RING_HEAVY = 3; // × the base stroke, on the binding ring

// THE CAPTOR (#190, decisions 16/17). The rings above show THAT a glyph is
// capped; one more circle per ringed glyph shows WHAT capped it — the specific
// neighbour disc (`capObstacle`) or the host container (`anchor.hostRadius`),
// selected in footprintScope.js and drawn here.
//
// DIMMER, and one only. It is the cause, not a second subject: the glyph's own
// two rings stay the bright pair, and the captor sits behind them at a third of
// the opacity. Drawn FIRST inside the same <g> so the glyph's rings paint over
// it where they overlap — SVG has no z-index, document order is the whole
// mechanism.
//
// WHAT LINKS IT TO THE GLYPH IS GEOMETRY, NOT A LEADER LINE. For 'neighbour'
// the engine's own definition puts the two in contact: packedRadius =
// margin × (d − r_obstacle), so at `margin: 1` the solid ring is EXACTLY
// tangent to the captor and at the default 0.85 it stands off by 15% of the
// gap — the captor is always the nearest disc, essentially touching the ring it
// bound. For 'host' the glyph sits INSIDE the container and containment is the
// link, with a leader line that would be near-zero long anyway. A second
// element per glyph was the alternative and it doubles the mark count the
// measurement below is about; the tangency is the cheaper answer and the one
// to test by eye first.
//
// The captor usually belongs to a DIFFERENT slot than the hovered one. It is
// drawn all the same — that is decision 16's point, not an exception to it.
const CAPTOR_OPACITY = 0.3;

// Stable identity for "nothing resolved", so the memos downstream of the
// placement pipeline do not re-run on every render of an unresolvable overlay.
const EMPTY_RESOLVED = Object.freeze({ placements: [], survivors: [], sequence: null });

/** Which ring `capBy` marks as binding. null ⇒ nothing is capping this glyph. */
const bindingRing = (capBy) => {
  if (capBy === 'neighbour') return 'packed';
  if (capBy === 'boundary' || capBy === 'host') return 'drawn';
  return null; // 'natural', or an unrecognised value — mark nothing
};

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
  // THE FOOTPRINT REVEAL (#188/#189, decision 19). `scope` is null when nothing
  // is revealed; it is an OPAQUE plain object — that file stores whatever a
  // trigger passes and classifies none of it, so classification happens here
  // (see footprintScope.js). Outside the provider this reads the frozen CLEARED
  // value, so every existing standalone test of this overlay is unaffected.
  const { scope: revealScope } = useFootprintReveal();
  // Every hook runs on every render (guards live INSIDE the memos, the single
  // early return is at the end). Mounting this overlay unconditionally means a
  // selection change must not change the hook count — Rules of Hooks.
  const selectedMotif = useMemo(() => {
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

  // THE MOTIF A REVEAL NAMES — a SECOND selector, not a filter (#189).
  //
  // This is load-bearing and non-obvious: the slot card that raises the reveal
  // lives in the MotifDevice, which the Inspector renders on the HOST layer and
  // explicitly refuses to render on a motif layer (Inspector.jsx:984). So while
  // the user is hovering a `hold` row, the SELECTED layer is the host and
  // `selectedMotif` is null — the render gate below would return null and the
  // overlay would never draw. Exactly the fails-OFF signature the reveal context
  // warns about, from a different cause. `scope.layerId` is what resolves it.
  //
  // Deliberately NOT folded into the memo above: the two answer different
  // questions and only one of them may raise the ghost-dot field (see
  // `ghostsVisible` at the render gate). One reveal ⇒ one extra memo pass, not
  // one per drag frame — the context re-uses the stored scope object when a
  // re-raise describes the same thing (`sameScope`).
  const revealMotif = useMemo(() => {
    const id = revealScope && revealScope.layerId;
    if (!id) return null;
    return (layers || []).find((l) => l.id === id && isMotifLayer(l)) || null;
  }, [layers, revealScope]);

  // Selection (or the pick arm) wins: a reveal must never silently retarget an
  // overlay the user is already editing through.
  const motif = selectedMotif || revealMotif;

  const host = useMemo(
    () => (motif ? (layers || []).find((l) => l.id === motifHostId(motif)) || null : null),
    [layers, motif]
  );

  // Host anchors — through the ONE SHARED RESOLVER (#149, hostAnchors.js), the
  // same module MotifPattern's render path calls. There is deliberately no host
  // kind named here any more: the resolver decides formula-vs-stash-vs-edge from
  // hostKinds, and forwards whatever geometry the host stashed. Removing this
  // overlay's hardcoded `voronoi` branch is what let Circle Packing (#146) — and
  // Module Grid / Girih / Truchet after it — inherit editable dots and the glyph
  // popover without touching this file at all.
  //
  // WHAT THE RESOLVER GETS:
  //   • the HOST's patternType/params/seed — a single-axis grid is a params-aware
  //     EDGE host, so its dots land ALONG each line (matching the render) rather
  //     than at the semantic extractor's 2 tips per line;
  //   • `geometry` = the drawn instance's `motifHostGeometry`, which is either a
  //     STASH host's own harvest (voronoi: drawnEdges+sites; circlepacking:
  //     circles) or the prepass-captured `hostPaths` of an edge host;
  //   • the MOTIF's edgeOpts, so edge dots resample exactly as the glyphs did.
  //     Fallback `{}` is the RENDER's fallback, which samples NOTHING without a
  //     spacing/count — a friendlier default would draw dots claiming "placed"
  //     over a canvas where no glyph drew.
  //
  // Keyed on the host object ref (updateLayer replaces layer objects immutably) +
  // canvas dims + patternInstances (host geometry) + the motif (edgeOpts).
  //
  // TIMING — geometry comes from `patternInstances`, which useCanvas sets AFTER
  // p5 draws (post-render setState). So on a host-param change the overlay may
  // render one frame against the PREVIOUS geometry, then self-heal when the fresh
  // instances arrive. This is safe because the extractors are deterministic (same
  // seed+params ⇒ same geometry ⇒ same anchor ids + coords), so ghost/glyph
  // agreement is exact once settled. Absent geometry (first frame before p5
  // draws, or a host that has not been probed) ⇒ the resolver returns null ⇒ the
  // overlay renders nothing (graceful, never a throw).
  // A HIDDEN host is NOT the absent case (#140): useCanvas still generates hidden
  // layers through the no-draw adapter, which stashes motifHostGeometry like any
  // drawn frame, and the edge prepass probes visibility-blind — so dots and the
  // glyph popover survive "hide the scaffold, keep the ornament". Locked by
  // AnchorGhostOverlay.hiddenHost.test and .stashHost.test.
  const anchors = useMemo(() => {
    if (!host) return null;
    return resolveHostAnchors({
      patternType: host.patternType,
      params: host.params,
      canvasW,
      canvasH,
      geometry: patternInstances[host.id]?.motifHostGeometry,
      hostSeed: host.seed,
      edgeOpts: motif?.params?.edgeOpts,
    });
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
  // THE RENDER'S OWN ROLE COERCION, RESOLVED ONCE (#154, amendment A2).
  //
  // Hoisted to hook level on purpose: BOTH consumers below read this one value —
  // the placement pipeline (which decides placed vs candidate) and the role-focus
  // DISPLAY filter further down (which decides whether a dot is drawn at all).
  // They used to disagree: placements ran on the coerced binding while the filter
  // ran on the RAW one, so a Voronoi motif stored as roles:['tip'] would place
  // glyphs at the fallback role and draw ZERO dots on them. No dot means no
  // popover, which means the whole per-glyph override surface (#136/#137) is
  // unreachable for exactly the placements #154 newly creates. One seam, both
  // readers — and the function itself is imported from the render, never
  // re-implemented (edgeRoles.js's whole reason for existing).
  //
  // `anchorMode` is derived from the HOST, not read off the motif — because it
  // must describe the anchor set THIS OVERLAY actually holds. `resolveHostAnchors`
  // above omits `mode` and so derives it from `isEdgeHost`; passing the motif's
  // stored anchorMode instead could coerce roles to 'edge' over a SEMANTIC anchor
  // set and filter away the very dots just resolved. (In the app the two always
  // agree — defaultBinding writes 'semantic' iff isSemanticHost, and
  // resolveMotifHost forces 'edge' iff isEdgeHost — so this matches the render on
  // every reachable path. Only a hand-made / legacy binding whose stored
  // anchorMode contradicts its host can differ, and that contradiction lives in
  // the ANCHOR resolution, which is not this ticket's to change.)
  //
  // READ-ONLY. Every WRITE below goes through the RAW stored binding — see
  // `applyGlyphEdit`. Patching from the coerced value would persist a derived
  // role into the document, which is precisely what #154 promises never happens.
  const binding = useMemo(
    () =>
      coerceRoles(motif?.params?.binding || {}, {
        type: host?.patternType,
        params: host?.params,
        anchorMode: isEdgeHost(host?.patternType, host?.params) ? 'edge' : 'semantic',
      }),
    [motif, host]
  );

  const resolved = useMemo(() => {
    if (!anchors || !motif) return EMPTY_RESOLVED;
    // EDGE hosts run the same pipeline (#141) — placed/candidate is what the
    // override dots are made of.
    const { survivors, sequence, overrideRecords } = resolveSelection(binding, anchors, {
      canvasW,
      canvasH,
      overrides: binding.overrides,
    });
    const placementConfig = { ...(binding.placement || {}) };
    if (sequence) placementConfig.sequence = sequence;
    // `overrideRecords` (the post-placement per-glyph scale/angle map, #137) IS
    // threaded now. It used to be deliberately omitted, on the recorded ground
    // that this overlay read only `anchorId` off the placements — with the note
    // "thread it if this overlay ever starts drawing footprints at their real
    // radius/rotation". THAT PRECONDITION HAS FIRED (#189): the footprint rings
    // below are drawn at `packedRadius` / `drawnRadius`, and per-glyph overrides
    // apply AFTER packing (overrides.js `applyGlyphOverrides`), so without this
    // the rings would not be the rings on screen.
    //
    // ⚠️ `applyGlyphOverrides` scales `drawnRadius` alongside `radius` and
    // deliberately leaves `packedRadius` alone — the reserve genuinely did not
    // move, packing never saw the override. So on an overridden glyph the two
    // rings legitimately differ even at `hold 0`. That is the truth, not a bug.
    //
    // SURVIVORS AND SEQUENCE COME OUT TOO, for the slot→placement mapping the
    // footprint overlay needs (footprintScope.js). `Placement` carries no slot
    // field and must not gain one.
    const { placements } = resolvePlacements(survivors, placementConfig, {
      boundary: { type: 'rect', width: canvasW, height: canvasH },
      overrideRecords,
    });
    return { placements, survivors, sequence };
  }, [anchors, motif, binding, canvasW, canvasH]);
  const placements = resolved.placements;

  // THE HOVERED SLOT'S PLACEMENTS — decision 16: the hovered slot's glyphs, NOT
  // every placement on the layer (that stays legible on a sparse host and
  // becomes a grey haze at MAX_PLACEMENTS). `null` when no slot reveal names
  // this motif; `[]` when it does and that slot places nothing.
  //
  // Gated on the reveal naming the SAME motif the pipeline above resolved: with
  // a motif layer selected AND a different motif's slot hovered, `motif` is the
  // selected one and these placements would describe the wrong layer.
  const footprintPlacements = useMemo(() => {
    if (!motif || !revealMotif || revealMotif.id !== motif.id) return null;
    return placementsForSlotScope(revealScope, {
      motifId: motif.id,
      seqIndex: firstSequenceIndex(readChain(motif.params?.binding)),
      survivors: resolved.survivors,
      sequence: resolved.sequence,
      placements: resolved.placements,
    });
  }, [motif, revealMotif, revealScope, resolved]);

  // THE CAPTORS — anchorId → the one disc capping that glyph, or absent (#190).
  // Keyed by anchorId rather than positionally so the render cannot drift out
  // of alignment with the list it is drawing.
  //
  // The ANCHOR LOOKUP is built lazily, and only when some glyph on the hovered
  // slot is actually 'host'-capped. `capObstacle` is self-contained, so on every
  // host but the three that emit `hostRadius` (circlepacking, modulegrid,
  // truchet cells) this pass never touches `survivors` at all — and this memo
  // re-runs on every frame of a `hold` drag, since `resolved` does.
  const footprintCaptors = useMemo(() => {
    if (!footprintPlacements || footprintPlacements.length === 0) return null;
    let anchorsById = null;
    const out = new Map();
    for (const p of footprintPlacements) {
      if (p.capBy === 'host' && !anchorsById) {
        anchorsById = new Map();
        for (const a of resolved.survivors) if (a && a.id != null) anchorsById.set(a.id, a);
      }
      const disc = captorDisc(p, anchorsById ? anchorsById.get(p.anchorId) : null);
      if (disc) out.set(p.anchorId, disc);
    }
    return out;
  }, [footprintPlacements, resolved]);

  // Is THIS motif's Route card armed for path picking on an EDGE host? That is
  // the ONE thing that decides which of the two render paths runs — and it also
  // has to close an open glyph popover, so it is computed at hook level rather
  // than inside the render branch below.
  const edgeMode = !!host && isEdgeHost(host.patternType, host.params);
  // The PICK gate is NOT `edgeMode` (#152). Path picking needs anchors carrying
  // `meta.pathIndex`, which every edge host has — and, since girih, one SEMANTIC
  // host too, whose straps are genuine paths. Asked of the one predicate in
  // hostKinds so this and the Route card cannot drift. Deliberately separate from
  // `edgeMode`, which still governs role COERCION and the placed-only dot set:
  // girih is not an edge host and must not have its roles coerced to `edge`.
  const pathPickable = !!host && hostHasPathStructure(host.patternType, host.params);
  const pickArmed = pathPickable && !!motif && !!motifPick && motifPick.layerId === motif.id;

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

  // ── FOOTPRINT OVERLAY (#189) ───────────────────────────────────────────────
  // A THIRD, independent render path, and the only one that is not driven by
  // selection: the reveal raises it while the user hovers or drags a `hold` row
  // in the HOST's inspector, where no motif is selected at all. It is therefore
  // computed here, ABOVE the override overlay's own machinery, and returned on
  // its own when nothing is selected — so this overlay never grows a ghost-dot
  // field the user did not ask for (decision 16 is about not drawing a
  // population; a full dot field raised by a size drag is the same mistake in a
  // different mark).
  //
  // Stroke widths are in CANVAS units like everything else here (the parent
  // scales the box), floored so they survive a small canvas.
  const ringW = Math.max(0.75, Math.min(canvasW, canvasH) * 0.0018);
  const footprint =
    footprintPlacements && footprintPlacements.length ? (
      <svg
        data-testid="motif-footprint-overlay"
        data-mode="footprint"
        className="pointer-events-none absolute inset-0"
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        aria-hidden="true"
      >
        {footprintPlacements.map((p) => {
          const binds = bindingRing(p.capBy);
          // Dash scaled to the ring it rides so it reads as "dashed" on a 4-unit
          // glyph and on a 60-unit one alike.
          const dash = Math.max(2, p.drawnRadius * 0.3);
          const captor = footprintCaptors ? footprintCaptors.get(p.anchorId) : null;
          return (
            <g
              key={p.anchorId}
              data-anchor-id={p.anchorId}
              data-cap-by={p.capBy}
              data-saturated={p.saturated ? 'true' : undefined}
            >
              {/* THE CAPTOR — the neighbour disc or the host container. First,
                  so the glyph's own rings paint over it, and dim, so it reads as
                  the cause rather than a second subject. Absent for 'natural'
                  (nothing capped this glyph) and for 'boundary' (decision 17 —
                  the page edge is already on screen). */}
              {captor ? (
                <circle
                  data-captor={captor.kind}
                  cx={captor.x}
                  cy={captor.y}
                  r={captor.r}
                  fill="none"
                  stroke={ACCENT}
                  strokeOpacity={CAPTOR_OPACITY}
                  strokeWidth={ringW}
                />
              ) : null}
              {/* RESERVED — what pushes neighbours around. */}
              <circle
                data-ring="packed"
                cx={p.x}
                cy={p.y}
                r={p.packedRadius}
                fill="none"
                stroke={ACCENT}
                strokeOpacity={0.9}
                strokeWidth={binds === 'packed' ? ringW * RING_HEAVY : ringW}
              />
              {/* DRAWN — what actually inked. Coincident at `hold 0`. */}
              <circle
                data-ring="drawn"
                cx={p.x}
                cy={p.y}
                r={p.drawnRadius}
                fill="none"
                stroke={ACCENT}
                strokeOpacity={0.9}
                strokeWidth={binds === 'drawn' ? ringW * RING_HEAVY : ringW}
                strokeDasharray={`${dash} ${dash}`}
              />
            </g>
          );
        })}
      </svg>
    ) : null;

  // REVEAL-ONLY: no layer is selected through this overlay, so there is no dot
  // field and no popover to render. `footprint` is null when nothing is
  // revealed, which is today's behaviour for an unselected motif exactly.
  if (!selectedMotif) return footprint;

  // `binding` is the COERCED one resolved at hook level — the same value the
  // placement pipeline above ran on (#154 A2). Everything below reads role and
  // override state off it, so the dots can never describe a different chain from
  // the one the canvas drew. Overrides, placement and every other field ride
  // through the coercion untouched (only Route/selection `roles` are narrowed).
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
    // THE RAW STORED BINDING, never the coerced one (#154). Role availability is
    // derived for the duration of a render; patching from the coerced value would
    // write a derived role into the document behind the maker's back — the one
    // thing this ticket promises never happens — and it would do it on an
    // unrelated gesture (hiding one glyph).
    const rawBinding = motif.params.binding || {};
    const newBinding = editBindingOverrides(rawBinding, edit);
    if (newBinding === rawBinding) return; // no-op — never a phantom undo entry
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
  // reddish dot. Legible over any artwork, deliberately not fancy. A SELECTED
  // dot recolors to saffron at full opacity, keeping whatever fill the state
  // gave it (`none` stays `none`, so a hidden glyph stays hollow).
  const styleFor = (state, selected) => {
    const base = baseStyleFor(state);
    if (!selected) return base;
    return {
      fill: base.fill === 'none' ? 'none' : SELECTED,
      fillOpacity: base.fillOpacity ? 0.9 : 0,
      stroke: SELECTED,
      strokeOpacity: 1,
    };
  };

  const baseStyleFor = (state) => {
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
  // The SEED is rounded to the dial's own 1° grid. A record's angle is already
  // on that grid (the control commits integers); a placement's rotation is raw
  // geometry — on an edge host it is the path tangent, so it arrives as
  // 233.70170941…° and overflowed the card's readout. Rounding here rather than
  // in the readout keeps what you SEE and what a commit WRITES identical.
  const resolvedAngle = openRecord?.angle ?? Math.round(openPlacement?.rotation ?? 0);

  const popover = openAnchor ? (
    <GlyphPopover
      // KEYED BY GLYPH: opening a different dot mounts a FRESH card, which is
      // what resets a dragged-aside card back to auto-placement (the pin lives
      // for as long as one card is open, and no longer). Also clears the menu
      // and flyout, which should never survive a change of subject.
      key={openGlyph.anchorId}
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
        const selected = openGlyph?.anchorId === a.id;
        const s = styleFor(state, selected);
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
              data-selected={selected || undefined}
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

  // Footprint FIRST so the ghost dots paint over it: the dots are the clickable
  // surface, and a heavy binding stroke passing through one must not hide it.
  return (
    <>
      {footprint}
      {ghosts}
      {popover}
    </>
  );
}
