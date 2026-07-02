// CanvasChrome — fabrication chrome around the canvas (Lane B / B4, issue #7).
//
// Draws rulers (mm/in/px) along the top + left, a solid outline of the DESIGN
// CANVAS (the artboard the rulers measure), and the active machine BED as a
// dashed "fits-on-machine" guide sharing the same top-left origin. Fully
// prop-driven so it renders + is assertable under jsdom without the live p5
// surface:
//
//   canvasWidthPx / canvasHeightPx  the design canvas size (96-PPI px, same as
//                             the p5 surface). The rulers measure THIS, and it's
//                             the solid artboard outline.
//   bedWidthMm / bedHeightMm  the active machine profile's bed size (mm). Drawn
//                             as the dashed guide, NOT the rulers' basis.
//   unit                      the active display unit (mm default).
//   zoom                      the shell's useCanvasView zoom; tick screen
//                             positions scale by it so rulers track zoom.
//   pan                       optional {x,y} the shell's Hand tool drives
//                             (legacy path, used only when `origin` is absent).
//   origin                    optional {x,y} the on-screen top-left of the
//                             canvas surface, measured relative to the chrome's
//                             container. When supplied, the chrome translates so
//                             ruler 0,0 sits at the canvas corner — keeping the
//                             rulers ON the artwork instead of pinned to the
//                             container's top-left. `origin` already encodes
//                             centering + pan + scroll (it's the same measured
//                             rect the cursor readout uses), so pan is NOT
//                             re-applied on this path. Absent → legacy pan-only.
//   showBed                   toggles the machine-bed overlay (bed-fill wash +
//                             bed-guide dashed rect). Defaults to true (today's
//                             behavior). false → neither bed rect renders and the
//                             SVG extent shrinks to the canvas alone, so a hidden
//                             bed reserves no layout space. The canvas-artboard
//                             rect + rulers/ticks are unaffected either way.
//
// Tick screen positions are computed (rulerTicks) rather than left to a CSS
// transform, so they track zoom explicitly and stay aligned with the cursor
// readout (which divides by the same scale). Pointer-events-none so it never
// steals canvas interaction.

import { PX_PER_MM, pxToUnit, unitToPx } from '../../lib/units';
import { rulerTicks } from '../../lib/canvasChrome';

const RULER = 18; // px band along top/left
const LABEL_FS = 9;

export default function CanvasChrome({
  // The DESIGN canvas — rulers measure THIS and it's the solid artboard outline.
  // Native px (96 PPI), matching the p5 surface; converted to the display unit.
  canvasWidthPx,
  canvasHeightPx,
  // The MACHINE bed (mm, from the active profile) — drawn as a dashed
  // "fits-on-machine" guide sharing the canvas's top-left origin, so you can see
  // how much of the design the selected machine can actually reach.
  bedWidthMm,
  bedHeightMm,
  unit = 'mm',
  zoom = 1,
  pan = { x: 0, y: 0 },
  origin = null,
  // Machine-bed overlay toggle — see header comment. Default true keeps every
  // existing caller byte-identical.
  showBed = true,
}) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  // Canvas (artboard) extent — rulers measure this. px -> display unit -> screen.
  const canvasWUnit = pxToUnit(canvasWidthPx, unit);
  const canvasHUnit = pxToUnit(canvasHeightPx, unit);
  const canvasScreenW = unitToPx(canvasWUnit, unit) * z;
  const canvasScreenH = unitToPx(canvasHUnit, unit) * z;

  // Bed-guide extent — mm -> base px -> display unit -> screen. May be smaller OR
  // larger than the canvas; the SVG sizes to the larger of the two so the guide
  // is never clipped.
  const bedWUnit = pxToUnit(bedWidthMm * PX_PER_MM, unit);
  const bedHUnit = pxToUnit(bedHeightMm * PX_PER_MM, unit);
  const bedScreenW = unitToPx(bedWUnit, unit) * z;
  const bedScreenH = unitToPx(bedHUnit, unit) * z;

  // Rulers measure the CANVAS (the design), not the machine bed.
  const { major: majorX, minor: minorX } = rulerTicks(canvasWUnit, unit, z);
  const { major: majorY, minor: minorY } = rulerTicks(canvasHUnit, unit, z);

  // The SVG must hold both rects + the ruler bands without clipping either.
  // When the bed overlay is hidden it contributes no extent, so a bed larger
  // than the canvas doesn't reserve dead space around a hidden guide.
  const extentW = showBed ? Math.max(canvasScreenW, bedScreenW) : canvasScreenW;
  const extentH = showBed ? Math.max(canvasScreenH, bedScreenH) : canvasScreenH;

  // Place the SVG. When `origin` (the measured canvas top-left) is given, shift
  // the chrome so the artboard/ruler corner (RULER,RULER inside the SVG) lands on
  // the canvas corner — the ruler band then sits in the RULER-px gutter just
  // outside the artwork's top/left edges. `origin` already includes pan, so pan
  // is not re-added here. Absent → legacy pan-only translate (pinned top-left).
  const translate = origin
    ? `translate(${origin.x - RULER}px, ${origin.y - RULER}px)`
    : `translate(${pan.x}px, ${pan.y}px)`;

  return (
    <div
      data-testid="canvas-chrome"
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden="true"
    >
      <svg
        className="absolute left-0 top-0 overflow-visible"
        width={extentW + RULER}
        height={extentH + RULER}
        style={{ transform: translate }}
      >
        {/* Machine-bed fill — a muted accent wash beneath everything, sharing the
            canvas top-left origin. Gives the bed (the machine's reachable area) a
            distinct tint so it reads as a zone against the canvas + page bg
            instead of relying on the dashed outline alone. Low opacity keeps it
            legible over both light and dark backgrounds. Toggleable via showBed;
            the work piece (artboard + rulers below) always renders. */}
        {showBed ? (
          <rect
            data-testid="bed-fill"
            x={RULER + 0.5}
            y={RULER + 0.5}
            width={Math.max(0, bedScreenW - 1)}
            height={Math.max(0, bedScreenH - 1)}
            fill="#00c9b1"
            fillOpacity="0.1"
          />
        ) : null}

        {/* Design-canvas artboard — solid; the rulers measure this extent. */}
        <rect
          data-testid="canvas-artboard"
          data-canvas-w-px={canvasWidthPx}
          data-canvas-h-px={canvasHeightPx}
          x={RULER + 0.5}
          y={RULER + 0.5}
          width={Math.max(0, canvasScreenW - 1)}
          height={Math.max(0, canvasScreenH - 1)}
          fill="none"
          stroke="#00c9b1"
          strokeOpacity="0.55"
          strokeWidth="1"
        />

        {/* Machine-bed guide — dashed + muted; shares the canvas top-left origin
            (design 0,0 = machine home) so you can see how much of the design the
            active machine can reach. May fall inside or beyond the canvas.
            Toggleable via showBed. */}
        {showBed ? (
          <rect
            data-testid="bed-guide"
            data-bed-w-mm={bedWidthMm}
            data-bed-h-mm={bedHeightMm}
            x={RULER + 0.5}
            y={RULER + 0.5}
            width={Math.max(0, bedScreenW - 1)}
            height={Math.max(0, bedScreenH - 1)}
            fill="none"
            stroke="#00c9b1"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="5 4"
          />
        ) : null}

        {/* Ruler bands (sized to the larger extent) */}
        <rect x={0} y={0} width={extentW + RULER} height={RULER} fill="#0a0a0a" fillOpacity="0.35" />
        <rect x={0} y={0} width={RULER} height={extentH + RULER} fill="#0a0a0a" fillOpacity="0.35" />

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
