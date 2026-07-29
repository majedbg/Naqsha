// @vitest-environment jsdom
// The `hold` row raises the FOOTPRINT OVERLAY, and only that (#189).
//
// WHY THIS EXISTS WHEN THE PRD EXCLUDES THE OVERLAY FROM ASSERTION. The
// exclusion is about the rendered SVG — ring radii, stroke widths, dash arrays,
// element counts — all presentation expected to move at review, and pinning it
// would encode exactly what is meant to change. Nothing here touches any of
// that. What it asserts is WIRING, and the wiring has two documented ways to
// fail SILENTLY OFF, both of which look identical to "the overlay was never
// built" and neither of which any unit test can see:
//
//   1. `pointerProps` spread onto `DragNumber` instead of a DOM element.
//      DragNumber does not forward unknown props, so the reveal simply never
//      raises (footprintRevealContext.js says so and cannot enforce it).
//   2. The overlay cannot FIND the motif. The slot card lives in the
//      MotifDevice, which the Inspector renders on the HOST layer and refuses
//      outright on a motif layer (Inspector.jsx:984) — so while a `hold` row is
//      hoverable, NO motif is selected and the overlay's render gate returns
//      null. `scope.layerId` is a second SELECTOR, not merely a filter. That is
//      the whole reason `revealMotif` exists, and it is written down nowhere in
//      the issue or the spec.
//
// So the layers are wired as the app wires them: the rack rendered for the
// motif, the overlay told the HOST is selected. Presence/absence only.

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FootprintRevealProvider } from '../shell/footprintRevealContext';
import MotifBlockRack from '../shell/MotifBlockRack';
import AnchorGhostOverlay from './AnchorGhostOverlay';
import { MOTIF_TYPE, createMotifParams } from '../../lib/motif/motifLayer';

const CANVAS_W = 800;
const CANVAS_H = 600;

// Two slots so "only the hovered one" is a question that can be asked at all.
const chain = [
  { type: 'route', roles: ['crossing'], pathScope: 'all' },
  {
    type: 'sequence',
    mode: 'cycle',
    seed: 1,
    slots: [{ glyphRef: 'leaf', hold: 0.5 }, { glyphRef: 'leaf' }],
  },
];

const host = { id: 'host1', name: 'host1', patternType: 'grid', params: {} };
const motif = {
  id: 'm1',
  name: 'm1',
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: createMotifParams({
    hostLayerId: host.id,
    glyphRef: 'leaf',
    // A size large enough that packing genuinely binds, so the placements
    // carry real caps rather than every glyph reaching its natural target.
    binding: {
      chain,
      placement: { sizing: { mode: 'proportional', size: 60, margin: 0.85, min: 1 } },
    },
  }),
};

function Harness() {
  return (
    <FootprintRevealProvider>
      <MotifBlockRack
        chain={chain}
        layerId="m1"
        onEditChain={() => {}}
        hostIsSemantic
        hostPatternType="grid"
        hostParams={{}}
        customGlyphs={{}}
        baseGlyphRef="leaf"
        onEditSlotGlyph={() => {}}
      />
      {/* The HOST is the selected layer — that is the app's real state while a
          slot card is on screen, and the case that used to render nothing. */}
      <AnchorGhostOverlay
        layers={[host, motif]}
        selectedLayerId={host.id}
        canvasW={CANVAS_W}
        canvasH={CANVAS_H}
      />
    </FootprintRevealProvider>
  );
}

const overlay = (c) => c.querySelector('[data-testid="motif-footprint-overlay"]');
const ringedIds = (c) =>
  [...overlay(c).querySelectorAll('g[data-anchor-id]')].map((g) => g.getAttribute('data-anchor-id'));
// The `hold` DragNumber's row wrapper — the element `pointerProps` must be on.
const holdRows = (c) =>
  [...c.querySelectorAll('[data-testid="motif-slot-hold"]')].map((el) => el.parentElement);

describe('AnchorGhostOverlay — the footprint reveal', () => {
  it('is absent at rest, and hovering a `hold` row raises it', () => {
    const { container } = render(<Harness />);
    expect(overlay(container)).toBeNull();

    fireEvent.pointerEnter(holdRows(container)[0]);
    expect(overlay(container)).not.toBeNull();
    expect(ringedIds(container).length).toBeGreaterThan(0);
  });

  it('does NOT drag the ghost-dot field up with it', () => {
    // The reveal names a motif that is not selected. Resolving its placements
    // must not also paint the whole candidate/placed dot population over the
    // artwork the user is trying to judge — decision 16 is about not drawing a
    // population, and a dot field raised by a size drag is the same mistake in
    // a different mark.
    const { container } = render(<Harness />);
    fireEvent.pointerEnter(holdRows(container)[0]);
    expect(container.querySelector('[data-testid="anchor-ghost-overlay"]')).toBeNull();
  });

  it('rings the hovered slot only — the two slots share no glyph', () => {
    const { container } = render(<Harness />);
    const rows = holdRows(container);

    fireEvent.pointerEnter(rows[0]);
    const first = ringedIds(container);
    fireEvent.pointerLeave(rows[0]);

    fireEvent.pointerEnter(rows[1]);
    const second = ringedIds(container);

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it('clears cleanly on leave — never left drawn over the artwork', () => {
    const { container } = render(<Harness />);
    const row = holdRows(container)[0];
    fireEvent.pointerEnter(row);
    expect(overlay(container)).not.toBeNull();
    fireEvent.pointerLeave(row);
    expect(overlay(container)).toBeNull();
  });
});
