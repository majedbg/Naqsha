// RoleBadge — production notation for the Motif device (motif-shell, D).
// Renders a tiny drawn fragment of the HOST (a lattice graticule or an open
// stroke curve) with role marks (crossing/cell/edge/tip) laid on it. Two-tone:
// the host fragment is muted (stroke-opacity), the role marks are full
// currentColor — single-tint, theme-aware, no CSS vars / hex (house rule,
// see GlyphThumb.jsx).
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RoleBadge, { badgeKindForHost } from "./RoleBadge";

const svgOf = (c) => c.querySelector("svg");
const marks = (c, role) => c.querySelectorAll(`[data-role-mark="${role}"]`);

describe("RoleBadge — decorative contract", () => {
  it("renders an aria-hidden decorative svg", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["crossing"]} />);
    const svg = svgOf(container);
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("honors the size prop on width/height (square, like GlyphThumb)", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={[]} size={24} />);
    const svg = svgOf(container);
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
  });

  it("defaults size to 18", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={[]} />);
    expect(svgOf(container)).toHaveAttribute("width", "18");
  });

  it("is a memoized component", () => {
    expect(RoleBadge.$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("is single-tint currentColor — no CSS vars, no hard-coded colors", () => {
    const { container } = render(
      <RoleBadge hostKind="lattice" roles={["crossing", "cell", "edge"]} />
    );
    expect(container.innerHTML).not.toMatch(/var\(--/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(container.innerHTML).not.toMatch(/saffron|rgb\(/i);
  });

  it("two-tone via opacity: the host fragment is muted, marks are not", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["crossing"]} />);
    const frag = container.querySelector("[data-badge-fragment]");
    expect(frag).toBeInTheDocument();
    expect(Number(frag.getAttribute("stroke-opacity"))).toBeLessThan(0.6);
  });
});

describe("RoleBadge — lattice family", () => {
  it("crossing → 4 dots at the graticule intersections", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["crossing"]} />);
    expect(marks(container, "crossing")).toHaveLength(4);
  });

  it("cell → 1 square in the cell centre", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["cell"]} />);
    expect(marks(container, "cell")).toHaveLength(1);
  });

  it("edge → 4 dots on the segment midpoints", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["edge"]} />);
    expect(marks(container, "edge")).toHaveLength(4);
  });

  it("tip → falls back to a stroke stub with 1 free-end dot (a lattice has no tips)", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={["tip"]} />);
    expect(marks(container, "tip")).toHaveLength(1);
  });

  it("composes multiple roles (each role's marks are drawn)", () => {
    const { container } = render(
      <RoleBadge hostKind="lattice" roles={["crossing", "edge", "cell"]} />
    );
    expect(marks(container, "crossing")).toHaveLength(4);
    expect(marks(container, "edge")).toHaveLength(4);
    expect(marks(container, "cell")).toHaveLength(1);
  });

  it("no roles → no marks (fragment only)", () => {
    const { container } = render(<RoleBadge hostKind="lattice" roles={[]} />);
    expect(container.querySelectorAll("[data-role-mark]")).toHaveLength(0);
    expect(container.querySelector("[data-badge-fragment]")).toBeInTheDocument();
  });
});

describe("RoleBadge — stroke family", () => {
  it("edge → 3 dots along the curve", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={["edge"]} />);
    expect(marks(container, "edge")).toHaveLength(3);
  });

  it("crossing → 1 dot at the self-intersection", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={["crossing"]} />);
    expect(marks(container, "crossing")).toHaveLength(1);
  });

  it("tip → 1 dot at the free end", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={["tip"]} />);
    expect(marks(container, "tip")).toHaveLength(1);
  });

  it("cell → 1 square in the loop pocket", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={["cell"]} />);
    expect(marks(container, "cell")).toHaveLength(1);
  });

  it("composes edge + tip (the common spiral/edge-host reading)", () => {
    const { container } = render(<RoleBadge hostKind="stroke" roles={["edge", "tip"]} />);
    expect(marks(container, "edge")).toHaveLength(3);
    expect(marks(container, "tip")).toHaveLength(1);
  });
});

describe("badgeKindForHost — every real host-kind vocabulary entry", () => {
  it.each([
    // semantic grid-like hosts → lattice fragment
    ["grid", "lattice"],
    ["recursive", "lattice"],
    ["voronoi", "lattice"],
    // spiral is semantic but rides arms, not a graticule → stroke
    ["spiral", "stroke"],
    // every edge host → stroke fragment
    ["flowfield", "stroke"],
    ["wave", "stroke"],
    ["spirograph", "stroke"],
    ["topographic", "stroke"],
    ["phyllodash", "stroke"],
    ["diffgrowth", "stroke"],
    ["dendrite", "stroke"],
  ])("%s → %s", (patternType, kind) => {
    expect(badgeKindForHost(patternType)).toBe(kind);
  });

  it("unknown / non-host pattern → stroke (safe default)", () => {
    expect(badgeKindForHost("mandala")).toBe("stroke");
    expect(badgeKindForHost(undefined)).toBe("stroke");
  });
});
