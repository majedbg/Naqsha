// @vitest-environment jsdom
//
// ExtractStepper (S0, issue #49; Flatten deepened in S3, issue #52) —
// full-screen guided flow Upload → Flatten → Select → Review → Save (locked
// decision 7; Flatten = manual 4-corner rectify + skip, locked decision 2).
// Tests walk the external flow with the DOM/canvas seam (imageIO) and the
// worker seam (workerBridge) mocked; the registry + entity layers are real,
// so a completed walk genuinely registers a pattern into the picker's custom
// family.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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

const RECTIFY_RESULT = {
  rectified: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
  homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  rectify: vi.fn(),
  dispose: vi.fn(),
  save: vi.fn(),
  cropToImageData: vi.fn(),
}));

vi.mock('../../lib/extraction/imageIO', () => ({
  fileToDataURL: vi.fn(async () => 'data:image/png;base64,x'),
  // Tag decoded images with their source URL so tests can tell whether the
  // ORIGINAL or the RECTIFIED image reached the Select/trace path.
  loadImage: vi.fn(async (url) => ({ naturalWidth: 400, naturalHeight: 300, src: url })),
  cropToImageData: mocks.cropToImageData,
  imageToImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 200, height: 150 })),
  imageDataToDataURL: vi.fn(() => 'data:image/png;base64,rectified'),
}));

vi.mock('../../lib/extraction/workerBridge', () => ({
  createExtractionBridge: () => ({
    extract: mocks.extract,
    rectify: mocks.rectify,
    dispose: mocks.dispose,
  }),
}));

vi.mock('../../lib/libraryRepository', () => ({
  saveExtractedPattern: mocks.save,
}));

import ExtractStepper from './ExtractStepper';
import { getDynamicPatternClass, getDynamicTypes, unregisterPattern } from '../../lib/patternRegistry';

let registeredIds = [];

beforeEach(() => {
  mocks.extract.mockReset().mockResolvedValue(TRACE_RESULT);
  mocks.rectify.mockReset().mockResolvedValue(RECTIFY_RESULT);
  mocks.save.mockReset().mockImplementation(async (entity) => ({ entity, persisted: true }));
  mocks.cropToImageData
    .mockReset()
    .mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
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

  it('advances Upload → Flatten (skippable) → Select', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    expect(await screen.findByRole('button', { name: /skip flatten/i })).toBeTruthy();
    // Manual rectify is offered (S3) …
    expect(screen.getByRole('button', { name: /apply flatten/i })).toBeTruthy();
    // … but "already flat" skips straight through.
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

  // S2 (issue #51): the stepper renders PER-STAGE progress from the pipeline's
  // staged events — every stage listed, each showing its latest status
  // (waiting/loading/running+fraction/done/skipped) while extraction runs.
  it('shows per-stage progress from the staged pipeline events', async () => {
    let emitProgress;
    let resolveExtract;
    mocks.extract.mockImplementation((_img, _opts, onProgress) => {
      emitProgress = onProgress;
      return new Promise((resolve) => {
        resolveExtract = () => resolve(TRACE_RESULT);
      });
    });
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));

    const rail = await screen.findByRole('list', { name: /extraction progress/i });
    // Every pipeline stage is listed up front, waiting.
    expect(rail.textContent).toMatch(/Flatten/);
    expect(rail.textContent).toMatch(/Trace/);
    expect(rail.textContent).toMatch(/waiting/i);

    await act(async () => emitProgress({ stage: 'flatten', status: 'skipped' }));
    expect(rail.textContent).toMatch(/skipped/i);

    await act(async () => emitProgress({ stage: 'trace', status: 'running', progress: 0.42 }));
    expect(rail.textContent).toMatch(/running/i);
    expect(rail.textContent).toMatch(/42%/);

    await act(async () => resolveExtract());
    // Extraction finished → Review, rail gone.
    expect(await screen.findByText(/1 shape/i)).toBeTruthy();
    expect(screen.queryByRole('list', { name: /extraction progress/i })).toBeNull();
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

// S3 (issue #52): manual 4-corner rectify + skip in the Flatten step.
describe('ExtractStepper — flatten (S3)', () => {
  it('shows four draggable corner handles over the photo', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });
    for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
      expect(screen.getByRole('button', { name: new RegExp(`${corner} corner`, 'i') })).toBeTruthy();
    }
  });

  it('skip bypasses rectification entirely', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByText(/1 shape/i);
    expect(mocks.rectify).not.toHaveBeenCalled();
    // The trace cropped the ORIGINAL upload.
    expect(mocks.cropToImageData.mock.calls[0][0].src).toBe('data:image/png;base64,x');
  });

  it('apply warps through the bridge (pixel quad) and shows before/after', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    fireEvent.click(await screen.findByRole('button', { name: /apply flatten/i }));

    // Before/after preview appears once the warp resolves.
    expect(await screen.findByText(/^before$/i)).toBeTruthy();
    expect(screen.getByText(/after — flattened/i)).toBeTruthy();
    expect(screen.getByAltText(/flattened photo/i).src).toContain('base64,rectified');

    // The quad reached the worker in PIXELS of the passed ImageData (200×150),
    // default corners at 12% inset.
    expect(mocks.rectify).toHaveBeenCalledTimes(1);
    const [imageArg, quadArg] = mocks.rectify.mock.calls[0];
    expect(imageArg.width).toBe(200);
    expect(quadArg[0].x).toBeCloseTo(0.12 * 200, 6);
    expect(quadArg[2].y).toBeCloseTo(0.88 * 150, 6);
  });

  it('the rectified raster flows into Select/trace after Continue', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    fireEvent.click(await screen.findByRole('button', { name: /apply flatten/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));

    fireEvent.click(await screen.findByRole('button', { name: /trace region/i }));
    await screen.findByText(/1 shape/i);
    // Select cropped the RECTIFIED image at its rectified dimensions (2×2).
    const [imgArg, rectArg] = mocks.cropToImageData.mock.calls[0];
    expect(imgArg.src).toContain('base64,rectified');
    expect(rectArg).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('"Adjust corners" discards the proposal and returns to the handles', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    fireEvent.click(await screen.findByRole('button', { name: /apply flatten/i }));
    fireEvent.click(await screen.findByRole('button', { name: /adjust corners/i }));

    expect(await screen.findByRole('button', { name: /apply flatten/i })).toBeTruthy();
    expect(screen.queryByText(/after — flattened/i)).toBeNull();
  });

  it('"Use original" from the preview proceeds with the unrectified photo', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    fireEvent.click(await screen.findByRole('button', { name: /apply flatten/i }));
    fireEvent.click(await screen.findByRole('button', { name: /use original/i }));

    fireEvent.click(await screen.findByRole('button', { name: /trace region/i }));
    await screen.findByText(/1 shape/i);
    expect(mocks.cropToImageData.mock.calls[0][0].src).toBe('data:image/png;base64,x');
  });

  it('surfaces a warp failure without leaving the Flatten step', async () => {
    mocks.rectify.mockRejectedValue(new Error('Cannot flatten: quad is degenerate (corners in a line)'));
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    fireEvent.click(await screen.findByRole('button', { name: /apply flatten/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /apply flatten/i })).toBeTruthy();
  });

  // S4 seam: detected corners arrive as a programmatic pre-fill.
  it('accepts an initialQuad pre-fill (S4 seam) and applies it', async () => {
    const detected = [
      { x: 0.2, y: 0.1 },
      { x: 0.9, y: 0.15 },
      { x: 0.85, y: 0.9 },
      { x: 0.15, y: 0.8 },
    ];
    render(<ExtractStepper onClose={() => {}} initialQuad={detected} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });
    // Handles sit at the detected corners …
    const tl = screen.getByRole('button', { name: /top-left corner/i });
    expect(tl.style.left).toBe('20%');
    expect(tl.style.top).toBe('10%');
    // … and the applied warp uses them.
    fireEvent.click(screen.getByRole('button', { name: /apply flatten/i }));
    await screen.findByText(/^before$/i);
    const [, quadArg] = mocks.rectify.mock.calls[0];
    expect(quadArg[0].x).toBeCloseTo(0.2 * 200, 6);
    expect(quadArg[3].y).toBeCloseTo(0.8 * 150, 6);
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
