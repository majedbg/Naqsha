// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MenuBar from "./MenuBar";

// Issue #8 (Lane B / B5): the pro shell's top menu bar. It is presentational —
// menus are wired to handlers passed as props (the SAME handlers Studio already
// owns), and the account cluster (Share / Theme / Auth) is composed from the
// existing components so "wire to existing behavior" holds by construction.
//
// ThemeToggle reads useTheme and AuthButton reads useAuth; mock both so the
// account cluster renders under jsdom without a real provider tree.
vi.mock("../../lib/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    tier: "guest",
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

function makeHandlers(overrides = {}) {
  return {
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onExamples: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onSave: vi.fn(),
    onSaveToCloud: vi.fn(),
    onOpenCloudDesigns: vi.fn(),
    onUndo: undefined,
    onRedo: undefined,
    buildShareState: () => ({ layers: [] }),
    ...overrides,
  };
}

// Open a top-level menu by its trigger label, returning a scope to query within.
function openMenu(name) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("MenuBar (B5 — top menu bar structure)", () => {
  it("renders the five top-level menus + account cluster", () => {
    render(<MenuBar {...makeHandlers()} />);
    // The five menus per spec.
    for (const menu of ["File", "Edit", "View", "Object", "Help"]) {
      expect(screen.getByRole("button", { name: menu })).toBeInTheDocument();
    }
    // Account cluster pinned right: Share (ShareLinkButton), Theme, Auth.
    expect(
      screen.getByRole("button", { name: /share link|copy share/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch to (light|dark)/i })
    ).toBeInTheDocument();
  });

  it("File menu exposes New, Open, Examples, Import, Export, Save", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("File");
    const menu = screen.getByRole("menu", { name: "File" });
    // Anchored names so "Save…" doesn't also match "Save to cloud".
    const items = [/^new$/i, /^open/i, /^examples$/i, /^import/i, /^export/i, /^save…$/i];
    for (const item of items) {
      expect(
        within(menu).getByRole("menuitem", { name: item })
      ).toBeInTheDocument();
    }
  });

  it("Edit menu exposes Undo and Redo", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("Edit");
    const menu = screen.getByRole("menu", { name: "Edit" });
    expect(
      within(menu).getByRole("menuitem", { name: /undo/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /redo/i })
    ).toBeInTheDocument();
  });

  it("Examples item invokes the existing examples handler", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} />);
    openMenu("File");
    fireEvent.click(screen.getByRole("menuitem", { name: /examples/i }));
    expect(h.onExamples).toHaveBeenCalledTimes(1);
  });

  it("Open item invokes the existing load handler", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} />);
    openMenu("File");
    fireEvent.click(screen.getByRole("menuitem", { name: /^open/i }));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it("Export item invokes the existing export handler", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} />);
    openMenu("File");
    fireEvent.click(screen.getByRole("menuitem", { name: /export/i }));
    expect(h.onExport).toHaveBeenCalledTimes(1);
  });

  it("Submit to org item invokes onSubmitToOrg when provided", () => {
    const h = makeHandlers({ onSubmitToOrg: vi.fn() });
    render(<MenuBar {...h} />);
    openMenu("File");
    fireEvent.click(screen.getByRole("menuitem", { name: /submit to org/i }));
    expect(h.onSubmitToOrg).toHaveBeenCalledTimes(1);
  });

  it("Submit to org item is disabled when no handler is supplied (signed-out)", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("File");
    expect(
      screen.getByRole("menuitem", { name: /submit to org/i })
    ).toBeDisabled();
  });

  it("Cloud designs item invokes the existing cloud handler", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} />);
    openMenu("File");
    fireEvent.click(
      screen.getByRole("menuitem", { name: /cloud design/i })
    );
    expect(h.onOpenCloudDesigns).toHaveBeenCalledTimes(1);
  });

  it("Undo/Redo render disabled when no history handler is provided (placeholder)", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("Edit");
    expect(screen.getByRole("menuitem", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /redo/i })).toBeDisabled();
  });

  it("Undo/Redo dispatch their handlers when provided (mirror future shortcuts)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<MenuBar {...makeHandlers({ onUndo, onRedo })} />);
    // Choosing an item closes the menu, so re-open between the two clicks.
    openMenu("Edit");
    fireEvent.click(screen.getByRole("menuitem", { name: /undo/i }));
    openMenu("Edit");
    fireEvent.click(screen.getByRole("menuitem", { name: /redo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  // S1 (issue #50): the Pattern Library opener lives beside the extraction
  // entry point in the Object menu, gated the same way (handler only when the
  // feature flag + tier gate allow).
  it("Object menu exposes Pattern Library…, invoking its handler when supplied", () => {
    const onOpenLibrary = vi.fn();
    render(<MenuBar {...makeHandlers({ onOpenLibrary })} />);
    openMenu("Object");
    fireEvent.click(
      screen.getByRole("menuitem", { name: /pattern library/i })
    );
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
  });

  it("Pattern Library… renders present-but-disabled without a handler (flag/tier off)", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("Object");
    expect(
      screen.getByRole("menuitem", { name: /pattern library/i })
    ).toBeDisabled();
  });
});

// UX reframe: bed-size selection moves OUT of Document Setup and INTO the
// View menu as a checkable "Bed size" nested submenu (presets + a "None"
// entry that hides the bed overlay). Mirrors the Overlays conditional-enable
// pattern (#15): disabled placeholder until Studio supplies presets + a
// select handler.
describe("MenuBar — View > Bed size submenu (UX reframe)", () => {
  const presets = [
    { id: "a4", label: "A4 (210 × 297 mm)" },
    { id: "letter", label: "Letter (8.5 × 11 in)" },
  ];

  const openBedSizeSubmenu = () => {
    openMenu("View");
    fireEvent.click(screen.getByRole("button", { name: /bed size/i }));
  };

  it("renders Bed size disabled with no submenu when no presets/handler are provided (placeholder)", () => {
    render(<MenuBar {...makeHandlers()} />);
    openMenu("View");
    const menu = screen.getByRole("menu", { name: "View" });
    const bedSize = within(menu).getByRole("menuitem", { name: /bed size/i });
    expect(bedSize).toBeDisabled();
    expect(bedSize).not.toHaveAttribute("aria-haspopup");
  });

  it("expands to show preset labels + None when clicked", () => {
    render(
      <MenuBar
        {...makeHandlers({
          bedPresets: presets,
          activeBedPresetId: "a4",
          bedVisible: true,
          onSelectBedPreset: vi.fn(),
          onHideBed: vi.fn(),
        })}
      />
    );
    openBedSizeSubmenu();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /a4/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /letter/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^none$/i })
    ).toBeInTheDocument();
  });

  it("checks the active preset when bedVisible, and None when it isn't", () => {
    const { rerender } = render(
      <MenuBar
        {...makeHandlers({
          bedPresets: presets,
          activeBedPresetId: "a4",
          bedVisible: true,
          onSelectBedPreset: vi.fn(),
          onHideBed: vi.fn(),
        })}
      />
    );
    openBedSizeSubmenu();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /a4/i })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /letter/i })
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^none$/i })
    ).toHaveAttribute("aria-checked", "false");

    rerender(
      <MenuBar
        {...makeHandlers({
          bedPresets: presets,
          activeBedPresetId: "a4",
          bedVisible: false,
          onSelectBedPreset: vi.fn(),
          onHideBed: vi.fn(),
        })}
      />
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: /a4/i })
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^none$/i })
    ).toHaveAttribute("aria-checked", "true");
  });

  it("clicking a preset invokes onSelectBedPreset with its id", () => {
    const onSelectBedPreset = vi.fn();
    render(
      <MenuBar
        {...makeHandlers({
          bedPresets: presets,
          activeBedPresetId: "a4",
          bedVisible: true,
          onSelectBedPreset,
          onHideBed: vi.fn(),
        })}
      />
    );
    openBedSizeSubmenu();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /letter/i }));
    expect(onSelectBedPreset).toHaveBeenCalledTimes(1);
    expect(onSelectBedPreset).toHaveBeenCalledWith("letter");
  });

  it("clicking None invokes onHideBed", () => {
    const onHideBed = vi.fn();
    render(
      <MenuBar
        {...makeHandlers({
          bedPresets: presets,
          activeBedPresetId: "a4",
          bedVisible: true,
          onSelectBedPreset: vi.fn(),
          onHideBed,
        })}
      />
    );
    openBedSizeSubmenu();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^none$/i }));
    expect(onHideBed).toHaveBeenCalledTimes(1);
  });
});
