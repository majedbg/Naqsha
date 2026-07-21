// @vitest-environment jsdom
// GlyphPickerChip — a11y contract for the motif glyph picker (accessibility pass):
//   B. focus-visible ring on the trigger (no bare outline-none affordance)
//   C. focus returns to the trigger on every close path EXCEPT "Manage library"
//      (which intentionally hands focus to the library panel)
//   D. dialog semantics on the flyout (haspopup + role=dialog + aria-controls)
//   E. Escape closes from anywhere inside the flyout (not only the search input)
//   F. recents buttons carry a real accessible name (not title-only)
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import GlyphPickerChip from "./GlyphPickerChip";

const baseProps = {
  glyphRef: "leaf",
  customGlyphs: {},
  libraryMotifs: [],
  onPick: () => {},
};

beforeEach(() => {
  localStorage.clear();
});

describe("GlyphPickerChip — a11y", () => {
  // ── B ──────────────────────────────────────────────────────────────────────
  it("B: the trigger exposes a focus-visible ring affordance", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.className).toContain("focus-visible:ring-violet");
  });

  // ── C (WCAG 2.4.3) ──────────────────────────────────────────────────────────
  it("C: focus returns to the trigger after committing a pick", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    fireEvent.click(trigger); // open
    fireEvent.click(screen.getByTestId("glyph-option-diamond"));
    expect(document.activeElement).toBe(trigger);
  });

  it("C: focus returns to the trigger after the close button", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close picker" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("C: 'Manage library' does NOT restore focus (it hands focus to the library panel)", () => {
    render(<GlyphPickerChip {...baseProps} onManageLibrary={() => {}} />);
    const trigger = screen.getByTestId("motif-glyph");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Manage library/ }));
    expect(document.activeElement).not.toBe(trigger);
  });

  // ── D ──────────────────────────────────────────────────────────────────────
  it("D: the flyout is a labelled dialog the trigger controls", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Choose a motif" });
    expect(dialog.id).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
  });

  // ── Floating-surface contract: the flyout uses the house `shadow-pop`
  //    token (RowMenu / PanelHeader / other portaled surfaces) — not raw
  //    Tailwind `shadow-lg`.
  it("D': the flyout uses the house shadow-pop token, not raw shadow-lg", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    const dialog = screen.getByRole("dialog", { name: "Choose a motif" });
    expect(dialog.className).toContain("shadow-pop");
    expect(dialog.className).not.toContain("shadow-lg");
  });

  // ── E ──────────────────────────────────────────────────────────────────────
  it("E: Escape from a set-filter chip closes the picker AND restores focus", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    fireEvent.click(trigger);
    const chip = screen.getByRole("button", { name: "Built-in" });
    chip.focus();
    fireEvent.keyDown(chip, { key: "Escape" });
    expect(screen.queryByTestId("glyph-picker-flyout")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // ── F ──────────────────────────────────────────────────────────────────────
  it("F: recents buttons expose the glyph name as their accessible name", () => {
    localStorage.setItem("sonoform-recent-glyphs", JSON.stringify(["diamond"]));
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    // Empty the grid so the only "Diamond" button left is the recent.
    fireEvent.change(screen.getByLabelText("Search motifs"), {
      target: { value: "zzz-no-match" },
    });
    const recent = screen.getByRole("button", { name: "Diamond" });
    // A real accessible name, not the title-only fallback the audit flagged.
    expect(recent).toHaveAttribute("aria-label", "Diamond");
  });
});

describe("GlyphPickerChip — house-icon language (final polish)", () => {
  // The trigger chevron and the flyout close button used bare Unicode glyphs
  // (⌄ / ✕); they are now crafted inline SVGs (currentColor, hairline stroke,
  // aria-hidden). Accessible names are unchanged (chevron decorative; close
  // still carries aria-label), so role+name queries stay green.
  it("the trigger chevron is a decorative inline SVG, not a ⌄ glyph", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(trigger.textContent).not.toContain("⌄");
  });

  it("the flyout close button is an inline SVG icon, not a ✕ glyph", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    const close = screen.getByRole("button", { name: "Close picker" });
    expect(close.querySelector("svg")).not.toBeNull();
    expect(close.textContent).not.toContain("✕");
  });
});

describe("GlyphPickerChip — responsive flyout (portal + flip + clamp)", () => {
  // The flyout used to be an absolute child inside the inspector's overflow-auto
  // region, so a ~320px popover near the viewport bottom got clipped. It now
  // portals to document.body as position:fixed and flips above the trigger when
  // it would overflow the viewport.
  it("renders the flyout into document.body (portal) yet keeps its dialog role", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    const dialog = screen.getByRole("dialog", { name: "Choose a motif" });
    // Portaled: the flyout is a direct child of <body>, not nested in the chip.
    expect(dialog.parentElement).toBe(document.body);
  });

  it("flips above the trigger when it would overflow the bottom of the viewport", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    // Trigger sits near the bottom edge (jsdom innerHeight defaults to 768).
    trigger.getBoundingClientRect = () => ({
      left: 100,
      right: 340,
      top: 750,
      bottom: 770,
      width: 240,
      height: 20,
    });
    fireEvent.click(trigger);
    const dialog = screen.getByTestId("glyph-picker-flyout");
    expect(dialog).toHaveAttribute("data-placement", "top");
    // Even flipped, it's height-capped with internal scroll so it can't exceed
    // the viewport.
    expect(dialog.style.maxHeight).not.toBe("");
    expect(dialog.className).toContain("overflow-y-auto");
  });

  it("places below the trigger when there is room underneath", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const trigger = screen.getByTestId("motif-glyph");
    trigger.getBoundingClientRect = () => ({
      left: 100,
      right: 340,
      top: 40,
      bottom: 60,
      width: 240,
      height: 20,
    });
    fireEvent.click(trigger);
    const dialog = screen.getByTestId("glyph-picker-flyout");
    expect(dialog).toHaveAttribute("data-placement", "bottom");
  });

  it("outside pointerdown closes, but a pointerdown inside the portaled flyout does not", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    // A click INSIDE the portaled flyout must be treated as inside (containment
    // uses the flyout ref, not DOM ancestry of the chip container).
    fireEvent.pointerDown(screen.getByLabelText("Search motifs"));
    expect(screen.queryByTestId("glyph-picker-flyout")).not.toBeNull();
    // A click OUTSIDE (on the document body) closes without committing.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("glyph-picker-flyout")).toBeNull();
  });
});

describe("GlyphPickerChip — 44px touch-target contract (mobile-reachable surface)", () => {
  // The chip + flyout also render inside the <768px MobileStudio drawer, so every
  // interactive element must clear a ≥44px effective hit area on touch. We keep
  // the dense pro visual by reaching 44px via min-h-11/min-w-11 with negative
  // margins that reabsorb the extra footprint (per .impeccable density rule).
  it("the trigger chip reaches a 44px-tall hit area", () => {
    render(<GlyphPickerChip {...baseProps} />);
    expect(screen.getByTestId("motif-glyph").className).toContain("min-h-11");
  });

  it("the close button is a 44px square icon button", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    const close = screen.getByRole("button", { name: "Close picker" });
    expect(close.className).toContain("min-h-11");
    expect(close.className).toContain("min-w-11");
  });

  it("set-filter pills reach a 44px hit area", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    const pill = screen.getByRole("button", { name: "Built-in" });
    expect(pill.className).toContain("min-h-11");
  });

  it("recents thumbnails reach a 44px square hit area", () => {
    localStorage.setItem("sonoform-recent-glyphs", JSON.stringify(["diamond"]));
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    // Empty the grid so the "Diamond" button left is the recent thumbnail.
    fireEvent.change(screen.getByLabelText("Search motifs"), {
      target: { value: "zzz-no-match" },
    });
    const recent = screen.getByRole("button", { name: "Diamond" });
    expect(recent.className).toContain("min-h-11");
    expect(recent.className).toContain("min-w-11");
  });

  it("grid option tiles reach a 44px-tall hit area", () => {
    render(<GlyphPickerChip {...baseProps} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    expect(screen.getByTestId("glyph-option-diamond").className).toContain("min-h-11");
  });
});

describe("GlyphPickerChip — type scale (typography pass)", () => {
  it("the chip's primary glyph name uses text-xs (11px sanctioned step)", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const name = screen.getByText("Leaf");
    expect(name.className).toContain("text-xs");
    expect(name.className).not.toMatch(/text-\[\d+px\]/);
  });

  it("the chip's secondary set label uses the 2xs step (keeps uppercase/tracking)", () => {
    render(<GlyphPickerChip {...baseProps} />);
    const setLabel = screen.getByText("Built-in");
    expect(setLabel.className).toContain("text-2xs");
    expect(setLabel.className).toContain("uppercase");
    expect(setLabel.className).toContain("tracking-wide");
  });

  it("flyout micro-labels use the 2xs step (recents, grid caption, Manage library)", () => {
    localStorage.setItem("sonoform-recent-glyphs", JSON.stringify(["diamond"]));
    render(<GlyphPickerChip {...baseProps} onManageLibrary={() => {}} />);
    fireEvent.click(screen.getByTestId("motif-glyph"));
    expect(screen.getByText("Recent").className).toContain("text-2xs");
    // Grid option caption (the glyph name under each thumbnail).
    const gridCaption = within(
      screen.getByTestId("glyph-option-diamond")
    ).getByText("Diamond");
    expect(gridCaption.className).toContain("text-2xs");
    expect(screen.getByText(/Manage library/).className).toContain("text-2xs");
  });

  it("renders no arbitrary text-[Npx] font-size class (trigger + open flyout)", () => {
    localStorage.setItem("sonoform-recent-glyphs", JSON.stringify(["diamond"]));
    const { container } = render(
      <GlyphPickerChip {...baseProps} onManageLibrary={() => {}} />
    );
    fireEvent.click(screen.getByTestId("motif-glyph"));
    // Trigger lives in `container`; the flyout is portalled to document.body.
    expect(container.innerHTML).not.toMatch(/text-\[\d+px\]/);
    const flyout = screen.getByTestId("glyph-picker-flyout");
    expect(flyout.innerHTML).not.toMatch(/text-\[\d+px\]/);
    // Empty the grid so the "No matches" caption also renders and is swept.
    fireEvent.change(screen.getByLabelText("Search motifs"), {
      target: { value: "zzz-no-match" },
    });
    expect(screen.getByText("No matches").className).toContain("text-2xs");
    expect(
      screen.getByTestId("glyph-picker-flyout").innerHTML
    ).not.toMatch(/text-\[\d+px\]/);
  });
});
