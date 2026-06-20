// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import OrgRoute from "./OrgRoute";
import { getOrgBySlug } from "../../lib/org/orgService";

vi.mock("../../lib/org/orgService", () => ({
  getOrgBySlug: vi.fn(),
}));

const ITP = {
  id: "org-1",
  slug: "itp-camp",
  name: "ITP Camp",
  logo_url: "https://example.com/itp.png",
  accent_color: "#ff6600",
};

function renderRoute(slug = "itp-camp") {
  return render(
    <MemoryRouter initialEntries={[`/o/${slug}`]}>
      <Routes>
        <Route path="/o/:slug" element={<OrgRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("OrgRoute", () => {
  beforeEach(() => {
    vi.mocked(getOrgBySlug).mockReset();
  });

  it("TRACER: valid slug renders branded shell with org name + accent CSS var", async () => {
    vi.mocked(getOrgBySlug).mockResolvedValue(ITP);
    renderRoute("itp-camp");
    expect(await screen.findByText("ITP Camp")).toBeInTheDocument();
    expect(getOrgBySlug).toHaveBeenCalledWith("itp-camp");
    const shell = screen.getByTestId("org-shell");
    expect(shell.style.getPropertyValue("--org-accent")).toBe("#ff6600");
    // logo is also injected as a CSS custom property (url(...)) for branded UI.
    expect(shell.style.getPropertyValue("--org-logo")).toContain("itp.png");
  });

  it("unknown slug renders a not-found state", async () => {
    vi.mocked(getOrgBySlug).mockResolvedValue(null);
    renderRoute("nope");
    expect(await screen.findByTestId("org-not-found")).toBeInTheDocument();
    expect(screen.queryByText("ITP Camp")).not.toBeInTheDocument();
  });

  it("shows a loading state with no flash of not-found", () => {
    // Never-resolving promise keeps the provider in its loading state.
    vi.mocked(getOrgBySlug).mockReturnValue(new Promise(() => {}));
    renderRoute("itp-camp");
    expect(screen.getByTestId("org-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("org-not-found")).not.toBeInTheDocument();
  });
});
