// MotifBlockRack — the Ableton-style Block stack for one motif (C2, issue #79).
//
// Renders the motif's SELECTION CHAIN (from readChain(binding)) as a reorderable
// list of Block cards: per-block ⏻ bypass, remove, drag-reorder, and an ⊕ add-block
// menu. The rack is the authoring UI over the chain the engine already runs
// (A2/A3) and C1 made addressable.
//
// ORIENTATION follows the Inspector dock (D7): a VERTICAL card stack in the right
// dock, a HORIZONTAL Ableton-style flow in the bottom shelf. Read via
// useInspectorDockContext(); a null context (legacy layout) degrades to vertical.
//
// THE LOAD-BEARING INVARIANT (the Sequencer is terminal, at-most-one, and last)
// lives in the pure ops (src/lib/motif/chainEditor.js): the add-menu HIDES the
// Sequencer option once a sequence exists, addBlock inserts selection blocks
// before the sequence, and reorderChain rejects an illegal drop. All edits route
// through `onEditChain(mutate)` — the parent (MotifDevice) does
// ensureChainForm→mutate→deepMergeBinding→ONE onUpdateLayer (the first-edit-as-one-
// undo trap, C1), and skips the write when the mutate is a no-op (same ref).
//
// CARD DEPTH (C2 scope): everyN / skip / density / field are FUNCTIONAL cards.
// route carries the barest control (role checkboxes) — its path-scope picker is
// C4. sequence is a minimal shell — its slot strip is C3. A `field` block has no
// source picker yet (deferred), so it is inert until C3/C4/a later slice wires one.

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useInspectorDockContext } from "./inspectorDockContext";
import {
  makeBlock,
  canAddBlock,
  addBlock,
  removeBlock,
  setBlock,
  toggleBypass,
  reorderChain,
} from "../../lib/motif/chainEditor";

// Human labels for each block type (add-menu + card header).
const BLOCK_LABELS = {
  route: "Route",
  everyN: "Every N",
  skip: "Skip",
  density: "Density",
  field: "Field",
  sequence: "Sequencer",
};

// Add-menu order. Sequencer last (it is the terminal block).
const ADDABLE_TYPES = ["route", "everyN", "skip", "density", "field", "sequence"];

const ROLE_OPTIONS_SEMANTIC = [
  { key: "crossing", label: "Crossings" },
  { key: "edge", label: "Edges" },
  { key: "tip", label: "Tips" },
  { key: "cell", label: "Cells" },
];

// ── per-type card bodies ─────────────────────────────────────────────────────

function RouteCardBody({ block, roleOptions, onPatch }) {
  const roles = Array.isArray(block.roles) ? block.roles : [];
  const toggleRole = (key) => {
    const next = roles.includes(key)
      ? roles.filter((r) => r !== key)
      : [...roles, key];
    // null when nothing checked = all-pass (a route with no role filter). Keep
    // the array shape while any role is on.
    onPatch({ roles: next.length ? next : null });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {roleOptions.map((r) => (
          <label
            key={r.key}
            className="flex items-center gap-1 text-[11px] text-ink-soft"
          >
            <input
              type="checkbox"
              data-testid={`motif-block-role-${r.key}`}
              aria-label={r.label}
              checked={roles.includes(r.key)}
              onChange={() => toggleRole(r.key)}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </div>
      <p className="text-[10px] text-ink-soft/60">Path scope · configured in C4</p>
    </div>
  );
}

function EveryNCardBody({ block, onPatch }) {
  const n = block.n ?? 1;
  const offset = block.offset ?? 0;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="whitespace-nowrap">Every</span>
          <input
            type="number"
            data-testid="motif-block-n"
            aria-label="Every Nth"
            min={1}
            step={1}
            value={n}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : 1;
              onPatch({ n: next });
            }}
            className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="whitespace-nowrap">Offset</span>
          <input
            type="number"
            data-testid="motif-block-offset"
            aria-label="Offset"
            min={0}
            step={1}
            value={offset}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;
              onPatch({ offset: next });
            }}
            className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
          />
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
        <input
          type="checkbox"
          data-testid="motif-block-continuous"
          aria-label="Continuous across paths"
          checked={!!block.continuous}
          onChange={(e) => onPatch({ continuous: e.target.checked })}
        />
        <span>Continuous across paths</span>
      </label>
    </div>
  );
}

function SkipCardBody({ block, onPatch }) {
  const mask = Array.isArray(block.mask) ? block.mask : [];
  const setStep = (i, val) => {
    const next = mask.slice();
    next[i] = val;
    onPatch({ mask: next });
  };
  const addStep = () => onPatch({ mask: [...mask, false] });
  const removeStep = () => onPatch({ mask: mask.slice(0, -1) });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {mask.map((on, i) => (
          <button
            key={i}
            type="button"
            data-testid={`motif-block-skip-${i}`}
            aria-label={`Step ${i + 1} ${on ? "skip" : "keep"}`}
            aria-pressed={on}
            onClick={() => setStep(i, !on)}
            className={`h-6 w-6 rounded-xs border text-[10px] font-medium transition-colors ${
              on
                ? "border-violet bg-violet/15 text-ink"
                : "border-hairline bg-paper text-ink-soft hover:border-violet"
            }`}
          >
            {on ? "×" : "•"}
          </button>
        ))}
        <button
          type="button"
          data-testid="motif-block-skip-add"
          aria-label="Add step"
          onClick={addStep}
          className="h-6 w-6 rounded-xs border border-hairline bg-paper text-[11px] text-ink-soft hover:border-violet hover:text-ink"
        >
          +
        </button>
        {mask.length > 0 && (
          <button
            type="button"
            data-testid="motif-block-skip-remove"
            aria-label="Remove step"
            onClick={removeStep}
            className="h-6 w-6 rounded-xs border border-hairline bg-paper text-[11px] text-ink-soft hover:border-violet hover:text-ink"
          >
            −
          </button>
        )}
      </div>
      <p className="text-[10px] text-ink-soft/60">× skip · • keep (cycles)</p>
    </div>
  );
}

function DensityCardBody({ block, onPatch }) {
  const density = block.density ?? 1;
  const seed = block.seed ?? 1;
  const rngMode = block.rngMode || "hash";
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-12 whitespace-nowrap">Density</span>
        <input
          type="range"
          data-testid="motif-block-density"
          aria-label="Density"
          min={0}
          max={1}
          step={0.05}
          value={density}
          onChange={(e) => onPatch({ density: Number(e.target.value) })}
          className="flex-1 accent-violet"
        />
        <span className="w-9 text-right tabular-nums text-ink num">
          {Number(density).toFixed(2)}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="whitespace-nowrap">Seed</span>
          <input
            type="number"
            data-testid="motif-block-seed"
            aria-label="Seed"
            step={1}
            value={seed}
            onChange={(e) => {
              const raw = Number(e.target.value);
              onPatch({ seed: Number.isFinite(raw) ? Math.round(raw) : 1 });
            }}
            className="w-16 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet num"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="whitespace-nowrap">RNG</span>
          <select
            data-testid="motif-block-rngmode"
            aria-label="RNG mode"
            value={rngMode}
            onChange={(e) => onPatch({ rngMode: e.target.value })}
            className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet"
          >
            <option value="hash">Hash (stable)</option>
            <option value="sequential">Sequential</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function FieldCardBody({ block, onPatch }) {
  const threshold = block.threshold ?? 0.5;
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="w-14 whitespace-nowrap">Threshold</span>
        <input
          type="range"
          data-testid="motif-block-threshold"
          aria-label="Threshold"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          onChange={(e) => onPatch({ threshold: Number(e.target.value) })}
          className="flex-1 accent-violet"
        />
        <span className="w-9 text-right tabular-nums text-ink num">
          {Number(threshold).toFixed(2)}
        </span>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
        <input
          type="checkbox"
          data-testid="motif-block-invert"
          aria-label="Invert"
          checked={!!block.invert}
          onChange={(e) => onPatch({ invert: e.target.checked })}
        />
        <span>Invert</span>
      </label>
      <p className="text-[10px] text-ink-soft/60">Field source · deferred</p>
    </div>
  );
}

function SequenceCardBody({ block }) {
  const slotCount = Array.isArray(block.slots) ? block.slots.length : 0;
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-ink-soft">
        {slotCount} slot{slotCount === 1 ? "" : "s"} · {block.mode || "cycle"}
      </p>
      <p className="text-[10px] text-ink-soft/60">Slot strip · configured in C3</p>
    </div>
  );
}

function BlockCardBody({ block, roleOptions, onPatch }) {
  switch (block.type) {
    case "route":
      return <RouteCardBody block={block} roleOptions={roleOptions} onPatch={onPatch} />;
    case "everyN":
      return <EveryNCardBody block={block} onPatch={onPatch} />;
    case "skip":
      return <SkipCardBody block={block} onPatch={onPatch} />;
    case "density":
      return <DensityCardBody block={block} onPatch={onPatch} />;
    case "field":
      return <FieldCardBody block={block} onPatch={onPatch} />;
    case "sequence":
      return <SequenceCardBody block={block} />;
    default:
      return null;
  }
}

// ── one sortable Block card ──────────────────────────────────────────────────
//
// The drag listeners ride ONLY the grip handle (not the whole card) so the card's
// inputs (number fields, checkboxes, selects, range sliders) keep normal pointer
// behavior. A stable per-block id (index-based) keys the sortable — the chain is a
// positional array with no block ids, and the SortableContext id set stays stable
// for a drag because a drag never adds/removes a block.
function SortableBlockCard({ id, block, index, roleOptions, onPatch, onBypass, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.85 } : null),
  };
  const bypassed = !!block.bypass;
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="motif-block"
      data-block-type={block.type}
      className={`shrink-0 rounded-cell border p-2 ${
        bypassed ? "border-hairline bg-paper/60 opacity-60" : "border-hairline bg-paper"
      } min-w-[160px]`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          data-testid="motif-block-grip"
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-ink-soft/60 hover:text-ink"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          {BLOCK_LABELS[block.type] || block.type}
        </span>
        <button
          type="button"
          data-testid="motif-block-bypass"
          aria-label={bypassed ? "Enable block" : "Bypass block"}
          aria-pressed={bypassed}
          title={bypassed ? "Enable block" : "Bypass block"}
          onClick={onBypass}
          className={`shrink-0 rounded-xs px-1 text-xs ${
            bypassed ? "text-ink-soft/50" : "text-ink-soft hover:text-ink"
          }`}
        >
          <span aria-hidden="true">⏻</span>
        </button>
        <button
          type="button"
          data-testid="motif-block-remove"
          aria-label="Remove block"
          onClick={onRemove}
          className="shrink-0 rounded-xs px-1 text-xs text-ink-soft hover:text-ink"
        >
          ×
        </button>
      </div>
      <BlockCardBody block={block} roleOptions={roleOptions} onPatch={onPatch} />
    </div>
  );
}

// ── the rack ─────────────────────────────────────────────────────────────────

export default function MotifBlockRack({ chain, onEditChain, hostIsSemantic = true }) {
  const dock = useInspectorDockContext();
  const orientation = dock?.dockPosition === "bottom" ? "horizontal" : "vertical";

  // On an edge host, Route only offers the Edges role (semantic crossing/tip/cell
  // anchors don't exist there) — mirror MotifDevice's roleOptions scoping.
  const roleOptions = hostIsSemantic
    ? ROLE_OPTIONS_SEMANTIC
    : ROLE_OPTIONS_SEMANTIC.filter((r) => r.key === "edge");

  const blocks = Array.isArray(chain) ? chain : [];
  // Stable ids for the sortable set (positional — the chain has no block ids and
  // never mutates mid-drag).
  const ids = blocks.map((_, i) => `block-${i}`);

  // Split sensors like PatternGalleryView: mouse distance so a click ≠ a drag,
  // touch delay so an iPad swipe scrolls, keyboard for a11y (and so jsdom/keyboard
  // reorder is drivable if ever needed).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from === -1 || to === -1) return;
    // reorderChain rejects an illegal drop (selection below the sequence /
    // sequence off the end) by returning the same ref → onEditChain skips it.
    onEditChain((c) => reorderChain(c, from, to));
  };

  const canAddSequence = canAddBlock(blocks, "sequence");
  const addTypes = ADDABLE_TYPES.filter(
    (t) => t !== "sequence" || canAddSequence
  );

  return (
    <div className="space-y-2" data-testid="motif-rack" data-orientation={orientation}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={ids}
          strategy={
            orientation === "horizontal"
              ? horizontalListSortingStrategy
              : verticalListSortingStrategy
          }
        >
          <div
            className={
              orientation === "horizontal"
                ? "flex flex-nowrap gap-2 overflow-x-auto pb-1"
                : "flex flex-col gap-2"
            }
          >
            {blocks.map((block, i) => (
              <SortableBlockCard
                key={ids[i]}
                id={ids[i]}
                block={block}
                index={i}
                roleOptions={roleOptions}
                onPatch={(patch) => onEditChain((c) => setBlock(c, i, patch))}
                onBypass={() => onEditChain((c) => toggleBypass(c, i))}
                onRemove={() => onEditChain((c) => removeBlock(c, i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* ⊕ add-block menu. The Sequencer option is HIDDEN once a sequence exists
          (at-most-one). A selection block is inserted before any sequence, so the
          menu never needs to forbid "add after the sequencer" — addBlock handles
          placement. */}
      <select
        data-testid="motif-block-add"
        aria-label="Add block"
        value=""
        onChange={(e) => {
          const type = e.target.value;
          if (!type) return;
          onEditChain((c) => addBlock(c, makeBlock(type)));
          e.target.value = "";
        }}
        className="w-full rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[11px] text-ink outline-none focus:border-violet"
      >
        <option value="">+ Add block</option>
        {addTypes.map((t) => (
          <option key={t} value={t}>
            {BLOCK_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
