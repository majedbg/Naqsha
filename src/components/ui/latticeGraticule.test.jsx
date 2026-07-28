// latticeGraticule — the ONE graticule primitive (#166).
//
// Two homes draw it: RoleBadge's `LatticeFragment` (the Route block's host
// notation) and the Grid Lines param toggle's three glyphs. This suite pins the
// primitive itself and, more importantly, the invariant that made sharing worth
// doing: RoleBadge's role marks must land ON these lines. Before the extraction
// the marks were literal coordinates sitting next to literal line coordinates;
// afterwards the lines live in another module, so a mark could silently drift
// off one. They are derived instead, and this is the test that says so.
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RoleBadge from "./RoleBadge";
import { GRATICULE, GRATICULE_STROKE, graticuleLines } from "./latticeGraticule";

const draw = (families) =>
  render(
    <svg>
      <g>{graticuleLines(families)}</g>
    </svg>,
  ).container;

const lines = (c) => [...c.querySelectorAll("line")];
const isVertical = (l) => l.getAttribute("x1") === l.getAttribute("x2");
const isHorizontal = (l) => l.getAttribute("y1") === l.getAttribute("y2");

describe("graticuleLines", () => {
  it("draws both families by default: 2 verticals + 2 horizontals", () => {
    const l = lines(draw());
    expect(l).toHaveLength(4);
    expect(l.filter(isVertical)).toHaveLength(2);
    expect(l.filter(isHorizontal)).toHaveLength(2);
  });

  it("draws the vertical family alone", () => {
    const l = lines(draw({ v: true, h: false }));
    expect(l).toHaveLength(2);
    expect(l.every(isVertical)).toBe(true);
  });

  it("draws the horizontal family alone", () => {
    const l = lines(draw({ v: false, h: true }));
    expect(l).toHaveLength(2);
    expect(l.every(isHorizontal)).toBe(true);
  });

  it("draws nothing when both families are off", () => {
    expect(lines(draw({ v: false, h: false }))).toHaveLength(0);
  });

  it("places each line at its geometry coordinate, spanning the full extent", () => {
    const l = lines(draw());
    const vs = l.filter(isVertical).map((n) => Number(n.getAttribute("x1")));
    const hs = l.filter(isHorizontal).map((n) => Number(n.getAttribute("y1")));
    expect(vs.sort((a, b) => a - b)).toEqual([...GRATICULE.vx].sort((a, b) => a - b));
    expect(hs.sort((a, b) => a - b)).toEqual([...GRATICULE.hy].sort((a, b) => a - b));
    for (const n of l.filter(isVertical)) {
      expect(Number(n.getAttribute("y1"))).toBe(GRATICULE.span[0]);
      expect(Number(n.getAttribute("y2"))).toBe(GRATICULE.span[1]);
    }
    for (const n of l.filter(isHorizontal)) {
      expect(Number(n.getAttribute("x1"))).toBe(GRATICULE.span[0]);
      expect(Number(n.getAttribute("x2"))).toBe(GRATICULE.span[1]);
    }
  });

  it("carries no colour of its own — the caller's <g> owns stroke", () => {
    const c = draw();
    expect(c.innerHTML).not.toMatch(/stroke=/);
    expect(c.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("exports one shared stroke weight and cap", () => {
    expect(GRATICULE_STROKE).toEqual({ strokeWidth: 1.1, strokeLinecap: "round" });
  });

  it("is a 2×2 graticule — exactly one bounded central cell", () => {
    expect(GRATICULE.vx).toHaveLength(2);
    expect(GRATICULE.hy).toHaveLength(2);
  });
});

describe("RoleBadge's marks sit on the shared graticule", () => {
  const marks = (roles, role) => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={roles} />);
    return [...container.querySelectorAll(`[data-role-mark="${role}"]`)];
  };
  const centre = (m) =>
    m.tagName.toLowerCase() === "circle"
      ? [Number(m.getAttribute("cx")), Number(m.getAttribute("cy"))]
      : [
          Number(m.getAttribute("x")) + Number(m.getAttribute("width")) / 2,
          Number(m.getAttribute("y")) + Number(m.getAttribute("height")) / 2,
        ];

  const MID_X = (GRATICULE.vx[0] + GRATICULE.vx[1]) / 2;
  const MID_Y = (GRATICULE.hy[0] + GRATICULE.hy[1]) / 2;

  it("crossings land on the four intersections", () => {
    const got = marks(["crossing"], "crossing").map(centre);
    const want = GRATICULE.hy.flatMap((y) => GRATICULE.vx.map((x) => [x, y]));
    expect(got.map(String).sort()).toEqual(want.map(String).sort());
  });

  it("edge marks land on the bounded cell's four edge midpoints", () => {
    const got = marks(["edge"], "edge").map(centre);
    const want = [
      [MID_X, GRATICULE.hy[0]],
      [MID_X, GRATICULE.hy[1]],
      [GRATICULE.vx[0], MID_Y],
      [GRATICULE.vx[1], MID_Y],
    ];
    expect(got.map(String).sort()).toEqual(want.map(String).sort());
  });

  it("the cell mark sits at the bounded cell's centre", () => {
    expect(centre(marks(["cell"], "cell")[0])).toEqual([MID_X, MID_Y]);
  });

  // The pixel geometry the badge has always drawn, pinned so the extraction
  // provably did not move it.
  it("the graticule is still the historical 2×2 at x/y 6 and 18, span 2 → 22", () => {
    expect(GRATICULE).toEqual({ vx: [6, 18], hy: [6, 18], span: [2, 22] });
  });
});
