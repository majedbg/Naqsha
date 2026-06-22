// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import SubmitForm from './SubmitForm.jsx';
import { listActiveOrgMaterials } from '../../lib/org/materialService';
import { uploadSubmissionSvg, removeSubmissionSvg } from '../../lib/org/uploadService';
import {
  createSubmission,
  createGuestSubmission,
} from '../../lib/org/submissionService';

vi.mock('../../lib/org/materialService');
vi.mock('../../lib/org/uploadService');
vi.mock('../../lib/org/submissionService');

// Mock-with-delegation: render the REAL HoldToSubmitButton (so the hold
// mechanism still drives onConfirm) while capturing the props it receives,
// which lets us assert `disabledReason` is wired through.
const { holdProps } = vi.hoisted(() => ({ holdProps: [] }));
vi.mock('./HoldToSubmitButton.jsx', async (orig) => {
  const actual = await orig();
  const React = await import('react');
  return {
    default: (props) => {
      holdProps.push(props);
      return React.createElement(actual.default, props);
    },
  };
});

function lastHoldProps() {
  return holdProps[holdProps.length - 1];
}

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
  holdProps.length = 0;
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
    // no material chosen yet → submit disabled with a clear reason.
    // (Scope to the visible gate-reason <li>; the hold button also exposes the
    // reason in an sr-only span, so an unscoped match is now ambiguous.)
    expect(
      screen.getByText(/pick a material/i, { selector: 'li' }),
    ).toBeTruthy();
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
    expect(
      screen.getByText(/pick a material/i, { selector: 'li' }),
    ).toBeTruthy();
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

  // Drive the form into a submit-ready state: pick a material in edit, save.
  function makeReady() {
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
  }

  async function holdToFire(holdBtn) {
    await act(async () => {
      fireEvent.mouseDown(holdBtn);
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {});
    await act(async () => {});
  }

  // ─── Fix 1: surface upload/create failures (no silent swallow) ──────────────
  it('surfaces an error and stays usable when createSubmission rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createSubmission.mockRejectedValue(new Error('RLS denied'));
    const onSubmitted = vi.fn();

    await renderForm({ onSubmitted });
    makeReady();

    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    await holdToFire(holdBtn);

    // visible, accessible error message
    expect(screen.getByRole('alert')).toBeTruthy();
    // logged for diagnosis
    expect(errSpy).toHaveBeenCalled();
    // onSubmitted NOT called on failure
    expect(onSubmitted).not.toHaveBeenCalled();
    // form stays usable: hold button re-enabled so the user can retry
    expect(
      screen.getByRole('button', { name: /hold to submit/i }).disabled,
    ).toBe(false);

    errSpy.mockRestore();
  });

  it('surfaces an error when uploadSubmissionSvg rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadSubmissionSvg.mockRejectedValue(new Error('network blip'));
    const onSubmitted = vi.fn();

    await renderForm({ onSubmitted });
    makeReady();

    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(errSpy).toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  // ─── Fix 2: clean up orphaned blob when create fails after upload ───────────
  it('removes the uploaded blob when createSubmission fails after a successful upload', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createSubmission.mockRejectedValue(new Error('RLS denied'));

    await renderForm();
    makeReady();
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    expect(removeSubmissionSvg).toHaveBeenCalledTimes(1);
    expect(removeSubmissionSvg).toHaveBeenCalledWith('org1/uuid-1.svg');

    errSpy.mockRestore();
  });

  it('does NOT attempt cleanup when the upload itself failed', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadSubmissionSvg.mockRejectedValue(new Error('upload boom'));

    await renderForm();
    makeReady();
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    expect(removeSubmissionSvg).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  // ─── Fix 3: pass the first unmet reason as disabledReason ───────────────────
  it('passes the first unmet completeness reason as disabledReason to the hold button', async () => {
    await renderForm();
    // gate unmet (no material) → first reason surfaced to the button
    expect(lastHoldProps().disabledReason).toBe('Pick a material');
  });

  it('clears disabledReason once the gate is satisfied', async () => {
    await renderForm();
    makeReady();
    expect(lastHoldProps().disabledReason).toBeUndefined();
  });

  // ─── Fix 4: gate also requires orgId/userId ─────────────────────────────────
  it('keeps submit disabled with a reason when orgId is missing', async () => {
    await renderForm({ orgId: undefined });
    makeReady();
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(true);
    expect(lastHoldProps().disabledReason).toBeTruthy();
  });

  it('keeps submit disabled with a reason when userId is missing', async () => {
    await renderForm({ userId: undefined });
    makeReady();
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(true);
    expect(lastHoldProps().disabledReason).toBeTruthy();
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

  // ─── Guest mode (#27): no userId, a `guest` identity prop instead ───────────
  // (reuses the makeReady / holdToFire helpers defined above)

  it('TRACER (guest): hold-complete calls createGuestSubmission (not createSubmission) with guest identity + org id', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createGuestSubmission.mockResolvedValue({ ok: true });
    const onSubmitted = vi.fn();

    await renderForm({
      userId: undefined,
      guest: { name: 'Ada Lovelace', email: 'ada@x.io', phone: '5551234' },
      onSubmitted,
    });
    makeReady();

    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(false);
    await holdToFire(holdBtn);

    expect(createGuestSubmission).toHaveBeenCalledTimes(1);
    expect(createSubmission).not.toHaveBeenCalled();

    const arg = createGuestSubmission.mock.calls[0][0];
    expect(arg.orgId).toBe('org1');
    expect(arg.guestName).toBe('Ada Lovelace');
    expect(arg.guestEmail).toBe('ada@x.io');
    expect(arg.guestPhone).toBe('5551234');
    // no member-only submitted_by leaks through the guest payload
    expect(arg.submittedBy).toBeUndefined();
    expect(arg.orgMaterialId).toBe('om1');
    expect(arg.svgPath).toBe('org1/uuid-1.svg');
    expect(onSubmitted).toHaveBeenCalledWith({ ok: true });
  });

  it('guest: keeps submit gated when the guest name is empty', async () => {
    await renderForm({ userId: undefined, guest: { name: '   ' } });
    makeReady();
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    expect(holdBtn.disabled).toBe(true);
    expect(lastHoldProps().disabledReason).toBeTruthy();
  });

  it('guest: still gated when neither userId nor guest is provided (no anon leak)', async () => {
    await renderForm({ userId: undefined });
    makeReady();
    expect(
      screen.getByRole('button', { name: /hold to submit/i }).disabled,
    ).toBe(true);
  });

  it('guest (AC8): auto-selects the only active material — no picker step needed', async () => {
    listActiveOrgMaterials.mockResolvedValue([MATERIALS[0]]); // exactly one active
    await renderForm({
      userId: undefined,
      guest: { name: 'Ada' },
    });
    // No "Pick a material" gate reason: the single material auto-selected.
    expect(screen.queryByText(/pick a material/i, { selector: 'li' })).toBeNull();
    // Its label is shown in the read-only card without entering edit.
    expect(screen.getByText(/3mm Birch Ply/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /hold to submit/i }).disabled,
    ).toBe(false);
  });

  it('guest: with multiple active materials, falls back to the picker (no auto-select)', async () => {
    listActiveOrgMaterials.mockResolvedValue(MATERIALS); // two active
    await renderForm({ userId: undefined, guest: { name: 'Ada' } });
    expect(
      screen.getByText(/pick a material/i, { selector: 'li' }),
    ).toBeTruthy();
  });

  it('member: a single active material is NOT auto-selected (member path unchanged)', async () => {
    listActiveOrgMaterials.mockResolvedValue([MATERIALS[0]]);
    await renderForm(); // member: userId present, no guest
    expect(
      screen.getByText(/pick a material/i, { selector: 'li' }),
    ).toBeTruthy();
  });

  it('guest: after submit, the done state offers "Make another" (no member submissions list)', async () => {
    listActiveOrgMaterials.mockResolvedValue([MATERIALS[0]]); // auto-selected
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createGuestSubmission.mockResolvedValue({ ok: true });
    const onSubmitted = vi.fn();

    await renderForm({
      userId: undefined,
      guest: { name: 'Ada' },
      onSubmitted,
    });
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/submitted/i);
    expect(
      screen.getByRole('button', { name: /make another/i }),
    ).toBeInTheDocument();
  });

  // FIX 1 (#27): "Make another" must return the guest to the studio — it fires
  // the reset callback (onAnother, or onCancel as the fallback the modal wires).
  it('guest: clicking "Make another" fires the reset callback (onCancel fallback)', async () => {
    listActiveOrgMaterials.mockResolvedValue([MATERIALS[0]]); // auto-selected
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createGuestSubmission.mockResolvedValue({ ok: true });
    const onCancel = vi.fn();

    await renderForm({
      userId: undefined,
      guest: { name: 'Ada' },
      onCancel,
    });
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /make another/i }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // FIX 1 (#27): an explicit onAnother takes precedence over onCancel.
  it('guest: "Make another" prefers onAnother when provided', async () => {
    listActiveOrgMaterials.mockResolvedValue([MATERIALS[0]]);
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createGuestSubmission.mockResolvedValue({ ok: true });
    const onAnother = vi.fn();
    const onCancel = vi.fn();

    await renderForm({
      userId: undefined,
      guest: { name: 'Ada' },
      onAnother,
      onCancel,
    });
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /make another/i }));
    });
    expect(onAnother).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('member: done state stays the plain "✓ Submitted" (no "Make another")', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createSubmission.mockResolvedValue({ id: 'r1' });
    await renderForm();
    makeReady();
    await holdToFire(screen.getByRole('button', { name: /hold to submit/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/submitted/i);
    expect(screen.queryByRole('button', { name: /make another/i })).toBeNull();
  });
});
