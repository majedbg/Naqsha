// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// Phase 5 INTEGRATION test — the text EDIT LIFECYCLE owned by Studio.
//
// The real lifecycle logic (handleCreateText + the prevTool-ref trap,
// handleEditText → params.text, handleExitEdit's abandoned-empty removal,
// handleRequestEdit, and the Inspector text panel) all live in Studio + the
// real Inspector — NOT in RightPanel. So instead of the trivial canvas stub the
// other StudioRoute tests use, we mock RightPanel with a RICH double that
// surfaces the edit-lifecycle callbacks as test controls and prints the props
// it receives as readouts. This lets us exercise the full Studio lifecycle
// against the REAL Studio + REAL Inspector/TextPropertiesPanel (portaled in)
// WITHOUT needing real canvas pixel coordinates.
//
// What this test covers vs. what defers to the Phase 7 browser check is
// documented at the bottom of this file.

vi.mock("../components/RightPanel", () => ({
  default: ({
    layers,
    activeTool,
    editingNodeId,
    selectedNodeId,
    onCreateText,
    onEditText,
    onExitEdit,
    onRequestEdit,
  }) => {
    const textLayers = (layers || []).filter((l) => l.type === "text");
    const editingLayer = (layers || []).find((l) => l.id === editingNodeId);
    return (
      <div data-testid="canvas-surface">
        <div data-testid="active-tool">{String(activeTool)}</div>
        <div data-testid="editing-id">{String(editingNodeId)}</div>
        <div data-testid="selected-id">{String(selectedNodeId)}</div>
        <div data-testid="text-layer-count">{textLayers.length}</div>
        <div data-testid="editing-text">
          {editingLayer ? String(editingLayer.params?.text ?? "") : ""}
        </div>
        {/* Stands in for a click-create gesture on the canvas overlay. */}
        <button
          data-testid="mock-create-text"
          onClick={() =>
            onCreateText({ x: 50, y: 50, box: { w: 0, h: 0 }, lineMode: "single" })
          }
        >
          create
        </button>
        {/* The edit textarea — only mounted while editing, mirroring the real
            TextEditOverlay's render condition. */}
        {editingNodeId && (
          <textarea
            data-testid="mock-text-editor"
            value={editingLayer?.params?.text ?? ""}
            onChange={(e) => onEditText(editingNodeId, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onExitEdit();
            }}
          />
        )}
        {/* Stands in for a double-click re-edit on an existing text layer. */}
        {textLayers[0] && (
          <button
            data-testid="mock-request-edit"
            onClick={() => onRequestEdit(textLayers[0].id)}
          >
            edit-first-text
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("../lib/AuthContext", () => ({
  // Pro tier → 6-layer cap, so creating two text layers on top of the two
  // default layers stays under the cap (guest's cap of 3 would block the 2nd).
  useAuth: () => ({
    loading: false,
    user: { id: "u1" },
    tier: "pro",
    profile: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

function renderPro() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

function activateTextTool() {
  const strip = screen.getByRole("region", { name: "Tool strip" });
  fireEvent.click(within(strip).getByRole("button", { name: /text/i }));
}

describe("StudioRoute — text edit lifecycle (phase 5 integration)", () => {
  beforeEach(() => {
    // The default layers persist to localStorage; clear so each test starts
    // from a known baseline (the two seeded default layers, zero text layers).
    localStorage.clear();
  });

  it("1) create opens the editor, keeps tool='text', and selects the new layer", () => {
    renderPro();
    activateTextTool();
    expect(screen.getByTestId("active-tool")).toHaveTextContent("text");

    fireEvent.click(screen.getByTestId("mock-create-text"));

    // Editor opened for a new text layer...
    const newId = screen.getByTestId("editing-id").textContent;
    expect(newId).not.toBe("null");
    // ...the tool STAYED on 'text' (the prevTool-ref trap did NOT kill the
    // editor on the create commit)...
    expect(screen.getByTestId("active-tool")).toHaveTextContent("text");
    // ...and the new layer is selected.
    expect(screen.getByTestId("selected-id")).toHaveTextContent(newId);
    // The editor textarea is mounted.
    expect(screen.getByTestId("mock-text-editor")).toBeInTheDocument();
  });

  it("2) typing writes the layer's params.text", () => {
    renderPro();
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));

    fireEvent.change(screen.getByTestId("mock-text-editor"), {
      target: { value: "Hi" },
    });
    expect(screen.getByTestId("editing-text")).toHaveTextContent("Hi");
  });

  it("3) Escape on non-empty text commits + closes, layer persists, tool→select", () => {
    renderPro();
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));
    fireEvent.change(screen.getByTestId("mock-text-editor"), {
      target: { value: "Hi" },
    });
    expect(screen.getByTestId("text-layer-count")).toHaveTextContent("1");

    fireEvent.keyDown(screen.getByTestId("mock-text-editor"), { key: "Escape" });

    // Editor closed.
    expect(screen.getByTestId("editing-id")).toHaveTextContent("null");
    expect(screen.queryByTestId("mock-text-editor")).not.toBeInTheDocument();
    // Tool returned to select.
    expect(screen.getByTestId("active-tool")).toHaveTextContent("select");
    // Non-empty layer PERSISTED.
    expect(screen.getByTestId("text-layer-count")).toHaveTextContent("1");
  });

  it("4) Escape on an abandoned-empty text removes the layer", () => {
    renderPro();
    // First make a persisting text layer so removing the empty one isn't blocked
    // by the last-layer guard, and to give a clean before/after count.
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));
    fireEvent.change(screen.getByTestId("mock-text-editor"), {
      target: { value: "Keep" },
    });
    fireEvent.keyDown(screen.getByTestId("mock-text-editor"), { key: "Escape" });
    expect(screen.getByTestId("text-layer-count")).toHaveTextContent("1");

    // Now create another, type NOTHING, Escape → it must be removed.
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));
    expect(screen.getByTestId("text-layer-count")).toHaveTextContent("2");
    fireEvent.keyDown(screen.getByTestId("mock-text-editor"), { key: "Escape" });

    // Count returns to its pre-create value; editor closed.
    expect(screen.getByTestId("text-layer-count")).toHaveTextContent("1");
    expect(screen.getByTestId("editing-id")).toHaveTextContent("null");
  });

  it("5) request-edit (double-click stand-in) re-opens the editor for an existing text layer", () => {
    renderPro();
    // Create + commit a text layer.
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));
    fireEvent.change(screen.getByTestId("mock-text-editor"), {
      target: { value: "Hi" },
    });
    fireEvent.keyDown(screen.getByTestId("mock-text-editor"), { key: "Escape" });
    expect(screen.getByTestId("editing-id")).toHaveTextContent("null");

    // Re-enter edit via the request-edit control (real double-click maps to
    // onRequestEdit; the canvas hit-test itself is a Phase 7 browser check).
    fireEvent.click(screen.getByTestId("mock-request-edit"));
    const id = screen.getByTestId("editing-id").textContent;
    expect(id).not.toBe("null");
    expect(screen.getByTestId("selected-id")).toHaveTextContent(id);
    expect(screen.getByTestId("mock-text-editor")).toBeInTheDocument();
  });

  it("the real Inspector shows the text properties panel for a selected text layer", () => {
    renderPro();
    activateTextTool();
    fireEvent.click(screen.getByTestId("mock-create-text"));
    // The selected layer is a text layer → Inspector renders the text panel
    // (data-testid="inspector-text"), NOT the pattern param controls.
    const inspector = screen.getByRole("region", { name: "Inspector" });
    expect(within(inspector).getByTestId("inspector-text")).toBeInTheDocument();
    expect(
      within(inspector).queryByTestId("inspector-params")
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// COVERAGE LEDGER (phase 5 gate)
//
// Covered by THIS integration test (real Studio + real Inspector):
//   • create opens editor, tool stays 'text', new layer selected  (assertion 1)
//   • typing → params.text                                         (assertion 2)
//   • Escape on non-empty: commit + close, persist, tool→select   (assertion 3)
//   • Escape on abandoned-empty: layer removed                     (assertion 4)
//   • re-enter edit via onRequestEdit (double-click's effect)      (assertion 5)
//   • Inspector swaps to the text properties panel for text layers (extra)
//
// DEFERRED to the Phase 7 browser check (need real canvas geometry / DOM the
// jsdom harness can't supply; RightPanel is mocked here):
//   • pointer→canvas coordinate mapping (toCanvasPoint / screenToCanvas)
//   • buildSelectables + pickTopmost hit-testing under the real transform
//   • handleDoubleClick's actual hit-test (kind==='text' gate) and its
//     dragRef-null phantom-commit avoidance
//   • the REAL TextEditOverlay rendered inside the scaled canvas box (font load)
// ---------------------------------------------------------------------------
