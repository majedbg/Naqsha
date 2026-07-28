// #166 — the Grid Lines three-way icon toggle, rendered through the real
// ParamRow → ParamControl → IconSelect chain.
//
// The row it replaces was ONE plot2d XY pad (a 104 px sheet + two labelled axis
// gutters + two editable numeric readouts, ~160 px) whose fourth corner built a
// Grid that paints nothing. The toggle expresses the three legal answers in one
// 28 px glyph row and offers no fourth.
//
// ParamRow is deliberately the entry point rather than PatternParams: this is
// where `def.key` earns its keep (the `param-row-${def.key}` test id, the
// randomize checkbox, the reset button), so a dropped synthetic key — the one
// silent failure in the plan — shows up here as a missing element rather than a
// throw.
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useState } from "react";
import ParamRow from "./ParamRow";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../../lib/useLayerParams";
import { DEFAULT_PARAMS, PATTERN_PARAM_DEFS } from "../../constants";

// HeroDragCue (the passthrough ParamRow wraps the control in) reads useAuth
// directly; mock it the way HeroDragCue.test.jsx does.
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "pro", loading: false, user: { id: "u1" } }),
}));

const GRID_LINES_DEF = PATTERN_PARAM_DEFS.grid.find((d) => d.key === "gridLines");

const optionByState = (v, h) =>
  GRID_LINES_DEF.options.find(
    (o) => (o.patch.drawVertical >= 0.5) === v && (o.patch.drawHorizontal >= 0.5) === h,
  );

const V_ONLY = optionByState(true, false);
const H_ONLY = optionByState(false, true);
const BOTH = optionByState(true, true);

// A harness that owns params + randomizeKeys state and wires the LayerParams
// context, mirroring LayerCard's boundary (identical shape to
// PatternParams.gate.test.jsx's Harness).
function Harness({ initialParams, initialKeys = [], onPatch, def = GRID_LINES_DEF }) {
  const [params, setParams] = useState(initialParams);
  const [keys, setKeys] = useState(initialKeys);
  const value = buildLayerParamsValue({
    patternType: "grid",
    params,
    onChange: (p) => {
      onPatch?.(p);
      setParams(p);
    },
    randomizeKeys: keys,
    onRandomizeKeysChange: setKeys,
  });
  return (
    <LayerParamsProvider value={value}>
      <ParamRow def={def} />
    </LayerParamsProvider>
  );
}

const renderRow = (params = { ...DEFAULT_PARAMS.grid }, extra = {}) => {
  const onPatch = vi.fn();
  const utils = render(<Harness initialParams={params} onPatch={onPatch} {...extra} />);
  const row = screen.getByTestId("param-row-gridLines");
  return { ...utils, row, onPatch };
};

const radios = (row) => within(row).getAllByRole("radio");
const radioNamed = (row, name) => within(row).getByRole("radio", { name });

describe("Grid Lines row — the control", () => {
  it("renders where the plot pad used to be, as a three-cell icon toggle", () => {
    const { row } = renderRow();
    expect(within(row).getByRole("radiogroup")).toBeInTheDocument();
    expect(radios(row)).toHaveLength(3);
  });

  it("is NOT a plot pad — none of ParamPlot's numeric readouts survive", () => {
    const { row } = renderRow();
    // ParamPlot renders one editable numeric readout per axis (spinbutton /
    // textbox) plus its own axis gutters; the toggle has neither.
    expect(within(row).queryAllByRole("spinbutton")).toHaveLength(0);
    expect(within(row).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("offers exactly three options and no fourth", () => {
    const { row } = renderRow();
    const labels = radios(row).map((r) => r.getAttribute("aria-label"));
    expect(labels).toHaveLength(3);
    expect(new Set(labels).size).toBe(3);
    expect(labels).toEqual([V_ONLY.label, H_ONLY.label, BOTH.label]);
  });

  it("each cell carries an aria-label naming its option", () => {
    const { row } = renderRow();
    for (const o of GRID_LINES_DEF.options) {
      expect(radioNamed(row, o.label)).toBeInTheDocument();
    }
  });

  it("labels the group 'Grid Lines' (the × read belonged to the plane, not the toggle)", () => {
    const { row } = renderRow();
    expect(within(row).getByRole("radiogroup")).toHaveAccessibleName("Grid Lines");
  });

  it("shows the current state: at defaults, Both is checked and the others are not", () => {
    const { row } = renderRow();
    expect(radioNamed(row, BOTH.label)).toHaveAttribute("aria-checked", "true");
    expect(radioNamed(row, V_ONLY.label)).toHaveAttribute("aria-checked", "false");
    expect(radioNamed(row, H_ONLY.label)).toHaveAttribute("aria-checked", "false");
  });

  it("reads a stored single-axis grid back as that option", () => {
    const { row } = renderRow({ ...DEFAULT_PARAMS.grid, drawVertical: 1, drawHorizontal: 0 });
    expect(radioNamed(row, V_ONLY.label)).toHaveAttribute("aria-checked", "true");
    expect(radioNamed(row, BOTH.label)).toHaveAttribute("aria-checked", "false");
  });

  it("paints the selected cell saffron and leaves the others on the hairline ground", () => {
    const { row } = renderRow();
    expect(radioNamed(row, BOTH.label).className).toMatch(/bg-saffron/);
    expect(radioNamed(row, V_ONLY.label).className).not.toMatch(/bg-saffron/);
    expect(radioNamed(row, V_ONLY.label).className).toMatch(/border-hairline/);
  });

  it("carries the violet focus-visible ring", () => {
    const { row } = renderRow();
    expect(radioNamed(row, BOTH.label).className).toMatch(/focus-visible:outline-violet/);
  });
});

describe("Grid Lines row — writing the three legal states", () => {
  it("clicking Vertical writes drawVertical: 1, drawHorizontal: 0", () => {
    const { row, onPatch } = renderRow();
    fireEvent.click(radioNamed(row, V_ONLY.label));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0]).toMatchObject({ drawVertical: 1, drawHorizontal: 0 });
  });

  it("clicking Horizontal writes drawVertical: 0, drawHorizontal: 1", () => {
    const { row, onPatch } = renderRow();
    fireEvent.click(radioNamed(row, H_ONLY.label));
    expect(onPatch.mock.calls[0][0]).toMatchObject({ drawVertical: 0, drawHorizontal: 1 });
  });

  it("clicking Both writes drawVertical: 1, drawHorizontal: 1", () => {
    const { row, onPatch } = renderRow({
      ...DEFAULT_PARAMS.grid,
      drawVertical: 1,
      drawHorizontal: 0,
    });
    fireEvent.click(radioNamed(row, BOTH.label));
    expect(onPatch.mock.calls[0][0]).toMatchObject({ drawVertical: 1, drawHorizontal: 1 });
  });

  it("preserves every sibling param — the patch is a merge, not a replacement", () => {
    const { row, onPatch } = renderRow();
    fireEvent.click(radioNamed(row, V_ONLY.label));
    const next = onPatch.mock.calls[0][0];
    expect(next.cols).toBe(DEFAULT_PARAMS.grid.cols);
    expect(next.spacing).toBe(DEFAULT_PARAMS.grid.spacing);
    expect(next.margin).toBe(DEFAULT_PARAMS.grid.margin);
  });

  it("never writes a non-numeric value into either axis key", () => {
    const { row, onPatch } = renderRow();
    for (const o of GRID_LINES_DEF.options) {
      fireEvent.click(radioNamed(row, o.label));
    }
    for (const [next] of onPatch.mock.calls) {
      expect(typeof next.drawVertical).toBe("number");
      expect(typeof next.drawHorizontal).toBe("number");
    }
  });

  it("no click sequence can reach the blank grid or deselect the current option", () => {
    const { row, onPatch } = renderRow();
    for (const o of [...GRID_LINES_DEF.options, ...GRID_LINES_DEF.options].flat()) {
      fireEvent.click(radioNamed(row, o.label));
      // Re-clicking the SAME cell must not toggle it off.
      fireEvent.click(radioNamed(row, o.label));
    }
    for (const [next] of onPatch.mock.calls) {
      expect(next.drawVertical >= 0.5 || next.drawHorizontal >= 0.5).toBe(true);
    }
    // …and after all of it exactly one cell is still checked.
    expect(radios(row).filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });
});

describe("Grid Lines row — radiogroup keyboard", () => {
  it("Arrow keys move selection AND commit it", () => {
    const { row, onPatch } = renderRow();
    // Default is Both (index 2); ArrowLeft lands on Horizontal (index 1).
    fireEvent.keyDown(radioNamed(row, BOTH.label), { key: "ArrowLeft" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(H_ONLY.patch);
    fireEvent.keyDown(radioNamed(row, H_ONLY.label), { key: "ArrowLeft" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(V_ONLY.patch);
  });

  it("ArrowRight/ArrowDown and ArrowUp move in the expected directions", () => {
    const { row, onPatch } = renderRow({
      ...DEFAULT_PARAMS.grid,
      ...V_ONLY.patch,
    });
    fireEvent.keyDown(radioNamed(row, V_ONLY.label), { key: "ArrowRight" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(H_ONLY.patch);
    fireEvent.keyDown(radioNamed(row, H_ONLY.label), { key: "ArrowDown" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(BOTH.patch);
    fireEvent.keyDown(radioNamed(row, BOTH.label), { key: "ArrowUp" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(H_ONLY.patch);
  });

  it("Home and End jump to the ends", () => {
    const { row, onPatch } = renderRow();
    fireEvent.keyDown(radioNamed(row, BOTH.label), { key: "Home" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(V_ONLY.patch);
    fireEvent.keyDown(radioNamed(row, V_ONLY.label), { key: "End" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(BOTH.patch);
  });

  it("Space and Enter commit the focused cell", () => {
    const { row, onPatch } = renderRow();
    fireEvent.keyDown(radioNamed(row, V_ONLY.label), { key: " " });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(V_ONLY.patch);
    fireEvent.keyDown(radioNamed(row, H_ONLY.label), { key: "Enter" });
    expect(onPatch.mock.calls.at(-1)[0]).toMatchObject(H_ONLY.patch);
  });

  it("no key sequence can reach the blank grid", () => {
    const { row, onPatch } = renderRow();
    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowLeft", "Home", "End", " ", "Enter"]) {
      const focused = radios(row).find((r) => r.tabIndex === 0) ?? radios(row)[0];
      fireEvent.keyDown(focused, { key });
    }
    for (const [next] of onPatch.mock.calls) {
      expect(next.drawVertical >= 0.5 || next.drawHorizontal >= 0.5).toBe(true);
    }
  });

  it("roving tabindex: exactly one cell is tabbable", () => {
    const { row } = renderRow();
    expect(radios(row).filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
});

describe("Grid Lines row — randomize, reset and defaults", () => {
  it("the randomize checkbox still toggles (proves def.key survived)", () => {
    const { row } = renderRow(undefined, { initialKeys: [] });
    const box = within(row).getByRole("checkbox");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(within(screen.getByTestId("param-row-gridLines")).getByRole("checkbox")).toBeChecked();
  });

  it("the checkbox reads as checked when 'gridLines' is in randomizeKeys", () => {
    const { row } = renderRow(undefined, { initialKeys: ["gridLines"] });
    expect(within(row).getByRole("checkbox")).toBeChecked();
  });

  it("the per-row dice produces one of the three legal patches", () => {
    const { row, onPatch } = renderRow();
    const dice = within(row).getByRole("button", { name: /Randomize Grid Lines/i });
    for (let i = 0; i < 60; i++) fireEvent.click(dice);
    const legal = GRID_LINES_DEF.options.map((o) => o.patch);
    for (const [next] of onPatch.mock.calls) {
      expect(legal).toContainEqual({
        drawHorizontal: next.drawHorizontal,
        drawVertical: next.drawVertical,
      });
    }
    expect(onPatch).toHaveBeenCalledTimes(60);
  });

  it("at defaults the reset affordance is not lit", () => {
    const { row } = renderRow();
    expect(within(row).getByRole("button", { name: /is at default/i })).toBeDisabled();
  });

  it("resetting a single-axis row returns drawHorizontal: 1, drawVertical: 1", () => {
    const { row, onPatch } = renderRow({
      ...DEFAULT_PARAMS.grid,
      drawVertical: 1,
      drawHorizontal: 0,
    });
    fireEvent.click(within(row).getByRole("button", { name: /Reset Grid Lines/i }));
    expect(onPatch.mock.calls[0][0]).toMatchObject({ drawHorizontal: 1, drawVertical: 1 });
  });
});

// randomizeGroup is the OTHER consumer of the synthetic key: it gates on
// `keys.includes(def.key)` before expanding the row. Exercised through the real
// context builder rather than a group render, because the gate — not the
// disclosure UI — is what a dropped `def.key` would silently break.
describe("Grid Lines row — group randomize", () => {
  const STRUCTURE_DEFS = PATTERN_PARAM_DEFS.grid.filter((d) =>
    ["gridSize", "spacing", "easing", "jitter", "gridLines", "margin"].includes(d.key),
  );

  const buildValue = (randomizeKeys, onChange) =>
    buildLayerParamsValue({
      patternType: "grid",
      params: { ...DEFAULT_PARAMS.grid },
      onChange,
      randomizeKeys,
      onRandomizeKeysChange: () => {},
    });

  it("randomizing the structure group WITH the row checked patches both axis keys", () => {
    const onChange = vi.fn();
    const legal = GRID_LINES_DEF.options.map((o) => o.patch);
    for (let i = 0; i < 40; i++) {
      onChange.mockClear();
      buildValue(["gridLines"], onChange).randomizeGroup(STRUCTURE_DEFS);
      const next = onChange.mock.calls[0][0];
      expect(legal).toContainEqual({
        drawHorizontal: next.drawHorizontal,
        drawVertical: next.drawVertical,
      });
    }
  });

  it("randomizing the group WITHOUT the row checked leaves the axes alone", () => {
    const onChange = vi.fn();
    buildValue([], onChange).randomizeGroup(STRUCTURE_DEFS);
    const next = onChange.mock.calls[0][0];
    expect(next.drawHorizontal).toBe(DEFAULT_PARAMS.grid.drawHorizontal);
    expect(next.drawVertical).toBe(DEFAULT_PARAMS.grid.drawVertical);
  });

  it("resetting the whole group returns the row to the full lattice", () => {
    const onChange = vi.fn();
    buildLayerParamsValue({
      patternType: "grid",
      params: { ...DEFAULT_PARAMS.grid, drawHorizontal: 0, drawVertical: 1 },
      onChange,
      randomizeKeys: [],
      onRandomizeKeysChange: () => {},
    }).resetGroup(STRUCTURE_DEFS);
    expect(onChange.mock.calls[0][0]).toMatchObject({ drawHorizontal: 1, drawVertical: 1 });
  });
});

describe("Grid Lines row — the legacy blank grid", () => {
  const BLANK = { ...DEFAULT_PARAMS.grid, drawHorizontal: 0, drawVertical: 0 };

  it("loads without error and renders the toggle with NO cell selected", () => {
    const { row } = renderRow({ ...BLANK });
    for (const r of radios(row)) {
      expect(r).toHaveAttribute("aria-checked", "false");
    }
  });

  it("writes nothing on load — the stored params are untouched", () => {
    const { onPatch } = renderRow({ ...BLANK });
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("the roving tabindex still anchors to the first cell", () => {
    const { row } = renderRow({ ...BLANK });
    expect(radios(row)[0].tabIndex).toBe(0);
  });

  it("clicking any cell repairs it, and the blank state cannot be re-entered", () => {
    const { row, onPatch } = renderRow({ ...BLANK });
    fireEvent.click(radios(row)[0]);
    const next = onPatch.mock.calls[0][0];
    expect(next.drawVertical >= 0.5 || next.drawHorizontal >= 0.5).toBe(true);
    // Every subsequent option is legal too, so there is no way back.
    for (const o of GRID_LINES_DEF.options) {
      fireEvent.click(radioNamed(row, o.label));
    }
    for (const [p] of onPatch.mock.calls) {
      expect(p.drawVertical >= 0.5 || p.drawHorizontal >= 0.5).toBe(true);
    }
  });
});

describe("Grid Lines glyphs", () => {
  it("each cell draws an aria-hidden svg", () => {
    const { row } = renderRow();
    for (const r of radios(row)) {
      const svg = r.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("uses currentColor only — no hard-coded hue, no CSS var", () => {
    const { row } = renderRow();
    for (const r of radios(row)) {
      const html = r.querySelector("svg").outerHTML;
      expect(html).not.toMatch(/var\(--/);
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      expect(html).not.toMatch(/saffron|rgb\(/i);
      expect(html).toMatch(/currentColor/);
    }
  });

  it("carries NO role dots — a param icon must not claim motif semantics", () => {
    const { row } = renderRow();
    for (const r of radios(row)) {
      expect(r.querySelectorAll("circle")).toHaveLength(0);
      expect(r.querySelectorAll("rect")).toHaveLength(0);
      expect(r.querySelectorAll("[data-role-mark]")).toHaveLength(0);
    }
  });

  it("draws the graticule the toggle claims: 2 verticals, 2 horizontals, 2×2", () => {
    const { row } = renderRow();
    const linesOf = (name) => [...radioNamed(row, name).querySelectorAll("line")];
    const isVertical = (l) => l.getAttribute("x1") === l.getAttribute("x2");
    const isHorizontal = (l) => l.getAttribute("y1") === l.getAttribute("y2");

    const v = linesOf(V_ONLY.label);
    expect(v).toHaveLength(2);
    expect(v.every(isVertical)).toBe(true);

    const h = linesOf(H_ONLY.label);
    expect(h).toHaveLength(2);
    expect(h.every(isHorizontal)).toBe(true);

    const b = linesOf(BOTH.label);
    expect(b.filter(isVertical)).toHaveLength(2);
    expect(b.filter(isHorizontal)).toHaveLength(2);
  });

  it("shares RoleBadge's LatticeFragment geometry — same 24-box, same x/y, same span", () => {
    const { row } = renderRow();
    const coords = (name, attr) =>
      [...radioNamed(row, name).querySelectorAll("line")]
        .map((l) => Number(l.getAttribute(attr)))
        .sort((a, b) => a - b);
    // LatticeFragment: verticals at x = 6 and 18, span 2 → 22 (RoleBadge.jsx:81-98).
    expect(coords(V_ONLY.label, "x1")).toEqual([6, 18]);
    expect(coords(V_ONLY.label, "y1")).toEqual([2, 2]);
    expect(coords(V_ONLY.label, "y2")).toEqual([22, 22]);
    expect(coords(H_ONLY.label, "y1")).toEqual([6, 18]);
    expect(coords(H_ONLY.label, "x1")).toEqual([2, 2]);
    expect(radioNamed(row, BOTH.label).querySelector("svg").getAttribute("viewBox")).toBe(
      "0 0 24 24",
    );
  });

  it("is NOT muted — the param glyph has no host fragment to read against", () => {
    const { row } = renderRow();
    for (const r of radios(row)) {
      expect(r.querySelectorAll("[stroke-opacity]")).toHaveLength(0);
      expect(r.querySelectorAll("[data-badge-fragment]")).toHaveLength(0);
    }
  });
});
