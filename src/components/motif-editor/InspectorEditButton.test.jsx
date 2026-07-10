// @vitest-environment jsdom
// The Inspector MotifDevice "Edit" (✎) button wiring. Co-located in the
// motif-editor dir (this WI's owned surface) so it doesn't disturb the
// existing Inspector.motif.test.jsx.
//
// Wave 3 relocation (motif-session deepening, #77, grilled decision 3):
// Inspector no longer decides custom-vs-built-in — that fork decision now
// lives in useMotifEditorSession's `open(layerId, glyphRef)` (covered by
// useMotifEditorSession.test.js's "open() fork decision" suite). The CUSTOM-
// row and BUILT-IN-row cases below now assert only the thin delegation:
// Inspector's Edit button forwards (layerId, glyphRef) verbatim, with no
// fork/draft-construction logic of its own and no store writes at click time.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Inspector from '../shell/Inspector';
import { MOTIF_TYPE, createMotifParams } from '../../lib/motif/motifLayer';

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ tier: 'studio' }),
}));

const defaultBinding = {
  selection: { roles: ['crossing'], rate: { n: 1 } },
  placement: {
    sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85 },
    orientation: { policy: 'path', useNormal: true },
    flip: false,
  },
};

const hostLayer = (id = 'host1', patternType = 'grid') => ({
  id,
  name: id,
  patternType,
  params: {},
  randomizeKeys: [],
  paramsCache: {},
});

const motifLayer = (id, hostId, glyphRef) => ({
  id,
  name: id,
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: createMotifParams({ hostLayerId: hostId, glyphRef, binding: defaultBinding }),
  randomizeKeys: [],
  paramsCache: {},
});

const customGlyph = (id, name) => ({
  id,
  name,
  tradition: 'imported',
  paths: [{ d: 'M0,0 L4,4', closed: false }],
  viewRadius: 5,
  root: { x: 0, y: 0, angle: 0 },
});

describe('MotifDevice — Edit button', () => {
  it('CUSTOM row: Edit forwards (layerId, glyphRef) verbatim to the session-open prop', () => {
    const onEditGlyph = vi.fn();
    const motif = motifLayer('m1', 'host1', 'cg-7');
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        customGlyphs={{ 'cg-7': customGlyph('cg-7', 'My Vine') }}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    const edit = screen.getByTestId('motif-edit');
    expect(edit).toHaveAttribute('aria-label', 'Edit motif');
    fireEvent.click(edit);
    // (layerId, glyphRef) — matches useMotifEditorSession's open(layerId, glyphRef).
    expect(onEditGlyph).toHaveBeenCalledWith('m1', 'cg-7');
  });

  it('BUILT-IN row: Edit forwards (layerId, glyphRef) verbatim — no fork/draft logic and no store writes in Inspector', () => {
    const onEditGlyph = vi.fn();
    const onUpdateLayer = vi.fn();
    const motif = motifLayer('m1', 'host1', 'leaf'); // built-in
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        customGlyphs={{}}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    const edit = screen.getByTestId('motif-edit');
    expect(edit).toHaveAttribute('aria-label', 'Duplicate to edit');
    fireEvent.click(edit);

    // The custom-vs-built-in fork decision (and the Draft Glyph construction,
    // D6) now live entirely in useMotifEditorSession.open — Inspector makes NO
    // store write and constructs no draft; it only names the (layerId, ref).
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(onEditGlyph).toHaveBeenCalledTimes(1);
    expect(onEditGlyph).toHaveBeenCalledWith('m1', 'leaf');
  });

  it('New motif… fires onNewMotif(layerId) for the row (draw-from-scratch)', () => {
    const onNewMotif = vi.fn();
    const motif = motifLayer('m1', 'host1', 'cg-7');
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        customGlyphs={{ 'cg-7': customGlyph('cg-7', 'My Vine') }}
        addCustomGlyph={vi.fn()}
        onNewMotif={onNewMotif}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    const newBtn = screen.getByTestId('motif-new');
    expect(newBtn).toHaveAttribute('aria-label', 'New motif');
    fireEvent.click(newBtn);
    expect(onNewMotif).toHaveBeenCalledWith('m1');
  });

  it('renders without crashing when onEditGlyph/addCustomGlyph are absent (legacy callers)', () => {
    const motif = motifLayer('m1', 'host1', 'leaf');
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    // Clicking is inert (no handler) but must not throw.
    expect(() => fireEvent.click(screen.getByTestId('motif-edit'))).not.toThrow();
  });
});
