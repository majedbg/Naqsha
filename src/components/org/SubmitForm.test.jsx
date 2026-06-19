// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import SubmitForm from './SubmitForm.jsx';
import { listActiveOrgMaterials } from '../../lib/org/materialService';
import { uploadSubmissionSvg } from '../../lib/org/uploadService';
import { createSubmission } from '../../lib/org/submissionService';

vi.mock('../../lib/org/materialService');
vi.mock('../../lib/org/uploadService');
vi.mock('../../lib/org/submissionService');

const MATERIALS = [
  {
    id: 'om1',
    name: 'Birch Ply',
    thickness_mm: 3,
    sheet_w_mm: 600,
    sheet_h_mm: 400,
  },
  {
    id: 'om2',
    name: 'Acrylic',
    thickness_mm: 5,
    sheet_w_mm: 600,
    sheet_h_mm: 400,
  },
];

function makeDraft(overrides = {}) {
  return {
    source: 'upload',
    svgClean: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    widthMm: 100,
    heightMm: 50,
    ambiguous: false,
    ops: [
      { key: 'red', label: 'Outline', defaultOp: 'cut' },
      { key: 'blue', label: 'Detail', defaultOp: 'score' },
    ],
    name: 'Lattice Panel',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  listActiveOrgMaterials.mockResolvedValue(MATERIALS);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderForm(props = {}) {
  let utils;
  await act(async () => {
    utils = render(
      <SubmitForm
        draft={makeDraft()}
        orgId="org1"
        userId="u1"
        onSubmitted={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />,
    );
  });
  return utils;
}

describe('SubmitForm', () => {
  it('TRACER: renders a read-only review card with dims, material area, op-grouped layers and job name', async () => {
    await renderForm();

    // job name
    expect(screen.getByText('Lattice Panel')).toBeTruthy();
    // dimensions readout W × H mm
    expect(screen.getByText(/100\s*×\s*50\s*mm/)).toBeTruthy();
    // op-type group headings (grouped by op)
    expect(screen.getByText(/cut/i)).toBeTruthy();
    expect(screen.getByText(/score/i)).toBeTruthy();
    // each layer label present
    expect(screen.getByText('Outline')).toBeTruthy();
    expect(screen.getByText('Detail')).toBeTruthy();
    // materials were fetched for this org
    expect(listActiveOrgMaterials).toHaveBeenCalledWith('org1');
  });

  it('renders a sanitized SVG preview thumbnail of the draft', async () => {
    const { container } = await renderForm();
    const preview = container.querySelector('[data-testid="svg-preview"]');
    expect(preview).toBeTruthy();
    expect(preview.innerHTML).toContain('<svg');
  });

  it('hides the Hold-to-Submit button while editing', async () => {
    await renderForm();
    expect(
      screen.getByRole('button', { name: /hold to submit/i }),
    ).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    });

    expect(
      screen.queryByRole('button', { name: /hold to submit/i }),
    ).toBeNull();
  });

  it('gates submit with "Pick a material" until a material is chosen', async () => {
    await renderForm();
    // no material chosen yet → submit disabled with a clear reason
    expect(screen.getByText(/pick a material/i)).toBeTruthy();
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(true);
  });

  it('gates submit with "Confirm size" when the draft size is ambiguous', async () => {
    await act(async () => {
      render(
        <SubmitForm
          draft={makeDraft({ ambiguous: true })}
          orgId="org1"
          userId="u1"
          onSubmitted={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });
    expect(screen.getByText(/confirm size/i)).toBeTruthy();
  });

  it('gates submit with "Tag layer N" when a layer has no op type', async () => {
    await act(async () => {
      render(
        <SubmitForm
          draft={makeDraft({
            ops: [
              { key: 'red', label: 'Outline', defaultOp: 'cut' },
              { key: 'blue', label: 'Detail', defaultOp: null },
            ],
          })}
          orgId="org1"
          userId="u1"
          onSubmitted={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });
    expect(screen.getByText(/tag layer/i)).toBeTruthy();
  });

  it('Edit → pick material + rename → Save round-trips into the read-only card and clears the gate', async () => {
    await renderForm();

    // enter edit mode
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    });

    // pick a material
    act(() => {
      fireEvent.change(screen.getByLabelText('Material'), {
        target: { value: 'om1' },
      });
    });
    // rename the job
    act(() => {
      fireEvent.change(screen.getByLabelText('Job name'), {
        target: { value: 'Renamed Panel' },
      });
    });

    // save → back to read-only
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    // new name shown in the read-only card
    expect(screen.getByText('Renamed Panel')).toBeTruthy();
    // material readout reflects the choice
    expect(screen.getByText(/3mm Birch Ply/)).toBeTruthy();
    // gate now clears → hold-to-submit enabled
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(false);
    expect(screen.queryByText(/pick a material/i)).toBeNull();
  });

  it('Cancel edit reverts material/name changes', async () => {
    await renderForm();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Material'), {
        target: { value: 'om1' },
      });
      fireEvent.change(screen.getByLabelText('Job name'), {
        target: { value: 'Throwaway' },
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel edit/i }));
    });

    // original name restored, material not applied
    expect(screen.getByText('Lattice Panel')).toBeTruthy();
    expect(screen.queryByText('Throwaway')).toBeNull();
    expect(screen.getByText(/pick a material/i)).toBeTruthy();
  });

  it('on hold-complete: uploads then creates the submission, then calls onSubmitted(row)', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    const row = { id: 'row-1', status: 'pending' };
    createSubmission.mockResolvedValue(row);
    const onSubmitted = vi.fn();

    await renderForm({ onSubmitted });

    // satisfy the gate: pick a material via edit, save
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Material'), {
        target: { value: 'om1' },
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(false);

    // hold the full 2s
    await act(async () => {
      fireEvent.mouseDown(holdBtn);
      vi.advanceTimersByTime(2000);
    });
    // flush the upload→create promise chain
    await act(async () => {});
    await act(async () => {});

    expect(uploadSubmissionSvg).toHaveBeenCalledTimes(1);
    expect(createSubmission).toHaveBeenCalledTimes(1);

    // upload runs before create
    expect(
      uploadSubmissionSvg.mock.invocationCallOrder[0],
    ).toBeLessThan(createSubmission.mock.invocationCallOrder[0]);

    // upload path uses orgId/<id>.svg
    const upArg = uploadSubmissionSvg.mock.calls[0][0];
    expect(upArg.orgId).toBe('org1');
    expect(upArg.svgString).toBe(makeDraft().svgClean);
    expect(typeof upArg.submissionId).toBe('string');

    // create gets the snapshot incl. the upload's returned path + material
    const createArg = createSubmission.mock.calls[0][0];
    expect(createArg.orgId).toBe('org1');
    expect(createArg.submittedBy).toBe('u1');
    expect(createArg.orgMaterialId).toBe('om1');
    expect(createArg.materialLabel).toBe('3mm Birch Ply');
    expect(createArg.svgPath).toBe('org1/uuid-1.svg');
    expect(createArg.widthMm).toBe(100);
    expect(createArg.heightMm).toBe(50);
    expect(createArg.ops).toHaveLength(2);

    expect(onSubmitted).toHaveBeenCalledWith(row);
  });

  it('Cancel calls onCancel and persists nothing', async () => {
    const onCancel = vi.fn();
    await renderForm({ onCancel });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(uploadSubmissionSvg).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();
  });
});
