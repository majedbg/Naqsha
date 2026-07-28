// ============================================================================
// PROTOTYPE — THROWAWAY. Variant C "Aperture / caliper".
//
// The design bet: make the control read as an INSTRUMENT rather than a
// picture. The strip is a window onto a dot field that continues past both
// edges (it fades out, it does not stop), so the graphic never pretends the
// anchors are a finite little row. Density is a FIXED viewport frame — corner
// brackets whose size depends on zoom alone, never on the value — and the
// field scales underneath it; that fixity is the pedagogical point, and it is
// the one variant where the rectangle's constancy is drawn rather than
// asserted. Spacing is a caliper whose jaws grip exactly two adjacent dots,
// with a stop block on the left jaw that the right jaw hits at 4 u.
//
// NOTE the field "slides" only in the sense that it RESCALES ABOUT THE
// WINDOW'S LEFT EDGE. It must not genuinely translate: the half-step phase
// lock shared with A and B (see dotField() in pitchProtoShared.jsx) is what
// makes the dots inside the frame count to the numeral, and a drifting phase
// would break exactly the thing this variant is best at showing.
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
const FIELD_Y = 29; // the dot field
const FRAME_TOP = 13;
const FRAME_BOT = 45;
const ROD_Y = 19;

export default function PitchVariantCAperture({ unit, spacing, onSpacing, onFlip, zoom, reduced, stripWidth }) {
  const width = stripWidth;
  const geo = computeGeometry({ spacing, stripWidth: width, zoom });
  const dots = dotField({ ...geo, stripWidth: width });
  const pair = gripPair(dots, width / 2);
  const density = densityOf(spacing);
  const atFloor = isAtFloor(spacing);

  const left = STRIP_PAD;
  const right = Math.max(STRIP_PAD, width - STRIP_PAD);
  const fadeIn = width > 0 ? Math.min(0.45, (STRIP_PAD + 10) / width) : 0;

  // At the sparse end the far jaw is off-strip. Clamp it and dash the rod —
  // the badge stays keyed to zoom only (decision 5), never to the value.
  const a = pair ? Math.max(pair[0].x, left) : 0;
  const b = pair ? Math.min(pair[1].x, right) : 0;
  const runsOff = pair ? pair[0].x < left - 0.5 || pair[1].x > right + 0.5 : false;
  const floorPx = Math.max(3, MIN_SPACING * geo.pxPerUnit);
  const readoutInline = b - a >= 46;

  const arm = Math.min(9, Math.max(3, geo.windowPx / 4)); // corner-bracket arm

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
              <FloorHatch id="pitch-c-hatch" />
              {/* mask LUMINANCE, not ink — `white` here means "fully opaque",
                  it never paints, so the tokens-only rule does not apply. */}
              <linearGradient id="pitch-c-fade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="white" stopOpacity="0" />
                <stop offset={fadeIn} stopColor="white" stopOpacity="1" />
                <stop offset={1 - fadeIn} stopColor="white" stopOpacity="1" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id="pitch-c-mask">
                <rect x="0" y="0" width={Math.max(1, width)} height={H} fill="url(#pitch-c-fade)" />
              </mask>
            </defs>

            {/* the field's own rule — runs edge to edge, no end caps: the
                anchors continue past the aperture */}
            <line x1={0} y1={FIELD_Y} x2={width} y2={FIELD_Y} stroke="var(--hairline)" strokeWidth="1" mask="url(#pitch-c-mask)" />

            {/* -------------------------- DENSITY — the fixed viewport frame */}
            <g style={{ opacity: unit === "density" ? 1 : 0, transition: markTransition(reduced) }}>
              <rect
                x={geo.windowX}
                y={FRAME_TOP}
                width={geo.windowPx}
                height={FRAME_BOT - FRAME_TOP}
                fill="var(--saffron)"
                opacity="0.08"
              />
              {[
                [geo.windowX, FRAME_TOP, 1, 1],
                [geo.windowX + geo.windowPx, FRAME_TOP, -1, 1],
                [geo.windowX, FRAME_BOT, 1, -1],
                [geo.windowX + geo.windowPx, FRAME_BOT, -1, -1],
              ].map(([x, y, sx, sy], i) => (
                <path
                  key={i}
                  d={`M${x + sx * arm},${y} L${x},${y} L${x},${y + sy * arm}`}
                  fill="none"
                  stroke="var(--saffron)"
                  strokeWidth="1.6"
                />
              ))}
              {/* the live count, on the mark, so it reads with zero motion */}
              <g transform={`translate(${geo.windowX + geo.windowPx / 2} 0)`}>
                <rect x={-15} y={FRAME_TOP - 1} width={30} height={12} fill="var(--paper)" opacity="0.85" />
                <text x={0} y={FRAME_TOP + 8} textAnchor="middle" fontSize="10" fill="var(--ink)" className="num">
                  {formatDensity(density)}
                </text>
              </g>
              <text
                x={geo.windowX + geo.windowPx / 2}
                y={FRAME_BOT - 2}
                textAnchor="middle"
                fontSize="7"
                fill="var(--ink-soft)"
              >
                aperture · 100 u
              </text>
              {/* the floor is a SPACING limit, so in density state it has to be
                  said out loud — the numeral just stops at 25.0 otherwise */}
              {atFloor && (
                <text
                  x={geo.windowX + geo.windowPx - 4}
                  y={FRAME_TOP + 8}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="var(--saffron)"
                  className="num"
                >
                  jaws closed · min 4 u
                </text>
              )}
            </g>

            {/* ------------------------------------ SPACING — the caliper */}
            <g style={{ opacity: unit === "spacing" ? 1 : 0, transition: markTransition(reduced) }}>
              {pair && (
                <>
                  {/* jaws */}
                  {[a, b].map((x, i) => (
                    <g key={i}>
                      <line
                        x1={x}
                        y1={ROD_Y - 5}
                        x2={x}
                        y2={FIELD_Y + 5}
                        stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                        strokeWidth="1.4"
                      />
                      <line
                        x1={x}
                        y1={FIELD_Y + 5}
                        x2={x + (i === 0 ? 4 : -4)}
                        y2={FIELD_Y + 5}
                        stroke={atFloor ? "var(--saffron)" : "var(--ink)"}
                        strokeWidth="1.4"
                      />
                    </g>
                  ))}
                  {/* measuring rod */}
                  <line
                    x1={a}
                    y1={ROD_Y}
                    x2={b}
                    y2={ROD_Y}
                    stroke={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                    strokeWidth="1"
                    strokeDasharray={runsOff ? "3 2" : undefined}
                  />
                  {!runsOff && b - a > 12 && (
                    <>
                      <path d={`M${a + 5},${ROD_Y - 3} L${a},${ROD_Y} L${a + 5},${ROD_Y + 3}`} fill="none" stroke="var(--ink-soft)" strokeWidth="1" />
                      <path d={`M${b - 5},${ROD_Y - 3} L${b},${ROD_Y} L${b - 5},${ROD_Y + 3}`} fill="none" stroke="var(--ink-soft)" strokeWidth="1" />
                    </>
                  )}
                  {/* the instrument's readout */}
                  <g transform={`translate(${readoutInline ? (a + b) / 2 : b + 26} ${runsOff ? 8 : 0})`}>
                    <rect
                      x={-21}
                      y={ROD_Y - 8}
                      width={42}
                      height={13}
                      rx={2}
                      fill="var(--paper)"
                      stroke={atFloor ? "var(--saffron)" : "var(--hairline)"}
                      strokeWidth="0.9"
                    />
                    <text
                      x={0}
                      y={ROD_Y + 1.5}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={atFloor ? "var(--saffron)" : "var(--ink)"}
                      className="num"
                    >
                      {spacing} u
                    </text>
                  </g>
                  {/* stop block on the left jaw — the right jaw closes onto it
                      at exactly MIN_EDGE_SPACING, so the floor is a physical
                      limit you can see coming, not a silent clamp */}
                  <rect x={a} y={FIELD_Y + 7} width={floorPx} height={6} fill="url(#pitch-c-hatch)" />
                  <line
                    x1={a}
                    y1={FIELD_Y + 7}
                    x2={a + floorPx}
                    y2={FIELD_Y + 7}
                    stroke={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                    strokeWidth={atFloor ? 1.4 : 0.8}
                    opacity={atFloor ? 1 : 0.6}
                  />
                  <text
                    x={a + floorPx + 3}
                    y={FIELD_Y + 13}
                    fontSize="7.5"
                    fill={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
                    opacity={atFloor ? 1 : 0.7}
                    className="num"
                  >
                    {atFloor ? "jaws closed · min 4 u" : "min 4"}
                  </text>
                </>
              )}
            </g>

            {/* -------------------------------------------- the dot field */}
            <g mask="url(#pitch-c-mask)">
              {dots.map((d) => {
                const lit =
                  unit === "density" ? d.inWindow : pair != null && (d.k === pair[0].k || d.k === pair[1].k);
                return (
                  <g key={d.k} style={{ transform: `translateX(${d.x}px)`, transition: dotTransition(reduced) }}>
                    <circle
                      cx={0}
                      cy={FIELD_Y}
                      r={lit ? 2.6 : 1.9}
                      fill={lit ? "var(--saffron)" : "var(--ink)"}
                      opacity={lit ? 1 : 0.45}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </GraphicButton>

      <PolarityCaption unit={unit} />
    </div>
  );
}
