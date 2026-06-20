// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrgSubmitPage from './OrgSubmitPage';

// Mock useOrg/useAuth so the page gets a stable org.id + user.id without
// standing up the real providers.
vi.mock('./OrgContext', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'ITP' }, loading: false, notFound: false }),
}));
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Stub the heavy children: this is a wiring smoke for the page's state machine,
// not a re-test of UploadPipeline/SubmitForm/MySubmissions (each owns its tests).
vi.mock('../../components/org/UploadPipeline.jsx', () => ({
  default: ({ onComplete }) => (
    <button
      type="button"
      onClick={() =>
        onComplete({
          source: 'upload',
          svgClean: '<svg/>',
          widthMm: 100,
          heightMm: 50,
          ambiguous: false,
          ops: [],
          removed: [],
        })
      }
    >
      mock-upload
    </button>
  ),
}));
vi.mock('../../components/org/SubmitForm.jsx', () => ({
  default: ({ orgId, userId, onSubmitted, onCancel }) => (
    <div>
      <span data-testid="submitform-props">{`${orgId}|${userId}`}</span>
      <button type="button" onClick={() => onSubmitted({ id: 's1' })}>
        mock-submit
      </button>
      <button type="button" onClick={onCancel}>
        mock-cancel
      </button>
    </div>
  ),
}));
vi.mock('../../components/org/MySubmissions.jsx', () => ({
  default: ({ orgId, userId }) => (
    <div data-testid="my-submissions">{`${orgId}|${userId}`}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrgSubmitPage', () => {
  it('TRACER: shows the uploader → completing a draft reveals SubmitForm → submitting shows MySubmissions', () => {
    render(<OrgSubmitPage />);

    // Step 1: uploader is shown.
    expect(screen.getByText('mock-upload')).toBeInTheDocument();

    // Completing a draft reveals SubmitForm with org/user ids threaded through.
    fireEvent.click(screen.getByText('mock-upload'));
    expect(screen.getByTestId('submitform-props')).toHaveTextContent(
      'org-1|user-1',
    );

    // After onSubmitted, MySubmissions renders.
    fireEvent.click(screen.getByText('mock-submit'));
    expect(screen.getByTestId('my-submissions')).toHaveTextContent(
      'org-1|user-1',
    );
  });

  it('Cancel from SubmitForm returns to the uploader', () => {
    render(<OrgSubmitPage />);
    fireEvent.click(screen.getByText('mock-upload'));
    expect(screen.getByText('mock-cancel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('mock-cancel'));
    expect(screen.getByText('mock-upload')).toBeInTheDocument();
  });

  it('"Submit another" from the done state returns to the uploader', () => {
    render(<OrgSubmitPage />);
    fireEvent.click(screen.getByText('mock-upload'));
    fireEvent.click(screen.getByText('mock-submit'));
    expect(screen.getByTestId('my-submissions')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Submit another'));
    expect(screen.getByText('mock-upload')).toBeInTheDocument();
  });
});
