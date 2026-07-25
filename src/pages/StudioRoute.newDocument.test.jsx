// @vitest-environment jsdom
//
// File → New starts a FRESH document (it used to add a pattern to the current
// one). The load-bearing contract: it must NEVER blank the current document
// until the user has either chosen to discard it or a chosen save/export path
// has demonstrably completed. This suite drives the whole flow through the real
// Studio (RightPanel + auth + designService + svgExport stubbed under jsdom),
// asserting the sequencing at the observable seams: localStorage (the autosave
// store resetDocument overwrites) and whether the pattern picker has opened.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/RightPanel", () => ({
  default: ({ layers, patternInstancesRef }) => {
    // Populate the instance map so a real export has something to serialize.
    if (patternInstancesRef && Array.isArray(layers)) {
      const map = {};
      for (const l of layers) map[l.id] = { toSVGGroup: () => "<g/>" };
      patternInstancesRef.current = map;
    }
    return <div data-testid="canvas-surface">canvas</div>;
  },
}));

const { mockUseAuth, signInSpy } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  signInSpy: vi.fn(),
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }) => children,
}));

// svgExport stubbed: the DOM blob/download is a no-op under jsdom AND the file
// write becomes assertable (the Export gate proves the SVG is produced BEFORE
// the document is blanked).
const exportAllLayersSVG = vi.fn();
vi.mock("../lib/svgExport", () => ({
  exportAllLayersSVG: (...a) => exportAllLayersSVG(...a),
  exportLayerSVG: vi.fn(),
  buildManifest: () => "",
}));

// designService.saveDesign is a deferred we resolve/reject by hand, so the
// save-success GATE can be observed edge-by-edge (no blank while pending; blank
// only after success; abort on failure).
const { saveDesignMock } = vi.hoisted(() => ({ saveDesignMock: vi.fn() }));
vi.mock("../lib/designService", () => ({
  saveDesign: (...a) => saveDesignMock(...a),
  loadDesign: vi.fn(),
  saveHistorySnapshot: vi.fn(() => Promise.resolve()),
}));

import StudioRoute from "./StudioRoute";
import { createLayer } from "../lib/useLayers";

const LAYERS_KEY = "sonoform-layers";
const PANELS_KEY = "sonoform-panels";

const GUEST_AUTH = {
  loading: false,
  user: null,
  tier: "guest",
  profile: null,
  signIn: signInSpy,
  signOut: vi.fn(),
};
const SIGNED_IN_AUTH = {
  loading: false,
  user: { id: "user-1" },
  tier: "pro",
  profile: { id: "user-1" },
  signIn: signInSpy,
  signOut: vi.fn(),
};

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

// Pre-seed a stored document so the freshly-mounted Studio reads as DIRTY
// (useDesignPersistence treats restored-from-localStorage work as unsaved).
const SEED_LAYER_ID = "layer-77-seed";
function seedStoredDoc() {
  const layer = { ...createLayer(0, "voronoi"), id: SEED_LAYER_ID };
  localStorage.setItem(LAYERS_KEY, JSON.stringify([layer]));
}

const storedLayerIds = () =>
  (JSON.parse(localStorage.getItem(LAYERS_KEY)) || []).map((l) => l.id);

const fileNew = () => {
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New" }));
};

const pickerOpen = () => screen.queryByText("Choose a pattern") !== null;
const promptOpen = () => screen.queryByRole("alertdialog") !== null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(GUEST_AUTH);
});
afterEach(() => vi.useRealTimers());

describe("StudioRoute — File → New, clean document (slice 2)", () => {
  it("not dirty: no prompt — blanks to one empty panel and opens the pattern picker", () => {
    // Fresh mount, cleared storage → the pristine seed is the clean baseline.
    renderStudio();
    expect(pickerOpen()).toBe(false);

    fileNew();

    // No prompt (nothing to lose), picker opened.
    expect(promptOpen()).toBe(false);
    expect(pickerOpen()).toBe(true);

    // Reset to a genuine blank: zero layers on exactly one empty panel.
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(PANELS_KEY))).toHaveLength(1);
  });
});

describe("StudioRoute — File → New, dirty document (slice 3)", () => {
  it("dirty: opens the four-action prompt and does NOT blank yet", () => {
    seedStoredDoc();
    renderStudio();

    fileNew();

    expect(promptOpen()).toBe(true);
    for (const label of ["Save to cloud", "Export SVG", "Discard", "Cancel"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Nothing discarded yet: the picker is closed and the doc is intact.
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);
  });

  it("Cancel: keeps the document and never blanks", () => {
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(promptOpen()).toBe(false);
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);
  });

  it("Discard: blanks immediately and opens the picker", () => {
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(promptOpen()).toBe(false);
    expect(pickerOpen()).toBe(true);
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(PANELS_KEY))).toHaveLength(1);
  });

  it("Export SVG: writes the file, THEN blanks and opens the picker", () => {
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));

    // The SVG was produced before the document was blanked (synchronous gate).
    expect(exportAllLayersSVG).toHaveBeenCalledTimes(1);
    expect(pickerOpen()).toBe(true);
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY))).toHaveLength(0);
  });

  it("guest Save to cloud: routes to sign-in and preserves the document (no blank)", () => {
    mockUseAuth.mockReturnValue(GUEST_AUTH);
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Save to cloud" }));

    expect(signInSpy).toHaveBeenCalledTimes(1);
    expect(saveDesignMock).not.toHaveBeenCalled();
    // Not blanked — the OAuth redirect must not cost the user their work.
    expect(promptOpen()).toBe(false);
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);
  });
});

describe("StudioRoute — File → New, signed-in Save gate (slice 3, load-bearing)", () => {
  beforeEach(() => mockUseAuth.mockReturnValue(SIGNED_IN_AUTH));

  it("does NOT blank while the save is in flight; blanks only after it succeeds", async () => {
    // A deferred save: nothing resolves until we say so.
    let resolveSave;
    saveDesignMock.mockReturnValue(
      new Promise((res) => {
        resolveSave = res;
      })
    );
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Save to cloud" }));

    // Save started, but the document is UNTOUCHED while it is pending.
    expect(saveDesignMock).toHaveBeenCalledTimes(1);
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);

    // Success signalled → NOW the document blanks and the picker opens.
    await act(async () => {
      resolveSave({ id: "design-1" });
    });

    await waitFor(() => expect(pickerOpen()).toBe(true));
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY))).toHaveLength(0);
  });

  it("aborts the New (keeps the document) when the save fails", async () => {
    // The save hook retries transient failures with backoff before surfacing the
    // error; fake timers let us flush those deterministically. The invariant
    // under test holds throughout: the document is NEVER blanked on a failed save.
    vi.useFakeTimers();
    saveDesignMock.mockRejectedValue(new Error("network"));
    seedStoredDoc();
    renderStudio();
    fileNew();

    fireEvent.click(screen.getByRole("button", { name: "Save to cloud" }));

    // While the save (and its retries) are in flight, nothing is discarded.
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);

    // Drive through every retry + the eventual failure.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Failure → the New is aborted, the document survives, the picker never opened.
    expect(pickerOpen()).toBe(false);
    expect(storedLayerIds()).toContain(SEED_LAYER_ID);
  });
});
