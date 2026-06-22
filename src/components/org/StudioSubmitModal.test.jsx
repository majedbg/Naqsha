// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudioSubmitModal from './StudioSubmitModal.jsx';
import { listMyOrgs } from '../../lib/org/membershipService';
import { seedOperations } from '../../lib/operations';

vi.mock('../../lib/org/membershipService');

// Stub SubmitToOrg: surface the props it was mounted with (org/name/designId).
// Keeps this test about the org-selection + naming chrome, not the form internals.
vi.mock('./SubmitToOrg.jsx', () => ({
  default: ({ orgId, name, designId, userId, guest, onSubmitted }) => (
    <div data-testid="submit-to-org">
      {`org:${orgId}|name:${name}|design:${designId}|user:${userId}|guest:${
        guest ? guest.name : ''
      }|onSubmitted:${onSubmitted ? 'fn' : 'none'}`}
      {/* Lets the modal test trigger the host's onSubmitted (the member
          auto-close seam) without driving the real SubmitForm. */}
      <button
        type="button"
        onClick={() => onSubmitted?.({ id: 'row-x' })}
        data-testid="fire-submitted"
      >
        fire onSubmitted
      </button>
    </div>
  ),
}));

// Advance past the name step (prefilled, just confirm) to reach SubmitToOrg.
function continuePastName() {
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

const OPS = [
  ...seedOperations(),
  { id: 'op-pen-1', name: 'Pen', color: '#0f0', process: 'pen' },
];

// A design with one cut layer (submittable) + one pen layer (dropped).
const LAYERS = [
  { id: 'a', name: 'Outline', visible: true, color: '#000', operationId: 'op-cut' },
  { id: 'b', name: 'Doodle', visible: true, color: '#000', operationId: 'op-pen-1' },
];

function renderModal(props = {}) {
  return render(
    <StudioSubmitModal
      userId="u1"
      layers={LAYERS}
      getPatternInstances={() => ({})}
      canvasW={100}
      canvasH={50}
      operations={OPS}
      onClose={vi.fn()}
      onSubmitted={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudioSubmitModal', () => {
  it('with one org, prompts for a name then mounts SubmitToOrg with name + designId', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);

    renderModal({ designId: 'design-9' });

    // name step first — no submit form yet
    const nameInput = await screen.findByLabelText('Submission name');
    expect(screen.queryByTestId('submit-to-org')).toBeNull();
    // prefilled from the top submittable layer name
    expect(nameInput).toHaveValue('Outline');

    fireEvent.change(nameInput, { target: { value: 'Coaster v2' } });
    continuePastName();

    const stub = await screen.findByTestId('submit-to-org');
    expect(stub).toHaveTextContent('org:org-1|name:Coaster v2|design:design-9');
    expect(listMyOrgs).toHaveBeenCalledWith('u1');
  });

  it('blocks Continue when the name is blank', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);

    renderModal();

    const nameInput = await screen.findByLabelText('Submission name');
    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(screen.queryByTestId('submit-to-org')).toBeNull();
  });

  it('with several orgs, picks an org, then names, then mounts SubmitToOrg for the chosen one', async () => {
    listMyOrgs.mockResolvedValue([
      { id: 'org-1', name: 'ITP Camp' },
      { id: 'org-2', name: 'Makerspace' },
    ]);

    renderModal();

    // picker first — no name step / no submit form yet
    const pick = await screen.findByRole('button', { name: 'Makerspace' });
    expect(screen.queryByLabelText('Submission name')).toBeNull();

    fireEvent.click(pick);

    await screen.findByLabelText('Submission name');
    continuePastName();

    const stub = await screen.findByTestId('submit-to-org');
    expect(stub).toHaveTextContent('org:org-2');
  });

  it('warns about pen/unassigned layers that will be left out of the cut', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);

    renderModal();

    // the warning is shown up front, on the name step
    await screen.findByLabelText('Submission name');
    const warn = screen.getByRole('status');
    expect(warn).toHaveTextContent(/won.t be included/i);
    expect(warn).toHaveTextContent('Doodle'); // the pen layer, by name
  });

  it('blocks when the design has no cut/score/engrave layers', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);

    renderModal({
      layers: [{ id: 'b', name: 'Doodle', visible: true, color: '#000', operationId: 'op-pen-1' }],
    });

    expect(await screen.findByText(/no cut, score, or engrave layers/i)).toBeInTheDocument();
    expect(screen.queryByTestId('submit-to-org')).toBeNull();
  });

  it('tells a user with no orgs there is nowhere to submit', async () => {
    listMyOrgs.mockResolvedValue([]);

    renderModal();

    expect(await screen.findByText(/not a member of any organization/i)).toBeInTheDocument();
    expect(screen.queryByTestId('submit-to-org')).toBeNull();
  });

  it('surfaces a role="alert" when loading orgs fails', async () => {
    listMyOrgs.mockRejectedValue(new Error('rls denied'));

    renderModal();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);
    const onClose = vi.fn();

    renderModal({ onClose });

    fireEvent.click(await screen.findByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // FIX 1 regression (#27): the MEMBER path still threads the host onSubmitted
  // (its auto-close seam) down to SubmitToOrg and fires it on submit.
  it('member: threads onSubmitted down and fires it on submit (auto-close intact)', async () => {
    listMyOrgs.mockResolvedValue([{ id: 'org-1', name: 'ITP Camp' }]);
    const onSubmitted = vi.fn();

    renderModal({ onSubmitted });

    await screen.findByLabelText('Submission name');
    continuePastName();

    const stub = await screen.findByTestId('submit-to-org');
    expect(stub).toHaveTextContent('onSubmitted:fn');
    fireEvent.click(screen.getByTestId('fire-submitted'));
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });
});

// ─── Guest mode (#27): no userId, an org threaded in via `submitOrg` ──────────
describe('StudioSubmitModal — guest', () => {
  function renderGuest(props = {}) {
    return render(
      <StudioSubmitModal
        layers={LAYERS}
        getPatternInstances={() => ({})}
        canvasW={100}
        canvasH={50}
        operations={OPS}
        submitOrg={{ id: 'org-guest', name: 'Brooklyn Spark' }}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
        {...props}
      />,
    );
  }

  it('TRACER (guest): skips membership, collects a name, then mounts SubmitToOrg with the context org + guest identity', () => {
    renderGuest();

    // guest path must NOT look up memberships
    expect(listMyOrgs).not.toHaveBeenCalled();
    // no org-picker (the context org is used directly)
    expect(screen.queryByRole('button', { name: 'Brooklyn Spark' })).toBeNull();

    const nameField = screen.getByLabelText(/your name/i);
    fireEvent.change(nameField, { target: { value: 'Ada Lovelace' } });
    continuePastName();

    const stub = screen.getByTestId('submit-to-org');
    expect(stub).toHaveTextContent('org:org-guest');
    expect(stub).toHaveTextContent('guest:Ada Lovelace');
    // no member userId in guest mode
    expect(stub).toHaveTextContent('user:undefined');
  });

  it('requires a guest name before continuing', () => {
    renderGuest();
    // empty by default → Continue disabled
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(screen.queryByTestId('submit-to-org')).toBeNull();
  });

  it('shows a phone-consent line near the optional phone field', () => {
    renderGuest();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(
      screen.getByText(/we'll only use your phone/i),
    ).toBeInTheDocument();
  });

  it('passes optional email + phone through to SubmitToOrg', () => {
    renderGuest();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Grace' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'grace@x.io' },
    });
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: '5551234' },
    });
    continuePastName();
    expect(screen.getByTestId('submit-to-org')).toHaveTextContent('guest:Grace');
  });

  // FIX 2 (#27): the required guest-name field conveys required/invalid state
  // programmatically (not only via the disabled Continue button).
  it('marks the guest name input aria-required and flips aria-invalid with input', () => {
    renderGuest();
    const nameField = screen.getByLabelText(/your name/i);
    expect(nameField).toHaveAttribute('aria-required', 'true');
    // empty by default → invalid
    expect(nameField).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(nameField, { target: { value: 'Ada' } });
    expect(nameField).toHaveAttribute('aria-invalid', 'false');
    // back to empty → invalid again
    fireEvent.change(nameField, { target: { value: '   ' } });
    expect(nameField).toHaveAttribute('aria-invalid', 'true');
  });

  // FIX 1 (#27): guests must NOT be auto-closed on submit — the host's
  // onSubmitted (member auto-close) is suppressed for them so the in-modal
  // "✓ Submitted" confirmation can render and stay.
  it('does NOT pass the host onSubmitted down on the guest path (no auto-close)', () => {
    renderGuest();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Ada' },
    });
    continuePastName();
    expect(screen.getByTestId('submit-to-org')).toHaveTextContent(
      'onSubmitted:none',
    );
  });
});
