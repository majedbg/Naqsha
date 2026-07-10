// @vitest-environment jsdom
// EvaluationsPage.test.jsx — material-evaluation slice 1
//
// The review view: the signed-in user's evaluation submissions listed as
// side-by-side pairings (photo | render). Signed-out and empty states are
// graceful; visibility is OWNER-ONLY in this slice (community gallery is an
// open vision question — see DECISIONS-DRAFT).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockAuth = { user: null, loading: false, signIn: vi.fn() };
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

let mockHookState;
vi.mock("../lib/hooks/useMaterialEvaluations", () => ({
  default: () => mockHookState,
}));

import EvaluationsPage from "./EvaluationsPage";

const EVAL_A = {
  id: "a",
  materialId: "turquoise-opaque",
  materialName: "Turquoise Opaque",
  archetype: "opaque-acrylic",
  kind: "material-vs-render",
  note: "daylight",
  createdAt: "2026-07-10T09:00:00Z",
  photoUrl: "https://signed/a/photo.jpg",
  renderUrl: "https://signed/a/render.png",
};
const EVAL_B = {
  ...EVAL_A,
  id: "b",
  materialName: "Clear",
  archetype: "clear-acrylic",
  note: null,
  photoUrl: null,
  renderUrl: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <EvaluationsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = { user: null, loading: false, signIn: vi.fn() };
  mockHookState = { evaluations: [], loading: false, error: null, submit: vi.fn(), refresh: vi.fn() };
});

describe("EvaluationsPage — states", () => {
  it("signed out: prompts to sign in, lists nothing", () => {
    renderPage();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByTestId("evaluation-row")).not.toBeInTheDocument();
  });

  it("signed in, empty: explains how evaluations are created", () => {
    mockAuth = { user: { id: "u1" }, loading: false, signIn: vi.fn() };
    renderPage();
    expect(screen.getByTestId("evaluations-empty")).toHaveTextContent(/evaluate material/i);
  });

  it("loading: shows a loading indicator", () => {
    mockAuth = { user: { id: "u1" }, loading: false, signIn: vi.fn() };
    mockHookState.loading = true;
    renderPage();
    expect(screen.getByTestId("evaluations-loading")).toBeInTheDocument();
  });
});

describe("EvaluationsPage — the side-by-side list", () => {
  beforeEach(() => {
    mockAuth = { user: { id: "u1" }, loading: false, signIn: vi.fn() };
  });

  it("renders one row per evaluation, newest first as given, photo|render side by side", () => {
    mockHookState.evaluations = [EVAL_A, EVAL_B];
    renderPage();
    const rows = screen.getAllByTestId("evaluation-row");
    expect(rows).toHaveLength(2);
    // Row A: both images signed.
    expect(screen.getByTestId("evaluation-photo-a")).toHaveAttribute("src", EVAL_A.photoUrl);
    expect(screen.getByTestId("evaluation-render-a")).toHaveAttribute("src", EVAL_A.renderUrl);
    // Metadata reads as prose: material + archetype + note.
    expect(screen.getByText("Turquoise Opaque")).toBeInTheDocument();
    expect(screen.getByText(/opaque-acrylic/)).toBeInTheDocument();
    expect(screen.getByText(/daylight/)).toBeInTheDocument();
  });

  it("falls back to the placeholder when a PRESENT signed URL fails to load (expired TTL)", () => {
    mockHookState.evaluations = [EVAL_A];
    renderPage();
    // Simulate the 1h-TTL-expired 404: the <img> error event must swap to the
    // same "unavailable" placeholder as a missing URL, not a broken image.
    fireEvent.error(screen.getByTestId("evaluation-photo-a"));
    expect(screen.queryByTestId("evaluation-photo-a")).not.toBeInTheDocument();
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });

  it("keeps a row reviewable when its signed URLs are null (placeholder, no broken img)", () => {
    mockHookState.evaluations = [EVAL_B];
    renderPage();
    expect(screen.getByTestId("evaluation-row")).toBeInTheDocument();
    expect(screen.queryByTestId("evaluation-photo-b")).not.toBeInTheDocument();
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });

  it("surfaces a load error without crashing the list", () => {
    mockHookState.error = new Error("load failed");
    renderPage();
    expect(screen.getByTestId("evaluations-error")).toHaveTextContent(/load failed/);
  });
});
