import { describe, it, expect } from "vitest";
import { isFrameStatsEnabled } from "./frameStatsFlag";

describe("isFrameStatsEnabled", () => {
  it("is off for no query string", () => {
    expect(isFrameStatsEnabled("")).toBe(false);
  });

  it("is off for an unrelated query string", () => {
    expect(isFrameStatsEnabled("?foo=1&bar=baz")).toBe(false);
  });

  it("is off for fps=0 or any non-'1' value", () => {
    expect(isFrameStatsEnabled("?fps=0")).toBe(false);
    expect(isFrameStatsEnabled("?fps=true")).toBe(false);
  });

  it("is on for exactly ?fps=1", () => {
    expect(isFrameStatsEnabled("?fps=1")).toBe(true);
  });

  it("is on for ?fps=1 alongside other params", () => {
    expect(isFrameStatsEnabled("?foo=bar&fps=1")).toBe(true);
  });

  it("never throws on malformed input", () => {
    expect(() => isFrameStatsEnabled("%%%not-a-query%%%")).not.toThrow();
  });
});
