// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import UploadPipeline from './UploadPipeline.jsx';

const fixtureDir = path.resolve(process.cwd(), 'src/test/fixtures/svg');

function svgFile(name) {
  const text = readFileSync(path.join(fixtureDir, name), 'utf8');
  return new File([text], name, { type: 'image/svg+xml' });
}

function fileInput() {
  return document.querySelector('input[type="file"]');
}

describe('UploadPipeline', () => {
  it('TRACER: a clean-dims SVG flows through to onComplete with dims + ops', async () => {
    const onComplete = vi.fn();
    render(<UploadPipeline onComplete={onComplete} />);

    fireEvent.change(fileInput(), {
      target: { files: [svgFile('units-mm.svg')] },
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const draft = onComplete.mock.calls[0][0];
    expect(draft.source).toBe('upload');
    expect(draft.widthMm).toBeCloseTo(80);
    expect(draft.heightMm).toBeCloseTo(60);
    expect(draft.ambiguous).toBe(false);
    expect(draft.ops).toEqual([
      { key: '#000000', label: '#000000', defaultOp: 'cut' },
    ]);
  });

  it('an ambiguous-dims SVG forces a confirm-size step before completing', async () => {
    const onComplete = vi.fn();
    render(<UploadPipeline onComplete={onComplete} />);

    fireEvent.change(fileInput(), {
      target: { files: [svgFile('viewbox-only.svg')] },
    });

    // Confirm-size step appears; onComplete is NOT called yet.
    const widthField = await screen.findByLabelText(/width/i);
    const heightField = screen.getByLabelText(/height/i);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(widthField, { target: { value: '120' } });
    fireEvent.change(heightField, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const draft = onComplete.mock.calls[0][0];
    expect(draft.widthMm).toBe(120);
    expect(draft.heightMm).toBe(90);
    // Dimensions are resolved once the user confirms a physical size.
    expect(draft.ambiguous).toBe(false);
  });

  it('sanitizes a malicious SVG: no <script> in svgClean, removed is non-empty', async () => {
    const onComplete = vi.fn();
    render(<UploadPipeline onComplete={onComplete} />);

    fireEvent.change(fileInput(), {
      target: { files: [svgFile('malicious-script.svg')] },
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const draft = onComplete.mock.calls[0][0];
    expect(draft.svgClean).not.toMatch(/<script/i);
    expect(draft.removed.length).toBeGreaterThan(0);
  });

  it('surfaces an error and does not complete for an unparseable file', async () => {
    const onComplete = vi.fn();
    render(<UploadPipeline onComplete={onComplete} />);

    const bad = new File(['this is not an svg'], 'notes.txt', {
      type: 'text/plain',
    });
    fireEvent.change(fileInput(), { target: { files: [bad] } });

    expect(
      await screen.findByText(/couldn.t read|invalid|error/i),
    ).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
