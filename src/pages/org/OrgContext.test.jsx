// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrgProvider, useOrg } from "./OrgContext";
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

// A descendant that consumes the context and renders what it sees.
function Consumer() {
  const { org, loading, notFound } = useOrg();
  if (loading) return <div>state:loading</div>;
  if (notFound) return <div>state:notFound</div>;
  return <div>org:{org.name}</div>;
}

describe("OrgContext / useOrg", () => {
  beforeEach(() => {
    vi.mocked(getOrgBySlug).mockReset();
  });

  it("provides the loaded org to descendants via useOrg()", async () => {
    vi.mocked(getOrgBySlug).mockResolvedValue(ITP);
    render(
      <OrgProvider slug="itp-camp">
        <Consumer />
      </OrgProvider>
    );
    expect(await screen.findByText("org:ITP Camp")).toBeInTheDocument();
  });

  it("starts in loading then resolves notFound for an unknown slug", async () => {
    vi.mocked(getOrgBySlug).mockResolvedValue(null);
    render(
      <OrgProvider slug="nope">
        <Consumer />
      </OrgProvider>
    );
    // No flash of not-found: loading shows first.
    expect(screen.getByText("state:loading")).toBeInTheDocument();
    expect(await screen.findByText("state:notFound")).toBeInTheDocument();
  });

  it("useOrg() throws when used outside an OrgProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/within OrgProvider/);
    spy.mockRestore();
  });
});
