import { useMemo } from 'react';
import { sanitizeSvg } from '../../lib/svg/sanitizeSvg';
import { parseDimensions } from '../../lib/svg/parseDimensions';
import { extractOps } from '../../lib/svg/extractOps';
import SubmitForm from './SubmitForm.jsx';

// In-app submit path (spec §5). The studio's real SVG exporter is deeply coupled
// to layer/instance/canvas state, so the current design's SVG is supplied via an
// injected `exportSvg` function (called once on open). That SVG MUST tag each
// layer group with `data-role="cut|score|engrave"` so ops derive from layer
// ROLES (not stroke colors) — see the integrator note in SubmitToOrg.test.jsx.
export default function SubmitToOrg({
  orgId,
  userId,
  // Guest mode (#27): when provided (and no userId), passed through to SubmitForm
  // so the submit goes via createGuestSubmission. Member path leaves it null.
  guest = null,
  exportSvg,
  designId = null,
  name,
  onSubmitted,
  onCancel,
}) {
  // Built once "on open": export → sanitize → parse exact dims → derive ops.
  const draft = useMemo(() => {
    const raw = exportSvg();
    const { clean } = sanitizeSvg(raw);
    const dims = parseDimensions(clean);
    const ops = extractOps(clean, { source: 'design' });
    return {
      source: 'design',
      svgClean: clean,
      // In-app dimensions are exact, so the size is never ambiguous.
      widthMm: dims.widthMm,
      heightMm: dims.heightMm,
      ambiguous: false,
      ops,
      designId,
      name,
    };
    // exportSvg is treated as a snapshot taken on open; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SubmitForm
      draft={draft}
      orgId={orgId}
      userId={userId}
      guest={guest}
      onSubmitted={onSubmitted}
      onCancel={onCancel}
    />
  );
}
