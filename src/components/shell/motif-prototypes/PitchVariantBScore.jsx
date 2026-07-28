// ============================================================================
// PROTOTYPE — THROWAWAY. Variant B "Score / rhythm".
//
// The design bet: the app already teaches placement as a SEQUENCE — slots,
// rests, a Trace transport that plays placement order. If pitch is drawn as
// rhythm, the control joins a metaphor the user has already learned instead of
// opening a second one. Anchors are noteheads on a staff; density is a BAR —
// barlines at 0 and 100 u with its count set inside like a time signature,
// which is exactly what a time signature is (how many beats in this measure);
// spacing is the span mark between two adjacent notes, drawn as a slur.
// The floor is a stop barline: nothing may be written closer than this.
//
// Phase lock (half a step off the window's left edge) is shared with A and C —
// see dotField() in pitchProtoShared.jsx for why.
// ============================================================================
import {
  MIN_SPACING,
  computeGeometry,
  densityOf,
  dotField,
  dotTransition,
  formatDensity,
  gripPair,
  isAtFloor,
  markTransition,
  FloorHatch,
  GraphicButton,
  PitchRowOne,
  PolarityCaption,
  STRIP_PAD,
} from "./pitchProtoShared";

const H = 54;
const STAFF = 32; // the line the notes sit on
const LEDGER_TOP = 26;
const LEDGER_BOT = 38;
const BAR_TOP = 14;
const BAR_BOT = 44;

export default function PitchVariantBScore({ unit, spacing, onSpacing, onFlip, zoom, reduced, stripWidth }) {
  const width = stripWidth;
  const geo = computeGeometry({ spacing, stripWidth: width, zoom });
  const dots = dotField({ ...geo, stripWidth: width });
  const pair = gripPair(dots, width / 2);
  const density = densityOf(spacing);
  const atFloor = isAtFloor(spacing);

  const left = STRIP_PAD;
  const right = Math.max(STRIP_PAD, width - STRIP_PAD);
  const stems = geo.stepPx >= 9;

  // The slur can be wider than the strip at the sparse end. Clamp and mark the
  // edge it runs off — the badge stays keyed to zoom only (decision 5).
  const a = pair ? Math.max(pair[0].x, left) : 0;
  const b = pair ? Math.min(pair[1].x, right) : 0;
  const runsOff = pair ? pair[0].x < left - 0.5 || pair[1].x > right + 0.5 : false;

  const sigInside = geo.windowPx >= 44;
  const floorPx = Math.max(3, MIN_SPACING * geo.pxPerUnit);

  return (
    <div className="flex flex-col gap-1.5">
      <PitchRowOne
        unit={unit}
        spacing={spacing}
        onSpacing={onSpacing}
        toScale={geo.toScale}
        measured={geo.measured}
      />

      <GraphicButton unit={unit} spacing={spacing} onFlip={onFlip} reduced={reduced}>
        <div className="w-full">
          <svg width="100%" height={H} viewBox={`0 0 ${Math.max(1, width)} ${H}`} aria-hidden focusable="false">
            <defs>
              <FloorHatch id="pitch-b-hatch" />
            </defs>

            {/* ---------------------------------------------- the staff */}
            {[LEDGER_TOP, LEDGER_BOT].map((y) => (
              <line key={y} x1={left} y1={y} x2={right} y2={y} stroke="var(--hairline)" strokeWidth="0.7" opacity="0.6" />
            ))}
            <line x1={left} y1={STAFF} x2={right} y2={STAFF} stroke="var(--hairline)" strokeWidth="1" />

            {/* -------------------------- the stop barline = the 4u floor */}
            <g>
              <rect x={left} y={LEDGER_TOP} width={floorPx} height={LEDGER_BOT - LEDGER_TOP} fill="url(#pitch-b-hatch)" />
              <line
                x1={left + floorPx}
                y1={LEDGER_TOP - 2}
                x2={left + floorPx}
                y2={LEDGER_BOT + 2}
                stroke={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                strokeWidth={atFloor ? 2.4 : 1.6}
                opacity={atFloor ? 1 : 0.6}
              />
              <text
                x={left + floorPx + 3}
                y={LEDGER_BOT + 9}
                fontSize="7.5"
                fill={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                opacity={atFloor ? 1 : 0.7}
                className="num"
              >
                {atFloor ? "at min 4 u" : "min 4"}
              </text>
            </g>

            {/* ------------------------------ DENSITY — the bar / measure */}
            <g style={{ opacity: unit === "density" ? 1 : 0, transition: markTransition(reduced) }}>
              <rect
                x={geo.windowX}
                y={BAR_TOP}
                width={geo.windowPx}
                height={BAR_BOT - BAR_TOP}
                fill="var(--saffron)"
                opacity="0.1"
              />
              {[geo.windowX, geo.windowX + geo.windowPx].map((x, i) => (
                <line key={i} x1={x} y1={BAR_TOP} x2={x} y2={BAR_BOT} stroke="var(--saffron)" strokeWidth="1.4" />
              ))}
              {/* the count, set inside the bar like a time signature — this is
                  the reading that survives with no motion at all (dec. 11) */}
              <text
                x={sigInside ? geo.windowX + 5 : geo.windowX + geo.windowPx / 2}
                y={sigInside ? 22 : 11}
                textAnchor={sigInside ? "start" : "middle"}
                fontSize="11"
                fill="var(--ink)"
                className="num"
              >
                {formatDensity(density)}
              </text>
              {sigInside && (
                <text x={geo.windowX + 5} y={BAR_BOT - 2} fontSize="7" fill="var(--ink-soft)">
                  per bar of 100 u
                </text>
              )}
              {/* the floor is a SPACING limit, so in density state it has to be
                  said out loud — the numeral just stops at 25.0 otherwise */}
              {atFloor && (
                <text
                  x={geo.windowX + geo.windowPx - 4}
                  y={BAR_BOT - 2}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="var(--saffron)"
                  className="num"
                >
                  at min gap 4 u
                </text>
              )}
            </g>

            {/* --------------------------- SPACING — the span mark (slur) */}
            <g style={{ opacity: unit === "spacing" ? 1 : 0, transition: markTransition(reduced) }}>
              {pair && (
                <>
                  <path
                    d={`M${a},${LEDGER_TOP - 1} Q${(a + b) / 2},${runsOff ? 9 : 15} ${b},${LEDGER_TOP - 1}`}
                    fill="none"
                    stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                    strokeWidth="1.2"
                    strokeDasharray={runsOff ? "3 2" : undefined}
                  />
                  {/* the span's value sits clear of the slur: above it when the
                      gap is wide enough to hold it, beside it when it isn't */}
                  <text
                    x={b - a < 34 ? b + 4 : (a + b) / 2}
                    y={b - a < 34 ? 20 : 12}
                    textAnchor={b - a < 34 ? "start" : "middle"}
                    fontSize="10"
                    fill={atFloor ? "var(--saffron)" : "var(--ink)"}
                    className="num"
                  >
                    {spacing} u
                  </text>
                </>
              )}
            </g>

            {/* ------------------------------------------- the noteheads */}
            {dots.map((d) => {
              const lit =
                unit === "density" ? d.inWindow : pair != null && (d.k === pair[0].k || d.k === pair[1].k);
              const tint = lit ? "var(--saffron)" : "var(--ink)";
              return (
                <g key={d.k} style={{ transform: `translateX(${d.x}px)`, transition: dotTransition(reduced) }}>
                  {stems && (
                    <line x1={3} y1={STAFF} x2={3} y2={STAFF - 11} stroke={tint} strokeWidth="0.9" opacity={lit ? 1 : 0.5} />
                  )}
                  <ellipse
                    cx={0}
                    cy={STAFF}
                    rx={lit ? 3.2 : 2.7}
                    ry={lit ? 2.4 : 2}
                    transform={`rotate(-18 0 ${STAFF})`}
                    fill={tint}
                    opacity={lit ? 1 : 0.55}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </GraphicButton>

      <PolarityCaption unit={unit} />
    </div>
  );
}
