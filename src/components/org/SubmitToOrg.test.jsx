// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import SubmitToOrg from './SubmitToOrg.jsx';
import { listActiveOrgMaterials } from '../../lib/org/materialService';
import { uploadSubmissionSvg } from '../../lib/org/uploadService';
import {
  createSubmission,
  createGuestSubmission,
} from '../../lib/org/submissionService';

// SubmitToOrg renders the REAL SubmitForm; mock only SubmitForm's services so a
// real submit drive proves the built draft is actually consumable end-to-end.
vi.mock('../../lib/org/materialService');
vi.mock('../../lib/org/uploadService');
vi.mock('../../lib/org/submissionService');

const MATERIALS = [
  { id: 'om1', name: 'Birch Ply', thickness_mm: 3, sheet_w_mm: 600, sheet_h_mm: 400 },
];

// An in-app exported design SVG: each layer is a <g> tagged with data-role
// (cut/score/engrave) by its operation — this is what extractOps(source:'design')
// reads. Exact physical dims in mm (in-app → unambiguous).
const DESIGN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="layer-cut" data-role="cut"><path d="M0 0 L10 10"/></g>
  <g id="layer-score" data-role="score"><path d="M0 0 L5 5"/></g>
</svg>`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  listActiveOrgMaterials.mockResolvedValue(MATERIALS);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderSubmit(props = {}) {
  let utils;
  await act(async () => {
    utils = render(
      <SubmitToOrg
        orgId="org1"
        userId="u1"
        exportSvg={() => DESIGN_SVG}
        onSubmitted={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />,
    );
  });
  return utils;
}

describe('SubmitToOrg', () => {
  it('TRACER: builds a design draft (exact dims + role-derived ops) and renders a pre-filled SubmitForm', async () => {
    await renderSubmit();

    // exact in-app dimensions surfaced (source:design → ambiguous:false)
    expect(screen.getByText(/100\s*×\s*50\s*mm/)).toBeTruthy();
    // ops grouped by layer role (cut/score) — derived from data-role, NOT stroke
    expect(screen.getByRole('heading', { name: /cut/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /score/i })).toBeTruthy();
  });

  // Drive the real SubmitForm to a submit-ready state, then hold the full 2s.
  function makeReadyAndHold() {
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

  async function holdToFire() {
    const holdBtn = screen.getByRole('button', { name: /hold to submit/i });
    await act(async () => {
      fireEvent.mouseDown(holdBtn);
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {});
    await act(async () => {});
  }

  it('submitting writes a pending submission with exact dims and source:design (ops from roles)', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    const row = { id: 'row-1', status: 'pending' };
    createSubmission.mockResolvedValue(row);
    const onSubmitted = vi.fn();

    await renderSubmit({ onSubmitted });
    makeReadyAndHold();
    await holdToFire();

    expect(createSubmission).toHaveBeenCalledTimes(1);
    const arg = createSubmission.mock.calls[0][0];
    expect(arg.source).toBe('design');
    expect(arg.widthMm).toBe(100);
    expect(arg.heightMm).toBe(50);
    // ops are derived from the two layer roles (cut + score), not stroke colors.
    expect(arg.ops).toHaveLength(2);
    expect(arg.ops.map((o) => o.op).sort()).toEqual(['cut', 'score']);
    expect(onSubmitted).toHaveBeenCalledWith(row);
  });

  it('sanitizes malicious content in the exported SVG before it is submitted', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createSubmission.mockResolvedValue({ id: 'row-1' });
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
      <g id="layer-cut" data-role="cut"><path d="M0 0 L10 10"/></g>
      <script>alert('xss')</script>
    </svg>`;

    await renderSubmit({ exportSvg: () => maliciousSvg });
    makeReadyAndHold();
    await holdToFire();

    // the SVG uploaded for the submission carries no <script>.
    const upArg = uploadSubmissionSvg.mock.calls[0][0];
    expect(upArg.svgString).not.toMatch(/<script/i);
  });

  it('Cancel calls onCancel and persists nothing', async () => {
    const onCancel = vi.fn();
    await renderSubmit({ onCancel });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(uploadSubmissionSvg).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('guest: threads the guest identity through so submitting writes via createGuestSubmission', async () => {
    uploadSubmissionSvg.mockResolvedValue('org1/uuid-1.svg');
    createGuestSubmission.mockResolvedValue({ ok: true });
    const onSubmitted = vi.fn();

    await renderSubmit({
      userId: undefined,
      guest: { name: 'Grace Hopper', email: '', phone: '' },
      onSubmitted,
    });
    makeReadyAndHold();
    await holdToFire();

    expect(createGuestSubmission).toHaveBeenCalledTimes(1);
    expect(createSubmission).not.toHaveBeenCalled();
    const arg = createGuestSubmission.mock.calls[0][0];
    expect(arg.guestName).toBe('Grace Hopper');
    // exact in-app dims + role-derived ops still flow through the built draft
    expect(arg.widthMm).toBe(100);
    expect(arg.heightMm).toBe(50);
    expect(arg.source).toBe('design');
    expect(onSubmitted).toHaveBeenCalledWith({ ok: true });
  });
});
