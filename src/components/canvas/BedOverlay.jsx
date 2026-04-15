import { pxToUnit } from '../../lib/units';

// Draw rulers along the top and left edges of the canvas + a dashed margin
// rectangle inset from the edge, sized in the user's chosen display unit.
// Renders as an absolutely-positioned SVG overlay sitting *on top of* the
// canvas — the canvas still uses its own transform/scale, so overlays sit
// outside that transform and use canvasW/canvasH directly.
//
// The parent wraps canvas + overlay in a transform: scale(finalScale).
// That means this SVG is also scaled, which is what we want: tick marks
// stay aligned to real canvas positions regardless of zoom.

function tickSpacing(unit) {
  // Aim for ticks roughly every 50 display pixels at 1× zoom.
  // px per unit: mm ≈ 3.78, in = 96, px = 1.
  if (unit === 'mm') return { major: 10, minor: 5 };
  if (unit === 'in') return { major: 1,  minor: 0.5 };
  return { major: 100, minor: 50 };
}

export default function BedOverlay({ canvasW, canvasH, marginPx = 0, unit = 'mm' }) {
  const totalUnitsW = pxToUnit(canvasW, unit);
  const totalUnitsH = pxToUnit(canvasH, unit);
  const { major, minor } = tickSpacing(unit);
  const pxPerUnitW = canvasW / totalUnitsW;
  const pxPerUnitH = canvasH / totalUnitsH;

  const majorTicksX = [];
  for (let v = 0; v <= totalUnitsW + 1e-3; v += major) majorTicksX.push(v);
  const minorTicksX = [];
  for (let v = 0; v <= totalUnitsW + 1e-3; v += minor) {
    if (Math.abs((v / major) - Math.round(v / major)) > 1e-3) minorTicksX.push(v);
  }
  const majorTicksY = [];
  for (let v = 0; v <= totalUnitsH + 1e-3; v += major) majorTicksY.push(v);
  const minorTicksY = [];
  for (let v = 0; v <= totalUnitsH + 1e-3; v += minor) {
    if (Math.abs((v / major) - Math.round(v / major)) > 1e-3) minorTicksY.push(v);
  }

  const RULER = 16; // px of "ruler" band drawn inside the canvas along top/left
  const labelFs = 9;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      style={{ mixBlendMode: 'normal' }}
      aria-hidden="true"
    >
      {/* Bed border */}
      <rect
        x={0.5} y={0.5}
        width={canvasW - 1} height={canvasH - 1}
        fill="none"
        stroke="#00c9b1"
        strokeOpacity="0.55"
        strokeWidth="1"
      />

      {/* Ruler bands (subtle tinted strip at top/left) */}
      <rect x={0} y={0} width={canvasW} height={RULER} fill="#0a0a0a" fillOpacity="0.45" />
      <rect x={0} y={0} width={RULER} height={canvasH} fill="#0a0a0a" fillOpacity="0.45" />

      {/* Major ticks — top */}
      {majorTicksX.map((v) => {
        const x = v * pxPerUnitW;
        return (
          <g key={`mx-${v}`}>
            <line x1={x} y1={0} x2={x} y2={RULER} stroke="#9aa0a6" strokeOpacity="0.85" strokeWidth="1" />
            <text
              x={x + 2}
              y={RULER - 4}
              fontSize={labelFs}
              fill="#c0c4c9"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {/* Minor ticks — top */}
      {minorTicksX.map((v, i) => {
        const x = v * pxPerUnitW;
        return (
          <line key={`nx-${i}`} x1={x} y1={0} x2={x} y2={RULER * 0.45}
            stroke="#6b7075" strokeOpacity="0.7" strokeWidth="0.5" />
        );
      })}
      {/* Major ticks — left */}
      {majorTicksY.map((v) => {
        const y = v * pxPerUnitH;
        return (
          <g key={`my-${v}`}>
            <line x1={0} y1={y} x2={RULER} y2={y} stroke="#9aa0a6" strokeOpacity="0.85" strokeWidth="1" />
            <text
              x={2}
              y={y + labelFs + 1}
              fontSize={labelFs}
              fill="#c0c4c9"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {majorTicksY.length > 0 && (
        <text
          x={2}
          y={canvasH - 4}
          fontSize={labelFs}
          fill="#6b7075"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {unit}
        </text>
      )}
      {/* Minor ticks — left */}
      {minorTicksY.map((v, i) => {
        const y = v * pxPerUnitH;
        return (
          <line key={`ny-${i}`} x1={0} y1={y} x2={RULER * 0.45} y2={y}
            stroke="#6b7075" strokeOpacity="0.7" strokeWidth="0.5" />
        );
      })}

      {/* Margin rectangle */}
      {marginPx > 0 && (
        <rect
          x={marginPx}
          y={marginPx}
          width={Math.max(0, canvasW - marginPx * 2)}
          height={Math.max(0, canvasH - marginPx * 2)}
          fill="none"
          stroke="#ffb020"
          strokeOpacity="0.7"
          strokeWidth="1"
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}
