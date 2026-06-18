// @vitest-environment jsdom
//
// AC2 re-home (#16): the Document Setup dialog (#14) sets the MACHINE BED
// (display/artboard) but NOT the EXPORT document size (canvasW/canvasH) that the
// export manifest + SVG dimensions use. The legacy two-pane layout had a
// canvas-size control; this re-homes a document-size control (px) into the dialog,
// reported OUT via onApply alongside the bed. It must NOT collide with the bed
// Width/Height inputs (those tests query by /width/i and /height/i), so the
// document-size inputs use the disjoint labels "Document W" / "Document H".
//
// NEW test file — does not touch the existing DocumentSetupDialog.test.jsx.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DocumentSetupDialog from "./DocumentSetupDialog";
import { defaultBedSize } from "../../lib/machineProfiles";

function makeProps(overrides = {}) {
  return {
    open: true,
    profileId: "laser",
    bedSize: defaultBedSize("laser"),
    unit: "mm",
    canvasW: 768,
    canvasH: 1024,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DocumentSetupDialog — export document size (#16 AC2)", () => {
  it("seeds the document-size inputs from canvasW/canvasH (px)", () => {
    render(<DocumentSetupDialog {...makeProps({ canvasW: 768, canvasH: 1024 })} />);
    expect(screen.getByLabelText("Document W")).toHaveValue(768);
    expect(screen.getByLabelText("Document H")).toHaveValue(1024);
  });

  it("Apply reports the chosen document size out through onApply (canvasW/canvasH px)", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ onApply })} />);
    fireEvent.change(screen.getByLabelText("Document W"), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Document H"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg.canvasW).toBe(900);
    expect(arg.canvasH).toBe(600);
  });

  it("the document-size inputs are disjoint from the bed Width/Height inputs", () => {
    render(<DocumentSetupDialog {...makeProps()} />);
    const dialog = screen.getByRole("dialog");
    // The bed inputs still resolve uniquely under /width/i and /height/i — proof
    // the new inputs did not collide with the untouched bed-input queries.
    expect(within(dialog).getByLabelText(/width/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/height/i)).toBeInTheDocument();
  });
});
