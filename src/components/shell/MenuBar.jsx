// MenuBar — the pro shell's top menu bar (Lane B / B5, GitHub issue #8).
//
// Folds the legacy loose top-bar actions (Examples, Load existing, Cloud
// designs, Export, Share) into a single navigation paradigm: app name on the
// left; File / Edit / View / Object / Help menus; account cluster (Share,
// Theme, Auth) pinned right. It is purely presentational — every menu item is
// wired to a handler PASSED IN by Studio (the same handlers Studio already
// owns), so "wire to existing behavior" holds by construction and no behavior is
// reimplemented here.
//
// Items whose behavior lands in later slices (#7 rulers/overlays, #15 zoom,
// Object operations, New/Import, Undo/Redo history) render as present-but-
// disabled placeholders. Undo/Redo become live the moment an onUndo/onRedo
// handler is supplied (none exists yet — there is no history system).

import { useEffect, useRef, useState } from "react";
import ShareLinkButton from "../ShareLinkButton";
import ThemeToggle from "../ui/ThemeToggle";
import AuthButton from "../AuthButton";

// One top-level menu (File, Edit, …) as a click-to-open dropdown. Closes on
// outside click and on Escape, and after any item is chosen.
function Menu({ label, items, openId, setOpenId }) {
  const ref = useRef(null);
  const isOpen = openId === label;

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenId(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, setOpenId]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenId(isOpen ? null : label)}
        className={`px-2 py-0.5 text-xs rounded-xs transition-colors duration-fast ease-out-quart ${
          isOpen
            ? "text-ink bg-muted"
            : "text-ink-soft hover:text-ink hover:bg-paper-warm"
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-paper border border-hairline rounded-sm py-1 shadow-sm"
        >
          {items.map((item, i) =>
            item.separator ? (
              <div
                key={`sep-${i}`}
                role="separator"
                className="my-1 border-t border-hairline"
              />
            ) : (
              <button
                key={item.label}
                type="button"
                role={item.checkable ? "menuitemcheckbox" : "menuitem"}
                aria-checked={item.checkable ? !!item.checked : undefined}
                disabled={item.disabled || !item.onSelect}
                onClick={() => {
                  setOpenId(null);
                  item.onSelect?.();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:bg-paper-warm disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft transition-colors duration-fast ease-out-quart flex items-center justify-between gap-4"
              >
                <span className="flex items-center gap-2">
                  {item.checkable && (
                    <span className="w-3 text-accent" aria-hidden="true">
                      {item.checked ? "✓" : ""}
                    </span>
                  )}
                  <span>{item.label}</span>
                </span>
                {item.shortcut && (
                  <span className="text-[10px] text-ink-soft/50 num">
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function MenuBar({
  onNew,
  onOpen,
  onExamples,
  onImport,
  onExport,
  onSubmitToOrg,
  onSave,
  onSaveToCloud,
  onOpenCloudDesigns,
  onDocumentSetup,
  onUndo,
  onRedo,
  onToggleOverlays,
  overlaysOn = false,
  // ITP Camp kit mode (#18) as a View toggle. `kitModeAvailable` gates it (the
  // kit is Laser-only; the OperationsPanel control is gated the same way), so it
  // renders disabled on non-laser profiles. `onToggleKitMode` enters/exits;
  // `kitModeOn` reflects the live kit state so the checkmark stays in sync with
  // the OperationsPanel control (both drive the same kitMode).
  onToggleKitMode,
  kitModeOn = false,
  kitModeAvailable = false,
  kitModeName = "ITP Camp",
  onGenerateAI,
  buildShareState,
}) {
  // A single "which menu is open" id keeps only one dropdown open at a time and
  // lets clicking another top-level menu switch directly.
  const [openId, setOpenId] = useState(null);

  const menus = [
    {
      label: "File",
      items: [
        { label: "New", onSelect: onNew, disabled: !onNew },
        { label: "Open…", onSelect: onOpen },
        { label: "Examples", onSelect: onExamples },
        { label: "Import…", onSelect: onImport, disabled: !onImport },
        { separator: true },
        // Document Setup… (C6 / #14) — machine profile + bed (= artboard).
        {
          label: "Document Setup…",
          onSelect: onDocumentSetup,
          disabled: !onDocumentSetup,
        },
        { separator: true },
        { label: "Export…", onSelect: onExport },
        // Submit to org… (org/admin MVP) — in-app path to a workshop's cut queue.
        // Disabled (no handler) until the user is signed in.
        {
          label: "Submit to org…",
          onSelect: onSubmitToOrg,
          disabled: !onSubmitToOrg,
        },
        { label: "Save…", onSelect: onSave },
        { label: "Save to cloud", onSelect: onSaveToCloud },
        { label: "Cloud designs…", onSelect: onOpenCloudDesigns },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", onSelect: onUndo, disabled: !onUndo, shortcut: "⌘Z" },
        {
          label: "Redo",
          onSelect: onRedo,
          disabled: !onRedo,
          shortcut: "⇧⌘Z",
        },
      ],
    },
    {
      // View toggles (rulers / overlays land in #7/#15; zoom in #15). Present but
      // disabled placeholders until those slices wire them.
      label: "View",
      items: [
        { label: "Rulers", disabled: true },
        { label: "Zoom in", disabled: true },
        { label: "Zoom out", disabled: true },
        // Overlays (C7 / #15) — plot preview + overlap highlights over the canvas.
        // Live the moment Studio supplies a toggle handler; renders as a checkbox
        // item reflecting the current on/off state.
        {
          label: "Overlays",
          checkable: true,
          checked: overlaysOn,
          onSelect: onToggleOverlays,
          disabled: !onToggleOverlays,
        },
        { separator: true },
        // ITP Camp mode (#18) — a second entry point to the kit lifecycle (the
        // OperationsPanel control is the other). Laser-gated: disabled unless
        // `kitModeAvailable`, since the kit auto-exits off a laser profile.
        {
          label: `${kitModeName} mode`,
          checkable: true,
          checked: kitModeOn,
          onSelect: onToggleKitMode,
          disabled: !onToggleKitMode || !kitModeAvailable,
        },
      ],
    },
    {
      label: "Object",
      items: [
        // AI-pattern generator (re-homed for #16 AC2). Opens AIPatternChat in
        // create mode (the legacy per-layer "AI" action is gone with LeftPanel);
        // the per-layer revise path still exists via the chat's mode toggle.
        {
          label: "Generate with AI…",
          onSelect: onGenerateAI,
          disabled: !onGenerateAI,
        },
      ],
    },
    {
      label: "Help",
      items: [{ label: "About Naqsha", disabled: true }],
    },
  ];

  return (
    <div className="flex h-full items-center gap-2 px-3 bg-paper">
      {/* Top-level menus. */}
      <nav className="flex items-center gap-0.5" aria-label="Main menu">
        {menus.map((m) => (
          <Menu
            key={m.label}
            label={m.label}
            items={m.items}
            openId={openId}
            setOpenId={setOpenId}
          />
        ))}
      </nav>

      {/* Account cluster pinned right — reuse the existing components so each is
          wired to its real behavior with zero reimplementation. */}
      <div className="ml-auto flex items-center gap-xs">
        {buildShareState && <ShareLinkButton buildState={buildShareState} />}
        <ThemeToggle />
        <AuthButton />
      </div>
    </div>
  );
}
