// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import EtchStackRack from './EtchStackRack';
import { createEtchParams } from '../../lib/etch/etchLayer';

function etchLayer(stack = []) {
  return { id: 'e1', type: 'etch', params: createEtchParams({ source: null, stack }) };
}
function toneStack() {
  return [
    { id: 't1', type: 'tone', bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } } },
  ];
}
function ditherStage(id = 'd1', bypassed = false) {
  return { id, type: 'dither', bypassed, params: { mode: 'floyd-steinberg', size: 1 } };
}

describe('EtchStackRack', () => {
  it('self-hides for a non-Etch layer', () => {
    const { container } = render(<EtchStackRack layer={{ id: 'p1', type: 'pattern' }} onUpdateLayer={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses Etch Stack vocabulary, never the forbidden motif words', () => {
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={() => {}} />);
    const rack = screen.getByTestId('etch-stack-rack');
    expect(rack).toHaveTextContent(/Etch Stack/);
    expect(rack.textContent).not.toMatch(/\b(Chain|Block|effect|filter|device|pass)\b/i);
  });

  it('adds a Tone Stage through the canonical params write', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer([])} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stack-add'));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdateLayer.mock.calls[0];
    expect(id).toBe('e1');
    expect(patch.params.stack).toHaveLength(1);
    expect(patch.params.stack[0].type).toBe('tone');
    expect(patch.params.stack[0].bypassed).toBe(false);
  });

  it('bypasses a Stage (writes bypassed:true for that Stage only)', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stage-bypass'));
    const patch = onUpdateLayer.mock.calls[0][1];
    expect(patch.params.stack[0].bypassed).toBe(true);
  });

  it('removes a Stage', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stage-remove'));
    expect(onUpdateLayer.mock.calls[0][1].params.stack).toHaveLength(0);
  });

  it('a Tone slider patches its param (exposure) via patchStageParams', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={onUpdateLayer} />);
    // Expand the Stage body, then move exposure.
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    const body = screen.getByTestId('etch-tone-body');
    fireEvent.change(within(body).getByTestId('tone-exposure'), { target: { value: '40' } });
    const patch = onUpdateLayer.mock.calls[0][1];
    expect(patch.params.stack[0].params.exposure).toBe(40);
    // untouched params preserved
    expect(patch.params.stack[0].params.levels.gamma).toBe(1);
  });

  it('the Gamma slider patches only the levels midtone, keeping black/white', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    const body = screen.getByTestId('etch-tone-body');
    fireEvent.change(within(body).getByTestId('tone-gamma'), { target: { value: '1.8' } });
    const levels = onUpdateLayer.mock.calls[0][1].params.stack[0].params.levels;
    expect(levels).toEqual({ blackPoint: 0, whitePoint: 255, gamma: 1.8 });
  });

  it('renders the Levels histogram control with black / white / gamma handles', () => {
    render(<EtchStackRack layer={etchLayer(toneStack())} onUpdateLayer={() => {}} />);
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    expect(screen.getByTestId('etch-levels')).toBeInTheDocument();
    expect(screen.getByTestId('levels-black')).toBeInTheDocument();
    expect(screen.getByTestId('levels-white')).toBeInTheDocument();
    expect(screen.getByTestId('levels-gamma')).toBeInTheDocument();
  });

  // ── Dither Stage (S3, #82) ─────────────────────────────────────────────────
  it('adds a Dither Stage through the canonical params write', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer([])} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stack-add-dither'));
    const patch = onUpdateLayer.mock.calls[0][1];
    expect(patch.params.stack).toHaveLength(1);
    expect(patch.params.stack[0].type).toBe('dither');
    expect(patch.params.stack[0].params.mode).toBe('floyd-steinberg');
    expect(patch.params.stack[0].params.size).toBe(1);
  });

  it('labels a Dither Stage "Dither" and never leaks a forbidden motif word', () => {
    render(<EtchStackRack layer={etchLayer([ditherStage()])} onUpdateLayer={() => {}} />);
    const rack = screen.getByTestId('etch-stack-rack');
    expect(rack).toHaveTextContent(/Dither/);
    expect(rack.textContent).not.toMatch(/\b(Chain|Block|effect|filter|device|pass)\b/i);
  });

  it('the Dither body exposes a mode selector (FS + Bayer 2/4/8) and a size slider', () => {
    render(<EtchStackRack layer={etchLayer([ditherStage()])} onUpdateLayer={() => {}} />);
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    const body = screen.getByTestId('etch-dither-body');
    const mode = within(body).getByTestId('dither-mode');
    const values = Array.from(mode.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['floyd-steinberg', 'bayer-2', 'bayer-4', 'bayer-8']);
    expect(within(body).getByTestId('dither-size')).toBeInTheDocument();
  });

  it('switching mode patches params.mode', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer([ditherStage()])} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    fireEvent.change(screen.getByTestId('dither-mode'), { target: { value: 'bayer-8' } });
    expect(onUpdateLayer.mock.calls[0][1].params.stack[0].params.mode).toBe('bayer-8');
  });

  it('changing size patches params.size', () => {
    const onUpdateLayer = vi.fn();
    render(<EtchStackRack layer={etchLayer([ditherStage()])} onUpdateLayer={onUpdateLayer} />);
    fireEvent.click(screen.getByTestId('etch-stage-expand'));
    fireEvent.change(screen.getByTestId('dither-size'), { target: { value: '4' } });
    expect(onUpdateLayer.mock.calls[0][1].params.stack[0].params.size).toBe(4);
  });

  it('badges a SECOND (non-winning) screening Stage as inactive — only one screens', () => {
    render(<EtchStackRack layer={etchLayer([ditherStage('d1'), ditherStage('d2')])} onUpdateLayer={() => {}} />);
    const rows = screen.getAllByTestId('etch-stage-row');
    // First Dither is the active screen (no inactive badge); the second is badged.
    expect(within(rows[0]).queryByTestId('stage-inactive')).toBeNull();
    expect(within(rows[1]).getByTestId('stage-inactive')).toBeInTheDocument();
  });

  it('badges ANY Stage positioned below the active screen as inactive (post-screen)', () => {
    // A Tone Stage dragged BELOW the active Dither is post-screen — it runs on
    // nothing (applyFieldStages stops at the screen). It must show that feedback,
    // not silently do nothing.
    const toneStage = (id) => ({ id, type: 'tone', bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } } });
    render(<EtchStackRack layer={etchLayer([toneStage('t-above'), ditherStage('d1'), toneStage('t-below')])} onUpdateLayer={() => {}} />);
    const rows = screen.getAllByTestId('etch-stage-row');
    expect(within(rows[0]).queryByTestId('stage-inactive')).toBeNull(); // Tone above the screen: active
    expect(within(rows[1]).queryByTestId('stage-inactive')).toBeNull(); // the active screen itself
    expect(within(rows[2]).getByTestId('stage-inactive')).toBeInTheDocument(); // Tone below: inactive
  });
});
