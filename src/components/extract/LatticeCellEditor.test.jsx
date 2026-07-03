// @vitest-environment jsdom
//
// LatticeCellEditor (S5, issue #54) — the draggable repeat-cell proposal.
// Pointer math needs only getBoundingClientRect on the overlay (mocked to a
// fixed display box), same testing pattern as FlattenStep. Commits fire on
// pointer-up in IMAGE pixels; the parent owns the re-extraction.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LatticeCellEditor from './LatticeCellEditor';

// Display box 200×150 for a 400×300 image → 1 display px = 2 image px.
const BOX = { left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150 };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(BOX);
});
afterEach(() => vi.restoreAllMocks());

const CELL = { x: 40, y: 30, width: 80, height: 60 };

function renderEditor(props = {}) {
  const onCommit = vi.fn();
  const onOptOut = vi.fn();
  render(
    <LatticeCellEditor
      imageURL="data:image/png;base64,sel"
      imageWidth={400}
      imageHeight={300}
      cell={CELL}
      confidence={0.87}
      onCommit={onCommit}
      onOptOut={onOptOut}
      {...props}
    />
  );
  return { onCommit, onOptOut };
}

describe('LatticeCellEditor', () => {
  it('shows the confidence badge as a percentage', () => {
    renderEditor();
    expect(screen.getByTestId('lattice-confidence')).toHaveTextContent('Repeat detected · 87%');
  });

  it('labels a manually seeded cell instead of faking a confidence', () => {
    renderEditor({ confidence: null });
    expect(screen.getByTestId('lattice-confidence')).toHaveTextContent(/manual/i);
  });

  it('positions the cell overlay fractionally over the image', () => {
    renderEditor();
    const cell = screen.getByTestId('lattice-cell');
    expect(cell.style.left).toBe('10%'); // 40/400
    expect(cell.style.top).toBe('10%'); // 30/300
    expect(cell.style.width).toBe('20%'); // 80/400
    expect(cell.style.height).toBe('20%'); // 60/300
  });

  it('renders 8 neighbor ghosts that preview the repeat', () => {
    renderEditor();
    const box = screen.getByTestId('lattice-cell-box');
    expect(box.querySelectorAll('[aria-hidden]')).toHaveLength(8);
  });

  it('drag-moves the cell and commits image-pixel coords on pointer-up', () => {
    const { onCommit } = renderEditor();
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 50, clientY: 40, pointerId: 1 });
    // +10 display px → +20 image px on x; +5 → +10 on y.
    fireEvent.pointerMove(box, { clientX: 60, clientY: 45, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith({ x: 60, y: 40, width: 80, height: 60 });
  });

  it('resize-drags via the corner handle without moving the origin', () => {
    const { onCommit } = renderEditor();
    const handle = screen.getByTestId('cell-resize-handle');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 110, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith({ x: 40, y: 30, width: 100, height: 80 });
  });

  it('clamps moves to the image bounds', () => {
    const { onCommit } = renderEditor();
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 50, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: -500, clientY: -500, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith({ x: 0, y: 0, width: 80, height: 60 });
  });

  it('does not commit when nothing moved', () => {
    const { onCommit } = renderEditor();
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 50, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('fires the opt-out (single-motif floor is always reachable)', () => {
    const { onOptOut } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /use single motif/i }));
    expect(onOptOut).toHaveBeenCalled();
  });

  it('ignores drags and disables opt-out while busy (re-extraction in flight)', () => {
    const { onCommit } = renderEditor({ busy: true });
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 50, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 90, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /use single motif/i })).toBeDisabled();
  });
});

// --- S5b (issue #66): oblique parallelogram mode ------------------------------

describe('LatticeCellEditor — oblique cell', () => {
  const OBL = {
    basis: { t1: [80, 0], t2: [24, 60] }, // sheared cell
    origin: { x: 40, y: 30 },
    cell: { x: 40, y: 30, width: 104, height: 60 },
  };

  it('renders the sheared parallelogram overlay with basis handles (not a rect)', () => {
    renderEditor(OBL);
    // The oblique SVG overlay is present; the cell is a polygon, not a div.
    expect(screen.getByTestId('lattice-cell-oblique')).toBeTruthy();
    expect(screen.getByTestId('lattice-cell').tagName.toLowerCase()).toBe('polygon');
    expect(screen.getByTestId('cell-handle-t1')).toBeTruthy();
    expect(screen.getByTestId('cell-handle-t2')).toBeTruthy();
  });

  it('draws 8 neighbour ghosts on the ACTUAL (sheared) lattice', () => {
    renderEditor(OBL);
    const svg = screen.getByTestId('lattice-cell-oblique');
    expect(svg.querySelectorAll('polygon[aria-hidden]')).toHaveLength(8);
  });

  it('drags the t2 endpoint independently and commits origin + basis', () => {
    const { onCommit } = renderEditor(OBL);
    const handle = screen.getByTestId('cell-handle-t2');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    // +10 display px x → +20 image px; +5 display y → +10 image px.
    fireEvent.pointerMove(box, { clientX: 10, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith({
      x: 40,
      y: 30,
      t1: [80, 0], // t1 untouched — vectors move independently
      t2: [44, 70], // t2 += (20,10)
    });
  });

  it('drags the whole cell by its origin, keeping the basis fixed', () => {
    const { onCommit } = renderEditor(OBL);
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith({
      x: 50, // 40 + 10 image px
      y: 40, // 30 + 10 image px
      t1: [80, 0],
      t2: [24, 60],
    });
  });

  it('refuses to commit a degenerate (near-collinear) basis', () => {
    const { onCommit } = renderEditor(OBL);
    const handle = screen.getByTestId('cell-handle-t2');
    const box = screen.getByTestId('lattice-cell-box');
    // Drag t2 onto the t1 direction (make it ~collinear with t1=[80,0]).
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    // Need image delta ≈ (+56, -60) to reach t2≈(80,0): display = image/2.
    fireEvent.pointerMove(box, { clientX: 28, clientY: -30, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
