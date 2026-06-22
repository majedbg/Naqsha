// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SubmissionsToggle from './SubmissionsToggle.jsx';
import { setSubmissionsOpen } from '../../../lib/org/orgService';

vi.mock('../../../lib/org/orgService');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubmissionsToggle', () => {
  it('shows the current state in words', () => {
    render(<SubmissionsToggle orgId="org-1" open={true} />);
    expect(screen.getByText(/submissions: open/i)).toBeInTheDocument();
  });

  it('flips closed->open via setSubmissionsOpen and reflects the new state', async () => {
    setSubmissionsOpen.mockResolvedValue({ id: 'org-1', submissions_open: true });

    render(<SubmissionsToggle orgId="org-1" open={false} />);
    expect(screen.getByText(/submissions: closed/i)).toBeInTheDocument();

    const control = screen.getByRole('switch', { name: /submissions/i });
    fireEvent.click(control);

    await waitFor(() =>
      expect(setSubmissionsOpen).toHaveBeenCalledWith('org-1', true),
    );
    expect(await screen.findByText(/submissions: open/i)).toBeInTheDocument();
  });

  it('surfaces a role="alert" when the update fails (no silent failure)', async () => {
    setSubmissionsOpen.mockRejectedValue(new Error('update denied'));

    render(<SubmissionsToggle orgId="org-1" open={false} />);
    fireEvent.click(screen.getByRole('switch', { name: /submissions/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // state unchanged on failure
    expect(screen.getByText(/submissions: closed/i)).toBeInTheDocument();
  });
});
