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

import { useState, useMemo } from "react";
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
  addSlot,
  removeSlot,
  reorderSlots,
  setSlot,
} from "../../lib/motif/chainEditor";
import { getGlyph, MOTIF_GLYPHS } from "../../lib/motif/glyphs.js";
import { sieveCounts } from "../../lib/motif/sieveCounts.js";
import ScrubNumeral from "../ui/ScrubNumeral";
import CadenceStripControl from "../ui/CadenceStripControl";
import RoleGlyphToggles from "../ui/RoleGlyphToggles";

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

// Blocks that COLLAPSE to a one-line row (Variant D): grip · chevron+name ·
// inline summary control · anchor chip · power. The chevron unfolds the SAME
// detail card body beneath. Skip/Field stay as full cards (no compact summary
// vocabulary is specified for them); the Sequencer is always expanded — it is the
// payload — but carries an "N placed" chip in its header.
const COLLAPSIBLE_TYPES = new Set(["route", "everyN", "density"]);

// The RoleBadge visual family fallback when the rack isn't told the host kind
// (tests / legacy callers): semantic hosts read as a lattice, edge hosts a stroke.
// The real device threads the exact badgeKindForHost(patternType) in.
function fallbackHostKind(hostIsSemantic) {
  return hostIsSemantic ? "lattice" : "stroke";
}

const ROLE_OPTIONS_SEMANTIC = [
  { key: "crossing", label: "Crossings" },
  { key: "edge", label: "Edges" },
  { key: "tip", label: "Tips" },
  { key: "cell", label: "Cells" },
];

// Path-scope options (D5). GATED by host type (A2 forward-note): semantic-anchor
// hosts (grid/recursive/spiral/voronoi) lack `meta.closed` AND `meta.pathIndex`,
// so `closed`/`picked` would EMPTY the selection there — offer only {all, open}
// (open ≡ all on semantic since those anchors carry no `closed`, so it's a safe,
// harmless superset). Edge hosts (flowfield/wave/…) carry both, so offer all four.
const SCOPE_OPTIONS_SEMANTIC = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
];
const SCOPE_OPTIONS_EDGE = [
  { key: "all", label: "All" },
  { key: "closed", label: "Closed" },
  { key: "open", label: "Open" },
  { key: "picked", label: "Picked" },
];

// ── per-type card bodies ─────────────────────────────────────────────────────

// The Route card (C4): anchor roles + host path scope. `picked` paths are chosen
// by CLICKING an edge-ghost dot on the canvas — the "Pick on canvas" arm toggle
// hands THIS route block's index to the Studio-level pick target (ephemeral, not
// persisted); a click then toggles that dot's `meta.pathIndex` in `pickedPaths`
// via the SAME editChain path the scope write uses (route-block edit, never
// `selection.overrides` — C1 mutual-exclusivity). Path indices are opaque to a
// designer, so clicking the visible tendril is the whole mechanism; the "N
// picked · Clear" line is a complement, not a substitute.
function RouteCardBody({
  block,
  roleOptions,
  hostIsSemantic = true,
  armed = false,
  onSetArmed,
  onPatch,
}) {
  const roles = Array.isArray(block.roles) ? block.roles : [];
  const toggleRole = (key) => {
    const next = roles.includes(key)
      ? roles.filter((r) => r !== key)
      : [...roles, key];
    // null when nothing checked = all-pass (a route with no role filter). Keep
    // the array shape while any role is on.
    onPatch({ roles: next.length ? next : null });
  };

  const scope = block.pathScope || "all";
  const scopeOptions = hostIsSemantic ? SCOPE_OPTIONS_SEMANTIC : SCOPE_OPTIONS_EDGE;
  const picked = Array.isArray(block.pickedPaths) ? block.pickedPaths : [];
  const setScope = (next) => {
    if (next === scope) return;
    // Leaving 'picked' disarms any active canvas-pick (the runbook's disarm-on-
    // scope-change-away — the arm state is ephemeral and must not linger).
    if (next !== "picked" && armed) onSetArmed?.(false);
    onPatch({ pathScope: next });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {roleOptions.map((r) => (
          <label
            key={r.key}
            className="flex items-center gap-1 text-xs text-ink-soft"
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

      {/* Path scope — gated by host type. */}
      <div
        className="flex flex-wrap items-center gap-1"
        data-testid="motif-route-scope"
      >
        {scopeOptions.map((o) => {
          const active = scope === o.key;
          return (
            <button
              key={o.key}
              type="button"
              data-testid={`motif-route-scope-${o.key}`}
              aria-pressed={active}
              onClick={() => setScope(o.key)}
              className={`rounded-xs border px-2 py-0.5 text-2xs font-medium transition-colors ${
                active
                  ? "border-violet bg-violet/15 text-ink"
                  : "border-hairline bg-paper text-ink-soft hover:border-violet"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Picked-scope canvas-pick (edge hosts only — semantic anchors carry no
          meta.pathIndex, so there is nothing to click there). */}
      {scope === "picked" && !hostIsSemantic && (
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="motif-route-pick"
        >
          {/* The arm renders only where canvas-pick is actually wired
              (onSetArmed present) — no dead button in unwired hosts (e.g. mobile,
              standalone). */}
          {typeof onSetArmed === "function" && (
            <button
              type="button"
              data-testid="motif-route-pick-arm"
              aria-pressed={armed}
              aria-label="Pick paths on canvas"
              onClick={() => onSetArmed(!armed)}
              className={`rounded-xs border px-2 py-0.5 text-2xs font-medium transition-colors ${
                armed
                  ? "border-violet bg-violet/15 text-ink"
                  : "border-hairline bg-paper text-ink-soft hover:border-violet"
              }`}
            >
              {armed ? "Picking…" : "Pick on canvas"}
            </button>
          )}
          <span
            data-testid="motif-route-picked-summary"
            className="text-2xs tabular-nums text-ink-soft num"
          >
            {picked.length} picked
          </span>
          {picked.length > 0 && (
            <button
              type="button"
              data-testid="motif-route-picked-clear"
              onClick={() => onPatch({ pickedPaths: [] })}
              className="text-2xs text-ink-soft underline hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EveryNCardBody({ block, onPatch }) {
  const n = block.n ?? 1;
  const offset = block.offset ?? 0;
  return (
    <div className="space-y-1.5">
      {/* The SAME cadence component as the collapsed summary, larger — clicking a
          beat shifts the OFFSET onto that beat (n unchanged). */}
      <div className="space-y-1">
        <p className="text-2xs text-ink-soft/70">Cadence — tap a beat to shift the offset</p>
        <CadenceStripControl
          n={n}
          offset={offset}
          beats={12}
          size="lg"
          onCommit={(off) => onPatch({ offset: off })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
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
            className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none focus:border-violet num"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
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
            className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none focus:border-violet num"
          />
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
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
            className={`h-6 w-6 rounded-xs border text-2xs font-medium transition-colors ${
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
          className="h-6 w-6 rounded-xs border border-hairline bg-paper text-xs text-ink-soft hover:border-violet hover:text-ink"
        >
          +
        </button>
        {mask.length > 0 && (
          <button
            type="button"
            data-testid="motif-block-skip-remove"
            aria-label="Remove step"
            onClick={removeStep}
            className="h-6 w-6 rounded-xs border border-hairline bg-paper text-xs text-ink-soft hover:border-violet hover:text-ink"
          >
            −
          </button>
        )}
      </div>
      <p className="text-2xs text-ink-soft/60">× skip · • keep (cycles)</p>
    </div>
  );
}

function DensityCardBody({ block, onPatch }) {
  const density = block.density ?? 1;
  const seed = block.seed ?? 1;
  const rngMode = block.rngMode || "hash";
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs text-ink-soft">
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
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
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
            className="w-16 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none focus:border-violet num"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="whitespace-nowrap">RNG</span>
          <select
            data-testid="motif-block-rngmode"
            aria-label="RNG mode"
            value={rngMode}
            onChange={(e) => onPatch({ rngMode: e.target.value })}
            className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-xs text-ink outline-none focus:border-violet"
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
      <label className="flex items-center gap-2 text-xs text-ink-soft">
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
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        <input
          type="checkbox"
          data-testid="motif-block-invert"
          aria-label="Invert"
          checked={!!block.invert}
          onChange={(e) => onPatch({ invert: e.target.checked })}
        />
        <span>Invert</span>
      </label>
      <p className="text-2xs text-ink-soft/60">Field source · deferred</p>
    </div>
  );
}

// ── Sequencer card (C3) ──────────────────────────────────────────────────────
//
// The terminal `sequence` block authored as a horizontal slot strip. Each Slot is
// a glyph thumbnail (tap → open its glyph in the Motif Edit Session with SLOT
// CONTEXT) or a Rest chip. Slots add / remove / reorder via a NESTED dnd (its own
// DndContext, isolated from the block-rack's outer sortable — dragging a slot must
// not drag its block). A Cycle | Random mode toggle switches the deal; per-slot
// weight sliders show ONLY in Random mode (a Rest carries a weight too). An
// "angle randomization" checkbox per glyph slot progressively reveals range +
// spread (flat | bell) → writes slot.rotationRandom; unchecking removes it.

const SPREAD_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "bell", label: "Bell" },
];

// One sortable Slot chip. Drag rides ONLY the grip (like the block card), so the
// chip's inputs (weight slider, angle controls) keep normal pointer behavior and
// tapping the glyph opens the editor rather than starting a drag.
function SortableSlotChip({
  id,
  slot,
  index,
  isRandom,
  customGlyphs,
  baseGlyphRef,
  onEditGlyph,
  onPatch,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.85 } : null),
  };
  const isRest = slot?.rest === true;
  const effectiveRef = slot?.glyphRef ?? baseGlyphRef;
  const glyph = isRest ? null : getGlyph(effectiveRef, customGlyphs);
  const rr = slot?.rotationRandom;
  const angleOn = !!rr;
  const weight = slot?.weight != null ? slot.weight : 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="motif-slot"
      data-slot-index={index}
      data-slot-rest={isRest ? "true" : "false"}
      className="flex w-[92px] shrink-0 flex-col gap-1 rounded-cell border border-hairline bg-paper p-1.5"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="motif-slot-grip"
          aria-label="Drag to reorder slot"
          className="cursor-grab touch-none text-2xs text-ink-soft/60 hover:text-ink"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="motif-slot-remove"
          aria-label="Remove slot"
          onClick={onRemove}
          className="shrink-0 text-xs text-ink-soft hover:text-ink"
        >
          ×
        </button>
      </div>

      {isRest ? (
        <div
          data-testid="motif-slot-rest"
          className="flex h-10 items-center justify-center rounded-xs border border-dashed border-hairline text-2xs font-medium uppercase tracking-wider text-ink-soft/70"
        >
          Rest
        </div>
      ) : (
        <button
          type="button"
          data-testid="motif-slot-edit"
          aria-label="Edit slot glyph"
          title="Edit this slot's glyph"
          onClick={() => onEditGlyph(index, effectiveRef)}
          className="flex h-10 items-center justify-center rounded-xs border border-hairline bg-paper-warm text-ink-soft hover:border-violet hover:text-ink"
        >
          <svg width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true">
            {glyph?.paths?.[0]?.d ? (
              <path d={glyph.paths[0].d} fill="none" stroke="currentColor" strokeWidth="1.5" />
            ) : (
              <circle r="6" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            )}
          </svg>
        </button>
      )}

      {/* Weight — Random mode only (positional in Cycle). Rests carry a weight too. */}
      {isRandom && (
        <label className="flex items-center gap-1 text-2xs text-ink-soft">
          <span className="shrink-0">wt</span>
          <input
            type="range"
            data-testid="motif-slot-weight"
            aria-label="Weight"
            min={0}
            max={5}
            step={0.5}
            value={weight}
            onChange={(e) => onPatch({ weight: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-violet"
          />
          <span className="w-5 shrink-0 text-right tabular-nums num">
            {Number(weight).toFixed(1)}
          </span>
        </label>
      )}

      {/* Angle randomization — glyph slots only (a Rest has no rotation). */}
      {!isRest && (
        <label className="flex items-center gap-1 text-2xs text-ink-soft">
          <input
            type="checkbox"
            data-testid="motif-slot-anglerand"
            aria-label="Angle randomization"
            checked={angleOn}
            onChange={(e) =>
              onPatch({
                rotationRandom: e.target.checked
                  ? { range: 30, spread: "flat" }
                  : undefined,
              })
            }
          />
          <span>Angle rnd</span>
        </label>
      )}
      {!isRest && angleOn && (
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-2xs text-ink-soft">
            <span className="shrink-0">±°</span>
            <input
              type="range"
              data-testid="motif-slot-range"
              aria-label="Angle range"
              min={0}
              max={180}
              step={5}
              value={rr.range ?? 0}
              onChange={(e) =>
                onPatch({
                  rotationRandom: { ...rr, range: Number(e.target.value) },
                })
              }
              className="min-w-0 flex-1 accent-violet"
            />
            <span className="w-5 shrink-0 text-right tabular-nums num">
              {Math.round(rr.range ?? 0)}
            </span>
          </label>
          <select
            data-testid="motif-slot-spread"
            aria-label="Spread"
            value={rr.spread === "bell" ? "bell" : "flat"}
            onChange={(e) =>
              onPatch({ rotationRandom: { ...rr, spread: e.target.value } })
            }
            className="w-full rounded-xs border border-hairline bg-paper px-1 py-0.5 text-2xs text-ink outline-none focus:border-violet"
          >
            {SPREAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function SequenceCardBody({
  block,
  seqIndex,
  onEditChain,
  customGlyphs,
  baseGlyphRef,
  onEditSlotGlyph,
}) {
  const slots = Array.isArray(block.slots) ? block.slots : [];
  const isRandom = block.mode === "random";

  // Positional slot ids for the NESTED sortable (stable within a drag — a drag
  // never adds/removes a slot). Separate sensors + DndContext from the block rack
  // so a slot drag is fully isolated from its parent block's drag.
  const slotIds = slots.map((_, i) => `slot-${i}`);
  const slotSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleSlotDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = slotIds.indexOf(active.id);
    const to = slotIds.indexOf(over.id);
    if (from === -1 || to === -1) return;
    onEditChain((c) => reorderSlots(c, seqIndex, from, to));
  };

  const setMode = (mode) => onEditChain((c) => setBlock(c, seqIndex, { mode }));

  return (
    <div className="space-y-2">
      {/* Cycle | Random deal mode. */}
      <div className="flex items-center gap-1" data-testid="motif-seq-mode">
        {["cycle", "random"].map((m) => {
          const active = (block.mode || "cycle") === m;
          return (
            <button
              key={m}
              type="button"
              data-testid={`motif-seq-mode-${m}`}
              aria-pressed={active}
              onClick={() => setMode(m)}
              className={`rounded-xs border px-2 py-0.5 text-2xs font-medium capitalize transition-colors ${
                active
                  ? "border-violet bg-violet/15 text-ink"
                  : "border-hairline bg-paper text-ink-soft hover:border-violet"
              }`}
            >
              {m}
            </button>
          );
        })}
        {/* Continuous — a CYCLE-mode control (documented no-op in Random, D10). */}
        {!isRandom && (
          <label className="ml-1 flex items-center gap-1 text-2xs text-ink-soft">
            <input
              type="checkbox"
              data-testid="motif-seq-continuous"
              aria-label="Continuous across paths"
              checked={!!block.continuous}
              onChange={(e) =>
                onEditChain((c) => setBlock(c, seqIndex, { continuous: e.target.checked }))
              }
            />
            <span>Continuous</span>
          </label>
        )}
      </div>

      {/* Horizontal slot strip (nested, isolated dnd). */}
      <DndContext
        sensors={slotSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSlotDragEnd}
      >
        <SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>
          <div
            data-testid="motif-slot-strip"
            className="flex flex-nowrap items-start gap-1.5 overflow-x-auto pb-1"
          >
            {slots.length === 0 && (
              <p className="py-2 text-2xs text-ink-soft/60">
                No slots — add a glyph or a rest.
              </p>
            )}
            {slots.map((slot, i) => (
              <SortableSlotChip
                key={slotIds[i]}
                id={slotIds[i]}
                slot={slot}
                index={i}
                isRandom={isRandom}
                customGlyphs={customGlyphs}
                baseGlyphRef={baseGlyphRef}
                onEditGlyph={(slotIndex, glyphRef) =>
                  onEditSlotGlyph(seqIndex, slotIndex, glyphRef)
                }
                onPatch={(patch) => onEditChain((c) => setSlot(c, seqIndex, i, patch))}
                onRemove={() => onEditChain((c) => removeSlot(c, seqIndex, i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="motif-slot-add"
          aria-label="Add glyph slot"
          onClick={() =>
            onEditChain((c) => addSlot(c, seqIndex, { glyphRef: baseGlyphRef }))
          }
          className="rounded-xs border border-hairline bg-paper px-2 py-0.5 text-2xs text-ink-soft hover:border-violet hover:text-ink"
        >
          + Glyph
        </button>
        <button
          type="button"
          data-testid="motif-slot-add-rest"
          aria-label="Add rest"
          onClick={() => onEditChain((c) => addSlot(c, seqIndex, { rest: true }))}
          className="rounded-xs border border-hairline bg-paper px-2 py-0.5 text-2xs text-ink-soft hover:border-violet hover:text-ink"
        >
          + Rest
        </button>
      </div>
    </div>
  );
}

function BlockCardBody({
  block,
  index,
  roleOptions,
  hostIsSemantic,
  armed,
  onSetArmed,
  onPatch,
  onEditChain,
  customGlyphs,
  baseGlyphRef,
  onEditSlotGlyph,
}) {
  switch (block.type) {
    case "route":
      return (
        <RouteCardBody
          block={block}
          roleOptions={roleOptions}
          hostIsSemantic={hostIsSemantic}
          armed={armed}
          onSetArmed={onSetArmed}
          onPatch={onPatch}
        />
      );
    case "everyN":
      return <EveryNCardBody block={block} onPatch={onPatch} />;
    case "skip":
      return <SkipCardBody block={block} onPatch={onPatch} />;
    case "density":
      return <DensityCardBody block={block} onPatch={onPatch} />;
    case "field":
      return <FieldCardBody block={block} onPatch={onPatch} />;
    case "sequence":
      return (
        <SequenceCardBody
          block={block}
          seqIndex={index}
          onEditChain={onEditChain}
          customGlyphs={customGlyphs}
          baseGlyphRef={baseGlyphRef}
          onEditSlotGlyph={onEditSlotGlyph}
        />
      );
    default:
      return null;
  }
}

// ── anchor-count chip ────────────────────────────────────────────────────────
//
// Per-block `in→out`: how many anchors ENTER this stage vs SURVIVE it, read from
// sieveCounts (the engine's real stage semantics). PRE-CAP by construction — the
// downstream MAX_PLACEMENTS truncation stays the truth of the placement-budget
// warning, never this chip (docs §6). A DROP (out < in) is normal (no tone), but
// a DEAD block (in > 0, out === 0 — nothing survives) reads tone-mild: it is the
// honest answer to "why is nothing showing?".
function AnchorCountChip({ inCount, outCount }) {
  const dead = inCount > 0 && outCount === 0;
  return (
    <span
      data-testid="motif-block-anchor-chip"
      title={`${inCount} anchors in · ${outCount} kept`}
      className={`shrink-0 rounded-xs px-1 text-2xs tabular-nums num ${
        dead ? "text-tone-mild" : "text-ink-soft"
      }`}
    >
      {inCount}
      <span aria-hidden="true">→</span>
      {outCount}
    </span>
  );
}

// The inline EDITABLE summary shown on a collapsed row — the compact-control
// vocabulary wired to the SAME onPatch (editChain) seam the unfolded detail uses,
// so a collapsed edit and an unfolded edit are indistinguishable to the model.
function BlockSummaryControl({ block, roleOptions, hostKind, onPatch }) {
  switch (block.type) {
    case "route": {
      const roles = Array.isArray(block.roles) ? block.roles : [];
      const toggleRole = (key) => {
        const next = roles.includes(key)
          ? roles.filter((r) => r !== key)
          : [...roles, key];
        onPatch({ roles: next.length ? next : null });
      };
      return (
        <RoleGlyphToggles
          hostKind={hostKind}
          options={roleOptions}
          roles={roles}
          onToggle={toggleRole}
        />
      );
    }
    case "everyN":
      return (
        <div className="flex items-center gap-1.5">
          <CadenceStripControl
            n={block.n ?? 1}
            offset={block.offset ?? 0}
            beats={12}
            onCommit={(offset) => onPatch({ offset })}
          />
          <ScrubNumeral
            value={block.n ?? 1}
            min={1}
            max={12}
            step={1}
            label="Every Nth"
            testId="motif-summary-n"
            onCommit={(n) => onPatch({ n })}
          />
        </div>
      );
    case "density":
      return (
        <ScrubNumeral
          value={block.density ?? 1}
          min={0}
          max={1}
          step={0.05}
          label="Density"
          testId="motif-summary-density"
          format={(v) => Number(v).toFixed(2)}
          onCommit={(density) => onPatch({ density })}
        />
      );
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
function SortableBlockCard({
  id,
  block,
  index,
  roleOptions,
  hostIsSemantic,
  hostKind,
  armed,
  onSetArmed,
  onPatch,
  onBypass,
  onRemove,
  onEditChain,
  customGlyphs,
  baseGlyphRef,
  onEditSlotGlyph,
  // Anchor-sieve numbers for THIS block (nullable — only when host anchors were
  // resolvable). `stage` is {inCount, outCount}; `placedCount` is the terminal
  // Sequencer's non-rest placement count for its header chip.
  stage = null,
  placedCount = null,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.85 } : null),
  };
  const bypassed = !!block.bypass;
  const collapsible = COLLAPSIBLE_TYPES.has(block.type);
  // Disclosure state is per-block component state (default collapsed). The rack
  // doesn't persist disclosure anywhere else, so component state is the match.
  const [open, setOpen] = useState(false);

  const grip = (
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
  );
  const power = (
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
  );
  const remove = (
    <button
      type="button"
      data-testid="motif-block-remove"
      aria-label="Remove block"
      onClick={onRemove}
      className="shrink-0 rounded-xs px-1 text-xs text-ink-soft hover:text-ink"
    >
      ×
    </button>
  );
  const body = (
    <BlockCardBody
      block={block}
      index={index}
      roleOptions={roleOptions}
      hostIsSemantic={hostIsSemantic}
      armed={armed}
      onSetArmed={onSetArmed}
      onPatch={onPatch}
      onEditChain={onEditChain}
      customGlyphs={customGlyphs}
      baseGlyphRef={baseGlyphRef}
      onEditSlotGlyph={onEditSlotGlyph}
    />
  );

  // ── collapsible one-line row (route / everyN / density) ────────────────────
  if (collapsible) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        data-testid="motif-block"
        data-block-type={block.type}
        className={`shrink-0 rounded-cell border ${
          bypassed ? "border-hairline bg-paper/60 opacity-60" : "border-hairline bg-paper"
        } min-w-[160px]`}
      >
        {/* ~28-32px one-line row. Height-free unfold below (no height animation). */}
        <div className="flex min-h-[28px] items-center gap-1.5 px-2 py-1">
          {grip}
          <button
            type="button"
            data-testid="motif-block-disclosure"
            aria-expanded={open}
            aria-label={open ? "Fold block" : "Unfold block"}
            title={open ? "Fold block" : "Unfold block"}
            onClick={() => setOpen((o) => !o)}
            // Negative-margin hit-area pad (branch convention) so the chevron/name
            // tap target clears ~44px effective without growing the row.
            className="-my-1.5 flex shrink-0 items-center gap-1 rounded-xs py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <span
              aria-hidden="true"
              className="inline-block text-2xs leading-none text-ink-soft transition-transform duration-fast"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▸
            </span>
            <span className="text-xs font-medium text-ink">
              {BLOCK_LABELS[block.type] || block.type}
            </span>
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <BlockSummaryControl
              block={block}
              roleOptions={roleOptions}
              hostKind={hostKind}
              onPatch={onPatch}
            />
          </div>
          {stage && (
            <AnchorCountChip inCount={stage.inCount} outCount={stage.outCount} />
          )}
          {power}
          {remove}
        </div>
        {open && <div className="border-t border-hairline px-2 py-2">{body}</div>}
      </div>
    );
  }

  // ── full card (skip / field / sequence — always expanded) ──────────────────
  const isSequence = block.type === "sequence";
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
        {grip}
        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-ink-soft">
          {BLOCK_LABELS[block.type] || block.type}
        </span>
        {isSequence && placedCount != null && (
          <span
            data-testid="motif-seq-placed"
            className="shrink-0 text-2xs tabular-nums text-ink-soft num"
          >
            {placedCount} placed
          </span>
        )}
        {power}
        {remove}
      </div>
      {body}
    </div>
  );
}

// ── the rack ─────────────────────────────────────────────────────────────────

export default function MotifBlockRack({
  chain,
  onEditChain,
  hostIsSemantic = true,
  // RoleBadge visual family for the host (badgeKindForHost — 'lattice'|'stroke').
  // Threaded from MotifDevice so the Route summary's role marks match the mode
  // column's; a bare caller falls back to the semantic/edge split.
  hostKind,
  // Resolved host anchors (nullable) for the per-block sieve chips. When present,
  // sieveCounts replays the engine's stage semantics to show each block's
  // in→out; when null (edge/voronoi hosts whose geometry is render-captured, or
  // no host), the rack simply shows no chips. PRE-CAP — the placement-budget
  // warning stays the truth about MAX_PLACEMENTS (docs §6).
  anchors = null,
  // The motif's post-chain include/exclude overrides (ADR-0004), threaded verbatim
  // to sieveCounts so the Sequencer's "N placed" matches the canvas's POST-override
  // survivor set. Per-stage chips stay PRE-override (sieveCounts only applies
  // overrides to selected/placed) — the correct split per the chip contract.
  overrides = null,
  // Canvas-pick arm state (C4): the block index (in this chain) whose route card
  // is armed as the active pick target, or null. Ephemeral (Studio component
  // state, never persisted). `onArmRoute(indexOrNull)` sets/clears it — passing
  // null disarms. One route may be armed at a time across the whole document.
  armedRouteIndex = null,
  onArmRoute,
  customGlyphs,
  baseGlyphRef,
  onEditSlotGlyph,
}) {
  const dock = useInspectorDockContext();
  const orientation = dock?.dockPosition === "bottom" ? "horizontal" : "vertical";

  // On an edge host, Route only offers the Edges role (semantic crossing/tip/cell
  // anchors don't exist there) — mirror MotifDevice's roleOptions scoping.
  const roleOptions = hostIsSemantic
    ? ROLE_OPTIONS_SEMANTIC
    : ROLE_OPTIONS_SEMANTIC.filter((r) => r.key === "edge");
  const badgeKind = hostKind || fallbackHostKind(hostIsSemantic);

  const blocks = Array.isArray(chain) ? chain : [];

  // Per-block anchor sieve (nullable). Memoized on [chain, anchors]; a bad/empty
  // anchor set degrades to no chips rather than throwing. `stageByIndex` maps a
  // block's chain index to its {inCount, outCount}; `placed` is the terminal
  // Sequencer's non-rest placement count.
  const sieve = useMemo(() => {
    if (!Array.isArray(anchors)) return null;
    try {
      return sieveCounts(chain, anchors, overrides ? { overrides } : {});
    } catch {
      return null;
    }
  }, [chain, anchors, overrides]);
  const stageByIndex = useMemo(() => {
    const map = new Map();
    if (sieve) for (const s of sieve.stages) map.set(s.blockIndex, s);
    return map;
  }, [sieve]);
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
                hostIsSemantic={hostIsSemantic}
                hostKind={badgeKind}
                stage={stageByIndex.get(i) || null}
                placedCount={
                  block.type === "sequence" && sieve ? sieve.placed : null
                }
                armed={armedRouteIndex === i}
                onSetArmed={
                  onArmRoute ? (next) => onArmRoute(next ? i : null) : undefined
                }
                onPatch={(patch) => onEditChain((c) => setBlock(c, i, patch))}
                onBypass={() => onEditChain((c) => toggleBypass(c, i))}
                onRemove={() => onEditChain((c) => removeBlock(c, i))}
                onEditChain={onEditChain}
                customGlyphs={customGlyphs}
                baseGlyphRef={baseGlyphRef}
                onEditSlotGlyph={onEditSlotGlyph}
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
        className="w-full rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-xs text-ink outline-none focus:border-violet"
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
