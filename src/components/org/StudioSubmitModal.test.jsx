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
  default: ({ orgId, name, designId }) => (
    <div data-testid="submit-to-org">{`org:${orgId}|name:${name}|design:${designId}`}</div>
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
});
