// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ExportReceipt from "./ExportReceipt";
import { buildExportReceipt } from "../lib/exportReceipt";

// Lane H — the Export Receipt surface. Presentational + transient: it renders
// the one calm line from buildExportReceipt, offers a "Run plan" affordance that
// links into the Run Plan, and auto-dismisses after a calm delay. It is NOT a
// stock toast — it is the paper-idiom receipt from CONTEXT.md / ADR 0001.

function cleanReceipt() {
  return buildExportReceipt({ estimate: { totalSec: 300 }, warnings: [] });
}

function croppedReceipt() {
  return buildExportReceipt({
    estimate: { totalSec: 300 },
    warnings: [{ type: "cropped-paths", count: 3 }],
  });
}

function makeProps(overrides = {}) {
  return {
    receipt: cleanReceipt(),
    onOpenPlan: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("ExportReceipt — render", () => {
  it("renders nothing when there is no receipt", () => {
    const { container } = render(
      <ExportReceipt {...makeProps({ receipt: null })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the receipt line verbatim", () => {
    render(<ExportReceipt {...makeProps()} />);
    expect(
      screen.getByText("Exported — Estimated · 5 min")
    ).toBeInTheDocument();
  });

  it("shows the cropped clause when the receipt carries crops", () => {
    render(<ExportReceipt {...makeProps({ receipt: croppedReceipt() })} />);
    expect(
      screen.getByText(/3 paths cropped at sheet edge/)
    ).toBeInTheDocument();
  });
});

describe("ExportReceipt — Run Plan affordance", () => {
  it("the Run plan affordance calls onOpenPlan and does not dismiss", () => {
    const onOpenPlan = vi.fn();
    const onDismiss = vi.fn();
    render(<ExportReceipt {...makeProps({ onOpenPlan, onDismiss })} />);
    fireEvent.click(screen.getByRole("button", { name: /run plan/i }));
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("ExportReceipt — auto-dismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onDismiss after the auto-dismiss delay", () => {
    const onDismiss = vi.fn();
    render(
      <ExportReceipt {...makeProps({ onDismiss, autoDismissMs: 6000 })} />
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not fire before the delay elapses", () => {
    const onDismiss = vi.fn();
    render(
      <ExportReceipt {...makeProps({ onDismiss, autoDismissMs: 6000 })} />
    );
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
