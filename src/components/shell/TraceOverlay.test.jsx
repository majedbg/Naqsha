// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TraceOverlay from "./TraceOverlay";

const positions = [
  { x: 10, y: 20, radius: 6 },
  { x: 30, y: 40, radius: 8 },
  { x: 50, y: 60, radius: 4 },
];

describe("TraceOverlay (Trace sweep marks, issue #91)", () => {
  it("renders nothing when no motif is being traced", () => {
    const { container, queryByTestId } = render(
      <TraceOverlay positions={null} progressIndex={0} canvasW={800} canvasH={600} />
    );
    expect(queryByTestId("trace-overlay")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing at progressIndex 0 (sweep not started)", () => {
    const { queryByTestId } = render(
      <TraceOverlay positions={positions} progressIndex={0} canvasW={800} canvasH={600} />
    );
    expect(queryByTestId("trace-overlay")).toBeNull();
  });

  it("lights only the leading prefix of length progressIndex", () => {
    const { getByTestId } = render(
      <TraceOverlay positions={positions} progressIndex={2} canvasW={800} canvasH={600} />
    );
    const svg = getByTestId("trace-overlay");
    const circles = svg.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    // In placement order — the first two positions, at their canvas coordinates.
    expect(circles[0].getAttribute("cx")).toBe("10");
    expect(circles[0].getAttribute("cy")).toBe("20");
    expect(circles[1].getAttribute("cx")).toBe("30");
    expect(circles[1].getAttribute("cy")).toBe("40");
  });

  it("shares the artwork coordinate space (viewBox = canvas dims) so marks scale with zoom/pan", () => {
    const { getByTestId } = render(
      <TraceOverlay positions={positions} progressIndex={3} canvasW={800} canvasH={600} />
    );
    const svg = getByTestId("trace-overlay");
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 600");
    // Decorative + inert: the canvas remains the source of truth.
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.className.baseVal).toContain("pointer-events-none");
  });

  it("clamps a progressIndex beyond the count to the full list", () => {
    const { getByTestId } = render(
      <TraceOverlay positions={positions} progressIndex={99} canvasW={800} canvasH={600} />
    );
    expect(getByTestId("trace-overlay").querySelectorAll("circle")).toHaveLength(3);
  });

  it("is radius-aware — a mark's radius reflects the placement footprint", () => {
    const { getByTestId } = render(
      <TraceOverlay positions={positions} progressIndex={2} canvasW={800} canvasH={600} />
    );
    const circles = getByTestId("trace-overlay").querySelectorAll("circle");
    const r0 = parseFloat(circles[0].getAttribute("r"));
    const r1 = parseFloat(circles[1].getAttribute("r"));
    // The 8-radius placement reads larger than the 6-radius one.
    expect(r1).toBeGreaterThan(r0);
  });
});
