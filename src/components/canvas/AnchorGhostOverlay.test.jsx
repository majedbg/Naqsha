// @vitest-environment jsdom
// AnchorGhostOverlay — the motif anchor-ghost overlay + per-glyph overrides.
//
// GESTURE RE-SPEC (#139). The dots used to toggle a hide on pointer-down. The
// per-glyph popover ticket replaces that: a CLICK selects the glyph and opens
// its popover, a DOUBLE-CLICK is the quick hide. The activation assertions
// below were rewritten to double-click accordingly — the rendering assertions
// (dot states, role filtering, data-state) are untouched and remain the
// regression gate on everything the re-spec did NOT intend to change.
//
// jsdom has no layout, but the ghost dots don't need it: semantic anchors come
// from the PURE getSemanticAnchors (params-only math for formula hosts, or the
// host's stashed drawn geometry for voronoi), so every <circle> renders with a
// real cx/cy. We assert on data-anchor-id / data-state presence and on the
// onUpdateLayer payload. We DO assert cx/cy for voronoi — those attributes are set
// verbatim from anchor.x/anchor.y (NOT layout-derived), so `getAttribute('cx')`
// returns the exact string coordinate; only getBoundingClientRect-style pixel
// positions (which jsdom can't compute) are off-limits.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import AnchorGhostOverlay from './AnchorGhostOverlay';
import { MOTIF_TYPE, createMotifParams } from '../../lib/motif/motifLayer';
import { getSemanticAnchors } from '../../lib/motif/semanticAnchors';
import { resolveSelection } from '../../lib/motif/compileSelectionToChain';
import { resolvePlacements } from '../../lib/motif/placementEngine';
import { sampleEdgeAnchors } from '../../lib/motif/anchors';

const CANVAS_W = 800;
const CANVAS_H = 600;

// A roomy default grid host (cols/rows 12) so crossings land on-canvas and
// proportional sizing finds room — rate n:2 then keeps ~half, so PLACED and
// CANDIDATE states both appear.
function gridHost(id = 'host1') {
  return { id, name: id, patternType: 'grid', params: {} };
}

function motif(id, hostId, binding) {
  return {
    id,
    name: id,
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: createMotifParams({ hostLayerId: hostId, glyphRef: 'leaf', binding }),
  };
}

// roles:['crossing'], rate n:2 — half the crossings are rate-dropped (candidates),
// half survive and place.
const crossingBinding = { selection: { roles: ['crossing'], rate: { n: 2 } } };

function renderOverlay({ layers, selectedLayerId, onUpdateLayer = () => {}, patternInstances = {} }) {
  return render(
    <AnchorGhostOverlay
      layers={layers}
      selectedLayerId={selectedLayerId}
      canvasW={CANVAS_W}
      canvasH={CANVAS_H}
      onUpdateLayer={onUpdateLayer}
      patternInstances={patternInstances}
    />
  );
}

// ── VORONOI fixtures ────────────────────────────────────────────────────────
// A tiny synthetic diagram: 3 edges meeting at one junction J(300,300) plus a
// leaf endpoint each, and 2 cell sites. This is exactly the {drawnEdges, sites}
// shape VoronoiCells.generate() stashes as `motifHostGeometry` (world/canvas-px).
//   Crossings (first-encounter dedup over endpoints):
//     crossing:0 = J(300,300) degree-3 junction
//     crossing:1 = A(500,300) leaf     crossing:2 = B(300,100) leaf
//     crossing:3 = C(100,300) leaf
//   Sites: cell:0 (400,400), cell:1 (200,200).
// With rate {n:2} over roles:['crossing'] the eligible list [J,A,B,C] keeps
// indices 0,2 (J,B → PLACED) and drops 1,3 (A,C → CANDIDATE) — both states appear.
const J = { x: 300, y: 300 };
const voronoiGeo = {
  drawnEdges: [
    { x1: J.x, y1: J.y, x2: 500, y2: 300 },
    { x1: J.x, y1: J.y, x2: 300, y2: 100 },
    { x1: J.x, y1: J.y, x2: 100, y2: 300 },
  ],
  sites: [{ x: 400, y: 400 }, { x: 200, y: 200 }],
};

function voronoiHost(id = 'vhost') {
  return { id, name: id, patternType: 'voronoi', params: {} };
}

function voronoiInstances(hostId = 'vhost') {
  return { [hostId]: { motifHostGeometry: voronoiGeo } };
}

describe('AnchorGhostOverlay', () => {
  it('(a) renders a circle per host crossing anchor when a motif is selected', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    const dots = container.querySelectorAll('[data-anchor-id]');
    expect(dots.length).toBeGreaterThan(0);
    // The overlay ghosts ALL of the host's semantic anchors; the roles filter
    // only governs which ones the engine PLACES. Crossings must be among them.
    const crossings = [...dots].filter((d) => d.getAttribute('data-anchor-id').startsWith('crossing:'));
    expect(crossings.length).toBeGreaterThan(0);
  });

  it('(b) shows at least one placed and at least one candidate (rate n:2 skips some)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    const placed = container.querySelectorAll('[data-state="placed"]');
    const candidate = container.querySelectorAll('[data-state="candidate"]');
    expect(placed.length).toBeGreaterThan(0);
    expect(candidate.length).toBeGreaterThan(0);
  });

  it('(c) double-clicking a candidate calls onUpdateLayer with a hidden:false record for that id (#136)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const candidate = container.querySelector('[data-state="candidate"]');
    const id = candidate.getAttribute('data-anchor-id');
    fireEvent.doubleClick(candidate);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    const ov = patch.params.binding.selection.overrides;
    expect(ov.records).toContainEqual({ ref: id, hidden: false });
    expect(ov.records.filter((r) => r.ref === id)).toHaveLength(1);
  });

  it('(d) double-clicking a placed anchor calls onUpdateLayer with a hidden:true record for that id (#136)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.doubleClick(placed);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    const ov = patch.params.binding.selection.overrides;
    expect(ov.records).toContainEqual({ ref: id, hidden: true });
    expect(ov.records.filter((r) => r.ref === id)).toHaveLength(1);
  });

  it('(e) renders nothing when a NON-motif layer is selected', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: host.id });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
    expect(container.querySelectorAll('[data-anchor-id]').length).toBe(0);
  });

  it('(f) voronoi host with NO geometry (empty patternInstances) renders null — graceful first frame', () => {
    // Before p5 draws (or for a hidden host) patternInstances has no
    // motifHostGeometry for the host → the overlay renders nothing rather than
    // guessing geometry. Self-heals once the fresh instances arrive.
    const host = voronoiHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
    expect(container.querySelectorAll('[data-anchor-id]').length).toBe(0);

    // Same host but an instance entry WITHOUT motifHostGeometry — still null.
    const { container: c2 } = renderOverlay({
      layers: [host, m],
      selectedLayerId: m.id,
      patternInstances: { [host.id]: {} },
    });
    expect(c2.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('(g) voronoi host WITH geometry renders ghosts at the drawn endpoints + sites', () => {
    const host = voronoiHost();
    // roles cover both the drawn-edge-derived crossings and the site-derived
    // cells, so both geometry paths are exercised.
    const m = motif('m1', host.id, { selection: { roles: ['crossing', 'cell'], rate: { n: 2 } } });
    const { container } = renderOverlay({
      layers: [host, m],
      selectedLayerId: m.id,
      patternInstances: voronoiInstances(host.id),
    });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).not.toBeNull();

    // Crossings come from the drawn edges; the junction J is crossing:0.
    const junction = container.querySelector('[data-anchor-id="crossing:0"]');
    expect(junction).not.toBeNull();
    expect(junction.getAttribute('cx')).toBe('300');
    expect(junction.getAttribute('cy')).toBe('300');

    // A cell-role ghost sits on a supplied SITE (proves the sites path).
    const cell0 = container.querySelector('[data-anchor-id="cell:0"]');
    expect(cell0).not.toBeNull();
    expect(cell0.getAttribute('cx')).toBe('400');
    expect(cell0.getAttribute('cy')).toBe('400');
  });

  it('(h) voronoi: at least one placed and one candidate crossing (rate n:2 over J,A,B,C)', () => {
    const host = voronoiHost();
    const m = motif('m1', host.id, { selection: { roles: ['crossing'], rate: { n: 2 } } });
    const { container } = renderOverlay({
      layers: [host, m],
      selectedLayerId: m.id,
      patternInstances: voronoiInstances(host.id),
    });
    expect(container.querySelectorAll('[data-state="placed"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-state="candidate"]').length).toBeGreaterThan(0);
  });

  it('(i) voronoi quick-hide: double-clicking a candidate appends a hidden:false record (#136)', () => {
    const host = voronoiHost();
    const m = motif('m1', host.id, { selection: { roles: ['crossing'], rate: { n: 2 } } });
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({
      layers: [host, m],
      selectedLayerId: m.id,
      onUpdateLayer,
      patternInstances: voronoiInstances(host.id),
    });
    const candidate = container.querySelector('[data-state="candidate"]');
    expect(candidate).not.toBeNull();
    const id = candidate.getAttribute('data-anchor-id');
    fireEvent.doubleClick(candidate);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    const ov = patch.params.binding.selection.overrides;
    expect(ov.records).toContainEqual({ ref: id, hidden: false });
  });

  it('un-excludes a previously excluded anchor on a second double-click (toggle round-trip)', () => {
    const host = gridHost();
    // Pre-seed a LEGACY exclude override on a known placed crossing id — the
    // overlay must read it through normalizeOverrides (migrate-on-read).
    const m = motif('m1', host.id, {
      selection: {
        roles: ['crossing'],
        rate: { n: 2 },
        overrides: { include: [], exclude: ['crossing:0:0'] },
      },
    });
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const excluded = container.querySelector('[data-state="excluded"]');
    expect(excluded).not.toBeNull();
    expect(excluded.getAttribute('data-anchor-id')).toBe('crossing:0:0');
    fireEvent.doubleClick(excluded);
    const [, patch] = onUpdateLayer.mock.calls[0];
    // The bare record (no scale/angle) is dropped entirely on un-exclude.
    const ov = patch.params.binding.selection.overrides;
    expect(ov.records.some((r) => r.ref === 'crossing:0:0')).toBe(false);
  });
});

// ── #136: override RECORD model — migration-on-write + record preservation ────
// The canonical overrides shape is now `{records: [{ref, hidden?, scale?,
// angle?}], tolerance?}`. The overlay READS both shapes via normalizeOverrides
// and ALWAYS WRITES the new shape — constructing the overrides slot by
// REPLACEMENT (not deepMergeBinding), so stale legacy include/exclude keys
// cannot be merged back into the written object. The binding FORM itself never
// migrates (legacy stays legacy, chain stays chain) — only the overrides shape.
describe('AnchorGhostOverlay — override records (#136)', () => {
  it('double-clicking a dot on a LEGACY-overrides binding writes the NEW shape (no include/exclude keys), one undo', () => {
    const host = gridHost();
    const m = motif('m1', host.id, {
      selection: {
        roles: ['crossing'],
        rate: { n: 2 },
        overrides: { include: [], exclude: ['crossing:0:0'], tolerance: 4 },
      },
    });
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const candidate = container.querySelector('[data-state="candidate"]');
    const id = candidate.getAttribute('data-anchor-id');
    fireEvent.doubleClick(candidate);

    // Exactly one write → one undo entry.
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    const ov = patch.params.binding.selection.overrides;

    // NEW shape: records array present, legacy keys ABSENT (migration-on-write).
    expect(Array.isArray(ov.records)).toBe(true);
    expect('include' in ov).toBe(false);
    expect('exclude' in ov).toBe(false);
    // The pre-existing legacy exclude migrated to a hidden:true record; the
    // clicked candidate appended as a hidden:false record; tolerance carried.
    expect(ov.records).toContainEqual({ ref: 'crossing:0:0', hidden: true });
    expect(ov.records).toContainEqual({ ref: id, hidden: false });
    expect(ov.tolerance).toBe(4);
    // Legacy binding form preserved — no chain migration on an override toggle.
    expect('chain' in patch.params.binding).toBe(false);
  });

  it('un-hiding a record that carries scale KEEPS the record (scale intact, hidden field gone)', () => {
    const host = gridHost();
    // Chain-form binding whose overrides already use the record shape, with a
    // hidden record that ALSO carries a per-glyph scale.
    const chainBinding = {
      chain: [
        { type: 'route', roles: ['crossing'], pathScope: 'all' },
        { type: 'everyN', n: 2, offset: 0, continuous: true },
        { type: 'density', density: 1, seed: 1, rngMode: 'sequential' },
      ],
      placement: {},
    };
    // Find a placed id via a scratch render, then hide it WITH a scale.
    const scratch = renderOverlay({
      layers: [gridHost(), motif('mS', 'host1', chainBinding)],
      selectedLayerId: 'mS',
    });
    const placedId = scratch.container
      .querySelector('[data-state="placed"]')
      .getAttribute('data-anchor-id');

    const m = motif('m1', host.id, {
      ...chainBinding,
      overrides: { records: [{ ref: placedId, hidden: true, scale: 1.5 }] },
    });
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const excluded = container.querySelector('[data-state="excluded"]');
    expect(excluded).not.toBeNull();
    expect(excluded.getAttribute('data-anchor-id')).toBe(placedId);
    fireEvent.doubleClick(excluded);

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    // The record SURVIVES the un-hide because it still carries scale; only the
    // hidden field is removed ("rules decide" visibility again).
    const rec = nb.overrides.records.find((r) => r.ref === placedId);
    expect(rec).toEqual({ ref: placedId, scale: 1.5 });
    expect('hidden' in rec).toBe(false);
  });

  it('chain-form writes the new shape to TOP-LEVEL binding.overrides (no selection key)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, {
      chain: [
        { type: 'route', roles: ['crossing'], pathScope: 'all' },
        { type: 'everyN', n: 2, offset: 0, continuous: true },
        { type: 'density', density: 1, seed: 1, rngMode: 'sequential' },
      ],
      placement: {},
    });
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.doubleClick(placed);

    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    expect(nb.overrides.records).toContainEqual({ ref: id, hidden: true });
    expect('include' in nb.overrides).toBe(false);
    expect('exclude' in nb.overrides).toBe(false);
    expect('selection' in nb).toBe(false);
  });

  it('legacy binding writes the new shape to binding.selection.overrides (stays legacy)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.doubleClick(placed);

    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    expect(nb.selection.overrides.records).toContainEqual({ ref: id, hidden: true });
    expect('include' in nb.selection.overrides).toBe(false);
    expect('exclude' in nb.selection.overrides).toBe(false);
    expect('chain' in nb).toBe(false);
    // The rest of the selection rules survive the replacement write untouched.
    expect(nb.selection.roles).toEqual(['crossing']);
  });
});

// ── D-slice: CHAIN-FORM semantic motif overrides (issue #79) ──────────────────
// A chain-form SEMANTIC motif (starter chip on a grid host, or a semantic motif
// upgraded in the rack) stores its selection as `binding.chain` and drops
// `binding.selection` (C1 mutual-exclusivity). Its overrides live TOP-LEVEL at
// `binding.overrides` — the SAME slot the render seam (MotifPattern.js:111) reads.
// The overlay must READ overrides/roles + placements shape-aware, and WRITE the
// toggle to `binding.overrides` WITHOUT resurrecting `selection` and WITHOUT
// forcing a legacy binding into chain-form.
describe('AnchorGhostOverlay — chain-form semantic overrides (D)', () => {
  // The EXACT compiled form of `crossingBinding` (roles crossing, rate n:2). The
  // compileSelectionToChain byte-identity contract guarantees this renders the
  // same survivors/placed set as the legacy binding — that parity is the proof
  // the placement swap is wired to the real render path.
  const chainCrossingBinding = {
    chain: [
      { type: 'route', roles: ['crossing'], pathScope: 'all' },
      { type: 'everyN', n: 2, offset: 0, continuous: true },
      { type: 'density', density: 1, seed: 1, rngMode: 'sequential' },
    ],
    placement: {},
  };

  // Recompute anchors exactly as the overlay does (formula host, params-only),
  // so we can run the real render seam against a toggled binding.
  function gridAnchors(host) {
    return getSemanticAnchors(host.patternType, host.params, CANVAS_W, CANVAS_H, {
      hostSeed: host.seed,
    });
  }

  it('renders placed + candidate for a chain-form binding (chain path drives placement)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, chainCrossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    expect(container.querySelectorAll('[data-state="placed"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-state="candidate"]').length).toBeGreaterThan(0);
  });

  it('placement parity: chain-form placed set === legacy placed set (target #4)', () => {
    const host = gridHost();
    const legacyM = motif('mL', host.id, crossingBinding);
    const chainM = motif('mC', host.id, chainCrossingBinding);
    const { container: cL } = renderOverlay({ layers: [host, legacyM], selectedLayerId: legacyM.id });
    const { container: cC } = renderOverlay({ layers: [host, chainM], selectedLayerId: chainM.id });
    const placedIds = (c) =>
      new Set(
        [...c.querySelectorAll('[data-state="placed"]')].map((d) => d.getAttribute('data-anchor-id'))
      );
    const legacyPlaced = placedIds(cL);
    const chainPlaced = placedIds(cC);
    expect(chainPlaced.size).toBeGreaterThan(0);
    expect([...chainPlaced].sort()).toEqual([...legacyPlaced].sort());
  });

  it('excluding a placed anchor writes binding.overrides (NOT selection), no selection key, one undo (targets #1/#3/#5)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, chainCrossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.doubleClick(placed);

    // One undo entry.
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    const nb = patch.params.binding;

    // Written to TOP-LEVEL binding.overrides; NO selection resurrection (C1).
    // #136: the write is the RECORD shape — a hidden:true record, no legacy keys.
    expect(nb.overrides.records).toContainEqual({ ref: id, hidden: true });
    expect(nb.overrides.records.filter((r) => r.ref === id)).toHaveLength(1);
    expect('selection' in nb).toBe(false);
    // chain preserved verbatim (not rewritten by an override toggle).
    expect(nb.chain).toBe(chainCrossingBinding.chain);

    // RENDER SEAM honors it: the toggled id is absent from survivors (target #1 —
    // effect, not payload shape). Runs the exact path MotifPattern.js:108 uses.
    const anchors = gridAnchors(host);
    const { survivors } = resolveSelection(nb, anchors, { overrides: nb.overrides });
    expect(survivors.map((a) => a.id)).not.toContain(id);
  });

  it('including a candidate writes a hidden:false record + render seam adds it (target #1)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, chainCrossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const candidate = container.querySelector('[data-state="candidate"]');
    const id = candidate.getAttribute('data-anchor-id');
    fireEvent.doubleClick(candidate);

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    expect(nb.overrides.records).toContainEqual({ ref: id, hidden: false });
    expect('selection' in nb).toBe(false);

    const anchors = gridAnchors(host);
    const { survivors } = resolveSelection(nb, anchors, { overrides: nb.overrides });
    expect(survivors.map((a) => a.id)).toContain(id);
  });

  it('round-trip: exclude → un-exclude restores (chain-form)', () => {
    const host = gridHost();
    // Pre-seed an exclude override at top-level binding.overrides on a placed id.
    const seeded = {
      chain: chainCrossingBinding.chain,
      overrides: { include: [], exclude: [] },
      placement: {},
    };
    // Find a placed id first via a scratch render.
    const scratch = renderOverlay({ layers: [host, motif('mS', host.id, chainCrossingBinding)], selectedLayerId: 'mS' });
    const placedId = scratch.container.querySelector('[data-state="placed"]').getAttribute('data-anchor-id');
    seeded.overrides.exclude = [placedId];

    const m = motif('m1', host.id, seeded);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const excluded = container.querySelector('[data-state="excluded"]');
    expect(excluded).not.toBeNull();
    expect(excluded.getAttribute('data-anchor-id')).toBe(placedId);
    fireEvent.doubleClick(excluded);
    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    // #136: un-exclude drops the bare record entirely (no scale/angle to keep).
    expect(nb.overrides.records.some((r) => r.ref === placedId)).toBe(false);
    expect('selection' in nb).toBe(false);
  });

  it('LEGACY binding stays legacy: toggle writes selection.overrides, NO chain key added (no forced migration, target #2)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.doubleClick(placed);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const nb = onUpdateLayer.mock.calls[0][1].params.binding;
    expect(nb.selection.overrides.records).toContainEqual({ ref: id, hidden: true });
    expect('chain' in nb).toBe(false); // legacy stays legacy — no migration
  });
});

// ── C4: edge-host path picker (issue #79) ─────────────────────────────────────
// An EDGE host (flowfield/wave/…) has no semantic extractor, so its ghost dots
// come from the SAME hostPaths capture the render uses — surfaced by useCanvas on
// the drawn instance as motifHostGeometry.hostPaths. The overlay resamples them
// with the motif's edgeOpts and renders a CLICKABLE path picker, but ONLY when
// THIS motif's Route card is armed (motifPick names it).
describe('AnchorGhostOverlay — edge-host path picker (C4)', () => {
  function flowHost(id = 'fh') {
    return { id, name: id, patternType: 'flowfield', params: {} };
  }

  // Two straight horizontal paths → sampleEdgeAnchors({spacing:24}) yields
  // several anchors per path, each carrying meta.pathIndex 0 or 1.
  const hostPaths = [
    { points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], closed: false },
    { points: [{ x: 0, y: 300 }, { x: 200, y: 300 }], closed: false },
  ];

  function pickMotif(id, hostId, pickedPaths = []) {
    return motif(id, hostId, {
      chain: [{ type: 'route', roles: ['edge'], pathScope: 'picked', pickedPaths }],
      placement: {},
    });
  }

  function renderPick({ layers, selectedLayerId, motifPick, onTogglePickedPath = () => {}, patternInstances }) {
    return render(
      <AnchorGhostOverlay
        layers={layers}
        selectedLayerId={selectedLayerId}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
        onUpdateLayer={() => {}}
        patternInstances={patternInstances}
        motifPick={motifPick}
        onTogglePickedPath={onTogglePickedPath}
      />
    );
  }

  const instancesWithPaths = (hostId) => ({
    [hostId]: { motifHostGeometry: { hostPaths } },
  });

  // #141 re-spec: an UNARMED edge host now renders the per-glyph override
  // overlay — but PLACED-ONLY, and this fixture's pathScope:'picked' with an
  // empty pickedPaths places nothing. So the "nothing on screen" this locks is
  // now the EMPTY-STATE rule (zero glyphs ⇒ zero dots), not "edge hosts are
  // unreachable unarmed". See the #141 describe below for the placed case.
  it('renders NOTHING when not armed and nothing is placed (empty state)', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id);
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      motifPick: null,
      patternInstances: instancesWithPaths(host.id),
    });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('when armed, renders edge-ghost dots that CARRY meta.pathIndex', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id);
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      motifPick: { layerId: m.id, blockIndex: 0 },
      patternInstances: instancesWithPaths(host.id),
    });
    const svg = container.querySelector('[data-testid="anchor-ghost-overlay"]');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-mode')).toBe('pick');
    const dots = container.querySelectorAll('circle[data-path-index]');
    expect(dots.length).toBeGreaterThan(0);
    // Both paths represented.
    const pis = new Set([...dots].map((d) => d.getAttribute('data-path-index')));
    expect(pis.has('0')).toBe(true);
    expect(pis.has('1')).toBe(true);
  });

  it('clicking a dot toggles THAT dot\'s pathIndex (never touches selection.overrides)', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id);
    const onTogglePickedPath = vi.fn();
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      motifPick: { layerId: m.id, blockIndex: 0 },
      onTogglePickedPath,
      patternInstances: instancesWithPaths(host.id),
    });
    const dotOnPath1 = container.querySelector('circle[data-path-index="1"]');
    fireEvent.pointerDown(dotOnPath1);
    expect(onTogglePickedPath).toHaveBeenCalledWith(1);
  });

  it('dots on a picked path render highlighted (data-picked=true)', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id, [0]); // path 0 already picked
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      motifPick: { layerId: m.id, blockIndex: 0 },
      patternInstances: instancesWithPaths(host.id),
    });
    const path0 = container.querySelectorAll('circle[data-path-index="0"]');
    const path1 = container.querySelectorAll('circle[data-path-index="1"]');
    expect([...path0].every((d) => d.getAttribute('data-picked') === 'true')).toBe(true);
    expect([...path1].every((d) => d.getAttribute('data-picked') === 'false')).toBe(true);
  });

  it('renders nothing when armed but hostPaths have not been captured yet (graceful)', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id);
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      motifPick: { layerId: m.id, blockIndex: 0 },
      patternInstances: {}, // no capture
    });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('pick mode works when the HOST is selected (the Route card lives in the host inspector)', () => {
    const host = flowHost();
    const m = pickMotif('m1', host.id);
    const { container } = renderPick({
      layers: [host, m],
      // The HOST is selected (arming happens from the host's Motif device), NOT
      // the motif — the armed motifPick must still drive the picker.
      selectedLayerId: host.id,
      motifPick: { layerId: m.id, blockIndex: 0 },
      patternInstances: instancesWithPaths(host.id),
    });
    const svg = container.querySelector('[data-testid="anchor-ghost-overlay"]');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-mode')).toBe('pick');
    expect(container.querySelectorAll('circle[data-path-index]').length).toBeGreaterThan(0);
  });

  it('a semantic host ignores motifPick (still renders the override overlay, no pick mode)', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderPick({
      layers: [host, m],
      selectedLayerId: m.id,
      // A stray pick target must not switch a semantic host into pick mode.
      motifPick: { layerId: m.id, blockIndex: 0 },
      patternInstances: {},
    });
    const svg = container.querySelector('[data-testid="anchor-ghost-overlay"]');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-mode')).not.toBe('pick');
  });
});

// ── #141: per-glyph overrides on an EDGE host (unarmed) ─────────────────────
// #139 scoped the override overlay to SEMANTIC hosts; on flowfield/wave/… the
// only edge affordance was the pick-armed picker above, so "hide the scaffold,
// keep the ornament" had no per-glyph editing at all. #141 opens the unarmed
// edge path. The settled shape:
//   • PLACED-ONLY dots — a dense flowfield emits thousands of samples but only
//     the glyphs that actually drew are editable (force-show is knowingly
//     unavailable here; the candidate field is the clutter #139 refused).
//   • DISPLAY = placed ∪ every record's anchor, so hiding a glyph (which
//     un-places it) can never strand its dot off-canvas.
//   • Armed still means the picker, verbatim; unarmed means override.
describe('AnchorGhostOverlay — per-glyph overrides on an EDGE host (#141)', () => {
  const flowHost = (id = 'fh') => ({ id, name: id, patternType: 'flowfield', params: {} });
  // Two long straight paths — at the motif default spacing 24 each yields
  // enough samples that a rate:{n:2} drop is unambiguously observable.
  const hostPaths = [
    { points: [{ x: 20, y: 100 }, { x: 620, y: 100 }], closed: false },
    { points: [{ x: 20, y: 300 }, { x: 620, y: 300 }], closed: false },
  ];
  const instances = (hostId = 'fh') => ({ [hostId]: { motifHostGeometry: { hostPaths } } });
  const sampled = () => sampleEdgeAnchors(hostPaths, { spacing: 24 });

  // rate n:2 keeps every other anchor, so PLACED is a strict subset of sampled
  // — that gap is what proves "placed-only" rather than "all anchors".
  const edgeMotif = (id, hostId, selection = {}) =>
    motif(id, hostId, { selection: { roles: ['edge'], rate: { n: 2 }, ...selection } });

  const renderEdge = ({ layers, selectedLayerId, onUpdateLayer = () => {}, motifPick = null }) =>
    render(
      <AnchorGhostOverlay
        layers={layers}
        selectedLayerId={selectedLayerId}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
        onUpdateLayer={onUpdateLayer}
        patternInstances={instances(layers[0].id)}
        motifPick={motifPick}
      />
    );

  const popover = () => document.querySelector('[data-testid="glyph-popover"]');

  it('an unarmed edge-host selection renders the OVERRIDE overlay, not the picker', () => {
    const host = flowHost();
    const m = edgeMotif('m1', host.id);
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    const svg = container.querySelector('[data-testid="anchor-ghost-overlay"]');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-mode')).toBe('override');
    const dots = container.querySelectorAll('circle[data-anchor-id]');
    expect(dots.length).toBeGreaterThan(0);
    expect([...dots].every((d) => d.getAttribute('data-anchor-id').startsWith('edge:'))).toBe(true);
  });

  it('draws a dot ONLY where a glyph is placed — rate-dropped samples get none', () => {
    const host = flowHost();
    const m = edgeMotif('m1', host.id);
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    const dots = [...container.querySelectorAll('circle[data-anchor-id]')];
    expect(dots.length).toBeGreaterThan(0);
    // Strictly fewer dots than samples, and every one of them is a real glyph.
    expect(dots.length).toBeLessThan(sampled().length);
    expect(dots.every((d) => d.getAttribute('data-state') === 'placed')).toBe(true);
  });

  it('un-bakes stale semantic roles — a binding still saying crossing still shows glyphs', () => {
    // The render coerces non-edge route roles to ['edge'] in edge mode
    // (coerceEdgeRoles); without the same coercion here the overlay would filter
    // every anchor out and silently draw nothing while the canvas is full of
    // glyphs. This is the parity assertion.
    const host = flowHost();
    const m = edgeMotif('m1', host.id, { roles: ['crossing'] });
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    expect(container.querySelectorAll('circle[data-state="placed"]').length).toBeGreaterThan(0);
  });

  it('a HIDDEN glyph keeps its dot (excluded) so the hide is reversible from the canvas', () => {
    // Placed-only has a trap: hiding un-places, so a naive placed-only display
    // would delete the only affordance that could un-hide it.
    const host = flowHost();
    const probe = renderEdge({ layers: [host, edgeMotif('m0', host.id)], selectedLayerId: 'm0' });
    const hiddenId = probe.container
      .querySelector('circle[data-state="placed"]')
      .getAttribute('data-anchor-id');
    probe.unmount();

    const m = edgeMotif('m1', host.id, {
      overrides: { records: [{ ref: hiddenId, hidden: true }] },
    });
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    const dot = container.querySelector(`circle[data-anchor-id="${hiddenId}"]`);
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('data-state')).toBe('excluded');
  });

  it('a scale/angle-only record keeps its dot even once the rules stop placing it', () => {
    // display = placed ∪ refs(records): an edited glyph can never become
    // unreachable, so Reset stays available from the canvas. It reads as a
    // CANDIDATE (not placed, not overridden-hidden) — the one state besides
    // placed/excluded an edge host can show, and the one narrow case where
    // force-show IS reachable there: its popover eye writes hidden:false.
    const host = flowHost();
    const strandedId = 'edge:0:1'; // rate n:2 drops the odd samples
    const m = edgeMotif('m1', host.id, {
      overrides: { records: [{ ref: strandedId, scale: 1.4 }] },
    });
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    const dot = container.querySelector(`circle[data-anchor-id="${strandedId}"]`);
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('data-state')).toBe('candidate');
  });

  it('a SINGLE-AXIS grid takes the same unarmed edge path (params-aware host kind)', () => {
    // The only host whose edge-ness comes from PARAMS rather than patternType,
    // and the only edge host that is ALSO in the semantic MOTIF_HOSTS set — so
    // the anchors memo's `!edgeMode && MOTIF_HOSTS.has(...)` ordering is
    // load-bearing here and nowhere else. Wrong order ⇒ the semantic extractor's
    // 2 tip dots per line instead of dots ALONG each line, and every flowfield
    // test above still passes.
    const host = {
      id: 'fh', // matches instances() keying
      name: 'grid',
      patternType: 'grid',
      params: { drawVertical: 1, drawHorizontal: 0 }, // columns only
    };
    const m = edgeMotif('m1', host.id);
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    const svg = container.querySelector('[data-testid="anchor-ghost-overlay"]');
    expect(svg.getAttribute('data-mode')).toBe('override');
    const dots = [...container.querySelectorAll('circle[data-anchor-id]')];
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.every((d) => d.getAttribute('data-anchor-id').startsWith('edge:'))).toBe(true);
  });

  it('double-clicking a placed edge dot writes hidden:true for that edge id', () => {
    const host = flowHost();
    const m = edgeMotif('m1', host.id);
    const onUpdateLayer = vi.fn();
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const dot = container.querySelector('circle[data-state="placed"]');
    const id = dot.getAttribute('data-anchor-id');
    fireEvent.doubleClick(dot);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection.overrides.records[0]).toEqual({ ref: id, hidden: true });
  });

  it('clicking a placed edge dot opens the per-glyph popover', () => {
    const host = flowHost();
    const m = edgeMotif('m1', host.id);
    const { container } = renderEdge({ layers: [host, m], selectedLayerId: m.id });
    expect(popover()).toBeNull();
    fireEvent.click(container.querySelector('circle[data-state="placed"]'));
    expect(popover()).not.toBeNull();
  });

  it('arming pick swaps to the picker and CLOSES an open popover (it never resurrects)', () => {
    const host = flowHost();
    const m = edgeMotif('m1', host.id);
    const props = (motifPick) => ({
      layers: [host, m],
      selectedLayerId: m.id,
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      onUpdateLayer: () => {},
      patternInstances: instances(host.id),
      motifPick,
    });
    const { container, rerender } = render(<AnchorGhostOverlay {...props(null)} />);
    fireEvent.click(container.querySelector('circle[data-state="placed"]'));
    expect(popover()).not.toBeNull();

    rerender(<AnchorGhostOverlay {...props({ layerId: m.id, blockIndex: 0 })} />);
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]').getAttribute('data-mode'))
      .toBe('pick');
    expect(popover()).toBeNull();

    rerender(<AnchorGhostOverlay {...props(null)} />);
    expect(popover()).toBeNull(); // disarming must not bring the old card back
  });
});

// ── #139: the click / double-click gesture and the popover it opens ─────────
describe('AnchorGhostOverlay — per-glyph popover gesture (#139)', () => {
  const setup = (onUpdateLayer = () => {}) => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const api = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const dot = api.container.querySelector('circle[data-state="placed"]');
    return { ...api, dot, motifId: m.id };
  };

  const popover = () => document.querySelector('[data-testid="glyph-popover"]');

  it('a single click opens the popover and mutates nothing', () => {
    const onUpdateLayer = vi.fn();
    const { dot } = setup(onUpdateLayer);
    expect(popover()).toBeNull();
    fireEvent.click(dot);
    expect(popover()).not.toBeNull();
    expect(onUpdateLayer).not.toHaveBeenCalled();
  });

  it('a second click on the SAME dot is idempotent — the popover stays open', () => {
    // Load-bearing: a double-click delivers two clicks BEFORE dblclick fires, and
    // the spec requires the popover to stay up while the eye flips. A toggle here
    // would close it on the way to the quick-hide.
    const { dot } = setup();
    fireEvent.click(dot);
    fireEvent.click(dot);
    expect(popover()).not.toBeNull();
  });

  it('a double-click hides the glyph AND leaves the popover open', () => {
    const onUpdateLayer = vi.fn();
    const { dot, motifId } = setup(onUpdateLayer);
    fireEvent.click(dot);
    fireEvent.doubleClick(dot);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe(motifId);
    expect(patch.params.binding.selection.overrides.records[0]).toMatchObject({ hidden: true });
    expect(popover()).not.toBeNull();
  });

  it('seeds scale at 1× and angle at the glyph RESOLVED rotation, not zero', () => {
    // Charting decision 3: the radial initializes at the current resolved
    // rotation so opening the card never jumps the glyph.
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    const dot = container.querySelector('circle[data-state="placed"]');
    const anchorId = dot.getAttribute('data-anchor-id');
    // Mirror the overlay's own pipeline so the expectation is the real resolved
    // rotation rather than a number copied from a fixture.
    const anchors = getSemanticAnchors(host.patternType, host.params, CANVAS_W, CANVAS_H, {
      hostSeed: host.seed,
    });
    const { survivors, sequence } = resolveSelection(m.params.binding, anchors, {
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
    });
    const { placements } = resolvePlacements(
      survivors,
      { ...(m.params.binding.placement || {}), ...(sequence ? { sequence } : {}) },
      { boundary: { type: 'rect', width: CANVAS_W, height: CANVAS_H } }
    );
    const placement = placements.find((p) => p.anchorId === anchorId);
    expect(placement).toBeTruthy();
    expect(placement.rotation).toBeTypeOf('number');

    fireEvent.click(dot);
    expect(
      document.querySelector('[data-testid="glyph-popover-dial"]').getAttribute('aria-valuenow')
    ).toBe(String(placement.rotation));
    expect(
      document.querySelector('[data-testid="glyph-popover-scale"]').getAttribute('aria-valuenow')
    ).toBe('1');
  });

  // The integration test in recordSites.integration.test.jsx proves the
  // flush-write-flush pattern yields exactly one undo entry per gesture against
  // the real history engine. These close the loop: the overlay actually uses it.
  it('brackets a discrete edit with a history flush on both sides', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onFlushHistory = vi.fn();
    const onUpdateLayer = vi.fn();
    const { container } = render(
      <AnchorGhostOverlay
        layers={[host, m]}
        selectedLayerId={m.id}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
        onUpdateLayer={onUpdateLayer}
        onFlushHistory={onFlushHistory}
      />
    );
    fireEvent.doubleClick(container.querySelector('circle[data-state="placed"]'));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    // Once BEFORE (so a preceding Inspector burst on the same layer cannot
    // swallow it) and once AFTER (so the next gesture is its own entry).
    expect(onFlushHistory).toHaveBeenCalledTimes(2);
  });

  it('does NOT flush for a no-op edit — no phantom entry', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onFlushHistory = vi.fn();
    const { container } = render(
      <AnchorGhostOverlay
        layers={[host, m]}
        selectedLayerId={m.id}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
        onFlushHistory={onFlushHistory}
      />
    );
    fireEvent.click(container.querySelector('circle[data-state="placed"]'));
    expect(onFlushHistory).not.toHaveBeenCalled(); // opening a popover edits nothing
  });

  it('an existing record OVERRIDES the resolved seed', () => {
    const host = gridHost();
    const plain = motif('m1', host.id, crossingBinding);
    const probe = renderOverlay({ layers: [host, plain], selectedLayerId: plain.id });
    const anchorId = probe.container
      .querySelector('circle[data-state="placed"]')
      .getAttribute('data-anchor-id');
    probe.unmount();

    const withRecord = motif('m1', host.id, {
      selection: {
        ...crossingBinding.selection,
        overrides: { records: [{ ref: anchorId, scale: 2, angle: 137 }] },
      },
    });
    const { container } = renderOverlay({
      layers: [host, withRecord],
      selectedLayerId: withRecord.id,
    });
    fireEvent.click(container.querySelector(`circle[data-anchor-id="${anchorId}"]`));
    expect(
      document.querySelector('[data-testid="glyph-popover-dial"]').getAttribute('aria-valuenow')
    ).toBe('137');
    expect(
      document.querySelector('[data-testid="glyph-popover-scale"]').getAttribute('aria-valuenow')
    ).toBe('2');
  });
});
