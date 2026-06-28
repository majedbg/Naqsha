import { describe, it, expect } from "vitest";
import { isTextEntryTarget } from "./typingGuard";

// The global ⌘Z must yield to NATIVE text undo only where one exists: real
// text-entry surfaces. Browser verification found focused range sliders (an
// <input> with no native undo) were wrongly swallowing ⌘Z, so this pins exactly
// which targets are guarded.

const el = (tagName, props = {}) => ({ tagName, ...props });

describe("history/typingGuard — isTextEntryTarget", () => {
  it("guards genuine text-entry surfaces", () => {
    expect(isTextEntryTarget(el("INPUT", { type: "text" }))).toBe(true);
    expect(isTextEntryTarget(el("INPUT", { type: "number" }))).toBe(true);
    expect(isTextEntryTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTextEntryTarget(el("INPUT", {}))).toBe(true); // missing type → text
    expect(isTextEntryTarget(el("TEXTAREA"))).toBe(true);
    expect(isTextEntryTarget(el("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("does NOT guard non-text controls (⌘Z falls through to document undo)", () => {
    expect(isTextEntryTarget(el("INPUT", { type: "range" }))).toBe(false); // the bug
    expect(isTextEntryTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTextEntryTarget(el("INPUT", { type: "radio" }))).toBe(false);
    expect(isTextEntryTarget(el("INPUT", { type: "color" }))).toBe(false);
    expect(isTextEntryTarget(el("SELECT"))).toBe(false);
    expect(isTextEntryTarget(el("DIV"))).toBe(false);
    expect(isTextEntryTarget(el("BUTTON"))).toBe(false);
  });

  it("is case-insensitive on the input type and null-safe", () => {
    expect(isTextEntryTarget(el("INPUT", { type: "RANGE" }))).toBe(false);
    expect(isTextEntryTarget(el("INPUT", { type: "Text" }))).toBe(true);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(undefined)).toBe(false);
  });
});
