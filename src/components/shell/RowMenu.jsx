// RowMenu — the per-row "⋯" overflow popper for the Object Tree panel
// (Object Tree Panel plan, spec §4 / WI-4).
//
// As of #139 this is a THIN CALLER over `ui/Menu`, which owns everything that
// was generic here: `role="menu"` with `role="menuitem"` DIVS (a native button
// synthesizes a click from Enter in browsers but not in jsdom, so a div keeps
// the explicit Enter handler the sole activation path), focus on the first item
// at open, ↑/↓ navigation, Enter activation, Escape, mousedown click-away (kept
// distinct from the item click path so selecting never trips it), and the
// aria-disabled + title treatment for unavailable items — never the `disabled`
// attribute, which would suppress the hover text explaining why.
//
// RowMenu keeps only what is actually about an Object Tree row: WHICH items
// exist, in what order, and where the panel sits. Behaviour is unchanged, with
// one fix that came with the extraction: Escape (and item activation) now
// return focus to the ⋯ trigger instead of stranding it on <body>.
//
// Trigger ownership: like OperationPicker, RowMenu renders ONLY the menu panel.
// The ⋯ button that toggles it lives in the LayerTree row (wired in WI-5); the
// caller owns the trigger and the one-at-a-time open guarantee.
//
// Items, top→bottom: Rename · Duplicate · [Move to panel…] · [Download] ·
// [Substrate details…] · [Clear all layers] · —divider— · Delete. Delete
// carries the project's destructive token (`tone-strong`), the same semantic
// token ConfirmDialog uses for destructive actions.
//
// Inline + flip: open below by default (top-full), flip above (bottom-full)
// when the anchoring row sits near the panel's bottom edge.
//
// Right-anchor (`right-0`): the ⋯ trigger sits at the panel's right edge, so a
// left-anchored menu would grow 140px rightward — off the panel, where the
// tree's `overflow-auto` scroll container clips it (the reported bug). Opening
// leftward keeps the whole menu inside the panel.

import Menu from "../ui/Menu";

export default function RowMenu({
  open = false,
  anchorNearBottom = false,
  onClose = () => {},
  onRename = () => {},
  onDuplicate = () => {},
  duplicateDisabled = false,
  duplicateTitle,
  onMoveToPanel,
  onDownload,
  onEditSubstrate,
  onClearLayers,
  clearLayersDisabled = false,
  clearLayersLabel = "Clear all layers",
  clearLayersTitle,
  onDelete = () => {},
  deleteDisabled = false,
  deleteTitle,
}) {
  const flipClass = anchorNearBottom ? "bottom-full mb-1" : "top-full mt-1";

  const items = [
    { label: "Rename", onActivate: onRename },
    {
      label: "Duplicate",
      disabled: duplicateDisabled,
      title: duplicateTitle,
      onActivate: onDuplicate,
    },
    // Layer rows in grouped (panel) mode only: opens the move-to-panel picker
    // popper (anchored to the same ⋯ trigger) listing the document's panels. The
    // caller gates this on having somewhere to move TO (≥2 panels), so the item
    // never dead-ends.
    onMoveToPanel && { label: "Move to panel…", onActivate: onMoveToPanel },
    onDownload && { label: "Download", onActivate: onDownload },
    // Panel rows only: opens the substrate-details editor (kind / color / label)
    // now that material + thickness live directly on the row.
    onEditSubstrate && { label: "Substrate details…", onActivate: onEditSubstrate },
    onClearLayers && {
      label: clearLayersLabel,
      disabled: clearLayersDisabled,
      title: clearLayersTitle,
      onActivate: onClearLayers,
    },
    { separator: true },
    {
      label: "Delete",
      danger: true,
      disabled: deleteDisabled,
      title: deleteTitle,
      onActivate: onDelete,
    },
  ];

  return (
    <Menu
      open={open}
      items={items}
      onClose={onClose}
      ariaLabel="Row actions"
      testId="row-menu"
      className={`absolute right-0 z-50 ${flipClass} min-w-[140px] rounded-sm border border-hairline bg-paper p-1 shadow-pop`}
    />
  );
}
