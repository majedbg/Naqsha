// @vitest-environment jsdom
// MaterialEvaluationDialog.test.jsx — material-evaluation slice 1
//
// The keystone side-by-side (vision doc "The UX in one image"): the maker's
// photo of their Sheet on one side, the captured render screenshot on the
// other. Login gate mirrors the motif-library precedent: logged-out → submit
// disabled + sign-in prompt (the premium scaffold is a separate module and
// ships OFF).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockAuth = { user: null, tier: "guest", signIn: vi.fn() };
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const mockSubmit = vi.fn();
let mockHookState;
vi.mock("../../lib/hooks/useMaterialEvaluations", () => ({
  default: () => mockHookState,
}));

import MaterialEvaluationDialog from "./MaterialEvaluationDialog";

const MATERIAL = { id: "turquoise-opaque", name: "Turquoise Opaque", type: "acrylic", hex: "#61DBC2" };
const RENDER_DATA_URL = "data:image/png;base64,AAAA";

function renderDialog(props = {}) {
  return render(
    <MemoryRouter>
      <MaterialEvaluationDialog
        material={MATERIAL}
        renderDataUrl={RENDER_DATA_URL}
        onClose={props.onClose ?? vi.fn()}
      />
    </MemoryRouter>
  );
}

function pickPhoto(type = "image/jpeg") {
  const file = new File([new Uint8Array(8)], "sheet.jpg", { type });
  fireEvent.change(screen.getByTestId("evaluation-photo-input"), {
    target: { files: [file] },
  });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = { user: null, tier: "guest", signIn: vi.fn() };
  mockHookState = { evaluations: [], loading: false, error: null, submit: mockSubmit, refresh: vi.fn() };
  // jsdom has no createObjectURL; the component guards, tests stub.
  URL.createObjectURL = vi.fn(() => "blob:photo-preview");
  URL.revokeObjectURL = vi.fn();
});

describe("MaterialEvaluationDialog — side-by-side", () => {
  it("shows the captured render on one side and the photo drop on the other", () => {
    renderDialog();
    const renderImg = screen.getByTestId("evaluation-render-img");
    expect(renderImg).toHaveAttribute("src", RENDER_DATA_URL);
    expect(screen.getByTestId("evaluation-photo-input")).toBeInTheDocument();
    // Both panes are labeled for what they hold.
    expect(screen.getByText(/your sheet/i)).toBeInTheDocument();
    expect(screen.getByText(/preview render/i)).toBeInTheDocument();
  });

  it("names the material and its resolved Material Archetype", () => {
    renderDialog();
    expect(screen.getAllByText(/Turquoise Opaque/).length).toBeGreaterThan(0);
    // 'Turquoise Opaque' has no transmission keyword → opaque-acrylic by NAME rule.
    expect(screen.getByTestId("evaluation-archetype")).toHaveTextContent("opaque-acrylic");
  });

  it("previews the chosen photo in the photo pane", () => {
    mockAuth = { user: { id: "u1" }, tier: "free", signIn: vi.fn() };
    renderDialog();
    pickPhoto();
    expect(screen.getByTestId("evaluation-photo-img")).toHaveAttribute("src", "blob:photo-preview");
  });
});

describe("MaterialEvaluationDialog — login gate (motif-library precedent)", () => {
  it("logged out: submit is disabled and a sign-in prompt is shown", () => {
    renderDialog();
    expect(screen.getByTestId("evaluation-submit")).toBeDisabled();
    expect(screen.getByText(/sign in to submit/i)).toBeInTheDocument();
  });

  it("signed in: no sign-in prompt; submit stays disabled until a photo is chosen", () => {
    mockAuth = { user: { id: "u1" }, tier: "free", signIn: vi.fn() };
    renderDialog();
    expect(screen.queryByText(/sign in to submit/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("evaluation-submit")).toBeDisabled();
    pickPhoto();
    expect(screen.getByTestId("evaluation-submit")).toBeEnabled();
  });
});

describe("MaterialEvaluationDialog — submit", () => {
  beforeEach(() => {
    mockAuth = { user: { id: "u1" }, tier: "free", signIn: vi.fn() };
  });

  it("submits the pairing (material + archetype + photo + render + note) and shows success", async () => {
    mockSubmit.mockResolvedValue({ id: "eval-1" });
    renderDialog();
    const file = pickPhoto();
    fireEvent.change(screen.getByTestId("evaluation-note"), {
      target: { value: "daylight, matte side up" },
    });
    fireEvent.click(screen.getByTestId("evaluation-submit"));

    await waitFor(() => expect(screen.getByTestId("evaluation-success")).toBeInTheDocument());
    expect(mockSubmit).toHaveBeenCalledWith({
      material: MATERIAL,
      archetype: "opaque-acrylic",
      photoFile: file,
      renderDataUrl: RENDER_DATA_URL,
      note: "daylight, matte side up",
    });
    // Success links to the review view.
    expect(screen.getByRole("link", { name: /my evaluations/i })).toHaveAttribute(
      "href",
      "/evaluations"
    );
  });

  it("shows a graceful error when the submit fails (hook resolves null)", async () => {
    mockSubmit.mockResolvedValue(null);
    mockHookState.error = new Error("upload failed");
    renderDialog();
    pickPhoto();
    fireEvent.click(screen.getByTestId("evaluation-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("evaluation-error")).toHaveTextContent(/couldn.t submit/i)
    );
    expect(screen.queryByTestId("evaluation-success")).not.toBeInTheDocument();
  });

  it("closes via the ✕ button", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId("evaluation-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses to close (✕ and Escape) while a submit is in flight", async () => {
    let resolveSubmit;
    mockSubmit.mockReturnValue(new Promise((r) => { resolveSubmit = r; }));
    const onClose = vi.fn();
    renderDialog({ onClose });
    pickPhoto();
    fireEvent.click(screen.getByTestId("evaluation-submit"));

    // Mid-submit: the outcome must stay visible, so close is guarded.
    expect(screen.getByTestId("evaluation-close")).toBeDisabled();
    fireEvent.click(screen.getByTestId("evaluation-close"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    await waitFor(async () => {
      resolveSubmit({ id: "eval-1" });
      expect(await screen.findByTestId("evaluation-success")).toBeInTheDocument();
    });
    // Settled: closable again.
    fireEvent.click(screen.getByTestId("evaluation-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
