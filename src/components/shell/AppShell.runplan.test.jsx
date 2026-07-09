// @vitest-environment jsdom
//
// Wave-3 UI Lane F (Run Plan, PRD #73). The plan is a shell-morph: AppShell
// mounts the RunPlanProvider so the hosted Studio (a child in the Canvas region)
// can open the plan, and adds calm shell-level chrome when the plan is open — a
// "Back to design" affordance and an Esc keydown that both call close(). When the
// plan is closed AppShell behaves exactly as before (the byte-identical guarantee
// covered by AppShell.test / .dock.test / .resize.test).

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AppShell from "./AppShell";
import { useRunPlan } from "./runPlanContext";

beforeEach(() => {
  localStorage.clear();
});

// A child hosted in the Canvas region that both drives and reflects the plan
// state through useRunPlan — proving AppShell provides the context to children.
function PlanProbe() {
  const { isOpen, open } = useRunPlan();
  return (
    <div>
      <div data-testid="plan-state">{isOpen ? "open" : "closed"}</div>
      <button type="button" onClick={open}>
        Plan the run
      </button>
    </div>
  );
}

describe("AppShell — Run Plan shell-morph (Lane F)", () => {
  it("provides useRunPlan to hosted children, closed by default", () => {
    render(
      <AppShell>
        <PlanProbe />
      </AppShell>
    );
    expect(screen.getByTestId("plan-state").textContent).toBe("closed");
    // No morph chrome and no plan-mode attribute while closed.
    expect(screen.queryByRole("button", { name: /back to design/i })).not.toBeInTheDocument();
    const root = screen.getByTestId("plan-state").closest("[data-plan-mode]");
    expect(root).toBeNull();
  });

  it("a child can open the plan; AppShell then shows Back to design and marks plan mode", () => {
    render(
      <AppShell>
        <PlanProbe />
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: /plan the run/i }));
    expect(screen.getByTestId("plan-state").textContent).toBe("open");
    expect(screen.getByRole("button", { name: /back to design/i })).toBeInTheDocument();
    expect(document.querySelector("[data-plan-mode]")).not.toBeNull();
  });

  it("Back to design closes the plan", () => {
    render(
      <AppShell>
        <PlanProbe />
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: /plan the run/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to design/i }));
    expect(screen.getByTestId("plan-state").textContent).toBe("closed");
  });

  it("Escape closes the plan when open", () => {
    render(
      <AppShell>
        <PlanProbe />
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: /plan the run/i }));
    expect(screen.getByTestId("plan-state").textContent).toBe("open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("plan-state").textContent).toBe("closed");
  });

  it("Escape does nothing while the plan is closed (no interference with the design surface)", () => {
    render(
      <AppShell>
        <PlanProbe />
      </AppShell>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("plan-state").textContent).toBe("closed");
  });
});
