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
import SaveStatusIndicator from "./SaveStatusIndicator";
import { useInspectorDockContext } from "./inspectorDockContext";

// One top-level menu (File, Edit, …) as a click-to-open dropdown. Closes on
// outside click and on Escape, and after any item is chosen.
function Menu({ label, items, openId, setOpenId }) {
  const ref = useRef(null);
  const isOpen = openId === label;

  // Which nested submenu (by item.label) is expanded, if any. Click-to-expand
  // (not hover-flyout) so it's jsdom-testable; collapses again once this
  // top-level menu closes so it doesn't reopen stale on the next click.
  const [expandedSubmenu, setExpandedSubmenu] = useState(null);

  useEffect(() => {
    if (!isOpen) setExpandedSubmenu(null);
  }, [isOpen]);

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
            ) : item.submenu ? (
              // Nested submenu (e.g. View > Bed size): click-to-expand inline,
              // NOT a hover flyout, so children render right in this same
              // dropdown and stay reachable/testable without pointer hover.
              <div key={item.label}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={expandedSubmenu === item.label}
                  disabled={item.disabled}
                  onClick={() =>
                    setExpandedSubmenu(
                      expandedSubmenu === item.label ? null : item.label
                    )
                  }
                  className="w-full text-left px-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:bg-paper-warm disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft transition-colors duration-fast ease-out-quart flex items-center justify-between gap-4"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-ink-soft/50" aria-hidden="true">
                    {expandedSubmenu === item.label ? "▾" : "▸"}
                  </span>
                </button>
                {expandedSubmenu === item.label &&
                  item.submenu.map((child) => (
                    <button
                      key={child.label}
                      type="button"
                      role={child.checkable ? "menuitemcheckbox" : "menuitem"}
                      aria-checked={child.checkable ? !!child.checked : undefined}
                      disabled={child.disabled || !child.onSelect}
                      onClick={() => {
                        setOpenId(null);
                        child.onSelect?.();
                      }}
                      className="w-full text-left pl-7 pr-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:bg-paper-warm disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-soft transition-colors duration-fast ease-out-quart flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-2">
                        {child.checkable && (
                          <span className="w-3 text-accent" aria-hidden="true">
                            {child.checked ? "✓" : ""}
                          </span>
                        )}
                        <span>{child.label}</span>
                      </span>
                    </button>
                  ))}
              </div>
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
  // Guest gating (Rec 3 / A) — OPTIONAL. When true, the cloud-save item relabels
  // to "Sign in to save to cloud" (Studio points onSaveToCloud at signIn for
  // guests). Omitted on the legacy/standalone path → label stays "Save to cloud".
  isGuest = false,
  onOpenCloudDesigns,
  onDocumentSetup,
  onUndo,
  onRedo,
  // Run Plan entry (PRD #73) — File▸Run plan… opens the pre-flight destination.
  // Present-but-disabled until the owner wires it.
  onRunPlan,
  // Preferences modal opener (ADR 0001) — Edit▸Preferences….
  onOpenPreferences,
  onGenerateAI,
  // Photo → Pattern stepper opener (issue #49) — OPTIONAL; gated upstream.
  onExtractPattern,
  // Pattern Library opener (S1, issue #50) — OPTIONAL; gated upstream the same
  // way as extraction (feature flag + tier gate).
  onOpenLibrary,
  buildShareState,
  // Admin entry point (relocated from the now-removed studio TopNav). `showAdmin`
  // is gated upstream (useShowAdmin); `onOpenAdmin` navigates to /admin. Both come
  // from the owner (Studio) so MenuBar stays presentational and router-free.
  showAdmin = false,
  onOpenAdmin,
  // Save-status surface (Rec 1) — all OPTIONAL. Supplied only on the pro shell
  // path where Studio wires useCloudPersistence; the legacy/standalone MenuBar
  // (no provider) passes none, so this block renders nothing and that path stays
  // byte-unchanged. MenuBar stays presentational and just forwards these to
  // <SaveStatusIndicator>.
  status,
  lastSavedAt,
  onRetry,
  designName,
  onRenameDesign,
  // Bed size (moved out of Document Setup into View, per the UX reframe) — all
  // OPTIONAL. Supplied only on the pro shell path where Studio owns the bed
  // presets + overlay visibility. The legacy/standalone MenuBar (no bed props)
  // renders the "Bed size" item disabled with no submenu, so that path stays
  // non-crashing and effectively unchanged.
  bedPresets,
  activeBedPresetId,
  bedVisible = false,
  onSelectBedPreset,
  onHideBed,
}) {
  // A single "which menu is open" id keeps only one dropdown open at a time and
  // lets clicking another top-level menu switch directly.
  const [openId, setOpenId] = useState(null);

  // Dock state (WI-6) read via context. Studio portals MenuBar inside AppShell's
  // InspectorDockProvider, so this is non-null on the pro desktop path and null
  // in the legacy/standalone MenuBar (no provider) — the View menu then renders
  // byte-unchanged.
  const dock = useInspectorDockContext();

  // Bed size submenu (View menu) — live only when Studio supplies presets AND
  // a select handler; otherwise a disabled placeholder with no submenu at all,
  // matching the Undo/Redo/Overlays conditional-enable pattern.
  const bedSizeItem =
    bedPresets && bedPresets.length > 0 && onSelectBedPreset
      ? {
          label: "Bed size",
          submenu: [
            ...bedPresets.map((preset) => ({
              label: preset.label,
              checkable: true,
              checked: bedVisible && preset.id === activeBedPresetId,
              onSelect: () => onSelectBedPreset(preset.id),
            })),
            {
              label: "None",
              checkable: true,
              checked: !bedVisible,
              onSelect: () => onHideBed?.(),
              disabled: !onHideBed,
            },
          ],
        }
      : { label: "Bed size", disabled: true };

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
        // Two-path export (Run Plan, PRD #73 / ADR 0001): the quick "Export SVG…"
        // (⌘E — writes the file + an Export Receipt) and "Run plan…" (⇧⌘E — the
        // pre-flight destination) sit ADJACENT so the maker chooses between "just
        // give me the file" and "let me see what the machine will do".
        { label: "Export SVG…", onSelect: onExport, shortcut: "⌘E" },
        {
          label: "Run plan…",
          onSelect: onRunPlan,
          disabled: !onRunPlan,
          shortcut: "⇧⌘E",
        },
        // Submit to org… (org/admin MVP) — in-app path to a workshop's cut queue.
        // Disabled (no handler) until the user is signed in.
        {
          label: "Submit to org…",
          onSelect: onSubmitToOrg,
          disabled: !onSubmitToOrg,
        },
        { label: "Save…", onSelect: onSave },
        {
          label: isGuest ? "Sign in to save to cloud" : "Save to cloud",
          onSelect: onSaveToCloud,
        },
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
        { separator: true },
        // Preferences… (Run Plan, ADR 0001) — the app-level Preferences modal
        // (currently the crop-to-Sheet Export toggle). Present-but-disabled until
        // the owner supplies a handler, matching the other conditional items.
        {
          label: "Preferences…",
          onSelect: onOpenPreferences,
          disabled: !onOpenPreferences,
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
        // The standalone "Overlays" toggle RETIRED into the Run Plan (PRD #73):
        // the canvas machine view now activates WITH the plan (File▸Run plan… /
        // ⇧⌘E), not a separate View toggle, so there is a single place the maker
        // sees "what the machine will do".
        // Bed size (moved out of Document Setup, per the UX reframe) — checkable
        // preset submenu + a "None" entry that hides the bed overlay entirely.
        bedSizeItem,
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
        // Photo → Pattern extraction (issue #49). Studio supplies the handler
        // only when the feature flag + tier gate allow it; without a handler
        // the item renders present-but-disabled like other pending features.
        {
          label: "Extract from Photo…",
          onSelect: onExtractPattern,
          disabled: !onExtractPattern,
        },
        // The Library surface for those extractions (S1, issue #50): browse
        // saved entries, open one, jump back into the Studio with it.
        {
          label: "Pattern Library…",
          onSelect: onOpenLibrary,
          disabled: !onOpenLibrary,
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

      {/* Save-status surface (Rec 1). Present only when Studio supplies `status`
          (pro shell). The editable doc name + status label sit between the menus
          and the account cluster. Omitted entirely on the legacy path. */}
      {status && (
        <SaveStatusIndicator
          status={status}
          lastSavedAt={lastSavedAt}
          onRetry={onRetry}
          name={designName}
          onRename={onRenameDesign}
        />
      )}

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
