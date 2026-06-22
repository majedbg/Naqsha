import { useState } from 'react';
import { setSubmissionsOpen } from '../../../lib/org/orgService';

// Admin control to open/close an org's guest submission window. Reflects the
// current `orgs.submissions_open` state and flips it via setSubmissionsOpen.
export default function SubmissionsToggle({ orgId, open }) {
  const [isOpen, setIsOpen] = useState(Boolean(open));
  const [error, setError] = useState('');

  async function handleToggle() {
    const next = !isOpen;
    setError('');
    try {
      await setSubmissionsOpen(orgId, next);
      setIsOpen(next);
    } catch (e) {
      setError(e?.message || 'Could not update submissions.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div
          role="alert"
          className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-900">
          {`Submissions: ${isOpen ? 'Open' : 'Closed'}`}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOpen}
          aria-label="Submissions open"
          className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700"
          onClick={handleToggle}
        >
          {isOpen ? 'Close' : 'Open'}
        </button>
      </div>
    </div>
  );
}
