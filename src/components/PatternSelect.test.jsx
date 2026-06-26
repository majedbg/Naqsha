// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatternSelect from "./PatternSelect";

// PatternSelect composes PatternPickerModal, which reads the tier gate via
// useAuth. Mock it to a tier where every pattern is unlocked so picking works
// (mirrors DockToggle.test.jsx / Inspector.test.jsx).
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

describe("PatternSelect (compact pattern swap → grid picker)", () => {
  // 1. Shows ONLY the active pattern as a trigger; the grid is not open yet.
  it("renders the active pattern label and keeps the grid closed", () => {
    render(<PatternSelect active="flowfield" onChange={() => {}} />);

    // Active pattern label lives inside the trigger button (reachable by name —
    // this is what the Inspector tests also assert on).
    expect(
      screen.getByRole("button", { name: /Flow Field/i })
    ).toBeInTheDocument();

    // No pill list: another pattern's name is NOT rendered up-front.
    expect(screen.queryByText("Spirograph")).not.toBeInTheDocument();
    // Grid picker is closed until the trigger is clicked.
    expect(screen.queryByText("Choose a pattern")).not.toBeInTheDocument();
  });

  // 2. Clicking the trigger opens the periodic-table grid picker.
  it("opens the grid picker when the trigger is clicked", () => {
    render(<PatternSelect active="flowfield" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Flow Field/i }));
    expect(screen.getByText("Choose a pattern")).toBeInTheDocument();
  });

  // 3. Picking a pattern from the grid calls onChange with its id and closes.
  it("picks a pattern → onChange(id) and the grid closes", () => {
    const onChange = vi.fn();
    render(<PatternSelect active="flowfield" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Flow Field/i }));

    // Cards carry a `title` of "<label> — <blurb>"; Spiral is a static (ready)
    // built-in, so its card is enabled.
    fireEvent.click(screen.getByTitle(/^Spiral —/));

    expect(onChange).toHaveBeenCalledWith("spiral");
    // Grid closed again after a pick.
    expect(screen.queryByText("Choose a pattern")).not.toBeInTheDocument();
  });
});
