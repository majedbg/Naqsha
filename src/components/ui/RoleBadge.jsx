// RoleBadge — a drawn thumbnail of WHICH anchors a motif rides on its host.
//
// A motif's identity is not just its glyph but WHERE it lands: the crossings of
// a grid, the cells of a Voronoi, the free tips of a spiral arm. This badge
// draws a tiny fragment of the host — a 2×2 lattice graticule, or a short open
// stroke curve — and lays the selected roles' marks on it, so a reader sees the
// anchoring at a glance next to the glyph thumbnail.
//
// Two visual families, chosen by `hostKind` (see badgeKindForHost, derived from
// the real hostKinds.js vocabulary):
//   • lattice — semantic grid-like hosts (grid / recursive / voronoi). A 2×2
//     graticule with role marks at crossings / cell centres / edge midpoints.
//   • stroke  — spiral + every polyline edge host (flowfield / wave / …). A
//     short open curve with ONE self-crossing loop, so it can carry all four
//     roles: dots along it (edge), the self-intersection (crossing), the free
//     end (tip), and the loop's pocket (cell).
//
// House drawing rules (mirror GlyphThumb.jsx): pure SVG, stroke/fill
// `currentColor` only — the caller tints via text color when the badge is lit,
// so saffron never leaks in here. The ONE nuance the brief allows is a two-tone
// read achieved with OPACITY, not color: the host fragment is muted
// (stroke-opacity ~0.45) so the full-strength role marks read as the subject.
// aria-hidden decorative (callers supply the text role names); memo'd because it
// renders in dense picker/rack surfaces whose parents re-render on every hover.
import { memo } from "react";
import { isSemanticHost } from "../../lib/motif/hostKinds";

// The badge is authored in a fixed 24-unit box; `size` only scales the pixels
// (like GlyphThumb's `size` over its self-computed viewBox).
const BOX = 24;
const FRAG_OPACITY = 0.45; // muted host fragment (two-tone via opacity)
const DOT_R = 1.7;
const SQUARE = 3.6;

/**
 * Visual family for a motif host's role badge, derived from the REAL host-kind
 * classification (hostKinds.js) rather than a private list:
 *   • lattice — a SEMANTIC structural host that is grid-like: grid / recursive /
 *     voronoi. Their anchors sit on a graticule (intersections, cells, edges).
 *   • stroke  — everything else: SPIRAL (semantic, but its anchors ride arms,
 *     not a graticule), every EDGE host, and any unknown/non-host type.
 * Spiral is the one semantic host that is NOT a lattice, so we subtract it from
 * the semantic set instead of hard-coding the lattice members.
 * @param {string} patternType
 * @returns {'lattice'|'stroke'}
 */
// A small pure host→family helper, co-located with the sole component that
// consumes it; the HMR-boundary rule below is not worth a separate module for
// one branchless function.
// eslint-disable-next-line react-refresh/only-export-components
export function badgeKindForHost(patternType) {
  return isSemanticHost(patternType) && patternType !== "spiral" ? "lattice" : "stroke";
}

/** A filled role mark (dot). */
function Dot({ role, cx, cy, r = DOT_R }) {
  return <circle data-role-mark={role} cx={cx} cy={cy} r={r} fill="currentColor" />;
}

/** A filled role mark (small square) — the "cell" reading. */
function Square({ role, cx, cy, side = SQUARE }) {
  return (
    <rect
      data-role-mark={role}
      x={cx - side / 2}
      y={cy - side / 2}
      width={side}
      height={side}
      fill="currentColor"
    />
  );
}

/* ------------------------------------------------------------- lattice */

// A 2×2 graticule: two verticals × two horizontals. The single central cell is
// bounded by the four crossings; its edges' midpoints and its centre are the
// other two anchor families.
const L = {
  vx: [6, 18], // vertical line x's
  hy: [6, 18], // horizontal line y's
  span: [2, 22], // line extent
  crossings: [
    [6, 6],
    [18, 6],
    [6, 18],
    [18, 18],
  ],
  edges: [
    [12, 6], // top-edge midpoint
    [12, 18], // bottom
    [6, 12], // left
    [18, 12], // right
  ],
  cell: [12, 12],
};

function LatticeFragment({ roleSet }) {
  return (
    <>
      <g
        data-badge-fragment
        stroke="currentColor"
        strokeOpacity={FRAG_OPACITY}
        strokeWidth={1.1}
        strokeLinecap="round"
      >
        {L.vx.map((x) => (
          <line key={`v${x}`} x1={x} y1={L.span[0]} x2={x} y2={L.span[1]} />
        ))}
        {L.hy.map((y) => (
          <line key={`h${y}`} x1={L.span[0]} y1={y} x2={L.span[1]} y2={y} />
        ))}
      </g>

      {roleSet.has("crossing") &&
        L.crossings.map(([cx, cy], i) => <Dot key={i} role="crossing" cx={cx} cy={cy} />)}
      {roleSet.has("edge") &&
        L.edges.map(([cx, cy], i) => <Dot key={i} role="edge" cx={cx} cy={cy} r={1.6} />)}
      {roleSet.has("cell") && <Square role="cell" cx={L.cell[0]} cy={L.cell[1]} />}

      {/* tip — DECISION: a lattice has no free ends, so `tip` falls back to the
          STROKE idiom: a short muted stub with a single dot at its free end,
          drawn in a corner. This keeps the role visible (and testable) while
          signalling that tips are not a native lattice anchor. */}
      {roleSet.has("tip") && (
        <>
          <path
            data-badge-fragment
            d="M17,17 Q20.5,16 22,12"
            fill="none"
            stroke="currentColor"
            strokeOpacity={FRAG_OPACITY}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <Dot role="tip" cx={22} cy={12} r={1.6} />
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------- stroke */

// An open curve shaped like a Greek alpha (α): it crosses itself ONCE, so a
// single fragment carries every role — a free tail end (tip), a self-crossing
// (crossing), an enclosed loop pocket (cell), and length to space dots along
// (edge). Geometry is decorative; only the mark placement needs to read right.
const S = {
  curve: "M20,8 C15,8 12,10 11,12 C9,14 8,17 11,18 C15,19 16,14 13,12 C11.5,11 9,8 6,8",
  crossing: [11.6, 12], // where the return strand crosses the entry strand
  tip: [20, 8], // the terminal free end
  cell: [12, 15.2], // inside the loop pocket
  edges: [
    [16.5, 8.6],
    [9.9, 16.9],
    [14.6, 13.4],
  ],
};

function StrokeFragment({ roleSet }) {
  return (
    <>
      <path
        data-badge-fragment
        d={S.curve}
        fill="none"
        stroke="currentColor"
        strokeOpacity={FRAG_OPACITY}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {roleSet.has("edge") &&
        S.edges.map(([cx, cy], i) => <Dot key={i} role="edge" cx={cx} cy={cy} r={1.5} />)}
      {roleSet.has("crossing") && <Dot role="crossing" cx={S.crossing[0]} cy={S.crossing[1]} />}
      {roleSet.has("tip") && <Dot role="tip" cx={S.tip[0]} cy={S.tip[1]} />}
      {roleSet.has("cell") && <Square role="cell" cx={S.cell[0]} cy={S.cell[1]} side={3} />}
    </>
  );
}

function RoleBadge({ hostKind, roles = [], size = 18 }) {
  const roleSet = new Set(Array.isArray(roles) ? roles : []);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {hostKind === "lattice" ? (
        <LatticeFragment roleSet={roleSet} />
      ) : (
        <StrokeFragment roleSet={roleSet} />
      )}
    </svg>
  );
}

export default memo(RoleBadge);
