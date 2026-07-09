// @vitest-environment jsdom
//
// Run Plan (PRD #73): the status bar's machine/bed cluster is the "tap the
// machine to see what it will do" entry — a button that opens the Run Plan when a
// handler is wired, and a plain readout otherwise (legacy / no provider).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatusBar from "./StatusBar";

describe("StatusBar — Run Plan opener on the machine cluster", () => {
  it("is a button that opens the plan when onOpenRunPlan is supplied", () => {
    const onOpenRunPlan = vi.fn();
    render(<StatusBar profileId="laser" bedSize={{ width: 500, height: 300, unit: "mm" }} onOpenRunPlan={onOpenRunPlan} />);
    const cluster = screen.getByRole("button", { name: "Active bed" });
    expect(cluster).toHaveTextContent(/500/);
    fireEvent.click(cluster);
    expect(onOpenRunPlan).toHaveBeenCalledTimes(1);
  });

  it("stays a plain readout (no button) when no handler is wired", () => {
    render(<StatusBar profileId="laser" bedSize={{ width: 500, height: 300, unit: "mm" }} />);
    expect(screen.queryByRole("button", { name: "Active bed" })).not.toBeInTheDocument();
    // The bed readout is still present as a label.
    expect(screen.getByLabelText("Active bed")).toHaveTextContent(/500/);
  });
});
