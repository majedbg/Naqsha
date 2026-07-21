// @vitest-environment jsdom
// CadenceStripControl — the EDITABLE cadence for an Every-N block. It renders
// `beats` positions on a host rule; a beat is PLACED (filled) when
// ((i - offset) mod n) === 0 and SKIPPED (faint) otherwise. Clicking beat k edits
// the OFFSET so that beat becomes placed: offset := k mod n (n is UNCHANGED — n
// is edited by the ScrubNumeral beside the strip). Every click flows through
// onCommit(nextOffset). role="group" with one aria-labelled button per beat.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CadenceStripControl from "./CadenceStripControl";

describe("CadenceStripControl — placed/skipped reading (n, offset)", () => {
  it("marks every Nth beat placed from the offset (n=3, offset=0)", () => {
    render(<CadenceStripControl n={3} offset={0} beats={12} onCommit={() => {}} />);
    const group = screen.getByRole("group", { name: /cadence/i });
    // Beats 1,4,7,10 (0-based 0,3,6,9) are placed.
    expect(within(group).getByRole("button", { name: "Beat 1 — placed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "Beat 4 — placed" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Beat 2 — skipped" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("shifts the placed beats when offset changes (n=3, offset=1)", () => {
    render(<CadenceStripControl n={3} offset={1} beats={12} onCommit={() => {}} />);
    // Now beats 2,5,8,11 (0-based 1,4,7,10) are placed.
    expect(screen.getByRole("button", { name: "Beat 2 — placed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beat 1 — skipped" })).toBeInTheDocument();
  });

  it("n=1 places every beat", () => {
    render(<CadenceStripControl n={1} offset={0} beats={6} onCommit={() => {}} />);
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByRole("button", { name: `Beat ${i} — placed` })).toBeInTheDocument();
    }
  });
});

describe("CadenceStripControl — clicking a beat edits OFFSET (not n)", () => {
  it("clicking beat 5 (0-based 4) with n=3 commits offset = 4 mod 3 = 1", () => {
    const onCommit = vi.fn();
    render(<CadenceStripControl n={3} offset={0} beats={12} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Beat 5 — skipped" }));
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it("clicking beat 7 (0-based 6) with n=4 commits offset = 6 mod 4 = 2", () => {
    const onCommit = vi.fn();
    render(<CadenceStripControl n={4} offset={0} beats={12} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Beat 7 — skipped" }));
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it("clicking an already-placed beat commits an offset that keeps it placed (idempotent-safe)", () => {
    const onCommit = vi.fn();
    render(<CadenceStripControl n={3} offset={0} beats={12} onCommit={onCommit} />);
    // Beat 4 (0-based 3) is placed; 3 mod 3 = 0, the current offset.
    fireEvent.click(screen.getByRole("button", { name: "Beat 4 — placed" }));
    expect(onCommit).toHaveBeenCalledWith(0);
  });
});

describe("CadenceStripControl — a11y + brief", () => {
  it("beat buttons carry a focus-visible violet ring", () => {
    render(<CadenceStripControl n={2} offset={0} beats={4} onCommit={() => {}} />);
    expect(screen.getByRole("button", { name: "Beat 1 — placed" }).className).toContain(
      "focus-visible:ring-violet"
    );
  });
});
