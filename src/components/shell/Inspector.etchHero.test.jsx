// @vitest-environment jsdom
// The 1:1 "what etches" preview hero is wired into the Etch inspector (Raster
// Etch S9, #88). This proves the Inspector surfaces the resolved single-source
// `etchBitmap` prop into the hero for an Etch, and self-hides it otherwise.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Inspector from './Inspector';
import { createEtchParams } from '../../lib/etch/etchLayer';
import { etchSourceToBitmap } from '../../lib/etch/etchProcess';

// Inspector composes PatternParams which reads the auth gate — mock it (sibling
// convention in Inspector.test.jsx) so a known tier drives the render.
vi.mock('../../lib/AuthContext', () => ({ useAuth: () => ({ tier: 'studio' }) }));

function grayImage(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = rows[y][x];
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}
const bitmap = () => etchSourceToBitmap(grayImage([[0, 255], [200, 40]]));

// Matches useLayers.addEtchLayer: type 'etch' AND a stable, non-colliding
// patternType 'etch' (like text/import/motif) so PatternSelect resolves a label.
const etchLayer = () => ({ id: 'e1', name: 'Etch 1', type: 'etch', patternType: 'etch', color: '#000000', params: createEtchParams({ source: null }) });
const patternLayer = () => ({ id: 'p1', name: 'Pattern 1', type: 'pattern', patternType: 'grid', params: {} });

describe('Inspector — 1:1 "what etches" preview hero wiring (Raster Etch S9, #88)', () => {
  it('renders the preview hero canvas for a selected Etch once its bitmap has resolved', () => {
    render(
      <Inspector layers={[etchLayer()]} selectedLayerId="e1" etchBitmap={bitmap()} onUpdateLayer={() => {}} />
    );
    expect(screen.getByTestId('etch-preview-hero')).toBeInTheDocument();
    expect(screen.getByTestId('etch-preview-canvas')).toBeInTheDocument();
  });

  it('shows the resolving placeholder for a selected Etch whose bitmap is still null', () => {
    render(
      <Inspector layers={[etchLayer()]} selectedLayerId="e1" etchBitmap={null} onUpdateLayer={() => {}} />
    );
    expect(screen.getByTestId('etch-preview-resolving')).toBeInTheDocument();
    expect(screen.queryByTestId('etch-preview-canvas')).not.toBeInTheDocument();
  });

  it('does NOT render the hero for a non-Etch layer (Etch-only)', () => {
    render(
      <Inspector layers={[patternLayer()]} selectedLayerId="p1" etchBitmap={bitmap()} onUpdateLayer={() => {}} />
    );
    expect(screen.queryByTestId('etch-preview-hero')).not.toBeInTheDocument();
  });
});
