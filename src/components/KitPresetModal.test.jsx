// Interaction tests for the floating kit preset-asset modal (issue #18, C9).
//
// Mirrors PatternPickerModal: a floating modal, NOT a tool-strip tool. Selecting
// an asset drops it via the place-as-artwork import path (addImportedLayer), and
// the drop produces a valid imported-path layer.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import KitPresetModal from './KitPresetModal.jsx';
import { ITP_CAMP_KIT_ID, getKit } from '../kits/kitRegistry.js';
import useLayers from '../lib/useLayers.js';

describe('KitPresetModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <KitPresetModal open={false} kitId={ITP_CAMP_KIT_ID} onPick={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists all 7 ITP Camp assets as pickable cards', () => {
    render(
      <KitPresetModal open kitId={ITP_CAMP_KIT_ID} onPick={() => {}} onClose={() => {}} />
    );
    const kit = getKit(ITP_CAMP_KIT_ID);
    for (const asset of kit.assetManifest) {
      // Exact-match the primary card name (the logo also exposes a "(dark
      // variant)" button, so a loose regex would match more than one).
      expect(screen.getByRole('button', { name: asset.name })).toBeTruthy();
    }
  });

  it('exposes the flipped logo as a reachable "dark variant" pick (both files usable)', () => {
    const onPick = vi.fn();
    render(
      <KitPresetModal open kitId={ITP_CAMP_KIT_ID} onPick={onPick} onClose={() => {}} />
    );
    const kit = getKit(ITP_CAMP_KIT_ID);
    const logo = kit.assetManifest.find((a) => a.id === 'logo');
    expect(logo.altSvg).toBeTruthy();
    const darkBtn = screen.getByRole('button', { name: /ITP Camp logo \(dark variant\)/i });
    fireEvent.click(darkBtn);
    // The dark variant drops the FLIPPED svg, not the primary.
    expect(onPick).toHaveBeenCalledWith(logo.altSvg, logo);
    expect(onPick.mock.calls[0][0]).toBe(logo.altSvg);
    expect(onPick.mock.calls[0][0]).not.toBe(logo.svg);
  });

  it('picking an asset reports its prepared SVG string OUT through onPick', () => {
    const onPick = vi.fn();
    render(
      <KitPresetModal open kitId={ITP_CAMP_KIT_ID} onPick={onPick} onClose={() => {}} />
    );
    const kit = getKit(ITP_CAMP_KIT_ID);
    const coaster = kit.assetManifest.find((a) => a.id === 'coaster');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(coaster.name, 'i') }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const svg = onPick.mock.calls[0][0];
    expect(typeof svg).toBe('string');
    expect(svg).toMatch(/<svg[\s>]/i);
    // No clipPath leakage in whatever string we drop.
    expect(svg).not.toContain('clipPath');
  });
});

describe('kit preset drop → imported-path layer (via the import path)', () => {
  it('dropping a kit asset through addImportedLayer creates ONE imported layer', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    const kit = getKit(ITP_CAMP_KIT_ID);
    const logo = kit.assetManifest.find((a) => a.id === 'logo');

    let outcome;
    act(() => {
      outcome = result.current.addImportedLayer(logo.svg);
    });
    expect(outcome.ok).toBe(true);
    expect(result.current.layers.length).toBe(before + 1);

    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.type).toBe('import');
    expect(added.patternType).toBe('import');
    expect(Array.isArray(added.params.pathData)).toBe(true);
    expect(added.params.pathData.length).toBeGreaterThan(0);
    // The logo asset string was preprocessed — no clip-rect outline leaked.
    const joined = added.params.pathData.join(' || ');
    expect(joined).not.toContain('M 14 336 L 1439.375 336');
  });
});
