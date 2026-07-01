/*
 * ModulationParamBox — the "painted violet cell" that houses a modulation-scoped
 * param (today: the Grid's `warpNodes`). Per docs/spiral-grid-modulation-targets.md
 * §5.1, this is a CELL PAINTED ON THE GRID-SHEET in the violet ornamental ink —
 * NOT a card, NOT a glowing panel. A modulation-scoped param is the exception, so
 * the violet reads as "special" against the cream/paper ground (rarity = meaning,
 * the 10% accent). It extends the existing violet signal (focus ring + active
 * `modulation-preview` button); do NOT spread violet beyond this box.
 *
 * Craft contract (§5.1) — a reviewer runs a visual pass + AI-slop test against it:
 *   • FULL 1px `border-violet/40` hairline (a whole border, never a left side-
 *     stripe accent — that is a banned AI tell). Fill `bg-violet/8`. Radius = the
 *     `rounded-cell` token. Quiet and painted: NO glow, NO glass, NO drop shadow.
 *   • Owner label — a small naqsheh-style annotation (`text-[11px] uppercase
 *     tracking-wider text-violet`) mirroring the existing "Targets" micro-heading.
 *   • Reveal — when modulation becomes active the box enters via a
 *     grid-template-rows 0fr → 1fr animation (NEVER animate height), patient
 *     ease-out. CSS-only (`.anim-reveal-rows` in index.css, runs once on mount);
 *     it collapses to instant under prefers-reduced-motion via the motion token,
 *     so no setState-in-effect is needed.
 *
 * Presentational only: takes an `owner` label and wraps a single control as
 * `children`. Conditional visibility (whether to render at all) is the caller's
 * job — there is no "disabled" state to design (§5.1 Empty/inactive).
 */

export default function ModulationParamBox({ owner, children }) {
  return (
    // Reveal track — a grid whose single row animates 0fr → 1fr on mount. The
    // WHOLE cell (border + label + body) lives inside the clipped child, so the
    // entire box wipes in together — border and owner-label never snap in ahead
    // of the content (§5.1 "patient, nothing snaps"). Height is never animated.
    <div className="anim-reveal-rows">
      <div className="min-h-0 overflow-hidden">
        <div
          data-testid="modulation-param-box"
          className="rounded-cell border border-violet/40 bg-violet/8 p-2"
        >
          {/* Header row — the owner label (a naqsheh-style annotation in the
              violet ornamental ink). */}
          <div className="mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-violet">
              {owner}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
