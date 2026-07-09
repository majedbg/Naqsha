// StatusBar — the pro shell's bottom status bar (Lane B / B4, issue #7).
//
// Reports document state: the active unit, the current zoom %, the live cursor
// coordinates in the active unit, and the active machine / bed. Fully prop-
// driven (cursor + zoom flow from Studio, which reads them off the same px->unit
// scale the rulers use), so it portals into the shell's Status bar region.
//
//   unit       active display unit (mm default).
//   zoom       useCanvasView zoom (1 = 100%).
//   cursor     { x, y } in the active unit, or null when off-canvas.
//   profileId  active machine profile id (for its human label).
//   bedSize    { width, height, unit } from defaultBedSize(profileId).

import { getProfile } from '../../lib/machineProfiles';

function fmtCoord(v) {
  return Number.isFinite(v) ? v.toFixed(1) : '–';
}

export default function StatusBar({
  unit = 'mm',
  zoom = 1,
  cursor = null,
  profileId = 'laser',
  bedSize,
  // Run Plan opener (PRD #73). When supplied, the machine/bed cluster becomes a
  // button that opens the pre-flight Run Plan — "tap the machine to see what it
  // will do". Omitted (legacy / no provider) → the cluster stays a plain span,
  // byte-unchanged.
  onOpenRunPlan,
}) {
  const zoomPct = `${Math.round((Number.isFinite(zoom) ? zoom : 1) * 100)}%`;
  const profile = getProfile(profileId);
  const bed = bedSize ?? {};
  const bedW = Number.isFinite(bed.width) ? Math.round(bed.width) : null;
  const bedH = Number.isFinite(bed.height) ? Math.round(bed.height) : null;
  const bedUnit = bed.unit ?? 'mm';

  const hasCursor = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y);

  return (
    <div
      data-testid="status-bar"
      className="flex h-full items-center gap-4 px-3 text-[11px] text-ink-soft select-none"
    >
      {/* Active unit */}
      <span aria-label="Unit" className="num">
        {unit}
      </span>

      {/* Zoom % */}
      <span aria-label="Zoom" className="num">
        {zoomPct}
      </span>

      {/* Live cursor coordinates in the active unit */}
      <span aria-label="Cursor position" className="num tabular-nums">
        {hasCursor
          ? `X ${fmtCoord(cursor.x)} · Y ${fmtCoord(cursor.y)} ${unit}`
          : `X – · Y – ${unit}`}
      </span>

      {/* Active machine / bed — pushed to the right. A button opening the Run
          Plan when a handler is wired; otherwise a plain readout. */}
      {onOpenRunPlan ? (
        <button
          type="button"
          aria-label="Active bed"
          title="Plan the run"
          onClick={onOpenRunPlan}
          className="ml-auto num rounded-xs px-1 -mx-1 text-ink-soft transition-colors duration-fast hover:text-ink hover:bg-paper-warm focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet"
        >
          {profile.label}
          {bedW != null && bedH != null
            ? ` · ${bedW} × ${bedH} ${bedUnit}`
            : ''}
        </button>
      ) : (
        <span aria-label="Active bed" className="ml-auto num">
          {profile.label}
          {bedW != null && bedH != null
            ? ` · ${bedW} × ${bedH} ${bedUnit}`
            : ''}
        </span>
      )}
    </div>
  );
}
