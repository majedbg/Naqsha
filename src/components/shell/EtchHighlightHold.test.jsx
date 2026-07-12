// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EtchHighlightHold from './EtchHighlightHold';
import { createEtchParams } from '../../lib/etch/etchLayer';

// An Etch on a given panel. The material-aware default reads the EFFECTIVE
// material (panel material first, else the Material-lens material).
function etchLayer({ panelId = 'p-auto', hold } = {}) {
  return { id: 'e1', type: 'etch', panelId, params: createEtchParams({ source: null, hold }) };
}
// Real per-panel materials come from the shipping catalog; `p-auto` follows the
// document lens. gold-mirror is NOT a selectable catalog / panel material (see
// NEEDS-HUMAN safety gap), so a mirror default can only arrive via the LENS.
const PANELS = [
  { id: 'p-green', materialId: 'green-fluorescent' },
  { id: 'p-auto', materialId: null },
];
// A SYNTHETIC mirror lens — minted directly, not selected from the real catalog.
const MIRROR_LENS = { mode: 'material', material: { id: 'gold-mirror' } };
const GREEN_LENS = { mode: 'material', material: { id: 'green-fluorescent' } };

describe('EtchHighlightHold — the fixed terminal Hold control (not a Stage)', () => {
  it('self-hides for a non-Etch layer', () => {
    const { container } = render(
      <EtchHighlightHold layer={{ id: 'p1', type: 'pattern' }} panels={PANELS} onUpdateLayer={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('uses Highlight Hold vocabulary, never the forbidden Stack/motif words', () => {
    render(<EtchHighlightHold layer={etchLayer()} panels={PANELS} onUpdateLayer={() => {}} />);
    const box = screen.getByTestId('etch-highlight-hold');
    expect(box).toHaveTextContent(/Highlight Hold/);
    // It is NOT a Stage / Stack entry, and never the motif-reserved words.
    expect(box.textContent).not.toMatch(/\b(Stage|Chain|Block|effect|filter|device|pass)\b/i);
  });

  it('AUTO under a mirror LENS shows the Hold as ON (effective-material default)', () => {
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-auto' })} panels={PANELS} colorView={MIRROR_LENS} onUpdateLayer={() => {}} />);
    expect(screen.getByTestId('etch-hold-toggle')).toBeChecked();
  });

  it('AUTO under a forgiving-stock lens shows the Hold as OFF', () => {
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-auto' })} panels={PANELS} colorView={GREEN_LENS} onUpdateLayer={() => {}} />);
    expect(screen.getByTestId('etch-hold-toggle')).not.toBeChecked();
  });

  it('AUTO with no lens / no known material shows the Hold as OFF', () => {
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-auto' })} panels={PANELS} onUpdateLayer={() => {}} />);
    expect(screen.getByTestId('etch-hold-toggle')).not.toBeChecked();
  });

  it('the PANEL material takes precedence over the lens (forgiving panel under a mirror lens → OFF)', () => {
    // p-green carries a real forgiving material; even under a mirror lens its own
    // material wins, so the Hold defaults OFF — the effective-material precedence.
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-green' })} panels={PANELS} colorView={MIRROR_LENS} onUpdateLayer={() => {}} />);
    expect(screen.getByTestId('etch-hold-toggle')).not.toBeChecked();
  });

  it('toggling writes an EXPLICIT boolean that overrides the material default', () => {
    const onUpdateLayer = vi.fn();
    // Under a mirror lens the resolved state is ON; clicking must persist OFF.
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-auto' })} panels={PANELS} colorView={MIRROR_LENS} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-hold-toggle'));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe('e1');
    expect(patch.params.hold.enabled).toBe(false); // explicit, not null
  });

  it('an explicit user choice persists over the material default (off under a mirror lens)', () => {
    const layer = etchLayer({ panelId: 'p-auto', hold: { enabled: false, cutoff: 235 } });
    render(<EtchHighlightHold layer={layer} panels={PANELS} colorView={MIRROR_LENS} onUpdateLayer={() => {}} />);
    expect(screen.getByTestId('etch-hold-toggle')).not.toBeChecked();
  });

  it('moving the cutoff writes it through the canonical params path', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchHighlightHold layer={etchLayer({ panelId: 'p-auto' })} panels={PANELS} colorView={MIRROR_LENS} onUpdateLayer={onUpdateLayer} />);
    fireEvent.change(screen.getByTestId('etch-hold-cutoff'), { target: { value: '210' } });
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateLayer.mock.calls[0];
    expect(patch.params.hold.cutoff).toBe(210);
  });
});
