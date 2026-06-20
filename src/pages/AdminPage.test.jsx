// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPage from "./AdminPage";

vi.mock("../lib/org/platformService", () => ({
  isPlatformAdmin: vi.fn(),
  listOrgs: vi.fn(),
  createOrg: vi.fn(),
  assignOrgAdmin: vi.fn(),
}));

import {
  isPlatformAdmin,
  listOrgs,
  createOrg,
  assignOrgAdmin,
} from "../lib/org/platformService";

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminPage — platform Organizations section", () => {
  // TRACER (behavior 1): a platform admin sees the Organizations section,
  // the org list (from listOrgs) and the create form.
  it("shows the Organizations section with the org list and create form for a platform admin", async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listOrgs.mockResolvedValue([
      { id: "1", name: "Acme", slug: "acme" },
    ]);

    renderPage();

    expect(await screen.findByText(/organizations/i)).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    // Create form fields
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });

  // Behavior 2: submitting the create form calls createOrg with {name,slug,accent,logo}
  // and the new org is shown.
  it("creates an org via createOrg({name,slug,accent,logo}) and shows it", async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listOrgs.mockResolvedValue([]);
    createOrg.mockResolvedValue({ id: "9", name: "Beta", slug: "beta" });

    renderPage();
    await screen.findByText(/organizations/i);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Beta" },
    });
    fireEvent.change(screen.getByLabelText(/slug/i), {
      target: { value: "beta" },
    });
    fireEvent.change(screen.getByLabelText(/accent/i), {
      target: { value: "#ff0000" },
    });
    fireEvent.change(screen.getByLabelText(/logo/i), {
      target: { value: "https://logo.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(createOrg).toHaveBeenCalledWith({
      name: "Beta",
      slug: "beta",
      accent: "#ff0000",
      logo: "https://logo.png",
    });
    expect(await screen.findByText("Beta")).toBeInTheDocument();
  });

  // Behavior 3: a non-platform user sees access-denied (no create form).
  it("shows access-denied for a non-platform user and never exposes the create form", async () => {
    isPlatformAdmin.mockResolvedValue(false);

    renderPage();

    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
    expect(createOrg).not.toHaveBeenCalled();
    expect(listOrgs).not.toHaveBeenCalled();
  });

  // Behavior 4: assign-admin — entering an email + submit calls
  // assignOrgAdmin(orgId, email).
  it("assigns an org admin by email via assignOrgAdmin(orgId, email)", async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listOrgs.mockResolvedValue([{ id: "42", name: "Acme", slug: "acme" }]);
    assignOrgAdmin.mockResolvedValue({ id: "m1" });

    renderPage();
    await screen.findByText("Acme");

    const row = screen.getByText("Acme").closest("li");
    const emailInput = within(row).getByLabelText(/admin email/i);
    fireEvent.change(emailInput, { target: { value: "boss@acme.com" } });
    fireEvent.click(within(row).getByRole("button", { name: /assign/i }));

    expect(assignOrgAdmin).toHaveBeenCalledWith("42", "boss@acme.com");
  });

  // Behavior 6: an assignOrgAdmin failure (RLS denial / duplicate / network)
  // surfaces a visible role="alert" in the row and does NOT clear the email
  // (the control stays usable/retryable, email not falsely shown as assigned).
  it("surfaces an assignOrgAdmin error in a role=alert and keeps the email", async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listOrgs.mockResolvedValue([{ id: "42", name: "Acme", slug: "acme" }]);
    assignOrgAdmin.mockRejectedValue(new Error("permission denied"));

    renderPage();
    await screen.findByText("Acme");

    const row = screen.getByText("Acme").closest("li");
    const emailInput = within(row).getByLabelText(/admin email/i);
    fireEvent.change(emailInput, { target: { value: "boss@acme.com" } });
    fireEvent.click(within(row).getByRole("button", { name: /assign/i }));

    const alert = await within(row).findByRole("alert");
    expect(alert).toHaveTextContent(/permission denied/i);
    // email retained → not falsely shown as assigned, control retryable
    expect(within(row).getByLabelText(/admin email/i)).toHaveValue(
      "boss@acme.com"
    );
  });

  // Behavior 5: a createOrg error (e.g. duplicate slug) surfaces a visible
  // role="alert", not a silent failure.
  it("surfaces a createOrg error in a role=alert", async () => {
    isPlatformAdmin.mockResolvedValue(true);
    listOrgs.mockResolvedValue([]);
    createOrg.mockRejectedValue(new Error("duplicate key value: slug"));

    renderPage();
    await screen.findByText(/organizations/i);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Dup" },
    });
    fireEvent.change(screen.getByLabelText(/slug/i), {
      target: { value: "acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/duplicate/i);
  });
});
