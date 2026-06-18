import { describe, it, expect } from "vitest";
import {
  TOOLS,
  TOOL_IDS,
  getTool,
  resolveToolByKey,
  DEFAULT_TOOL_ID,
} from "./toolRegistry";

// Issue #9 (Lane B / B6): the tool registry is the single source of truth for
// the left tool strip. It exposes exactly the four navigation/existing tools
// (no freehand drawing) and a key map resolving V / T / space.

describe("toolRegistry (B6 — tool definitions + key map)", () => {
  it("exposes exactly select / text / hand / zoom", () => {
    expect(TOOL_IDS).toEqual(["select", "text", "hand", "zoom"]);
  });

  it("does NOT expose any freehand drawing tool", () => {
    for (const banned of ["pen", "pencil", "freehand", "brush", "draw"]) {
      expect(TOOL_IDS).not.toContain(banned);
    }
  });

  it("each tool carries an id, label, and a hotkey hint", () => {
    for (const id of TOOL_IDS) {
      const tool = getTool(id);
      expect(tool).toBeTruthy();
      expect(tool.id).toBe(id);
      expect(typeof tool.label).toBe("string");
      expect(tool.label.length).toBeGreaterThan(0);
    }
  });

  it("TOOLS is keyed by id and matches TOOL_IDS", () => {
    expect(Object.keys(TOOLS).sort()).toEqual([...TOOL_IDS].sort());
  });

  it("defaults to the select tool", () => {
    expect(DEFAULT_TOOL_ID).toBe("select");
  });

  it("key map resolves V -> select, T -> text, space -> hand", () => {
    expect(resolveToolByKey("v")).toBe("select");
    expect(resolveToolByKey("V")).toBe("select");
    expect(resolveToolByKey("t")).toBe("text");
    expect(resolveToolByKey("T")).toBe("text");
    expect(resolveToolByKey(" ")).toBe("hand");
    expect(resolveToolByKey("Spacebar")).toBe("hand");
  });

  it("returns null for unmapped keys", () => {
    expect(resolveToolByKey("q")).toBeNull();
    expect(resolveToolByKey("Enter")).toBeNull();
  });

  it("zoom tool exists even though no single-letter key activates it", () => {
    expect(getTool("zoom")).toBeTruthy();
    // Zoom is reachable via the strip button (and wheel); not via V/T/space.
    expect(resolveToolByKey("z")).toBeNull();
  });
});
