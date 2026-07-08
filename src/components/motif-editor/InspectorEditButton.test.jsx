// @vitest-environment jsdom
// The Inspector MotifDevice "Edit" (✎) button wiring (WI-P2-2). Co-located in
// the motif-editor dir (this WI's owned surface) so it doesn't disturb the
// existing Inspector.motif.test.jsx. Exercises the two entry paths:
//   • CUSTOM glyph row → onEditGlyph(glyphId, layerId) directly.
//   • BUILT-IN glyph row → duplicate-to-edit: fork the geometry into a new
//     custom glyph, rebind THIS row, THEN open the editor on the copy.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Inspector from '../shell/Inspector';
import { MOTIF_TYPE, createMotifParams } from '../../lib/motif/motifLayer';
import { MOTIF_GLYPHS } from '../../lib/motif/glyphs';

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
  it('CUSTOM row: Edit opens the editor in place (no duplicate)', () => {
    const onEditGlyph = vi.fn();
    const addCustomGlyph = vi.fn();
    const motif = motifLayer('m1', 'host1', 'cg-7');
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        customGlyphs={{ 'cg-7': customGlyph('cg-7', 'My Vine') }}
        addCustomGlyph={addCustomGlyph}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    const edit = screen.getByTestId('motif-edit');
    expect(edit).toHaveAttribute('aria-label', 'Edit motif');
    fireEvent.click(edit);
    expect(onEditGlyph).toHaveBeenCalledWith('cg-7', 'm1');
    expect(addCustomGlyph).not.toHaveBeenCalled();
  });

  it('BUILT-IN row: Edit forks the geometry into a DRAFT and opens it WITHOUT touching the store (D6)', () => {
    const onEditGlyph = vi.fn();
    const onUpdateLayer = vi.fn();
    const addCustomGlyph = vi.fn(() => 'cg-new');
    const motif = motifLayer('m1', 'host1', 'leaf'); // built-in
    render(
      <Inspector
        layers={[hostLayer('host1', 'grid'), motif]}
        selectedLayerId="host1"
        onUpdateLayer={onUpdateLayer}
        onChangeLayerPattern={() => {}}
        customGlyphs={{}}
        addCustomGlyph={addCustomGlyph}
        onEditGlyph={onEditGlyph}
      />
    );
    fireEvent.click(screen.getByTestId('motif-toggle'));
    const edit = screen.getByTestId('motif-edit');
    expect(edit).toHaveAttribute('aria-label', 'Duplicate to edit');
    fireEvent.click(edit);

    // The fork is a DRAFT passed to the editor (3rd arg), null id ⇒ create session.
    // Crucially: NO store write and NO layer rebind happen at open time — that's
    // deferred to Save, so Cancel discards the fork cleanly (D6).
    expect(addCustomGlyph).not.toHaveBeenCalled();
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(onEditGlyph).toHaveBeenCalledTimes(1);
    const [id, layerId, draft] = onEditGlyph.mock.calls[0];
    expect(id).toBeNull();
    expect(layerId).toBe('m1');
    expect(draft.tradition).toBe('custom');
    expect(draft.paths).toEqual(MOTIF_GLYPHS.leaf.paths);
    expect(draft.root).toEqual({ x: 0, y: 0, angle: 0 });
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
