// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AggregatePanel from './AggregatePanel.jsx';
import { markStatus } from '../../../lib/org/submissionService';

vi.mock('../../../lib/org/submissionService');

// jsdom implements neither URL.createObjectURL nor anchor.click() usefully.
// Capture every Blob handed to createObjectURL so tests can read it back.
let createdBlobs;

beforeEach(() => {
  vi.clearAllMocks();
  createdBlobs = [];
  URL.createObjectURL = vi.fn((blob) => {
    createdBlobs.push(blob);
    return `blob:mock/${createdBlobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
});

const SHEET = { sheetWMm: 300, sheetHMm: 300, gapMm: 5 };

describe('AggregatePanel', () => {
  it('aggregates pieces that fit one sheet into one combined SVG, marks them cut, and calls onCut', async () => {
    const selected = [
      { id: 'a', width_mm: 50, height_mm: 50, ops: [{ process: 'cut' }], svg_path: 'p/a.svg' },
      { id: 'b', width_mm: 50, height_mm: 50, ops: [{ process: 'cut' }], svg_path: 'p/b.svg' },
    ];
    const loadSvg = vi.fn(async (path) =>
      `<svg viewBox="0 0 50 50"><rect data-path="${path}" width="10" height="10"/></svg>`,
    );
    markStatus.mockResolvedValue({});
    const onCut = vi.fn();

    render(
      <AggregatePanel selected={selected} sheet={SHEET} loadSvg={loadSvg} onCut={onCut} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aggregate/i }));

    await waitFor(() => expect(onCut).toHaveBeenCalledTimes(1));

    // Exactly one combined sheet SVG was produced.
    expect(createdBlobs).toHaveLength(1);
    const svgText = await createdBlobs[0].text();
    const groups = svgText.match(/<g data-submission=/g) || [];
    expect(groups).toHaveLength(2);

    // Both pieces flipped to cut, and onCut received their ids.
    expect(markStatus).toHaveBeenCalledWith('a', 'cut');
    expect(markStatus).toHaveBeenCalledWith('b', 'cut');
    expect(onCut).toHaveBeenCalledWith(['a', 'b']);
  });

  it('spills pieces exceeding one sheet onto multiple sheet SVGs', async () => {
    // A tiny sheet that fits only one near-full piece each forces spillover.
    const smallSheet = { sheetWMm: 60, sheetHMm: 60, gapMm: 5 };
    const selected = [
      { id: 'a', width_mm: 45, height_mm: 45, ops: [{ process: 'cut' }], svg_path: 'p/a.svg' },
      { id: 'b', width_mm: 45, height_mm: 45, ops: [{ process: 'cut' }], svg_path: 'p/b.svg' },
      { id: 'c', width_mm: 45, height_mm: 45, ops: [{ process: 'cut' }], svg_path: 'p/c.svg' },
    ];
    const loadSvg = vi.fn(async () => '<svg viewBox="0 0 45 45"><rect width="10" height="10"/></svg>');
    markStatus.mockResolvedValue({});
    const onCut = vi.fn();

    render(
      <AggregatePanel selected={selected} sheet={smallSheet} loadSvg={loadSvg} onCut={onCut} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aggregate/i }));

    await waitFor(() => expect(onCut).toHaveBeenCalledTimes(1));

    // More than one sheet => more than one downloaded SVG.
    expect(createdBlobs.length).toBeGreaterThan(1);
    expect(onCut).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('re-sanitizes each loaded SVG before compose: benign geometry survives, scripts are stripped', async () => {
    const selected = [
      { id: 'a', width_mm: 50, height_mm: 50, ops: [{ process: 'cut' }], svg_path: 'p/a.svg' },
    ];
    const loadSvg = vi.fn(async () =>
      '<svg viewBox="0 0 50 50"><circle id="keepme" r="5"/><script>alert(1)</script></svg>',
    );
    markStatus.mockResolvedValue({});
    const onCut = vi.fn();

    render(
      <AggregatePanel selected={selected} sheet={SHEET} loadSvg={loadSvg} onCut={onCut} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aggregate/i }));

    await waitFor(() => expect(onCut).toHaveBeenCalledTimes(1));

    const svgText = await createdBlobs[0].text();
    // Benign geometry made it through (proves we composed the .clean string).
    expect(svgText).toContain('keepme');
    // The script was stripped by re-sanitization.
    expect(svgText).not.toContain('<script');
    expect(svgText).not.toContain('alert(1)');
  });

  it('disables aggregate and does nothing when the selection is empty', async () => {
    const loadSvg = vi.fn();
    const onCut = vi.fn();

    render(
      <AggregatePanel selected={[]} sheet={SHEET} loadSvg={loadSvg} onCut={onCut} />,
    );

    const button = screen.getByRole('button', { name: /aggregate/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(loadSvg).not.toHaveBeenCalled();
    expect(markStatus).not.toHaveBeenCalled();
    expect(onCut).not.toHaveBeenCalled();
    expect(createdBlobs).toHaveLength(0);
  });

  it('surfaces an error and marks nothing cut when a piece is larger than the sheet', async () => {
    const selected = [
      { id: 'big', width_mm: 500, height_mm: 500, ops: [{ process: 'cut' }], svg_path: 'p/big.svg' },
    ];
    const loadSvg = vi.fn(async () => '<svg viewBox="0 0 500 500"><rect width="10" height="10"/></svg>');
    markStatus.mockResolvedValue({});
    const onCut = vi.fn();

    render(
      <AggregatePanel selected={selected} sheet={SHEET} loadSvg={loadSvg} onCut={onCut} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aggregate/i }));

    // A clear error is shown to the admin.
    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than/i);

    // Nothing was cut, nothing downloaded, onCut never fired.
    expect(markStatus).not.toHaveBeenCalled();
    expect(onCut).not.toHaveBeenCalled();
    expect(createdBlobs).toHaveLength(0);
  });
});
