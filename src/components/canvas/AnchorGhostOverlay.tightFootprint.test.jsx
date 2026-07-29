// @vitest-environment jsdom
// The overlay under the TIGHT packing law (#206, ruling 7f).
//
// WHY THIS EXISTS WHEN THE PRD EXCLUDES THE OVERLAY FROM ASSERTION. Nothing
// here pins a ring radius, a centre or an element count — the ring geometry is
// asserted headlessly in `footprintScope.test.js`, where it is arithmetic. What
// this asserts is that the overlay SURVIVES, and it is a live crash rather than
// a hypothetical: `resolvePlacements` THROWS in `'tight'` mode when no glyph is
// threaded (placementEngine.js `normalisedFootprint`, ruling 7d — a layer must
// never be packed by the law the user opted out of), and this overlay
// re-resolves the whole placement pipeline on every reveal. Before #206 it
// called the engine with `{boundary, overrideRecords}` and no glyph at all, so
// the moment #207 flips the default this render path died — taking the canvas
// with it, from a hover.
//
// TWO throw sites, and both are reachable from here:
//   • no glyph at all — a custom glyph the overlay cannot resolve (see the
//     `customGlyphs` note below);
//   • a glyph with no MEASURED footprint — an SVG imported before #202 taught
//     `importMotif` to measure one.
// The engine is right to throw at both. The overlay is right to degrade: it is
// a hover diagnostic, and the render path (MotifPattern) reports the same
// document loudly on its own.

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  FootprintRevealProvider,
  useFootprintRevealTrigger,
} from '../shell/footprintRevealContext';
import AnchorGhostOverlay from './AnchorGhostOverlay';
import { MOTIF_TYPE, createMotifParams } from '../../lib/motif/motifLayer';

const CANVAS_W = 800;
const CANVAS_H = 600;

const host = { id: 'host1', name: 'host1', patternType: 'grid', params: {} };

const motifWith = (sizing, glyphRef = 'leaf') => ({
  id: 'm1',
  name: 'm1',
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: createMotifParams({
    hostLayerId: host.id,
    glyphRef,
    binding: {
      chain: [{ type: 'route', roles: ['crossing'], pathScope: 'all' }],
      // Big enough that packing genuinely binds, so the placements carry real
      // caps rather than every glyph reaching its natural target.
      placement: { sizing: { mode: 'proportional', size: 60, margin: 0.85, min: 1, ...sizing } },
    },
  }),
});

// Layer Size's scope (#192) as a bare trigger — the cheapest way to raise the
// reveal on a motif that is NOT the selected layer, which is the app's real
// state while a size control is being dragged in the host's inspector.
function LayerScopeTrigger() {
  const fp = useFootprintRevealTrigger({ kind: 'layer', layerId: 'm1' });
  return <div data-testid="layer-row" {...fp.pointerProps} />;
}

function Harness({ motif, customGlyphs = {} }) {
  return (
    <FootprintRevealProvider>
      <LayerScopeTrigger />
      <AnchorGhostOverlay
        layers={[host, motif]}
        selectedLayerId={host.id}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
        customGlyphs={customGlyphs}
      />
    </FootprintRevealProvider>
  );
}

const overlay = (c) => c.querySelector('[data-testid="motif-footprint-overlay"]');
const raise = (c) => fireEvent.pointerEnter(c.querySelector('[data-testid="layer-row"]'));

// A glyph with no MEASURED footprint — the pre-#202 imported-SVG shape.
const UNMEASURED = { id: 'raw', paths: [{ d: 'M0 0 L10 0 L10 10' }], viewRadius: 10 };

describe('AnchorGhostOverlay under the tight packing law', () => {
  it('rings a `tight` layer instead of throwing — the glyph is threaded', () => {
    // THE REGRESSION. With no glyph on `opts`, this render threw before the
    // reveal ever painted, so the assertion that matters is that we get here
    // at all; the ring count is the same one the root law draws.
    const { container } = render(<Harness motif={motifWith({ footprint: 'tight' })} />);
    raise(container);
    expect(overlay(container)).not.toBeNull();
    expect(overlay(container).querySelectorAll('[data-ring="packed"]').length).toBeGreaterThan(0);
  });

  it('still rings a `root` layer exactly as before', () => {
    const { container } = render(<Harness motif={motifWith({})} />);
    raise(container);
    expect(overlay(container).querySelectorAll('[data-ring="packed"]').length).toBeGreaterThan(0);
  });

  it('threads a SEQUENCED layer’s per-slot glyphs, not just the base one', () => {
    // The engine resolves a sequenced slot's glyph through `glyphMap` and falls
    // back to the base; an overlay that passes only the base would throw on any
    // slot whose glyph is not the layer's own.
    const motif = motifWith({ footprint: 'tight' });
    motif.params.binding.chain.push({
      type: 'sequence',
      mode: 'cycle',
      seed: 1,
      slots: [{ glyphRef: 'rosette' }, { glyphRef: 'star' }],
    });
    const { container } = render(<Harness motif={motif} />);
    raise(container);
    expect(overlay(container)).not.toBeNull();
  });

  it('degrades to no rings on a glyph carrying no measured footprint', () => {
    // The engine's SECOND throw site. Loud there, quiet here — the overlay must
    // not be the thing that takes the canvas down over a stale import.
    const { container } = render(
      <Harness motif={motifWith({ footprint: 'tight' }, 'raw')} customGlyphs={{ raw: UNMEASURED }} />
    );
    raise(container);
    expect(overlay(container)).toBeNull();
  });

  it('degrades to no rings when the glyph cannot be resolved at all', () => {
    // A custom glyph with no `customGlyphs` reaching this overlay — today's
    // wiring exactly, since RightPanel passes the store to `useCanvas` and not
    // to here. The engine's FIRST throw site.
    const { container } = render(<Harness motif={motifWith({ footprint: 'tight' }, 'raw')} />);
    raise(container);
    expect(overlay(container)).toBeNull();
  });

  it('leaves the ghost-dot overlay alive when the reveal cannot resolve', () => {
    // The degrade must be scoped to the rings. With the motif SELECTED, the
    // editable dot field is the surface the user is working through, and losing
    // it would take per-glyph overrides with it.
    const motif = motifWith({ footprint: 'tight' }, 'raw');
    const { container } = render(
      <FootprintRevealProvider>
        <AnchorGhostOverlay
          layers={[host, motif]}
          selectedLayerId={motif.id}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
        />
      </FootprintRevealProvider>
    );
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).not.toBeNull();
  });
});
