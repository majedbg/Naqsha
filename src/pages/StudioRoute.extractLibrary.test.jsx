// @vitest-environment jsdom
//
// D5 (issue #49 browser finding) — the "+ New from Photo" round-trip.
// When a guest completes an extraction launched FROM the Pattern Library, the
// save is session-only: ExtractStepper stays mounted showing a "Continue"
// notice until acknowledged. The bug: Studio re-opened LibraryView straight
// from onSaved, and LibraryView (rendered AFTER the stepper in the JSX, same
// z-50 fixed-inset overlay) painted its backdrop over the still-mounted notice
// and intercepted its clicks — the notice became undismissable.
//
// The fix defers the Library re-open to the stepper's onClose (the notice's
// Continue → onClose is the completion signal). This test drives Studio's real
// wiring through lightweight ExtractStepper/LibraryView doubles that expose the
// onSaved/onClose/onNewExtraction callbacks, and asserts the DISCRIMINATING
// intermediate state: after onSaved but before onClose, LibraryView must NOT be
// mounted — only after the stepper closes does it re-open.
//
// NEW test file — touches no existing test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest" }),
  AuthProvider: ({ children }) => children,
}));

// Lightweight doubles for the lazy-loaded extraction surfaces. They expose the
// exact callbacks Studio wires so we exercise the real onSaved/onClose flow
// without the extraction pipeline (canvas/worker/potrace).
vi.mock("../components/extract/ExtractStepper", () => ({
  default: ({ onClose, onSaved }) => (
    <div data-testid="extract-stepper">
      {/* Guest save → session-only: fire onSaved WITHOUT closing (mirrors the
          real stepper, which keeps the notice up until Continue). */}
      <button type="button" onClick={() => onSaved({ persisted: false, reason: "guest" })}>
        stepper-save
      </button>
      {/* The session-only notice's "Continue" → onClose. */}
      <button type="button" onClick={onClose}>
        stepper-continue
      </button>
    </div>
  ),
}));
vi.mock("../components/library/LibraryView", () => ({
  default: ({ onClose, onNewExtraction }) => (
    <div data-testid="library-view">
      <h2>Pattern Library</h2>
      <button type="button" onClick={onNewExtraction}>
        + New from Photo
      </button>
      <button type="button" onClick={onClose}>
        close-library
      </button>
    </div>
  ),
}));

import StudioRoute from "./StudioRoute";

async function openLibraryFromMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Object" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /pattern library/i }));
  return screen.findByTestId("library-view");
}

describe("StudioRoute — extract round-trip returns to Library only after close (D5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the session-only notice interactive: Library re-opens on close, NOT on save", async () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );

    // Open the Library, then launch "+ New from Photo" (sets the from-Library
    // round-trip intent, closes the Library, opens the stepper).
    await openLibraryFromMenu();
    fireEvent.click(screen.getByRole("button", { name: "+ New from Photo" }));

    const stepper = await screen.findByTestId("extract-stepper");
    // Library closed when the stepper opened.
    expect(screen.queryByTestId("library-view")).not.toBeInTheDocument();

    // Guest save → session-only: onSaved fires, notice stays up.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "stepper-save" }));
    });

    // DISCRIMINATING ASSERTION: the Library must NOT have re-opened yet — the
    // stepper (its notice) is still the only overlay, so nothing paints over it.
    expect(stepper).toBeInTheDocument();
    expect(screen.queryByTestId("library-view")).not.toBeInTheDocument();

    // Acknowledge the notice: Continue → onClose. Now the round-trip lands.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "stepper-continue" }));
    });

    expect(screen.queryByTestId("extract-stepper")).not.toBeInTheDocument();
    const lib = await screen.findByTestId("library-view");
    expect(lib).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pattern Library" })).toBeInTheDocument();
  });
});
