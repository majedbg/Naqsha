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
import { useInspectorDockContext } from "./inspectorDockContext";

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
  onGenerateAI,
  buildShareState,
  // Admin entry point (relocated from the now-removed studio TopNav). `showAdmin`
  // is gated upstream (useShowAdmin); `onOpenAdmin` navigates to /admin. Both come
  // from the owner (Studio) so MenuBar stays presentational and router-free.
  showAdmin = false,
  onOpenAdmin,
}) {
  // A single "which menu is open" id keeps only one dropdown open at a time and
  // lets clicking another top-level menu switch directly.
  const [openId, setOpenId] = useState(null);

  // Dock state (WI-6) read via context. Studio portals MenuBar inside AppShell's
  // InspectorDockProvider, so this is non-null on the pro desktop path and null
  // in the legacy/standalone MenuBar (no provider) — the View menu then renders
  // byte-unchanged.
  const dock = useInspectorDockContext();

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
        // Dock Properties to Bottom (WI-6) — checkable, in sync with the live
        // dockPosition. Only present when a dock provider is mounted (pro shell);
        // omitted entirely in the legacy MenuBar so that path is unchanged.
        ...(dock
          ? [
              { separator: true },
              {
                label: "Dock Properties to Bottom",
                checkable: true,
                checked: dock.dockPosition === "bottom",
                onSelect: dock.toggleDock,
              },
            ]
          : []),
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
      {/* App name, inline with the menus so the standalone TopNav bar can be
          dropped on the studio route (reclaims a full row of vertical space).
          Hover / focus reveals the name's meaning (the brand story). The tooltip
          drops DOWN — the label sits at the very top edge, so an upward tooltip
          would clip off-screen. */}
      <span
        className="group/brand relative mr-1"
        tabIndex={0}
        aria-label="About the name Naqsha"
      >
        <span className="display text-sm font-semibold text-ink tracking-tight select-none cursor-default">
          Naqsha
        </span>
        <span
          role="tooltip"
          className="absolute top-full left-0 mt-1.5 hidden group-hover/brand:block group-focus-within/brand:block z-50 w-[340px] px-3 py-2 text-xs leading-relaxed text-ink-soft bg-paper border border-hairline rounded-sm shadow-sm"
        >
          <span className="font-semibold text-ink">Naqsha</span> is an Arabic,
          Persian, and Urdu word from the root <span lang="ar" dir="rtl">نقش</span>{" "}
          (<span className="italic">naqsh</span>, “to engrave or decorate”) — it
          names both the <span className="text-ink">pattern</span> (its Arabic
          sense) and the <span className="text-ink">map or blueprint</span> to
          make it (its Persian and Urdu sense). That’s exactly what this tool is:
          a place where a painted, generative design becomes a precise plan a
          plotter or laser can cut.
        </span>
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
        {showAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-2 py-0.5 text-xs rounded-xs text-ink-soft hover:text-ink hover:bg-paper-warm transition-colors duration-fast ease-out-quart"
          >
            Admin
          </button>
        )}
        {buildShareState && <ShareLinkButton buildState={buildShareState} />}
        <ThemeToggle />
        <AuthButton />
      </div>
    </div>
  );
}
