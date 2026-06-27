// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatternCard from "./PatternCard";
import { CUSTOM_FAMILY } from "../lib/patternCatalog";

// A ready, enabled taxonomy-style card baseline.
const baseMeta = { family: "A", det: "deterministic", mark: "line", sym: false };

function renderCard(props = {}) {
  return render(
    <PatternCard
      id="spiral"
      meta={baseMeta}
      symbol="Sl"
      label="Spiral"
      ready
      locked={false}
      onPick={() => {}}
      {...props}
    />
  );
}

describe("PatternCard", () => {
  it("renders the element symbol", () => {
    renderCard();
    expect(screen.getByText("Sl")).toBeInTheDocument();
  });

  it("applies width/height from the size prop via inline style", () => {
    renderCard({ size: 140 });
    const btn = screen.getByRole("button");
    expect(btn.style.width).toBe("140px");
    expect(btn.style.height).toBe("140px");
  });

  it("defaults the box to 92px when no size is passed (Map view parity)", () => {
    renderCard();
    const btn = screen.getByRole("button");
    expect(btn.style.width).toBe("92px");
    expect(btn.style.height).toBe("92px");
  });

  it("is disabled and shows SOON when not ready; onPick not called on click", () => {
    const onPick = vi.fn();
    renderCard({ ready: false, onPick });
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(screen.getByText("SOON")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("is disabled and shows a lock when locked; onPick not called on click", () => {
    const onPick = vi.fn();
    const { container } = renderCard({ locked: true, lockReason: "Upgrade", onPick });
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    // The lock marker renders an inline <svg> (no SOON text when ready+locked).
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("SOON")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("calls onPick with the id when enabled and clicked", () => {
    const onPick = vi.fn();
    renderCard({ onPick });
    fireEvent.click(screen.getByRole("button"));
    expect(onPick).toHaveBeenCalledWith("spiral");
  });

  it("resolves a custom pattern's color via familyMetaFor (neutral gray, not #888)", () => {
    renderCard({
      id: "ai-thing",
      meta: { family: "custom", det: "seeded", mark: "line", sym: false },
      symbol: "Ai",
      label: "AI Thing",
    });
    // The element-symbol caption colors via fam.color; for a custom pattern this
    // is the neutral CUSTOM_FAMILY gray, NOT the bare '#888' fallback.
    const symbolEl = screen.getByText("Ai");
    expect(symbolEl.style.color).toBe("rgb(138, 143, 153)"); // CUSTOM_FAMILY.color #8a8f99
    expect(symbolEl.style.color).not.toBe("rgb(136, 136, 136)"); // not #888
    // Sanity: the constant itself is the neutral gray.
    expect(CUSTOM_FAMILY.color).toBe("#8a8f99");
  });
});
