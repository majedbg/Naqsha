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
  detectQuad: vi.fn(),
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

// S4 (issue #53): the auto-detect seam. Default null → the plain manual default
// corners, so every pre-S4 test walks the flow unchanged; the S4 describe block
// below drives the detected-proposal path with mockReturnValueOnce.
vi.mock('../../lib/extraction/detectQuad', () => ({
  detectQuad: mocks.detectQuad,
  MIN_QUAD_CONFIDENCE: 0.4,
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
  mocks.detectQuad.mockReset().mockReturnValue(null);
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

// --- S4 (issue #53): auto-detect pre-fills the Flatten quad -------------------

describe('ExtractStepper — auto-detect flatten (S4)', () => {
  const DETECTED = [
    { x: 0.22, y: 0.12 },
    { x: 0.86, y: 0.2 },
    { x: 0.78, y: 0.84 },
    { x: 0.16, y: 0.74 },
  ];

  it('pre-fills the detected quad and shows the confidence badge', async () => {
    mocks.detectQuad.mockReturnValueOnce({ quad: DETECTED, confidence: 0.82 });
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });

    // Handles land on the detected corners (not the 12% default).
    const tl = screen.getByRole('button', { name: /top-left corner/i });
    expect(tl.style.left).toBe('22%');
    expect(tl.style.top).toBe('12%');
    // Confidence badge (editable proposal, locked decision 8).
    const badge = screen.getByTestId('flatten-detection-badge');
    expect(badge.textContent).toMatch(/plane detected/i);
    expect(badge.textContent).toMatch(/82%/);

    // Detection ran on the decoded upload (a real ImageData-shaped input).
    expect(mocks.detectQuad).toHaveBeenCalledTimes(1);
    expect(mocks.detectQuad.mock.calls[0][0]).toHaveProperty('width');
  });

  it('the detected corners are still draggable, then apply uses them', async () => {
    mocks.detectQuad.mockReturnValueOnce({ quad: DETECTED, confidence: 0.7 });
    const gbcr = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 });
    try {
      render(<ExtractStepper onClose={() => {}} />);
      uploadFixtureFile();
      await screen.findByRole('button', { name: /apply flatten/i });

      // Nudge the top-left corner — proposals are corrections, not commitments.
      const area = screen.getByTestId('flatten-area');
      fireEvent.pointerDown(screen.getByTestId('corner-handle-0'), { clientX: 88, clientY: 36 });
      fireEvent.pointerMove(area, { clientX: 40, clientY: 30 });
      const tl = screen.getByRole('button', { name: /top-left corner/i });
      expect(tl.style.left).toBe('10%'); // 40/400
      expect(tl.style.top).toBe('10%'); // 30/300

      // Apply warps with the CORRECTED quad in pixels of the 200×150 ImageData.
      fireEvent.click(screen.getByRole('button', { name: /apply flatten/i }));
      await screen.findByText(/^before$/i);
      const [, quadArg] = mocks.rectify.mock.calls[0];
      expect(quadArg[0].x).toBeCloseTo(0.1 * 200, 6);
      expect(quadArg[0].y).toBeCloseTo(0.1 * 150, 6);
    } finally {
      gbcr.mockRestore();
    }
  });

  it('falls back to the plain default corners (no badge) when nothing is detected', async () => {
    mocks.detectQuad.mockReturnValueOnce(null);
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });

    const tl = screen.getByRole('button', { name: /top-left corner/i });
    expect(tl.style.left).toBe('12%'); // DEFAULT_QUAD inset
    expect(screen.queryByTestId('flatten-detection-badge')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a detection failure is silent — default corners, no error banner', async () => {
    mocks.detectQuad.mockImplementationOnce(() => {
      throw new Error('detector blew up');
    });
    render(<ExtractStepper onClose={() => {}} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });

    const tl = screen.getByRole('button', { name: /top-left corner/i });
    expect(tl.style.left).toBe('12%');
    expect(screen.queryByTestId('flatten-detection-badge')).toBeNull();
    // Fail-soft: indistinguishable from "no detection ran".
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an explicit initialQuad prop overrides auto-detect (no detection, no badge)', async () => {
    const external = [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.3 },
      { x: 0.7, y: 0.7 },
      { x: 0.3, y: 0.7 },
    ];
    render(<ExtractStepper onClose={() => {}} initialQuad={external} />);
    uploadFixtureFile();
    await screen.findByRole('button', { name: /apply flatten/i });

    const tl = screen.getByRole('button', { name: /top-left corner/i });
    expect(tl.style.left).toBe('30%');
    expect(mocks.detectQuad).not.toHaveBeenCalled();
    expect(screen.queryByTestId('flatten-detection-badge')).toBeNull();
  });
});

// --- S5 (issue #54): lattice Review — draggable repeat cell + tiled preview --

const LATTICE_S5 = {
  t1: [20, 0],
  t2: [0, 20],
  cell: { width: 20, height: 20 },
  type: 'square',
  confidence: 0.87,
};

const TRACE_RESULT_LATTICE = {
  tile: {
    width: 20,
    height: 20,
    fills: [{ d: 'M4 4 L16 4 L16 16 L4 16 Z', role: 'engrave' }],
    strokes: [],
  },
  lattice: LATTICE_S5,
  latticeCell: { x: 0, y: 0, width: 20, height: 20 },
  confidence: { lattice: 0.87, trace: 1 },
};

describe('ExtractStepper — lattice Review (S5)', () => {
  // Display box for the cell editor's pointer math (selection is the full
  // 400×300 mock image → 1 display px = 2 image px).
  const BOX = { left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150 };
  let gbcr;
  beforeEach(() => {
    gbcr = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(BOX);
  });
  afterEach(() => gbcr.mockRestore());

  async function walkToReviewWithLattice() {
    mocks.extract.mockResolvedValueOnce(TRACE_RESULT_LATTICE);
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByTestId('lattice-cell-editor');
  }

  it('shows the tiled preview, confidence badge, and draggable cell when a repeat is detected', async () => {
    await walkToReviewWithLattice();
    // Tiled preview: 3×3-cell window, 9 copies of the fill.
    const tiled = screen.getByTestId('tiled-preview');
    expect(tiled).toHaveAttribute('viewBox', '0 0 60 60');
    expect(tiled.querySelectorAll('g')).toHaveLength(9);
    // Confidence badge as a percentage (editable proposal, locked decision 8).
    expect(screen.getByTestId('lattice-confidence')).toHaveTextContent('87%');
    expect(screen.getByTestId('lattice-cell')).toBeTruthy();
  });

  it('dragging the cell re-extracts the SAME selection with the corrected cell', async () => {
    await walkToReviewWithLattice();
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 20, clientY: 15, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    await waitFor(() => expect(mocks.extract).toHaveBeenCalledTimes(2));
    // +10 display px → +20 image px on x; +5 → +10 on y, from the (0,0) cell.
    expect(mocks.extract.mock.calls[1][1]).toEqual({
      lattice: { cell: { x: 20, y: 10, width: 20, height: 20 } },
    });
    // The SAME selection rect was re-cropped for the re-run.
    expect(mocks.cropToImageData).toHaveBeenCalledTimes(2);
    expect(mocks.cropToImageData.mock.calls[1][1]).toEqual(
      mocks.cropToImageData.mock.calls[0][1]
    );
  });

  it('"Use single motif" opts out: re-extracts with lattice:false and shows the floor', async () => {
    await walkToReviewWithLattice();
    fireEvent.click(screen.getByRole('button', { name: /use single motif/i }));
    await waitFor(() => expect(mocks.extract).toHaveBeenCalledTimes(2));
    expect(mocks.extract.mock.calls[1][1]).toEqual({ lattice: false });
    // Default mock (TRACE_RESULT, lattice null) lands → single-motif floor.
    expect(await screen.findByTestId('no-lattice-notice')).toHaveTextContent(/single motif/i);
    expect(screen.queryByTestId('tiled-preview')).toBeNull();
  });

  it('no repeat detected → floor notice; "Mark repeat cell" seeds a manual editable cell', async () => {
    render(<ExtractStepper onClose={() => {}} />);
    await walkToSelect();
    fireEvent.click(screen.getByRole('button', { name: /trace region/i }));
    await screen.findByTestId('no-lattice-notice');
    expect(screen.queryByTestId('lattice-cell-editor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /mark repeat cell/i }));
    expect(screen.getByTestId('lattice-confidence')).toHaveTextContent(/manual/i);

    // Committing the manual cell re-extracts with it (selection 400×300 →
    // seeded cell (100,75) 200×150; +10 display px → +20 image px on x).
    const cell = screen.getByTestId('lattice-cell');
    const box = screen.getByTestId('lattice-cell-box');
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    await waitFor(() => expect(mocks.extract).toHaveBeenCalledTimes(2));
    expect(mocks.extract.mock.calls[1][1]).toEqual({
      lattice: { cell: { x: 120, y: 75, width: 200, height: 150 } },
    });
  });

  it('the saved entity carries the detected lattice (free tier = tile + lattice + export)', async () => {
    await walkToReviewWithLattice();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /save to library/i }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const entity = mocks.save.mock.calls[0][0];
    registeredIds.push(entity.patternId);
    expect(entity.lattice).toEqual(LATTICE_S5);
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
