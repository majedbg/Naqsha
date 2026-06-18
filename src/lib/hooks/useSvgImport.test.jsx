// Interaction tests (issue #12): drag-drop and paste of an SVG both create an
// imported layer. Drives the real useSvgImport hook against a DOM element and a
// spy onImport, asserting both gestures deliver the SVG text.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useSvgImport from './useSvgImport.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L1,1"/></svg>';

function Target({ onImport }) {
  const ref = useRef(null);
  useSvgImport(ref, onImport);
  return <div ref={ref} data-testid="canvas" />;
}

// A File whose .text() resolves to the given content (jsdom File.text exists,
// but we set it explicitly for determinism across environments).
function svgFile(content, name = 'art.svg', type = 'image/svg+xml') {
  const f = new File([content], name, { type });
  f.text = () => Promise.resolve(content);
  return f;
}

describe('useSvgImport — drag-drop', () => {
  it('calls onImport with the dropped SVG file contents', async () => {
    const onImport = vi.fn();
    const { getByTestId } = render(<Target onImport={onImport} />);
    const el = getByTestId('canvas');

    fireEvent.drop(el, {
      dataTransfer: { files: [svgFile(SVG)], items: [], types: ['Files'] },
    });

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(SVG));
  });
});

describe('useSvgImport — paste', () => {
  it('calls onImport with pasted SVG text', async () => {
    const onImport = vi.fn();
    render(<Target onImport={onImport} />);

    fireEvent.paste(document, {
      clipboardData: { getData: (t) => (t === 'text/plain' ? SVG : ''), files: [] },
    });

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(SVG));
  });

  it('calls onImport with a pasted SVG file (image/svg+xml on the clipboard)', async () => {
    const onImport = vi.fn();
    render(<Target onImport={onImport} />);

    fireEvent.paste(document, {
      clipboardData: { getData: () => '', files: [svgFile(SVG)] },
    });

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(SVG));
  });

  it('ignores a paste with no SVG content (does not call onImport)', async () => {
    const onImport = vi.fn();
    render(<Target onImport={onImport} />);

    fireEvent.paste(document, {
      clipboardData: { getData: () => 'just some text', files: [] },
    });

    // Give any async path a tick; onImport must not fire for non-SVG text.
    await new Promise((r) => setTimeout(r, 20));
    expect(onImport).not.toHaveBeenCalled();
  });
});
