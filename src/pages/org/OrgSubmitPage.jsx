import { useState } from 'react';
import { useOrg } from './OrgContext';
import { useAuth } from '../../lib/AuthContext';
import UploadPipeline from '../../components/org/UploadPipeline.jsx';
import SubmitForm from '../../components/org/SubmitForm.jsx';
import MySubmissions from '../../components/org/MySubmissions.jsx';

// OrgSubmitPage — the member submit flow rendered inside OrgRoute's branded
// shell at /o/:slug. Three-step state machine:
//   1. 'upload'   — <UploadPipeline> collects + sanitizes an SVG into a draft.
//   2. 'review'   — <SubmitForm> tags ops, picks material, hold-to-submit.
//   3. 'done'     — <MySubmissions> shows the member's jobs (incl. the new one).
// A Cancel in step 2 returns to step 1; "Submit another" in step 3 resets to 1.
export default function OrgSubmitPage() {
  const { org } = useOrg();
  const { user } = useAuth();
  const [draft, setDraft] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const orgId = org?.id;
  const userId = user?.id;

  function reset() {
    setDraft(null);
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            Your submissions
          </h1>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            onClick={reset}
          >
            Submit another
          </button>
        </div>
        <MySubmissions orgId={orgId} userId={userId} />
      </div>
    );
  }

  if (draft) {
    return (
      <div className="p-4">
        <SubmitForm
          draft={draft}
          orgId={orgId}
          userId={userId}
          onSubmitted={() => setSubmitted(true)}
          onCancel={reset}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-gray-900">Submit a design</h1>
      <UploadPipeline onComplete={setDraft} />
    </div>
  );
}
