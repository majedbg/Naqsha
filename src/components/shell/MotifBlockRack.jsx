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

import { useState, useMemo, useRef, useId, useEffect } from "react";
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
import { useMeasuredWidth } from "../../lib/hooks/useMeasuredWidth";
import { rolesForHost, ALL_ROLES } from "../../lib/motif/hostRoles";
import { hostHasPathStructure } from "../../lib/motif/hostKinds";
import { zonesForRoles } from "../../lib/motif/zones";
import { coerceRoles } from "../../lib/motif/edgeRoles";
import {
  makeBlock,
  canAddBlock,
  addBlock,
  removeBlock,
  setBlock,
  toggleBypass,
  reorderChain,
  addSlot,
  duplicateSlot,
  removeSlot,
  reorderSlots,
  setSlot,
  addZoneSlot,
  duplicateZoneSlot,
  removeZoneSlot,
  reorderZoneSlots,
  setZoneSlot,
  setZoneMode,
  setZoneEnds,
} from "../../lib/motif/chainEditor";
import { GlyphPickerFlyout } from "./GlyphPickerChip";
import { getGlyph, MOTIF_GLYPHS } from "../../lib/motif/glyphs.js";
import { sieveCounts } from "../../lib/motif/sieveCounts.js";
import GlyphThumb from "../ui/GlyphThumb";
import DragNumber from "../ui/DragNumber";
import Menu from "../ui/Menu";
import ScrubNumeral from "../ui/ScrubNumeral";
import {
  SCALE_FORMAT,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_PARSE,
  SCALE_STEP,
} from "../canvas/glyphPopoverPlacement";
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

// Path-scope options (D5). GATED by whether the host's anchors carry PATH
// STRUCTURE — `meta.closed` and `meta.pathIndex` — which is
// `hostHasPathStructure` in hostKinds.js and never a conditional here. Hosts
// without it (grid/recursive/spiral/voronoi/circlepacking) would EMPTY the
// selection under `closed`/`picked`, so they get only {all, open} (open ≡ all
// there, since those anchors carry no `closed` — a safe, harmless superset).
// Edge hosts carry both, and so — as of #152 — does GIRIH, whose straps are
// genuine paths even though its anchors are structural rather than sampled.
const SCOPE_OPTIONS_FLAT = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
];
const SCOPE_OPTIONS_PATHED = [
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
  // Whether this host's anchors carry meta.pathIndex / meta.closed — answered by
  // hostKinds.hostHasPathStructure at the rack level, never re-derived here.
  hostHasPaths = false,
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
  const scopeOptions = hostHasPaths ? SCOPE_OPTIONS_PATHED : SCOPE_OPTIONS_FLAT;
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

      {/* Picked-scope canvas-pick (path-structured hosts only — an anchor with
          no meta.pathIndex has nothing to click). */}
      {scope === "picked" && hostHasPaths && (
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

/* ------------------------------------------------------- slot card icons */

function SlotEyeIcon({ open }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// Two columns of dots — the drag affordance visible before you hover, matching
// GlyphPopover's header rather than the old "⠿" text glyph.
function SlotGripIcon() {
  return (
    <svg width="10" height="13" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      {[4, 7, 10].map((cy) => (
        <g key={cy}>
          <circle cx="3.5" cy={cy} r="0.9" />
          <circle cx="6.5" cy={cy} r="0.9" />
        </g>
      ))}
    </svg>
  );
}

function SlotMoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

// FLIP — two wedges about a dashed mirror axis. FILL carries the state, not
// opacity: outlined wedges read as a DIFFERENT mark at 14px, where a tinted
// copy of the same mark would just read as "disabled".
function SlotFlipIcon({ state }) {
  const fill = state === "on" ? "currentColor" : "none";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor">
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeWidth="1" strokeDasharray="2 1.6" />
      <path d="M6.2 3.6 1.8 8l4.4 4.4z" fill={fill} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M9.8 3.6 14.2 8l-4.4 4.4z" fill={fill} strokeWidth="1.1" strokeLinejoin="round" />
      {state === "off" && <line x1="2" y1="14" x2="14" y2="2" strokeWidth="1.5" />}
    </svg>
  );
}

// ANGLE RANDOMISATION — three ticks from one root: parallel when off (every
// glyph the same), splayed when on.
function SlotAngleRndIcon({ on }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      {on ? (
        <>
          <line x1="8" y1="14" x2="4" y2="4.5" />
          <line x1="8" y1="14" x2="8" y2="3" />
          <line x1="8" y1="14" x2="12" y2="4.5" />
        </>
      ) : (
        <>
          <line x1="4.5" y1="14" x2="4.5" y2="4" />
          <line x1="8" y1="14" x2="8" y2="4" />
          <line x1="11.5" y1="14" x2="11.5" y2="4" />
        </>
      )}
    </svg>
  );
}

// SPREAD — the two distributions drawn as their own shapes: a uniform plateau,
// a triangular bell. The old <select> said "Flat"/"Bell"; this shows them.
function SlotSpreadIcon({ kind }) {
  return (
    <svg width="16" height="12" viewBox="0 0 18 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      {kind === "bell" ? <path d="M1 11 L9 2 L17 11" /> : <path d="M1 11 L1 4 L17 4 L17 11" />}
    </svg>
  );
}

const SPREAD_OPTIONS = [
  { value: "flat", label: "Flat — every angle equally likely" },
  { value: "bell", label: "Bell — clustered near 0°" },
];

// Flip cycles inherit → always → never, which is exactly the tri-state the
// engine reads (`flipSpecified`, sequencer.js:109).
const NEXT_FLIP = { inherit: true, on: false, off: undefined };
const FLIP_LABEL = {
  inherit: "Flip: inherit the layer",
  on: "Flip: always",
  off: "Flip: never (overrides the layer)",
};

const SLOT_ICON_BTN =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-transparent outline-none hover:border-hairline hover:bg-paper-warm hover:text-ink focus-visible:ring-2 focus-visible:ring-violet";

/* ------------------------------------------------------ gesture ↔ undo */

// ONE undo entry per gesture, with the canvas following the drag.
//
// `updateLayer` coalesces by `${id}:params` for 400ms, so every chain write in
// a burst already folds into one entry — including writes from a DIFFERENT
// control, which carry an identical signature. The flush is what draws the
// boundaries: once BEFORE a gesture's first write (so an Inspector burst on the
// same layer cannot swallow it) and once when it commits.
//
// The pointerup listener is not belt-and-braces. `useDragValue` suppresses
// `onCommit` when a gesture ends exactly where it started (useDragValue.js:120)
// — but the intermediate frames DID write — so a latch cleared only by
// `onCommit` would stay open and let the NEXT gesture join this entry. Closing
// unconditionally on pointerup costs a redundant flush at worst (a no-op, the
// same double-flush AnchorGhostOverlay already does around discrete actions).
function useGestureFlush(onFlushHistory) {
  const open = useRef(false);
  // Detaches the pending pointerup, or null when none is armed. The listener
  // MUST NOT outlive either the gesture or the chip: a slot deleted mid-drag
  // would otherwise flush history from a component that no longer exists.
  const detach = useRef(null);
  useEffect(() => () => detach.current?.(), []);

  const close = () => {
    detach.current?.();
    if (!open.current) return;
    open.current = false;
    onFlushHistory();
  };

  const begin = () => {
    if (open.current) return;
    open.current = true;
    onFlushHistory();
    const onUp = () => {
      detach.current = null; // already removed by {once:true}
      close();
    };
    window.addEventListener("pointerup", onUp, { once: true });
    detach.current = () => {
      window.removeEventListener("pointerup", onUp);
      detach.current = null;
    };
  };

  return { begin, end: close };
}

// One sortable Slot chip — the "gutter + inline spread" card (variant D,
// verdict 2026-07-28; docs/motif-slot-card-decisions.md).
//
//   header      eye · grip · "…"          the popover's header, verbatim
//   thumb       tap → the glyph browser
//   [wt]        Random mode only
//   scale %  ⇄  sizeScale, and flip in the gutter
//   +180°    ≋  rotationOffset, and angle-rnd in the gutter
//   ±30°  ▬ ▲   full width, only when angle-rnd is on
//
// The GUTTER holds only the toggles that DISCLOSE; a row angle-rnd opens spans
// the full chip beneath it. A disclosed child row earns full width; a modifier
// of an existing row does not.
//
// Three of these controls surface fields the Slot model has carried since the
// sequencer shipped (`sizeScale`, `rotationOffset`, `flip` — sequencer.js) and
// which only `starterChips.js` could ever write. Their PLACEMENT semantics are
// not the per-glyph popover's, despite the shared look: `sizeScale` multiplies
// the target radius BEFORE the empty-circle test, so scaling repacks the
// neighbours, and `rotationOffset` is RELATIVE to each anchor's base
// orientation — hence the signed readout, and hence no dial (a dial's 12
// o'clock reference is signage for an absolute bearing, which this is not).
//
// Drag rides ONLY the grip (like the block card), so the chip's controls keep
// normal pointer behavior and tapping the glyph opens the browser.
function SortableSlotChip({
  id,
  slot,
  index,
  isRandom,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onEditGlyph,
  onSwapGlyph,
  onManageLibrary,
  onPatch,
  onRemove,
  onDuplicate,
  onFlushHistory = () => {},
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, opacity: 0.85 } : null),
  };
  const effectiveRef = slot?.glyphRef ?? baseGlyphRef;
  // HIDDEN vs REST — one model shape, two chips. Hiding a glyph writes
  // `rest:true` and KEEPS its glyphRef (decision 4: the beat stays empty, the
  // rhythm does not re-flow), so the only thing telling a muted glyph from a
  // deliberate Rest is whether a ref survived. A hidden chip keeps its
  // thumbnail and every control, ghosted; a pure Rest collapses to the plate.
  const isHidden = slot?.rest === true && !!slot?.glyphRef;
  const isRest = slot?.rest === true && !slot?.glyphRef;
  const glyph = isRest ? null : getGlyph(effectiveRef, customGlyphs);
  const rr = slot?.rotationRandom;
  const angleOn = !!rr;
  const weight = slot?.weight != null ? slot.weight : 1;
  const sizeScale = slot?.sizeScale != null ? slot.sizeScale : 1;
  const rotationOffset = slot?.rotationOffset != null ? slot.rotationOffset : 0;
  const flipState = slot?.flip === undefined ? "inherit" : slot.flip ? "on" : "off";

  const [menuOpen, setMenuOpen] = useState(false);
  const gesture = useGestureFlush(onFlushHistory);

  // A discrete edit is its own entry: flush, write, flush.
  const patchOnce = (patch) => {
    gesture.begin();
    onPatch(patch);
    gesture.end();
  };
  // A drag: open on the first live frame, close on commit.
  const patchLive = (patch) => {
    gesture.begin();
    onPatch(patch);
  };
  const patchCommit = (patch) => {
    onPatch(patch);
    gesture.end();
  };

  // The eye writes the EFFECTIVE ref, never a bare `rest:true`. A slot that
  // never named a glyph still draws the layer's base one (`effectiveRef`), and
  // hiding it without recording that ref would make it indistinguishable from a
  // pure Rest — the chip would lose its eye and un-hiding would be impossible.
  const toggleHidden = () =>
    patchOnce(
      slot?.rest === true
        ? { rest: false }
        : { rest: true, glyphRef: effectiveRef },
    );

  // Slot glyph-swap picker (Feature B). The preview button IS the trigger; the
  // flyout is the SAME GlyphPickerFlyout the row chip uses. `firstTile` pins the
  // slot's CURRENT glyph as tile #1 with a pencil badge that opens the pen
  // editor (the old direct-to-editor click). The trigger doubles as the
  // outside-click root, so re-clicking it toggles rather than dismisses.
  const [pickerOpen, setPickerOpen] = useState(false);
  const previewRef = useRef(null);
  const pickerId = useId();
  const closePicker = (restoreFocus = true) => {
    setPickerOpen(false);
    if (restoreFocus) previewRef.current?.focus();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="motif-slot"
      data-slot-index={index}
      data-slot-rest={isRest ? "true" : "false"}
      data-slot-hidden={isHidden ? "true" : undefined}
      className={`flex w-[124px] shrink-0 flex-col gap-0.5 self-start rounded-cell border border-hairline bg-paper p-1 ${
        isHidden ? "opacity-45" : ""
      }`}
    >
      {/* header — eye · grip · "…" */}
      <div className="flex items-center justify-between gap-1">
        {isRest ? (
          // A deliberate Rest is already an empty beat; there is nothing to hide.
          <span className="h-5 w-5 shrink-0" />
        ) : (
          <button
            type="button"
            data-testid="motif-slot-eye"
            aria-label={isHidden ? "Show glyph" : "Hide glyph"}
            aria-pressed={isHidden}
            title={isHidden ? "Show glyph" : "Hide glyph — the beat stays empty"}
            onClick={toggleHidden}
            className={`${SLOT_ICON_BTN} ${isHidden ? "text-saffron" : "text-ink-soft"}`}
          >
            <SlotEyeIcon open={!isHidden} />
          </button>
        )}
        <button
          type="button"
          data-testid="motif-slot-grip"
          aria-label="Drag to reorder slot"
          className="flex flex-1 cursor-grab touch-none justify-center text-ink-soft/50 hover:text-ink"
          {...attributes}
          {...listeners}
        >
          <SlotGripIcon />
        </button>
        <span className="relative">
          <button
            type="button"
            data-testid="motif-slot-menu"
            aria-label="Slot actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Duplicate · reset · delete"
            onClick={() => setMenuOpen((o) => !o)}
            className={`${SLOT_ICON_BTN} ${
              menuOpen ? "border-hairline bg-paper-warm text-ink" : "text-ink-soft"
            }`}
          >
            <SlotMoreIcon />
          </button>
          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            ariaLabel="Slot actions"
            testId="motif-slot-menu-list"
            className="absolute right-0 top-full z-50 mt-2xs min-w-[132px] rounded-sm border border-hairline bg-paper p-1 shadow-pop"
            items={[
              { label: "Duplicate slot", onActivate: onDuplicate },
              {
                label: "Reset settings",
                onActivate: () =>
                  patchOnce({
                    sizeScale: undefined,
                    rotationOffset: undefined,
                    flip: undefined,
                    rotationRandom: undefined,
                    weight: undefined,
                  }),
              },
              { separator: true },
              { label: "Delete slot", onActivate: onRemove },
            ]}
          />
        </span>
      </div>

      {isRest ? (
        <div
          data-testid="motif-slot-rest"
          className="flex h-11 items-center justify-center rounded-xs border border-dashed border-hairline text-2xs font-medium uppercase tracking-wider text-ink-soft/70"
        >
          Rest
        </div>
      ) : (
        <>
          <button
            type="button"
            ref={previewRef}
            data-testid="motif-slot-edit"
            aria-label="Swap slot glyph"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            aria-controls={pickerId}
            title="Swap this slot's glyph"
            onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
            className={`flex h-11 items-center justify-center rounded-xs border bg-paper-warm text-ink-soft hover:border-violet hover:text-ink ${
              pickerOpen ? "border-accent/60" : "border-hairline"
            }`}
          >
            {/* The shared thumbnail, not a local SVG: this swatch used to
                hard-code `viewBox="-12 -12 24 24"` and draw only paths[0], so an
                imported glyph (art in its source user space, often ~96 units
                around (55,55)) rendered as an EMPTY box. GlyphThumb frames each
                glyph's real extent and draws every path. */}
            {glyph?.paths?.[0]?.d ? (
              <GlyphThumb glyph={glyph} size={38} />
            ) : (
              <svg width="38" height="38" viewBox="-12 -12 24 24" aria-hidden="true">
                <circle r="6" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
              </svg>
            )}
          </button>
          {pickerOpen && (
            <GlyphPickerFlyout
              onRequestClose={closePicker}
              triggerRef={previewRef}
              rootRef={previewRef}
              flyoutId={pickerId}
              glyphRef={effectiveRef}
              customGlyphs={customGlyphs}
              libraryMotifs={libraryMotifs}
              onManageLibrary={onManageLibrary}
              onPick={(payload) => onSwapGlyph(index, payload)}
              firstTile={{
                glyphId: effectiveRef,
                glyph,
                name: glyph?.name || effectiveRef || "Current",
                onEdit: () => {
                  // Close WITHOUT refocusing the preview — the pen editor takes
                  // over focus — then open the editor for this slot.
                  closePicker(false);
                  onEditGlyph(index, effectiveRef);
                },
              }}
            />
          )}
        </>
      )}

      {/* Weight — Random mode only (positional in Cycle). Rests carry a weight too. */}
      {isRandom && (
        <DragNumber
          value={weight}
          min={0}
          max={5}
          step={0.5}
          label="Weight"
          title="Drag \u2195 \u00b7 how often Random picks this slot"
          format={(v) => `wt ${Number(v).toFixed(1)}`}
          parse={(t) => parseFloat(String(t).replace(/[^\d.]/g, ""))}
          slotWidth="6ch"
          testId="motif-slot-weight"
          onChange={(v) => patchLive({ weight: v })}
          onCommit={(v) => patchCommit({ weight: v })}
        />
      )}

      {/* The value column and its GUTTER of disclosing toggles. A Rest has no
          glyph to scale, turn or flip, so it carries none of this. */}
      {!isRest && (
        <div className="flex gap-0.5">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Scale — a multiplier over the layer's Size, on the popover's own
                scale (same constants, so 140% means the same thing in both). */}
            <DragNumber
              value={sizeScale}
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              mapping="geometric"
              format={SCALE_FORMAT}
              parse={SCALE_PARSE}
              label="Glyph scale"
              title="Drag \u2195 to size every instance \u00b7 neighbours repack"
              slotWidth="5ch"
              testId="motif-slot-scale"
              onChange={(v) => patchLive({ sizeScale: v })}
              onCommit={(v) => patchCommit({ sizeScale: v })}
            />
            {/* Rotation — SIGNED, because this is an offset from each anchor's
                base orientation, not a bearing. Stored 0..359 (the engine adds
                it to the base), displayed \u2212179..+180 so "turn it back a bit"
                reads as a negative number rather than as 340. */}
            <DragNumber
              value={rotationOffset}
              min={0}
              max={359}
              step={1}
              label="Rotation offset"
              title="Drag \u2195 \u00b7 degrees turned FROM the path direction"
              format={(v) => `${v > 180 ? v - 360 : v > 0 ? `+${v}` : v}\u00b0`}
              parse={(t) => {
                const n = parseFloat(String(t).replace(/[^\d.+-]/g, ""));
                return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0;
              }}
              slotWidth="5ch"
              testId="motif-slot-rotation"
              onChange={(v) => patchLive({ rotationOffset: v })}
              onCommit={(v) => patchCommit({ rotationOffset: v })}
            />
          </div>
          <div className="flex w-[22px] shrink-0 flex-col items-center gap-0.5 border-l border-hairline/60 pl-0.5">
            {/* Flip \u2014 TRI-state, because `flipSpecified` is: absent inherits the
                layer's Flip, true/false override it. A two-state toggle would
                lose the ability to un-flip ONE slot under a flipped layer. */}
            <button
              type="button"
              data-testid="motif-slot-flip"
              aria-label={FLIP_LABEL[flipState]}
              title={FLIP_LABEL[flipState]}
              onClick={() => patchOnce({ flip: NEXT_FLIP[flipState] })}
              className={`${SLOT_ICON_BTN} ${
                flipState === "inherit" ? "text-ink-soft/45" : "text-ink"
              }`}
            >
              <SlotFlipIcon state={flipState} />
            </button>
            {/* Angle randomisation \u2014 both the switch and the disclosure. */}
            <button
              type="button"
              data-testid="motif-slot-anglerand"
              aria-label="Angle randomization"
              aria-pressed={angleOn}
              title={angleOn ? "Angle randomisation on" : "Randomise each glyph's angle"}
              onClick={() =>
                patchOnce({
                  rotationRandom: angleOn ? undefined : { range: 30, spread: "flat" },
                })
              }
              className={`${SLOT_ICON_BTN} ${angleOn ? "text-saffron" : "text-ink-soft/45"}`}
            >
              <SlotAngleRndIcon on={angleOn} />
            </button>
          </div>
        </div>
      )}

      {/* The disclosed row spans the FULL chip, under the gutter: at 22px the
          lane cannot hold the range and both spreads side by side, and stacking
          them was the thing this layout set out to avoid. A disclosed child row
          earns full width; a modifier of an existing row does not. */}
      {!isRest && angleOn && (
        <div className="flex items-center justify-between gap-0.5">
          <DragNumber
            value={rr.range ?? 0}
            min={0}
            max={180}
            step={1}
            label="Angle range"
            title="Drag \u2195 \u00b7 \u00b1 degrees either side"
            format={(v) => `\u00b1${Math.round(v)}\u00b0`}
            parse={(t) => parseFloat(String(t).replace(/[^\d.]/g, ""))}
            slotWidth="4ch"
            testId="motif-slot-range"
            onChange={(v) => patchLive({ rotationRandom: { ...rr, range: v } })}
            onCommit={(v) => patchCommit({ rotationRandom: { ...rr, range: v } })}
          />
          <span className="flex items-center gap-px" data-testid="motif-slot-spread">
            {SPREAD_OPTIONS.map((o) => {
              const active = (rr.spread === "bell" ? "bell" : "flat") === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-testid={`motif-slot-spread-${o.value}`}
                  aria-label={o.value}
                  aria-pressed={active}
                  title={o.label}
                  onClick={() => patchOnce({ rotationRandom: { ...rr, spread: o.value } })}
                  className={`${SLOT_ICON_BTN} ${
                    active ? "border-hairline bg-paper-warm text-ink" : "text-ink-soft/45"
                  }`}
                >
                  <SlotSpreadIcon kind={o.value} />
                </button>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

// Cycle | Random deal toggle, shared by the flat Sequencer and each Zone. The
// Continuous checkbox (a CYCLE-mode control, documented no-op in Random — D10)
// renders only when `continuousTestid` is supplied (the flat card; zones omit
// it — their per-path restart is a zone-aware engine default per ADR 0008).
function DealModeToggle({
  mode,
  continuous,
  modeTestid,
  continuousTestid,
  onSetMode,
  onSetContinuous,
}) {
  const isRandom = (mode || "cycle") === "random";
  return (
    <div className="flex items-center gap-1" data-testid={modeTestid}>
      {["cycle", "random"].map((m) => {
        const active = (mode || "cycle") === m;
        return (
          <button
            key={m}
            type="button"
            data-testid={`${modeTestid}-${m}`}
            aria-pressed={active}
            onClick={() => onSetMode(m)}
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
      {continuousTestid && !isRandom && (
        <label className="ml-1 flex items-center gap-1 text-2xs text-ink-soft">
          <input
            type="checkbox"
            data-testid={continuousTestid}
            aria-label="Continuous across paths"
            checked={!!continuous}
            onChange={(e) => onSetContinuous(e.target.checked)}
          />
          <span>Continuous</span>
        </label>
      )}
    </div>
  );
}

// The Apex end-selector (ADR 0008): which strand end flowers — both / upper /
// lower. Rendered as inline VECTOR arrows (never text arrows): a double-headed
// vertical arrow for 'both', a single up/down arrow otherwise. The choice is
// SPATIAL (y-then-x), never drawing order — the vertical arrow reads that.
const END_OPTIONS = [
  { value: "both", label: "Both ends", d: "M8 3v10M5 6l3-3 3 3M5 10l3 3 3-3" },
  { value: "up", label: "Upper end", d: "M8 3v10M5 6l3-3 3 3" },
  { value: "down", label: "Lower end", d: "M8 3v10M5 10l3 3 3-3" },
];

function EndSelector({ ends, onSetEnds }) {
  const value = ends || "both";
  return (
    <div className="flex items-center gap-1" data-testid="motif-zone-ends">
      {END_OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            aria-pressed={active}
            title={o.label}
            onClick={() => onSetEnds(o.value)}
            className={`flex h-6 w-6 items-center justify-center rounded-xs border transition-colors ${
              active
                ? "border-violet bg-violet/15 text-ink"
                : "border-hairline bg-paper text-ink-soft hover:border-violet"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={o.d} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// The horizontal slot strip (nested, isolated dnd) + the + Glyph / + Rest
// adders. Shared by the flat Sequencer and every Zone; the caller binds the
// slot ops (flat vs zone-addressed) and passes a unique `idPrefix` so each
// zone's drag ids never collide. Cross-strip drag is not supported — each strip
// owns its own DndContext, so a drag never crosses a zone boundary.
function SlotStrip({
  slots,
  isRandom,
  idPrefix,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onReorder,
  onAddGlyph,
  onAddRest,
  onSetSlot,
  onRemoveSlot,
  onDuplicateSlot,
  onFlushHistory,
  onEditSlot,
  onSwapSlot,
}) {
  const slotIds = slots.map((_, i) => `${idPrefix}-${i}`);
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
    onReorder(from, to);
  };

  return (
    <>
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
                libraryMotifs={libraryMotifs}
                baseGlyphRef={baseGlyphRef}
                onManageLibrary={onManageLibrary}
                onEditGlyph={(slotIndex, glyphRef) => onEditSlot(slotIndex, glyphRef)}
                onSwapGlyph={(slotIndex, payload) => onSwapSlot(slotIndex, payload)}
                onPatch={(patch) => onSetSlot(i, patch)}
                onRemove={() => onRemoveSlot(i)}
                onDuplicate={() => onDuplicateSlot(i)}
                onFlushHistory={onFlushHistory}
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
          onClick={onAddGlyph}
          className="rounded-xs border border-hairline bg-paper px-2 py-0.5 text-2xs text-ink-soft hover:border-violet hover:text-ink"
        >
          + Glyph
        </button>
        <button
          type="button"
          data-testid="motif-slot-add-rest"
          aria-label="Add rest"
          onClick={onAddRest}
          className="rounded-xs border border-hairline bg-paper px-2 py-0.5 text-2xs text-ink-soft hover:border-violet hover:text-ink"
        >
          + Rest
        </button>
      </div>
    </>
  );
}

// Maker-facing Zone vocabulary (CONTEXT.md — Apex/Stem/Cell). The ⓘ tooltip copy
// is the short maker-facing explanation of each Zone: WHERE it is — em dash —
// WHAT happens there, plus an optional short caveat.
//
// CELL (#150) is the first Zone that cannot use the word "path" of itself, which
// is why the botanical register breaks there. Its label is singular against the
// Route block's plural "Cells" checkbox, continuing the contrast the rack already
// runs — Apex ↔ Tips, Stem ↔ Edges.
const ZONE_LABELS = { apex: "Apex", stem: "Stem", cell: "Cell" };
const ZONE_TOOLTIPS = {
  apex: "The ends of each path — where the vine flowers. A closed loop has no Apex.",
  stem: "The body of the path — interior points and junctions, where leaves sprout.",
  cell:
    "The enclosed areas of the pattern — each tile, circle or face takes a glyph of its own. " +
    "Some patterns are all cells and no path.",
};

// One Zone SECTION of a zoned Sequencer (ADR 0008): a titled partition with its
// own deal toggle, the Apex-only end-selector, and its own slot strip. Every
// mutation is zone-addressed by the Zone's `zone` FIELD (never its array index).
function ZoneSection({
  zone,
  seqIndex,
  onEditChain,
  onFlushHistory,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onEditSlotGlyph,
  onSwapSlotGlyph,
}) {
  const zoneId = zone.zone;
  const slots = Array.isArray(zone.slots) ? zone.slots : [];
  const isRandom = zone.mode === "random";
  const isApex = zoneId === "apex";
  const name = ZONE_LABELS[zoneId] || zoneId;

  return (
    <div
      data-testid="motif-zone"
      data-zone={zoneId}
      className="space-y-2 rounded-xs border border-hairline/70 bg-paper/40 p-1.5"
    >
      <div className="flex items-center gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-soft">
          {name}
        </span>
        {/* Info affordance — hover/focus tooltip explains the Zone (title idiom;
            no reusable shell Tooltip to couple to). */}
        <button
          type="button"
          data-testid="motif-zone-info"
          aria-label={`About ${name}`}
          title={ZONE_TOOLTIPS[zoneId] || ""}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-hairline text-2xs leading-none text-ink-soft/70 hover:text-ink"
        >
          <span aria-hidden="true">i</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DealModeToggle
          mode={zone.mode}
          modeTestid="motif-zone-mode"
          onSetMode={(m) => onEditChain((c) => setZoneMode(c, seqIndex, zoneId, { mode: m }))}
        />
        {isApex && (
          <EndSelector
            ends={zone.ends}
            onSetEnds={(e) => onEditChain((c) => setZoneEnds(c, seqIndex, zoneId, e))}
          />
        )}
      </div>

      <SlotStrip
        slots={slots}
        isRandom={isRandom}
        idPrefix={`zone-${zoneId}`}
        customGlyphs={customGlyphs}
        libraryMotifs={libraryMotifs}
        baseGlyphRef={baseGlyphRef}
        onManageLibrary={onManageLibrary}
        onReorder={(f, t) => onEditChain((c) => reorderZoneSlots(c, seqIndex, zoneId, f, t))}
        onAddGlyph={() => onEditChain((c) => addZoneSlot(c, seqIndex, zoneId, { glyphRef: baseGlyphRef }))}
        onAddRest={() => onEditChain((c) => addZoneSlot(c, seqIndex, zoneId, { rest: true }))}
        onSetSlot={(i, patch) => onEditChain((c) => setZoneSlot(c, seqIndex, zoneId, i, patch))}
        onRemoveSlot={(i) => onEditChain((c) => removeZoneSlot(c, seqIndex, zoneId, i))}
        onDuplicateSlot={(i) => onEditChain((c) => duplicateZoneSlot(c, seqIndex, zoneId, i))}
        onFlushHistory={onFlushHistory}
        onEditSlot={(i, ref) => onEditSlotGlyph(seqIndex, i, ref, zoneId)}
        onSwapSlot={(i, payload) => onSwapSlotGlyph({ seqIndex, zone: zoneId, slotIndex: i }, payload)}
      />
    </div>
  );
}

function SequenceCardBody({
  block,
  seqIndex,
  liveZones,
  onEditChain,
  onFlushHistory,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onEditSlotGlyph,
  onSwapSlotGlyph,
}) {
  // ZONED (ADR 0008): one SECTION per Zone instead of the flat slot row, in the
  // chain's STORED order — Apex → Stem → Cell, as the chip factories author it.
  //
  // Only the Zones this host can actually FILL are shown (#150): a cell-only host
  // has no path to flower or leaf along, so rendering an Apex and a Stem there
  // would offer the maker two sections that can never receive an anchor. This is
  // a VIEW, never a write — the chain keeps every Zone it carries, so switching
  // host re-reveals them and the mode's Zone skeleton is unchanged. `liveZones`
  // is null for callers that name no host, which then see everything.
  if (Array.isArray(block.zones)) {
    const shown = liveZones ? block.zones.filter((z) => liveZones.includes(z?.zone)) : block.zones;
    return (
      <div className="space-y-2" data-testid="motif-seq-zones">
        {shown.map((zone) => (
          <ZoneSection
            key={zone.zone}
            zone={zone}
            seqIndex={seqIndex}
            onEditChain={onEditChain}
            onFlushHistory={onFlushHistory}
            customGlyphs={customGlyphs}
            libraryMotifs={libraryMotifs}
            baseGlyphRef={baseGlyphRef}
            onManageLibrary={onManageLibrary}
            onEditSlotGlyph={onEditSlotGlyph}
            onSwapSlotGlyph={onSwapSlotGlyph}
          />
        ))}
      </div>
    );
  }

  // FLAT — today's rendering exactly (one run of Slots over every survivor).
  const slots = Array.isArray(block.slots) ? block.slots : [];
  const isRandom = block.mode === "random";
  return (
    <div className="space-y-2">
      <DealModeToggle
        mode={block.mode}
        continuous={block.continuous}
        modeTestid="motif-seq-mode"
        continuousTestid="motif-seq-continuous"
        onSetMode={(m) => onEditChain((c) => setBlock(c, seqIndex, { mode: m }))}
        onSetContinuous={(v) => onEditChain((c) => setBlock(c, seqIndex, { continuous: v }))}
      />
      <SlotStrip
        slots={slots}
        isRandom={isRandom}
        idPrefix="slot"
        customGlyphs={customGlyphs}
        libraryMotifs={libraryMotifs}
        baseGlyphRef={baseGlyphRef}
        onManageLibrary={onManageLibrary}
        onReorder={(f, t) => onEditChain((c) => reorderSlots(c, seqIndex, f, t))}
        onAddGlyph={() => onEditChain((c) => addSlot(c, seqIndex, { glyphRef: baseGlyphRef }))}
        onAddRest={() => onEditChain((c) => addSlot(c, seqIndex, { rest: true }))}
        onSetSlot={(i, patch) => onEditChain((c) => setSlot(c, seqIndex, i, patch))}
        onRemoveSlot={(i) => onEditChain((c) => removeSlot(c, seqIndex, i))}
        onDuplicateSlot={(i) => onEditChain((c) => duplicateSlot(c, seqIndex, i))}
        onFlushHistory={onFlushHistory}
        onEditSlot={(i, ref) => onEditSlotGlyph(seqIndex, i, ref)}
        onSwapSlot={(i, payload) => onSwapSlotGlyph({ seqIndex, slotIndex: i }, payload)}
      />
    </div>
  );
}

function BlockCardBody({
  block,
  index,
  roleOptions,
  hostHasPaths,
  liveZones,
  armed,
  onSetArmed,
  onPatch,
  onEditChain,
  onFlushHistory,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onEditSlotGlyph,
  onSwapSlotGlyph,
}) {
  switch (block.type) {
    case "route":
      return (
        <RouteCardBody
          block={block}
          roleOptions={roleOptions}
          hostHasPaths={hostHasPaths}
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
          liveZones={liveZones}
          onEditChain={onEditChain}
          onFlushHistory={onFlushHistory}
          customGlyphs={customGlyphs}
          libraryMotifs={libraryMotifs}
          baseGlyphRef={baseGlyphRef}
          onManageLibrary={onManageLibrary}
          onEditSlotGlyph={onEditSlotGlyph}
          onSwapSlotGlyph={onSwapSlotGlyph}
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
  hostHasPaths,
  liveZones,
  hostKind,
  armed,
  onSetArmed,
  onPatch,
  onBypass,
  onRemove,
  onEditChain,
  onFlushHistory,
  customGlyphs,
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onEditSlotGlyph,
  onSwapSlotGlyph,
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
      hostHasPaths={hostHasPaths}
      liveZones={liveZones}
      armed={armed}
      onSetArmed={onSetArmed}
      onPatch={onPatch}
      onEditChain={onEditChain}
      onFlushHistory={onFlushHistory}
      customGlyphs={customGlyphs}
      libraryMotifs={libraryMotifs}
      baseGlyphRef={baseGlyphRef}
      onManageLibrary={onManageLibrary}
      onEditSlotGlyph={onEditSlotGlyph}
      onSwapSlotGlyph={onSwapSlotGlyph}
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
        {/* One-line header that WRAPS when narrow: below ~a rail's worth of width
            the summary control (Route's role toggles / everyN strip) would
            otherwise collapse its container to 0 and paint its fixed-width
            buttons left over the block name. flex-wrap + a content-sized summary
            (no min-w-0 below) drops it to a second line instead of overlapping. */}
        <div className="flex min-h-[28px] flex-wrap items-center gap-1.5 px-2 py-1">
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
          <div className="flex flex-1 items-center justify-end">
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
  // Closes the current undo-coalescing window. `updateLayer` merges every write
  // carrying the same `${id}:params` signature for 400ms, so a slot-card drag
  // would otherwise fold into whatever burst preceded it; the slot chip flushes
  // once before a gesture's first write and once when it commits, which is
  // exactly one entry per gesture with the canvas following throughout. Same
  // seam the canvas glyph popover uses (Studio.jsx, onFlushHistory).
  onFlushHistory = () => {},
  hostIsSemantic = true,
  // The HOST's registry id + live params. Threaded so the Route block can ask the
  // ONE host-capability seam (rolesForHost, #146) which roles this host actually
  // emits, instead of guessing from the semantic/edge split. Omitted by bare
  // callers (tests, legacy) → the pre-#146 semantic/edge fallback below.
  hostPatternType,
  hostParams,
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
  libraryMotifs,
  baseGlyphRef,
  onManageLibrary,
  onEditSlotGlyph,
  // Slot glyph-swap (Feature B). `onSwapSlotGlyph(address, payload)` where
  // address is {seqIndex, slotIndex} (flat) or {seqIndex, zone, slotIndex}
  // (zoned) and payload is the GlyphPickerFlyout emission {kind, glyphId,
  // glyph}. The parent (MotifDevice) owns the builtin/custom-vs-library commit
  // routing; a bare caller may omit it (the picker still opens, swap is inert).
  onSwapSlotGlyph = () => {},
}) {
  const dock = useInspectorDockContext();
  // Orientation follows the rack's ACTUAL width, not the dock position. The rack
  // always sits in a NARROW sub-column — the w-28 mode column beside it on the
  // rail, a ~256px module on the shelf — so the old "bottom shelf ⇒ horizontal"
  // rule cramped the chain into a scroll strip you paged through one 160px card
  // at a time. Go horizontal only when there's genuine room for a left→right
  // chain (≥2 cards); fall back to the dock hint before the first measurement
  // (jsdom / SSR / first paint) so the unmeasured default stays deterministic.
  const [rackRef, rackWidth] = useMeasuredWidth();
  const HORIZONTAL_MIN = 340; // ≈ 2 × min-w-[160px] cards + gap
  const orientation =
    rackWidth != null
      ? rackWidth >= HORIZONTAL_MIN
        ? "horizontal"
        : "vertical"
      : dock?.dockPosition === "bottom"
        ? "horizontal"
        : "vertical";

  // WHICH ROLES THIS HOST EMITS. Answered by the single params-aware capability
  // seam (src/lib/motif/hostRoles.js) — never by a conditional here, so the
  // Inspector, the Route UI and the overlay cannot drift (PRD #143, module E).
  // On an edge host that is Edges alone; on Circle Packing it is Cells alone.
  // Bare callers (tests, legacy) that pass no hostPatternType keep the previous
  // semantic/edge split verbatim.
  const emitted = hostPatternType
    ? rolesForHost(hostPatternType, hostParams)
    : hostIsSemantic
      ? ALL_ROLES
      : ["edge"];
  const roleOptions = ROLE_OPTIONS_SEMANTIC.filter((r) => emitted.includes(r.key));
  // WHETHER THIS HOST'S ANCHORS CARRY PATH STRUCTURE — the gate on the Route
  // card's Closed / Open / Picked scopes and on the canvas strap picker. Asked of
  // the one predicate in hostKinds.js, so this surface and AnchorGhostOverlay
  // cannot drift. Bare callers (tests, legacy) that name no host keep the
  // pre-#152 behaviour exactly: the legacy `hostIsSemantic` boolean's inverse,
  // which is what "is an edge host" meant to those callers.
  const hostHasPaths = hostPatternType
    ? hostHasPathStructure(hostPatternType, hostParams)
    : !hostIsSemantic;
  // WHICH ZONES THIS HOST CAN ACTUALLY FILL (#150). The role→Zone reading rule is
  // `zonesForRoles`, which lives beside the partitioner that implements it — the
  // rack asks, it never decides. Fed by `emitted` above, so there is still exactly
  // ONE host→roles seam. `null` for callers that name no host: they keep the
  // pre-#150 behaviour of rendering every Zone the chain carries.
  const liveZones = hostPatternType ? zonesForRoles(emitted) : null;
  const badgeKind = hostKind || fallbackHostKind(hostIsSemantic);

  const blocks = Array.isArray(chain) ? chain : [];

  // Per-block anchor sieve (nullable). Memoized on [chain, anchors]; a bad/empty
  // anchor set degrades to no chips rather than throwing. `stageByIndex` maps a
  // block's chain index to its {inCount, outCount}; `placed` is the terminal
  // Sequencer's non-rest placement count.
  // THE CHAIN THE CANVAS ACTUALLY RUNS (#154, amendment A2). The render resolves
  // a Route block's stored roles against what the host emits (`coerceRoles`), so
  // counting the RAW chain here would make the card read "→ 0" beside a canvas
  // full of glyphs — the same dots-vs-glyphs divergence in its third surface. The
  // ONE function the render and the overlay call, never a conditional grown here.
  //
  // `anchorMode` is derived from the HOST, exactly as AnchorGhostOverlay derives
  // it, because it must describe the anchor set the chips are counting — the
  // `anchors` prop is the SEMANTIC extractor's output (Inspector.hostAnchors).
  // `hostIsSemantic` is the pre-#146 fallback for bare callers that name no host;
  // it is literally the rule defaultBinding.js / starterChips.js use to WRITE
  // anchorMode. Do NOT "simplify" this to `?? 'edge'`: that would send every bare
  // caller down the edge branch and rewrite its roles to ['edge'] before counting.
  const sieveChain = useMemo(() => {
    const blocksIn = Array.isArray(chain) ? chain : [];
    const coerced = coerceRoles(
      { chain: blocksIn },
      {
        type: hostPatternType,
        params: hostParams,
        anchorMode: hostIsSemantic ? "semantic" : "edge",
      }
    );
    return Array.isArray(coerced.chain) ? coerced.chain : blocksIn;
  }, [chain, hostPatternType, hostParams, hostIsSemantic]);

  const sieve = useMemo(() => {
    if (!Array.isArray(anchors)) return null;
    try {
      return sieveCounts(sieveChain, anchors, overrides ? { overrides } : {});
    } catch {
      return null;
    }
  }, [sieveChain, anchors, overrides]);
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
    <div ref={rackRef} className="space-y-2" data-testid="motif-rack" data-orientation={orientation}>
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
                : // overflow-x-auto is a FLOOR: after the row stacks (P1) the
                  // vertical rack gets full width and the min-w-[160px] cards fit,
                  // but if it's ever narrower than a card this scrolls the rack
                  // instead of pushing a scrollbar onto the whole inspector.
                  "flex flex-col gap-2 overflow-x-auto"
            }
          >
            {blocks.map((block, i) => (
              <SortableBlockCard
                key={ids[i]}
                id={ids[i]}
                block={block}
                index={i}
                roleOptions={roleOptions}
                hostHasPaths={hostHasPaths}
                liveZones={liveZones}
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
                onFlushHistory={onFlushHistory}
                customGlyphs={customGlyphs}
                libraryMotifs={libraryMotifs}
                baseGlyphRef={baseGlyphRef}
                onManageLibrary={onManageLibrary}
                onEditSlotGlyph={onEditSlotGlyph}
                onSwapSlotGlyph={onSwapSlotGlyph}
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
