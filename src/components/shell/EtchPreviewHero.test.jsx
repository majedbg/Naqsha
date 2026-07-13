// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EtchPreviewHero from './EtchPreviewHero';
import { etchSourceToBitmap } from '../../lib/etch/etchProcess';

// A gray ImageData helper (mirrors etchSvgExport.test's fixture): rows of 0..255
// luma become an RGBA source the Etch pipeline thresholds into a 1-bit buffer.
function grayImage(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = rows[y][x];
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// A resolved bitmap with a mix of etched dots and paper — the SAME single-source
// buffer useCanvas caches and svgExport embeds.
const bitmap = () => etchSourceToBitmap(grayImage([[0, 255], [200, 40]]));

// A bitmap WITH a held highlight band: bright pixels above the cutoff are held
// (guaranteed zero dots), so `held` is populated for the preview overlay.
const heldBitmap = () =>
  etchSourceToBitmap(grayImage([[10, 250], [250, 20]]), { hold: { enabled: true, cutoff: 200 } });

const etch = (extra = {}) => ({ id: 'e1', type: 'etch', color: '#000000', ...extra });

describe('EtchPreviewHero — the 1:1 "what etches" verification hero (Raster Etch S9, #88)', () => {
  it('self-hides for a non-Etch layer', () => {
    const { container } = render(
      <EtchPreviewHero layer={{ id: 'p1', type: 'pattern' }} bitmap={bitmap()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a resolving placeholder (no crash, no canvas) while the bitmap is null', () => {
    render(<EtchPreviewHero layer={etch()} bitmap={null} />);
    expect(screen.getByTestId('etch-preview-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('etch-preview-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('etch-preview-hero')).toHaveTextContent(/resolv/i);
  });

  it('renders the resolved bits onto a canvas sized to the bitmap (device-pixel backing store)', () => {
    const bmp = bitmap();
    render(<EtchPreviewHero layer={etch()} bitmap={bmp} />);
    const canvas = screen.getByTestId('etch-preview-canvas');
    // The backing store is exactly the bitmap's device pixels — 1:1, never a
    // downscaled overview.
    expect(canvas.width).toBe(bmp.width);
    expect(canvas.height).toBe(bmp.height);
    // Pixelated scaling keeps each dot a crisp square when zoomed (the Refine idiom).
    expect(canvas.style.imageRendering).toBe('pixelated');
  });

  it('never downscales below 1:1 — the CSS render size is >= the backing store', () => {
    const bmp = bitmap();
    render(<EtchPreviewHero layer={etch()} bitmap={bmp} />);
    const canvas = screen.getByTestId('etch-preview-canvas');
    // Default zoom is an integer >= 1, so the on-screen width is >= device pixels
    // (fixing the sub-pixel-dot bug that motivates this hero).
    const cssW = parseInt(canvas.style.width, 10);
    expect(cssW).toBeGreaterThanOrEqual(bmp.width);
  });

  it('zooms in to inspect a region at true dot scale (pan via the scroll container)', () => {
    const bmp = bitmap();
    render(<EtchPreviewHero layer={etch()} bitmap={bmp} />);
    const canvas = screen.getByTestId('etch-preview-canvas');
    const before = parseInt(canvas.style.width, 10);
    fireEvent.click(screen.getByTestId('etch-preview-zoom-in'));
    const after = parseInt(canvas.style.width, 10);
    expect(after).toBeGreaterThan(before);
    // The viewport scrolls to pan — an overflow-auto region around the canvas.
    const viewport = screen.getByTestId('etch-preview-viewport');
    expect(viewport.className).toMatch(/overflow-auto/);
  });

  it('shows the Highlight Hold band in the hero when the bitmap carries a held region', () => {
    render(<EtchPreviewHero layer={etch()} bitmap={heldBitmap()} />);
    // A visible legend tells the maker the shaded band is the guaranteed-safe hold.
    expect(screen.getByTestId('etch-preview-hero')).toHaveTextContent(/Highlight Hold/i);
  });

  it('uses preview/hero vocabulary, never the forbidden Stack/motif words', () => {
    render(<EtchPreviewHero layer={etch()} bitmap={heldBitmap()} />);
    const box = screen.getByTestId('etch-preview-hero');
    expect(box.textContent).not.toMatch(/\b(Chain|Block|Pass|effect|filter|device)\b/i);
  });
});
