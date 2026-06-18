// @vitest-environment jsdom
// WI-2 — ConfirmDialog `danger` variant (spec §6, §10.3).
//
// The dialog is a controlled, on-brand confirm. By default its single
// load-bearing action is saffron. An OPT-IN `danger` boolean recolours that
// action to the project's semantic destructive token (`tone-strong`, already
// used for Delete/error states) without changing any of the controlled
// behaviour: Esc cancels, Enter confirms, focus lands on the confirm button.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

// The confirm button is the one carrying the confirm label.
const getConfirm = (label = "Continue") =>
  screen.getByRole("button", { name: label });

describe("ConfirmDialog danger variant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("default (no danger prop) — backward compatible", () => {
    it("keeps the saffron action when `danger` is omitted", () => {
      render(
        <ConfirmDialog
          open
          title="Replace artwork?"
          message="The current sketch is swapped out."
        />
      );
      const confirm = getConfirm();
      expect(confirm).toHaveClass("bg-saffron");
      expect(confirm).toHaveClass("hover:bg-saffron-hover");
    });

    it("keeps the saffron action when `danger={false}`", () => {
      render(<ConfirmDialog open danger={false} title="Proceed?" />);
      const confirm = getConfirm();
      expect(confirm).toHaveClass("bg-saffron");
      expect(confirm).not.toHaveClass("bg-tone-strong");
    });
  });

  describe("danger", () => {
    it("recolours the confirm action with the destructive token", () => {
      render(<ConfirmDialog open danger title="Delete layer?" />);
      const confirm = getConfirm();
      expect(confirm).toHaveClass("bg-tone-strong");
    });

    it("drops BOTH saffron classes in danger mode", () => {
      render(<ConfirmDialog open danger title="Delete layer?" />);
      const confirm = getConfirm();
      expect(confirm).not.toHaveClass("bg-saffron");
      expect(confirm).not.toHaveClass("hover:bg-saffron-hover");
      // And no leftover saffron token anywhere in the class string.
      expect(confirm.className).not.toContain("saffron");
    });

    it("still focuses the confirm button on open (parity with default)", () => {
      render(<ConfirmDialog open danger title="Delete layer?" />);
      expect(getConfirm()).toHaveFocus();
    });

    it("still fires onCancel on Escape", () => {
      const onCancel = vi.fn();
      render(
        <ConfirmDialog open danger title="Delete layer?" onCancel={onCancel} />
      );
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("still fires onConfirm on Enter", () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog open danger title="Delete layer?" onConfirm={onConfirm} />
      );
      fireEvent.keyDown(window, { key: "Enter" });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("honours a custom confirmLabel while in danger mode", () => {
      render(
        <ConfirmDialog open danger title="Delete?" confirmLabel="Delete" />
      );
      const confirm = getConfirm("Delete");
      expect(confirm).toHaveClass("bg-tone-strong");
      expect(confirm.className).not.toContain("saffron");
    });
  });
});
