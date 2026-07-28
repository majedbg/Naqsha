// ============================================================================
// PROTOTYPE — THROWAWAY. Variant A "Ruler / drafting".
//
// The design bet: this is a plotter/laser tool, so the strip should read as a
// TECHNICAL DRAWING and borrow its authority. The baseline is a literal
// measuring rule with a unit scale zeroed on the window's left edge; the
// density mark is a shaded span across that rule; the spacing mark is a proper
// dimension line — extension lines, slanted end serifs, value on a leader.
// Anyone who has read a drawing already knows how to read it, and the floor
// can be drawn the way a drawing draws a limit: as a ghost dimension of the
// smallest legal size sitting next to the live one.
//
// Phase lock (half a step off the window's left edge) is shared with B and C —
// see dotField() in pitchProtoShared.jsx for why.
// ============================================================================
import {
  MIN_SPACING,
  WINDOW_UNITS,
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
const BASE = 34; // the rule
const DIM_Y = 17; // the dimension line
const TICK_MINOR = 38;
const TICK_MAJOR = 41;
const NUM_Y = 50;

function tickUnit(pxPerUnit) {
  for (const u of [1, 2, 5, 10, 25, 50, 100, 250, 500]) if (u * pxPerUnit >= 6) return u;
  return 1000;
}

export default function PitchVariantARuler({ unit, spacing, onSpacing, onFlip, zoom, reduced, stripWidth }) {
  const width = stripWidth;
  const geo = computeGeometry({ spacing, stripWidth: width, zoom });
  const dots = dotField({ ...geo, stripWidth: width });
  const pair = gripPair(dots, width / 2);
  const density = densityOf(spacing);
  const atFloor = isAtFloor(spacing);

  const minor = tickUnit(geo.pxPerUnit);
  const minorPx = minor * geo.pxPerUnit;
  const majorEvery = 5;
  const showNumerals = minorPx * majorEvery >= 30;
  const ticks = [];
  if (geo.measured && minorPx > 0) {
    const kLo = Math.ceil((STRIP_PAD - geo.windowX) / minorPx);
    const kHi = Math.floor((width - STRIP_PAD - geo.windowX) / minorPx);
    for (let k = kLo; k <= kHi && ticks.length < 240; k++) {
      ticks.push({ k, x: geo.windowX + k * minorPx, major: k % majorEvery === 0 });
    }
  }

  // The gripped gap can be wider than the strip at the sparse end. The badge
  // stays keyed to zoom only (decision 5), so instead of rescaling we clamp the
  // dimension line and put a caret on the edge it runs off.
  const left = STRIP_PAD;
  const right = Math.max(STRIP_PAD, width - STRIP_PAD);
  const a = pair ? Math.max(pair[0].x, left) : 0;
  const b = pair ? Math.min(pair[1].x, right) : 0;
  const runsOffL = pair ? pair[0].x < left - 0.5 : false;
  const runsOffR = pair ? pair[1].x > right + 0.5 : false;
  const gapPx = b - a;
  const labelInline = gapPx < 40;

  const floorPx = Math.max(3, MIN_SPACING * geo.pxPerUnit);
  const numeralInside = geo.windowPx >= 46;

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
              <FloorHatch id="pitch-a-hatch" />
            </defs>

            {/* ---------------------------------------------- the rule */}
            <line x1={left} y1={BASE} x2={right} y2={BASE} stroke="var(--hairline)" strokeWidth="1" />
            {ticks.map((t) => (
              <line
                key={t.k}
                x1={t.x}
                y1={BASE}
                x2={t.x}
                y2={t.major ? TICK_MAJOR : TICK_MINOR}
                stroke="var(--hairline)"
                strokeWidth={t.major ? 1 : 0.7}
              />
            ))}
            {showNumerals &&
              ticks
                .filter((t) => t.major)
                .map((t) => (
                  <text
                    key={`n${t.k}`}
                    x={t.x}
                    y={NUM_Y}
                    textAnchor="middle"
                    fontSize="8"
                    fill="var(--ink-soft)"
                    className="num"
                  >
                    {t.k * minor}
                  </text>
                ))}

            {/* ------------------------------- DENSITY — the shaded span */}
            <g style={{ opacity: unit === "density" ? 1 : 0, transition: markTransition(reduced) }}>
              <rect
                x={geo.windowX}
                y={12}
                width={geo.windowPx}
                height={BASE - 12}
                fill="var(--saffron)"
                opacity="0.14"
              />
              <line x1={geo.windowX} y1={12} x2={geo.windowX} y2={BASE} stroke="var(--saffron)" strokeWidth="1" />
              <line
                x1={geo.windowX + geo.windowPx}
                y1={12}
                x2={geo.windowX + geo.windowPx}
                y2={BASE}
                stroke="var(--saffron)"
                strokeWidth="1"
              />
              <line
                x1={geo.windowX}
                y1={12}
                x2={geo.windowX + geo.windowPx}
                y2={12}
                stroke="var(--saffron)"
                strokeWidth="1"
              />
              {/* live count numeral ON the mark — so the reading survives with
                  no motion at all (decision 11) */}
              <text
                x={geo.windowX + geo.windowPx / 2}
                y={numeralInside ? 25 : 9}
                textAnchor="middle"
                fontSize="10"
                fill="var(--ink)"
                className="num"
              >
                {formatDensity(density)}
              </text>
              {numeralInside && (
                <text
                  x={geo.windowX + geo.windowPx / 2}
                  y={9}
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="var(--ink-soft)"
                >
                  in {WINDOW_UNITS} u
                </text>
              )}
              {/* the floor is a SPACING limit, so in density state it has to be
                  said out loud — the numeral just stops at 25.0 otherwise */}
              {atFloor && (
                <text
                  x={geo.windowX + geo.windowPx - 3}
                  y={BASE - 3}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="var(--saffron)"
                  className="num"
                >
                  at min gap 4 u
                </text>
              )}
            </g>

            {/* ------------------------------ SPACING — the dimension line */}
            <g style={{ opacity: unit === "spacing" ? 1 : 0, transition: markTransition(reduced) }}>
              {pair && (
                <>
                  {/* extension lines */}
                  <line x1={a} y1={BASE - 5} x2={a} y2={DIM_Y - 4} stroke="var(--hairline)" strokeWidth="0.8" />
                  <line x1={b} y1={BASE - 5} x2={b} y2={DIM_Y - 4} stroke="var(--hairline)" strokeWidth="0.8" />
                  <line
                    x1={a}
                    y1={DIM_Y}
                    x2={b}
                    y2={DIM_Y}
                    stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                    strokeWidth="1"
                  />
                  {/* slanted end serifs — the drafting convention */}
                  {!runsOffL && (
                    <line
                      x1={a - 3}
                      y1={DIM_Y + 3.5}
                      x2={a + 3}
                      y2={DIM_Y - 3.5}
                      stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                      strokeWidth="1"
                    />
                  )}
                  {!runsOffR && (
                    <line
                      x1={b - 3}
                      y1={DIM_Y + 3.5}
                      x2={b + 3}
                      y2={DIM_Y - 3.5}
                      stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                      strokeWidth="1"
                    />
                  )}
                  {/* the gap runs off the strip — say so, don't rescale */}
                  {runsOffL && (
                    <path d={`M${a + 7},${DIM_Y - 4} L${a},${DIM_Y} L${a + 7},${DIM_Y + 4}`} fill="none" stroke="var(--ink-soft)" strokeWidth="1" />
                  )}
                  {runsOffR && (
                    <path d={`M${b - 7},${DIM_Y - 4} L${b},${DIM_Y} L${b - 7},${DIM_Y + 4}`} fill="none" stroke="var(--ink-soft)" strokeWidth="1" />
                  )}
                  <text
                    x={labelInline ? b + 5 : (a + b) / 2}
                    y={labelInline ? DIM_Y + 3 : DIM_Y - 4}
                    textAnchor={labelInline ? "start" : "middle"}
                    fontSize="10"
                    fill={atFloor ? "var(--saffron)" : "var(--ink)"}
                    className="num"
                  >
                    {spacing} u
                  </text>
                </>
              )}
              {/* the MIN_EDGE_SPACING floor, drawn the way a drawing draws a
                  limit: a ghost dimension of the smallest legal gap */}
              <g>
                <rect x={left} y={DIM_Y + 6} width={floorPx} height={5} fill="url(#pitch-a-hatch)" />
                <line
                  x1={left}
                  y1={DIM_Y + 5}
                  x2={left + floorPx}
                  y2={DIM_Y + 5}
                  stroke={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                  strokeWidth={atFloor ? 1.2 : 0.8}
                  opacity={atFloor ? 1 : 0.55}
                />
                <text
                  x={left + floorPx + 3}
                  y={DIM_Y + 9}
                  fontSize="7.5"
                  fill={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                  opacity={atFloor ? 1 : 0.7}
                  className="num"
                >
                  {atFloor ? "at min 4 u" : "min 4"}
                </text>
              </g>
            </g>

            {/* ------------------------------------------- anchor dots */}
            {dots.map((d) => {
              const lit =
                unit === "density" ? d.inWindow : pair != null && (d.k === pair[0].k || d.k === pair[1].k);
              return (
                <g
                  key={d.k}
                  style={{ transform: `translateX(${d.x}px)`, transition: dotTransition(reduced) }}
                >
                  <circle
                    cx={0}
                    cy={BASE}
                    r={lit ? 2.6 : 2}
                    fill={lit ? "var(--saffron)" : "var(--ink)"}
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
