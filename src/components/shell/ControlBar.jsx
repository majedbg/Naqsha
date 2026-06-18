// ControlBar — the pro shell's row-2 contextual control bar (Lane B / B6, issue
// #9). Its contents swap by the active tool / selection (decision 9):
//
//   Text   -> font / size / align + outline<->single-line toggle
//   Select -> align / arrange
//   nothing selected -> document quick-info
//
// Plus the always-present stroke/operation swatch (its picker is #11; rendered
// here as a chip with a stubbed click).
//
// IMPORTANT scope note: this app has no text-object model yet — the Text Tool
// Plan (TextNode / lineMode / opentype) is a separate, NOT-built effort. So the
// Text controls below are real, interactive widgets backed by LOCAL state; they
// are intentionally inert with respect to a text model until that plan ships.
// B6 is the *wiring* slice — presence + contextual swapping — which is what the
// acceptance criteria require.

import { useState } from "react";

const FONTS = ["Inter", "Georgia", "Courier", "Helvetica"];
const ALIGNMENTS = [
  { id: "left", label: "Align left" },
  { id: "center", label: "Align center" },
  { id: "right", label: "Align right" },
];
const ARRANGE = [
  { id: "front", label: "Bring to front" },
  { id: "forward", label: "Bring forward" },
  { id: "backward", label: "Send backward" },
  { id: "back", label: "Send to back" },
];

function OperationSwatch({ operation }) {
  const op = operation ?? { name: "Cut", color: "#e23b3b" };
  return (
    <button
      type="button"
      aria-label={`Operation: ${op.name}`}
      title={`Operation: ${op.name} (picker coming soon)`}
      onClick={() => {
        /* operation picker is issue #11 — stubbed no-op */
      }}
      className="flex items-center gap-1.5 rounded-sm border border-hairline px-1.5 py-0.5 hover:bg-paper-warm transition-colors duration-fast ease-out-quart"
    >
      <span
        className="block h-3.5 w-3.5 rounded-xs border border-hairline"
        style={{ backgroundColor: op.color }}
      />
      <span className="text-[11px] text-ink-soft">{op.name}</span>
    </button>
  );
}

function AlignGroup() {
  return (
    <div
      role="group"
      aria-label="Align"
      className="flex items-center gap-0.5 rounded-sm border border-hairline p-0.5"
    >
      {ALIGNMENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-label={a.label}
          title={a.label}
          className="rounded-xs px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-paper-warm hover:text-ink transition-colors duration-fast ease-out-quart"
        >
          {a.id === "left" ? "⇤" : a.id === "center" ? "↔" : "⇥"}
        </button>
      ))}
    </div>
  );
}

function TextControls() {
  const [font, setFont] = useState(FONTS[0]);
  const [size, setSize] = useState(24);
  // outline = the path-outline render mode; when false the glyph is a single-
  // line (engrave) stroke. This is the outline<->single-line toggle (decision 9).
  const [outline, setOutline] = useState(true);

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-ink-soft">
        <span className="sr-only">Font</span>
        <select
          aria-label="Font"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink"
        >
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-[11px] text-ink-soft">
        <span className="sr-only">Size</span>
        <input
          aria-label="Size"
          type="number"
          min={1}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-[11px] text-ink"
        />
      </label>

      <AlignGroup />

      <button
        type="button"
        aria-label={outline ? "Outline (switch to single-line)" : "Single-line (switch to outline)"}
        aria-pressed={outline}
        title="Toggle outline / single-line"
        onClick={() => setOutline((v) => !v)}
        className={`rounded-sm border border-hairline px-2 py-0.5 text-[11px] transition-colors duration-fast ease-out-quart ${
          outline ? "bg-saffron text-ink" : "text-ink-soft hover:bg-paper-warm hover:text-ink"
        }`}
      >
        {outline ? "Outline" : "Single-line"}
      </button>
    </div>
  );
}

function SelectControls() {
  return (
    <div className="flex items-center gap-2">
      <AlignGroup />
      <div
        role="group"
        aria-label="Arrange"
        className="flex items-center gap-0.5 rounded-sm border border-hairline p-0.5"
      >
        {ARRANGE.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-label={a.label}
            title={a.label}
            className="rounded-xs px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-paper-warm hover:text-ink transition-colors duration-fast ease-out-quart"
          >
            {a.id === "front" ? "⤒" : a.id === "forward" ? "↑" : a.id === "backward" ? "↓" : "⤓"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoomControls({ view }) {
  const zoomPercent = Math.round((view?.zoom ?? 1) * 100);
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="flex items-center gap-0.5 rounded-sm border border-hairline p-0.5"
    >
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => view?.zoomOut?.()}
        className="rounded-xs px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-paper-warm hover:text-ink transition-colors duration-fast ease-out-quart"
      >
        −
      </button>
      <button
        type="button"
        aria-label="Reset zoom"
        title="Reset zoom"
        onClick={() => view?.reset?.()}
        className="num min-w-[40px] px-1 text-center text-[11px] text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => view?.zoomIn?.()}
        className="rounded-xs px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-paper-warm hover:text-ink transition-colors duration-fast ease-out-quart"
      >
        +
      </button>
    </div>
  );
}

function HandInfo() {
  return (
    <span aria-label="Hand tool" className="text-[11px] text-ink-soft">
      Drag to pan the canvas
    </span>
  );
}

function DocumentInfo({ docInfo }) {
  const { canvasW, canvasH, unit = "mm", layerCount = 0 } = docInfo ?? {};
  return (
    <div
      aria-label="Document quick-info"
      className="flex items-center gap-3 text-[11px] text-ink-soft"
    >
      <span className="num">
        {canvasW} × {canvasH} {unit}
      </span>
      <span className="text-ink-soft/60">·</span>
      <span className="num">
        {layerCount} layer{layerCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export default function ControlBar({
  activeTool = "select",
  hasSelection = false,
  docInfo,
  operation,
  view,
}) {
  // Decide which contextual cluster to show (decision 9). Text -> text controls;
  // Zoom -> zoom controls; Hand -> pan hint; Select (or default) with a selection
  // -> align/arrange; nothing selected -> document quick-info.
  let context;
  if (activeTool === "text") {
    context = <TextControls />;
  } else if (activeTool === "zoom") {
    context = <ZoomControls view={view} />;
  } else if (activeTool === "hand") {
    context = <HandInfo />;
  } else if (hasSelection) {
    context = <SelectControls />;
  } else {
    context = <DocumentInfo docInfo={docInfo} />;
  }

  return (
    <div className="flex h-full items-center gap-3 px-3">
      {context}
      <div className="ml-auto">
        <OperationSwatch operation={operation} />
      </div>
    </div>
  );
}
