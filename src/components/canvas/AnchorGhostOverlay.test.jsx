// @vitest-environment jsdom
// AnchorGhostOverlay — the motif anchor-ghost overlay + click-to-override.
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

  it('(c) clicking a candidate calls onUpdateLayer with that id in overrides.include', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const candidate = container.querySelector('[data-state="candidate"]');
    const id = candidate.getAttribute('data-anchor-id');
    fireEvent.pointerDown(candidate);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    expect(patch.params.binding.selection.overrides.include).toContain(id);
    expect(patch.params.binding.selection.overrides.exclude).not.toContain(id);
  });

  it('(d) clicking a placed anchor calls onUpdateLayer with that id in overrides.exclude', () => {
    const host = gridHost();
    const m = motif('m1', host.id, crossingBinding);
    const onUpdateLayer = vi.fn();
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id, onUpdateLayer });
    const placed = container.querySelector('[data-state="placed"]');
    const id = placed.getAttribute('data-anchor-id');
    fireEvent.pointerDown(placed);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection.overrides.exclude).toContain(id);
    expect(patch.params.binding.selection.overrides.include).not.toContain(id);
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

  it('(i) voronoi click-to-override: pointerdown a candidate appends its id to overrides.include', () => {
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
    fireEvent.pointerDown(candidate);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [layerId, patch] = onUpdateLayer.mock.calls[0];
    expect(layerId).toBe('m1');
    expect(patch.params.binding.selection.overrides.include).toContain(id);
    expect(patch.params.binding.selection.overrides.exclude).not.toContain(id);
  });

  it('un-excludes a previously excluded anchor on a second click (toggle round-trip)', () => {
    const host = gridHost();
    // Pre-seed an exclude override on a known placed crossing id.
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
    fireEvent.pointerDown(excluded);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.binding.selection.overrides.exclude).not.toContain('crossing:0:0');
  });
});
