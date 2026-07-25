// RhythmStrip — production notation for the Motif device (motif-shell, D).
// Reads a REAL selection/sequence chain (the shape starterChips.js builds) and
// draws its marks along a thin host "rule": glyph miniatures for sequence glyph
// slots, hollow rests, faint density/everyN skips, filled beat/route dots.
// currentColor throughout; opacity is the only tone control. markerFrac drops a
// vertical scrubber line (the Trace hook).
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RhythmStrip from "./RhythmStrip";
import { STARTER_CHIPS } from "../../lib/motif/starterChips";

const chip = (id) => STARTER_CHIPS.find((c) => c.id === id);
const chainOf = (id, host = "grid") => chip(id).build(host).binding.chain;
const marks = (c, kind) => c.querySelectorAll(`[data-mark="${kind}"]`);
const xs = (nodes) => [...nodes].map((n) => Number(n.getAttribute("data-x")));
const gaps = (arr) => arr.slice(1).map((v, i) => +(v - arr[i]).toFixed(3));

describe("RhythmStrip — decorative contract", () => {
  it("renders an aria-hidden svg", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("is a memoized component", () => {
    expect(RhythmStrip.$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("is single-tint currentColor — no CSS vars, no hard-coded colors", () => {
    const { container } = render(<RhythmStrip chain={chainOf("vine")} markerFrac={0.5} />);
    expect(container.innerHTML).not.toMatch(/var\(--/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(container.innerHTML).not.toMatch(/saffron|rgb\(/i);
  });

  it("empty / missing chain renders an svg without throwing", () => {
    const { container } = render(<RhythmStrip chain={[]} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    const { container: c2 } = render(<RhythmStrip chain={undefined} />);
    expect(c2.querySelector("svg")).toBeInTheDocument();
  });
});

describe("RhythmStrip — sequence chains (alternate-xo)", () => {
  // slots [diamond, rest] repeated to fill 5 → glyph, rest, glyph, rest, glyph.
  it("renders glyph + rest marks in slot order, repeated to ~5 positions", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} />);
    expect(marks(container, "glyph")).toHaveLength(3);
    expect(marks(container, "rest")).toHaveLength(2);
    expect(marks(container, "skip")).toHaveLength(0);
  });

  it("glyph slots carry their glyphRef; rests do not draw a glyph", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} />);
    marks(container, "glyph").forEach((m) =>
      expect(m.getAttribute("data-glyph")).toBe("diamond")
    );
  });
});

describe("RhythmStrip — vine sequence (worked example: base-at-origin leaf, 180° turn)", () => {
  // slots [rosette, leaf, leaf@180] → fill-to-5 = rosette,leaf,leaf180,rosette,leaf.
  // The +x growth axis maps to the rule NORMAL (placement orientation 'path' +
  // useNormal), so on a horizontal rule a plain leaf grows perpendicular and the
  // rotationOffset:180 leaf grows off the OTHER side — vine alternation.
  it("the first two leaf marks are un-turned then turned 180°", () => {
    const { container } = render(<RhythmStrip chain={chainOf("vine")} />);
    const leaves = container.querySelectorAll('[data-mark="glyph"][data-glyph="leaf"]');
    expect(leaves.length).toBeGreaterThanOrEqual(2);

    expect(leaves[0].getAttribute("data-rotation-offset")).toBe("0");
    expect(leaves[1].getAttribute("data-rotation-offset")).toBe("180");

    // The turn is reflected in the actual transform, not just the data attr:
    // the two leaves' base rotations differ by 180°.
    const rot = (el) => {
      const m = /rotate\(\s*(-?\d+(?:\.\d+)?)/.exec(el.getAttribute("transform") || "");
      return m ? Number(m[1]) : null;
    };
    expect(Math.abs(rot(leaves[1]) - rot(leaves[0]))).toBe(180);
  });

  it("also draws the rosette slot as a glyph mark", () => {
    const { container } = render(<RhythmStrip chain={chainOf("vine")} />);
    const rosettes = container.querySelectorAll('[data-mark="glyph"][data-glyph="rosette"]');
    expect(rosettes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("RhythmStrip — everyN chain (border-march, n=3)", () => {
  // filled beat on every 3rd position, faint skip dots between.
  it("beats are glyph marks, skipped positions are skip marks", () => {
    const { container } = render(<RhythmStrip chain={chainOf("border-march")} />);
    const beats = marks(container, "glyph");
    const skips = marks(container, "skip");
    expect(beats.length).toBe(3); // 3 beats shown (3*n positions, n=3 → 9)
    expect(skips.length).toBe(6);
    expect(marks(container, "rest")).toHaveLength(0);
  });

  it("skip dots are faint (opacity ~0.35)", () => {
    const { container } = render(<RhythmStrip chain={chainOf("border-march")} />);
    const skip = marks(container, "skip")[0];
    expect(Number(skip.getAttribute("opacity"))).toBeLessThan(0.5);
  });
});

describe("RhythmStrip — density chain (sparse-scatter)", () => {
  it("renders exactly 3 marks, unevenly spaced at fixed deterministic positions", () => {
    const { container } = render(<RhythmStrip chain={chainOf("sparse-scatter")} />);
    const dots = marks(container, "glyph");
    expect(dots).toHaveLength(3);
    expect(marks(container, "rest")).toHaveLength(0);

    const g = gaps(xs(dots));
    expect(g).toHaveLength(2);
    expect(g[0]).not.toBeCloseTo(g[1], 1); // uneven spacing

    // deterministic — identical across renders
    const { container: c2 } = render(<RhythmStrip chain={chainOf("sparse-scatter")} />);
    expect(xs(marks(c2, "glyph"))).toEqual(xs(dots));
  });
});

describe("RhythmStrip — plain route-only chain", () => {
  it("evenly spaced filled dots, no rests/skips", () => {
    const { container } = render(
      <RhythmStrip chain={[{ type: "route", roles: ["crossing"], pathScope: "all" }]} />
    );
    const dots = marks(container, "glyph");
    expect(dots.length).toBeGreaterThanOrEqual(3);
    expect(marks(container, "rest")).toHaveLength(0);
    expect(marks(container, "skip")).toHaveLength(0);

    const g = gaps(xs(dots));
    g.slice(1).forEach((gap) => expect(gap).toBeCloseTo(g[0], 2)); // even spacing
  });
});

describe("RhythmStrip — markerFrac (Trace scrubber)", () => {
  it("markerFrac=0.5 draws a vertical marker at the horizontal centre", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} markerFrac={0.5} />);
    const marker = container.querySelector('[data-testid="rhythm-marker"]');
    expect(marker).toBeInTheDocument();
    // viewBox is a fixed 7:1 strip; pad-symmetric ⇒ frac 0.5 sits at W/2.
    const x1 = Number(marker.getAttribute("x1"));
    const x2 = Number(marker.getAttribute("x2"));
    expect(x1).toBe(x2); // vertical
    const w = Number(container.querySelector("svg").getAttribute("viewBox").split(" ")[2]);
    expect(x1).toBeCloseTo(w / 2, 3);
  });

  it("markerFrac=null → no marker", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} markerFrac={null} />);
    expect(container.querySelector('[data-testid="rhythm-marker"]')).toBeNull();
  });

  it("markerFrac omitted → no marker (defaults to null)", () => {
    const { container } = render(<RhythmStrip chain={chainOf("alternate-xo")} />);
    expect(container.querySelector('[data-testid="rhythm-marker"]')).toBeNull();
  });
});
