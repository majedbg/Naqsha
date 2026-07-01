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
