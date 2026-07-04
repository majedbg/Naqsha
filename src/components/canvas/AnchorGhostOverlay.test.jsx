// @vitest-environment jsdom
// AnchorGhostOverlay — the motif anchor-ghost overlay + click-to-override.
//
// jsdom has no layout, but the ghost dots don't need it: semantic anchors come
// from the PURE getSemanticAnchors (params-only math), so every <circle> renders
// with a real cx/cy. We therefore assert on data-anchor-id / data-state presence
// and on the onUpdateLayer payload — never on pixel positions.

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

function renderOverlay({ layers, selectedLayerId, onUpdateLayer = () => {} }) {
  return render(
    <AnchorGhostOverlay
      layers={layers}
      selectedLayerId={selectedLayerId}
      canvasW={CANVAS_W}
      canvasH={CANVAS_H}
      onUpdateLayer={onUpdateLayer}
    />
  );
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

  it('(f) renders nothing for a voronoi-host motif (deferred)', () => {
    const host = { id: 'vhost', name: 'vhost', patternType: 'voronoi', params: {} };
    const m = motif('m1', host.id, crossingBinding);
    const { container } = renderOverlay({ layers: [host, m], selectedLayerId: m.id });
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
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
