// @vitest-environment jsdom
//
// SheetInspector (#75) — the Inspector's empty-selection state becomes the
// Sheet inspector: work-piece dims editable in the active unit (px-canonical
// at the boundary, same math discipline as DocumentSetupDialog), the size
// preset select, and a read-only bed line. Presentational + controlled:
// Studio owns the live size and receives commits via onApplySize.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SheetInspector from "./SheetInspector";
import { PPI, MM_PER_IN, unitToPx } from "../../lib/units";
import { PRESET_SIZES } from "../../constants";

function makeProps(overrides = {}) {
  return {
    canvasW: 768,
    canvasH: 1024,
    unit: "mm",
    bedSize: { width: 300, height: 400 },
    onApplySize: vi.fn(),
    ...overrides,
  };
}

describe("SheetInspector — Sheet dims in the active unit (AC1)", () => {
  it("shows width/height converted from canonical px to the active unit (mm, integers)", () => {
    // 768px / 1024px @96 PPI = 8in / 10.667in → 203mm / 271mm rounded.
    render(<SheetInspector {...makeProps()} />);
    expect(screen.getByLabelText(/width/i)).toHaveValue(
      Math.round((768 / PPI) * MM_PER_IN)
    );
    expect(screen.getByLabelText(/height/i)).toHaveValue(
      Math.round((1024 / PPI) * MM_PER_IN)
    );
  });
});

describe("SheetInspector — commits px-canonical size (AC2)", () => {
  it("Enter on an edited width reports { canvasW, canvasH } in rounded px, height untouched", () => {
    const onApplySize = vi.fn();
    render(<SheetInspector {...makeProps({ onApplySize })} />);
    const width = screen.getByLabelText(/width/i);
    fireEvent.change(width, { target: { value: "210" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(onApplySize).toHaveBeenCalledTimes(1);
    expect(onApplySize).toHaveBeenCalledWith({
      canvasW: Math.round(unitToPx(210, "mm")),
      canvasH: 1024,
    });
  });
});

describe("SheetInspector — read-only bed reference (AC1)", () => {
  it("shows the machine bed dims (canonical mm) as read-only text, plus the select-a-layer hint", () => {
    render(<SheetInspector {...makeProps({ bedSize: { width: 300, height: 400 } })} />);
    expect(screen.getByText(/bed 300 × 400 mm/i)).toBeInTheDocument();
    // The bed is View-menu-owned — no input edits it here.
    expect(screen.queryByLabelText(/bed/i)).not.toBeInTheDocument();
    // The old placeholder's guidance survives as a footer hint.
    expect(screen.getByText(/select a layer/i)).toBeInTheDocument();
  });
});

describe("SheetInspector — unit display round-trip (AC4)", () => {
  it("shows inches at 2dp and an unedited blur commits nothing (no drift)", () => {
    const onApplySize = vi.fn();
    // 768px @96 PPI = exactly 8in; 1000px = 10.42in (2dp-rounded display).
    render(
      <SheetInspector
        {...makeProps({ canvasW: 768, canvasH: 1000, unit: "in", onApplySize })}
      />
    );
    const width = screen.getByLabelText(/width/i);
    const height = screen.getByLabelText(/height/i);
    expect(width).toHaveValue(8);
    expect(height).toHaveValue(10.42);
    // Tab-through without editing: the 2dp display value must not be
    // re-committed as a slightly-different px (1000px vs round(10.42in)).
    fireEvent.blur(width);
    fireEvent.blur(height);
    expect(onApplySize).not.toHaveBeenCalled();
  });
});

describe("SheetInspector — size preset (AC3)", () => {
  it("choosing a named preset commits its dims as rounded px", () => {
    const onApplySize = vi.fn();
    render(<SheetInspector {...makeProps({ onApplySize })} />);
    const idx = PRESET_SIZES.findIndex((p) => p.width !== null);
    const preset = PRESET_SIZES[idx];
    fireEvent.change(screen.getByLabelText(/sheet preset/i), {
      target: { value: String(idx) },
    });
    expect(onApplySize).toHaveBeenCalledTimes(1);
    expect(onApplySize).toHaveBeenCalledWith({
      canvasW: Math.round(preset.width * PPI),
      canvasH: Math.round(preset.height * PPI),
    });
  });
});
