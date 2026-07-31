// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T9) — account isolation on sign-out.
//
// TEMPORARY test for the project-saving architecture review.
//
// By direct inspection, AuthContext.jsx signOut (lines 207-219) clears exactly:
//   - supabase auth session (supabase.auth.signOut(), line 209)
//   - React session/profile state (lines 211-212)
//   - localStorage 'sonoform-profile' (clearCachedProfile, lines 44-50 / 213)
//   - module-global extracted-pattern registry (clearExtractedPatterns, 217)
//   - module-global etch source cache (_clearEtchSourceCache, 218)
// It does NOT touch any document key: sonoform-layers, sonoform-panels,
// sonoform-bg-color, sonoform-custom-glyphs, sonoform-optimizations,
// sonoform-canvas, nor any sonoform-cloud-draft:* recovery draft. The next
// account (or guest) on this browser inherits the previous account's document.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const authSignOut = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("../../supabase", () => ({
  supabase: {
    auth: {
      signOut: (...a) => authSignOut(...a),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));
vi.mock("../../org/claimOnLogin", () => ({ maybeClaimOnLogin: vi.fn() }));
const clearExtractedPatterns = vi.fn();
vi.mock("../../patterns/ExtractedPatternGenerator", () => ({
  clearExtractedPatterns: (...a) => clearExtractedPatterns(...a),
}));
const clearEtchSourceCache = vi.fn();
vi.mock("../../etch/etchSourceStorage", () => ({
  _clearEtchSourceCache: (...a) => clearEtchSourceCache(...a),
}));

import { AuthProvider, useAuth } from "../../AuthContext";

const DOCUMENT_KEYS = {
  "sonoform-layers": '[{"id":"layer-1-aaa","panelId":"panel-1-zzz"}]',
  "sonoform-panels": '[{"id":"panel-1-zzz","order":0}]',
  "sonoform-bg-color": "#123456",
  "sonoform-custom-glyphs": '{"cg-1":{"id":"cg-1"}}',
  "sonoform-optimizations": '{"applied":[]}',
  "sonoform-canvas": '{"w":800,"h":1200}',
  "sonoform-cloud-draft:new": '{"config":{},"name":"unsaved","savedAt":1}',
  "sonoform-cloud-draft:design-1": '{"config":{},"name":"failed","savedAt":2}',
};

describe("T9 — signOut leaves every document key (and recovery drafts) in localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    authSignOut.mockClear();
    clearExtractedPatterns.mockClear();
    clearEtchSourceCache.mockClear();
  });

  it("T9: document keys and sonoform-cloud-draft:* SURVIVE signOut(); only sonoform-profile is removed", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: no account isolation for the
    // locally persisted document — the next sign-in on this browser sees the
    // previous account's layers/panels/drafts.
    for (const [key, value] of Object.entries(DOCUMENT_KEYS)) {
      localStorage.setItem(key, value);
    }
    // The one key signOut DOES clear, as a positive control.
    localStorage.setItem(
      "sonoform-profile",
      JSON.stringify({ profile: { id: "user-1", tier: "pro" }, ts: Date.now() })
    );

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signOut();
    });

    // Sign-out really ran (auth called + both module-cache clears fired).
    expect(authSignOut).toHaveBeenCalledTimes(1);
    expect(clearExtractedPatterns).toHaveBeenCalled();
    expect(clearEtchSourceCache).toHaveBeenCalled();

    // Positive control: the profile cache IS cleared…
    expect(localStorage.getItem("sonoform-profile")).toBe(null);

    // …while EVERY document key and BOTH recovery drafts survive verbatim.
    for (const [key, value] of Object.entries(DOCUMENT_KEYS)) {
      expect(localStorage.getItem(key)).toBe(value);
    }
  });
});
