// @vitest-environment jsdom
//
// ExtractStepper (S0, issue #49) — full-screen guided flow Upload → Flatten →
// Select → Review → Save (locked decision 7; Flatten is skip-only in S0 but
// the stage EXISTS — locked decision 2). Tests walk the external flow with the
// DOM/canvas seam (imageIO) and the worker seam (workerBridge) mocked; the
// registry + entity layers are real, so a completed walk genuinely registers
// a pattern into the picker's custom family.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const TRACE_RESULT = {
  tile: {
    width: 40,
    height: 40,
    fills: [{ d: 'M10 10 L30 10 L30 30 L10 30 Z', role: 'engrave' }],
    strokes: [],
  },
  lattice: null,
  confidence: { trace: 1 },
};

// S6 (issue #55): pipeline result carrying BOTH representations per motif —
// one line-work shape (centerline-default, score) + one solid (contour,
// engrave). The solid's skeleton was degenerate → centerline null.
const TRACE_RESULT_S6 = {
  tile: {
    width: 80,
    height: 60,
    fills: [{ d: 'M50 20 L70 20 L70 40 L50 40 Z', role: 'engrave' }],
    strokes: [{ d: 'M10.5 30.5 L40.5 30.5', role: 'score' }],
  },
  components: [
    {
      kind: 'stroke',
      role: 'score',
      contour: { d: 'M10 29 L41 29 L41 32 L10 32 Z' },
      centerline: { d: 'M10.5 30.5 L40.5 30.5' },
    },
    {
      kind: 'fill',
      role: 'engrave',
      contour: { d: 'M50 20 L70 20 L70 40 L50 40 Z' },
      centerline: null,
    },
  ],
  lattice: null,
  confidence: { trace: 1 },
};

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  dispose: vi.fn(),
  save: vi.fn(),
}));

vi.mock('../../lib/extraction/imageIO', () => ({
  fileToDataURL: vi.fn(async () => 'data:image/png;base64,x'),
  loadImage: vi.fn(async () => ({ naturalWidth: 400, naturalHeight: 300 })),
  cropToImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
}));

vi.mock('../../lib/extraction/workerBridge', () => ({
  createExtractionBridge: () => ({ extract: mocks.extract, dispose: mocks.dispose }),
}));

vi.mock('../../lib/libraryRepository', () => ({
  saveExtractedPattern: mocks.save,
}));

import ExtractStepper from './ExtractStepper';
import { getDynamicPatternClass, getDynamicTypes, unregisterPattern } from '../../lib/patternRegistry';

let registeredIds = [];

beforeEach(() => {
  mocks.extract.mockReset().mockResolvedValue(TRACE_RESULT);
  mocks.save.mockReset().mockImplementation(async (entity) => ({ entity, persisted: true }));
  registeredIds = [];
});

afterEach(() => {
  registeredIds.forEach((id) => unregisterPattern(id));
});

function uploadFixtureFile() {
  const input = screen.getByLabelText(/choose a photo/i);
  const file = new File(['x'], 'ornament.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

async function walkToSelect() {
  uploadFixtureFile();
  // Flatten stage appears (skip-only stub) …
  const skip = await screen.findByRole('button', { name: /skip flatten/i });
  fireEvent.click(skip);
  // … then Select.
  await screen.findByRole('button', { name: /trace region/i });
}

describe('ExtractStepper — step flow', () => {
  it('shows all five stages of the guided flow', () => {
    render(<ExtractStepper onClose={() => {}} />);
    for (const label of ['Upload', 'Flatten', 'Select', 'Review', 'Save']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('advances Upload → Flatten (skip-only) → Select', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    expect(await screen.findByRole('button', { name: /skip flatten/i })).toBeTruthy();
    // The stub is honest about what it is.
    expect(screen.getByText(/auto-flatten/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /skip flatten/i }));
    expect(await screen.findByRole('button', { name: /trace region/i })).toBeTruthy();
  });

  it('traces the selected region and shows the Review proposal', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    // Review: traced geometry proposal + shape count.
    expect(await screen.findByText(/1 shape/i)).toBeTruthy();
    expect(mocks.extract).toHaveBeenCalledTimes(1);
  });

  it('stays on Select with a message when nothing traces (no dead end)', async () => {
    mocks.extract.mockResolvedValue({
      tile: { width: 4, height: 4, fills: [], strokes: [] },
      lattice: null,
      confidence: { trace: 0 },
    });
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    expect(await screen.findByText(/no shapes/i)).toBeTruthy();
    // Still on Select — the user can adjust and retry.
    expect(screen.getByRole('button', { name: /trace region/i })).toBeTruthy();
  });
});

// S6 (issue #55): Review is an editable per-shape proposal — flip a shape's
// engrave/cut/score role, toggle centerline↔contour, and the SAVED entity
// reflects the edits (locked decision 9).
describe('ExtractStepper — Review role flip + representation toggle (S6)', () => {
  async function walkToReview() {
    await walkToSelectShared();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByText(/2 shapes/i);
  }
  const walkToSelectShared = walkToSelect;

  beforeEach(() => {
    mocks.extract.mockResolvedValue(TRACE_RESULT_S6);
  });

  it('lists each shape with its default representation and role', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToReview();

    const rep1 = screen.getByRole('button', { name: /representation for shape 1/i });
    expect(rep1.textContent).toBe('Centerline'); // line-work → centerline-default
    const rep2 = screen.getByRole('button', { name: /representation for shape 2/i });
    expect(rep2.textContent).toBe('Contour');

    expect(screen.getByLabelText(/fabrication role for shape 1/i).value).toBe('score');
    expect(screen.getByLabelText(/fabrication role for shape 2/i).value).toBe('engrave');
  });

  it('renders centerlines visibly distinct from contours in the preview', async () => {
    const { container } = render(<ExtractStepper onClose={() => {}} />);
    await walkToReview();
    const svg = container.querySelector('svg[aria-label="Traced pattern preview"]');
    const strokePath = svg.querySelector('path[fill="none"]');
    expect(strokePath).toBeTruthy();
    expect(strokePath.getAttribute('stroke')).toBe('#2563eb'); // score color
    const fillPath = svg.querySelector('path[fill-rule="evenodd"]');
    expect(fillPath.getAttribute('fill')).toBe('#1a1a1a'); // engrave color
  });

  it('flipping a role carries into the saved entity', async () => {
    const onSaved = vi.fn();
    render(<ExtractStepper onClose={() => {}} onSaved={onSaved} />);
    await walkToReview();

    fireEvent.change(screen.getByLabelText(/fabrication role for shape 1/i), {
      target: { value: 'cut' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save to library/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { entity } = onSaved.mock.calls[0][0];
    registeredIds.push(entity.patternId);
    expect(entity.tile.strokes).toEqual([{ d: 'M10.5 30.5 L40.5 30.5', role: 'cut' }]);
    expect(entity.tile.fills).toEqual([{ d: 'M50 20 L70 20 L70 40 L50 40 Z', role: 'engrave' }]);
  });

  it('toggling centerline→contour saves the contour d with the fill default role', async () => {
    const onSaved = vi.fn();
    render(<ExtractStepper onClose={() => {}} onSaved={onSaved} />);
    await walkToReview();

    const rep1 = screen.getByRole('button', { name: /representation for shape 1/i });
    fireEvent.click(rep1);
    expect(rep1.textContent).toBe('Contour');
    expect(screen.getByLabelText(/fabrication role for shape 1/i).value).toBe('engrave');

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save to library/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { entity } = onSaved.mock.calls[0][0];
    registeredIds.push(entity.patternId);
    expect(entity.tile.strokes).toEqual([]);
    expect(entity.tile.fills).toEqual([
      { d: 'M10 29 L41 29 L41 32 L10 32 Z', role: 'engrave' },
      { d: 'M50 20 L70 20 L70 40 L50 40 Z', role: 'engrave' },
    ]);
  });

  it('toggling back restores the centerline with the stroke default role', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToReview();
    const rep1 = screen.getByRole('button', { name: /representation for shape 1/i });
    fireEvent.click(rep1);
    fireEvent.click(rep1);
    expect(rep1.textContent).toBe('Centerline');
    expect(screen.getByLabelText(/fabrication role for shape 1/i).value).toBe('score');
  });

  it('disables the toggle when the shape has only one representation', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToReview();
    // Shape 2's skeleton was degenerate — contour is the guaranteed floor.
    const rep2 = screen.getByRole('button', { name: /representation for shape 2/i });
    expect(rep2.disabled).toBe(true);
  });

  it('still supports results without components (single-representation rows)', async () => {
    mocks.extract.mockResolvedValue(TRACE_RESULT);
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelectShared();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByText(/1 shape/i);
    const rep = screen.getByRole('button', { name: /representation for shape 1/i });
    expect(rep.textContent).toBe('Contour');
    expect(rep.disabled).toBe(true); // no centerline available
    // Role flip still works.
    expect(screen.getByLabelText(/fabrication role for shape 1/i).value).toBe('engrave');
  });
});

describe('ExtractStepper — save', () => {
  async function walkToSave() {
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByText(/1 shape/i);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('button', { name: /save to library/i });
  }

  it('registers the pattern in the custom family and persists it', async () => {
    const onSaved = vi.fn();
    render(<ExtractStepper onClose={() => {}} onSaved={onSaved} />);
    await walkToSave();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Cathedral vault' } });
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const { entity, persisted } = onSaved.mock.calls[0][0];
    registeredIds.push(entity.patternId);

    expect(persisted).toBe(true);
    expect(entity.title).toBe('Cathedral vault');
    expect(entity.source).toBe('extracted');
    // Genuinely registered: class resolvable + typed as extracted (custom family).
    expect(getDynamicPatternClass(entity.patternId)).toBeTruthy();
    const t = getDynamicTypes().find((x) => x.id === entity.patternId);
    expect(t.origin).toBe('extracted');
    // The original photo travels to the repository for the private bucket.
    expect(mocks.save.mock.calls[0][1].photoBlob).toBeInstanceOf(File);
  });

  it('closes after a successful save', async () => {
    const onClose = vi.fn();
    render(<ExtractStepper onClose={onClose} onSaved={({ entity }) => registeredIds.push(entity.patternId)} />);
    await walkToSave();
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // Adversarial-review finding 2: a persisted:false save must not be silently
  // swallowed — the pattern IS kept for the session (by design), but the user
  // learns it won't survive a reload before the stepper goes away.
  it('surfaces a session-only notice on persisted:false and closes on dismiss', async () => {
    mocks.save.mockImplementation(async (entity) => ({
      entity,
      persisted: false,
      reason: 'save failed: relation "user_patterns" does not exist',
    }));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ExtractStepper onClose={onClose} onSaved={onSaved} />);
    await walkToSave();
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/saved for this session/i);
    expect(notice.textContent).toMatch(/disappear on reload/i);
    expect(notice.textContent).toMatch(/user_patterns/); // short reason surfaced
    // Not closed out from under the notice; the result still reached onSaved.
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0].persisted).toBe(false);
    registeredIds.push(onSaved.mock.calls[0][0].entity.patternId);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no session-only notice when the save persisted', async () => {
    const onClose = vi.fn();
    render(<ExtractStepper onClose={onClose} onSaved={({ entity }) => registeredIds.push(entity.patternId)} />);
    await walkToSave();
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/saved for this session/i)).toBeNull();
  });

  it('still registers in-session when persistence reports guest', async () => {
    mocks.save.mockImplementation(async (entity) => ({ entity, persisted: false, reason: 'guest' }));
    const onSaved = vi.fn();
    render(<ExtractStepper onClose={() => {}} onSaved={onSaved} />);
    await walkToSave();
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const { entity, persisted } = onSaved.mock.calls[0][0];
    registeredIds.push(entity.patternId);
    expect(persisted).toBe(false);
    expect(getDynamicPatternClass(entity.patternId)).toBeTruthy();
  });
});

describe('ExtractStepper — chrome', () => {
  it('closes on the X button', () => {
    const onClose = vi.fn();
    render(<ExtractStepper onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
