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
                role="menuitem"
                disabled={item.disabled || !item.onSelect}
                onClick={() => {
                  setOpenId(null);
                  item.onSelect?.();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:bg-paper-warm disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft transition-colors duration-fast ease-out-quart flex items-center justify-between gap-4"
              >
                <span>{item.label}</span>
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
  onSave,
  onSaveToCloud,
  onOpenCloudDesigns,
  onUndo,
  onRedo,
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
        { label: "Export…", onSelect: onExport },
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
        { label: "Overlays", disabled: true },
      ],
    },
    {
      // Object operations are a later slice; placeholder only.
      label: "Object",
      items: [{ label: "No object operations yet", disabled: true }],
    },
    {
      label: "Help",
      items: [{ label: "About Naqsha", disabled: true }],
    },
  ];

  return (
    <div className="flex h-full items-center gap-2 px-3 bg-paper">
      {/* App name, left. */}
      <span className="display text-xs font-semibold text-ink tracking-tight select-none pr-2">
        Naqsha
      </span>

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
