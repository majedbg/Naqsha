// ============================================================================
// PROTOTYPE — THROWAWAY. Variant C "Score margin".
// The left mode COLUMN is minimal — just the rhythm strip as the row (name a
// small caption beneath), like margin notation in a score. The lit row extends
// a saffron connector into the right side, where properties group under
// headers. Trace lives per-motif-row at the top right; the sweep scrubs a
// position marker along the lit row's OWN rhythm strip while the mock canvas
// fills.
// ============================================================================
import { useMemo, useState } from "react";
import {
  MODES,
  modeById,
  layoutForMode,
  fillOrder,
  useTrace,
  usePrefersReducedMotion,
  HostPreview,
} from "./prototypeShared";
import { ModeColumn, TraceTransport, DeviceFrame, MockBlock } from "./prototypeParts";

// Approximate rendered row pitch (strip + caption + gap) — only used to align
// the decorative saffron connector to the lit row. Prototype-grade.
const ROW_PITCH = 46;
const ROW_TOP = 20; // column heading offset

export default function VariantCScoreMargin() {
  const [mode, setMode] = useState("sparse");
  const reduced = usePrefersReducedMotion();
  const nodes = useMemo(() => layoutForMode(mode), [mode]);
  const order = useMemo(() => fillOrder(nodes), [nodes]);
  const trace = useTrace(order.length, { reducedMotion: reduced });
  const m = modeById(mode);
  const toCustom = () => mode !== "custom" && setMode("custom");

  const litIndex = MODES.findIndex((x) => x.id === mode);
  const markerFrac =
    trace.index < 0 || order.length <= 1 ? null : trace.index / (order.length - 1);
  const connectorTop = ROW_TOP + litIndex * ROW_PITCH + ROW_PITCH / 2;

  return (
    <DeviceFrame title="Motif" subtitle="Score margin" width={620}>
      <div className="relative flex gap-3">
        {/* left: minimal score-margin mode column */}
        <div className="w-40 shrink-0">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Rhythm</p>
          <ModeColumn selectedId={mode} onSelect={setMode} layout="score" litMarkerFrac={markerFrac} />
        </div>

        {/* saffron connector from the lit row into the properties */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-40 h-px w-3 bg-saffron"
          style={{ top: connectorTop }}
        />

        {/* right: grouped properties + trace + canvas */}
        <div className="min-w-0 flex-1 border-l-2 border-saffron/40 pl-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink">{m.name}</span>
            <TraceTransport
              playing={trace.playing}
              index={trace.index}
              total={order.length}
              onToggle={trace.toggle}
              onScrub={trace.scrub}
              onClear={trace.clear}
              reducedMotion={reduced}
              compact
            />
          </div>

          <p className="text-2xs text-ink-soft">{m.note}</p>

          <div className="mt-3 space-y-3">
            <section>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-soft">Placement</p>
              <div className="space-y-2">
                <MockBlock label="Route" hint="crossings" onEdit={toCustom} />
                <MockBlock label="Density" hint="60%" onEdit={toCustom} />
              </div>
            </section>

            <section>
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-soft">Preview</p>
              <div className="flex items-center gap-3">
                <HostPreview
                  modeId={mode}
                  glyphRef={m.glyphRef}
                  nodes={nodes}
                  order={order}
                  traceIndex={trace.index}
                  size={132}
                />
                <p className="text-2xs text-ink-soft">
                  {trace.index < 0
                    ? "Scrub the margin strip to walk the order."
                    : `Beat ${trace.index + 1} of ${order.length}.`}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </DeviceFrame>
  );
}
