// CanvasChrome — fabrication chrome around the canvas (Lane B / B4, issue #7).
//
// Draws mm (or in/px) rulers along the top + left of the canvas and the machine
// BED as the artboard. Fully prop-driven so it renders + is assertable under
// jsdom without the live p5 surface:
//
//   bedWidthMm / bedHeightMm  the active machine profile's bed size (NOT the
//                             canvas px size — the bed is the artboard, #7-AC2).
//   unit                      the active display unit (mm default).
//   zoom                      the shell's useCanvasView zoom; tick screen
//                             positions scale by it so rulers track zoom.
//   pan                       optional {x,y} the shell's Hand tool drives.
//
// Tick screen positions are computed (rulerTicks) rather than left to a CSS
// transform, so they track zoom/pan explicitly and stay aligned with the cursor
// readout (which divides by the same scale). Pointer-events-none so it never
// steals canvas interaction.

import { PX_PER_MM, pxToUnit, unitToPx } from '../../lib/units';
import { rulerTicks } from '../../lib/canvasChrome';

const RULER = 18; // px band along top/left
const LABEL_FS = 9;

export default function CanvasChrome({
  bedWidthMm,
  bedHeightMm,
  unit = 'mm',
  zoom = 1,
  pan = { x: 0, y: 0 },
}) {
  // Bed dims arrive in mm (the canonical chrome unit from machineProfiles).
  // Convert mm -> base px (96 PPI) once via units.js, then re-express the bed's
  // length in the active display unit for the rulers.
  const bedWUnit = pxToUnit(bedWidthMm * PX_PER_MM, unit);
  const bedHUnit = pxToUnit(bedHeightMm * PX_PER_MM, unit);

  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const bedScreenW = unitToPx(bedWUnit, unit) * z;
  const bedScreenH = unitToPx(bedHUnit, unit) * z;

  const { major: majorX, minor: minorX } = rulerTicks(bedWUnit, unit, z);
  const { major: majorY, minor: minorY } = rulerTicks(bedHUnit, unit, z);

  return (
    <div
      data-testid="canvas-chrome"
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden="true"
    >
      <svg
        className="absolute left-0 top-0 overflow-visible"
        width={bedScreenW + RULER}
        height={bedScreenH + RULER}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {/* Bed artboard — the machine bed, sized from the active profile. */}
        <rect
          data-testid="bed-artboard"
          data-bed-w-mm={bedWidthMm}
          data-bed-h-mm={bedHeightMm}
          x={RULER + 0.5}
          y={RULER + 0.5}
          width={Math.max(0, bedScreenW - 1)}
          height={Math.max(0, bedScreenH - 1)}
          fill="none"
          stroke="#00c9b1"
          strokeOpacity="0.55"
          strokeWidth="1"
        />

        {/* Ruler bands */}
        <rect x={0} y={0} width={bedScreenW + RULER} height={RULER} fill="#0a0a0a" fillOpacity="0.35" />
        <rect x={0} y={0} width={RULER} height={bedScreenH + RULER} fill="#0a0a0a" fillOpacity="0.35" />

        {/* Corner unit badge */}
        <text
          x={3}
          y={RULER - 5}
          fontSize={LABEL_FS}
          fill="#6b7075"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {unit}
        </text>

        {/* Top ruler — minor ticks */}
        {minorX.map((t) => (
          <line
            key={`nx-${t.value}`}
            data-tick="minor-x"
            data-tick-value={t.value}
            data-pos={t.pos}
            x1={RULER + t.pos}
            y1={RULER * 0.55}
            x2={RULER + t.pos}
            y2={RULER}
            stroke="#6b7075"
            strokeOpacity="0.7"
            strokeWidth="0.5"
          />
        ))}
        {/* Top ruler — major ticks + labels */}
        {majorX.map((t) => (
          <g key={`mx-${t.value}`}>
            <line
              data-tick="major-x"
              data-tick-value={t.value}
              data-pos={t.pos}
              x1={RULER + t.pos}
              y1={0}
              x2={RULER + t.pos}
              y2={RULER}
              stroke="#9aa0a6"
              strokeOpacity="0.85"
              strokeWidth="1"
            />
            <text
              x={RULER + t.pos + 2}
              y={LABEL_FS}
              fontSize={LABEL_FS}
              fill="#c0c4c9"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {fmt(t.value)}
            </text>
          </g>
        ))}

        {/* Left ruler — minor ticks */}
        {minorY.map((t) => (
          <line
            key={`ny-${t.value}`}
            data-tick="minor-y"
            data-tick-value={t.value}
            data-pos={t.pos}
            x1={RULER * 0.55}
            y1={RULER + t.pos}
            x2={RULER}
            y2={RULER + t.pos}
            stroke="#6b7075"
            strokeOpacity="0.7"
            strokeWidth="0.5"
          />
        ))}
        {/* Left ruler — major ticks + labels */}
        {majorY.map((t) => (
          <g key={`my-${t.value}`}>
            <line
              data-tick="major-y"
              data-tick-value={t.value}
              data-pos={t.pos}
              x1={0}
              y1={RULER + t.pos}
              x2={RULER}
              y2={RULER + t.pos}
              stroke="#9aa0a6"
              strokeOpacity="0.85"
              strokeWidth="1"
            />
            <text
              x={2}
              y={RULER + t.pos + LABEL_FS}
              fontSize={LABEL_FS}
              fill="#c0c4c9"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {fmt(t.value)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function fmt(v) {
  return Number.isInteger(v) ? v : v.toFixed(1);
}
