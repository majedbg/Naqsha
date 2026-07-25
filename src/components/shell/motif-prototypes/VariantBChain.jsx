// ============================================================================
// PROTOTYPE — THROWAWAY. Variant B "Chain".
// The full Ableton reading. Flex ROW: left = mode COLUMN whose rows show badge
// + rhythm strip + name. Right lays the blocks HORIZONTALLY as a scrollable
// chain of narrow cards. The Trace transport sits at the chain's HEAD like a
// device power/play cluster; the sweep highlights chain blocks AND the mock
// canvas strip in placement order.
// ============================================================================
import { useMemo, useState } from "react";
import {
  modeById,
  layoutForMode,
  fillOrder,
  useTrace,
  usePrefersReducedMotion,
  HostPreview,
} from "./prototypeShared";
import { ModeColumn, TraceTransport, DeviceFrame, MockBlock } from "./prototypeParts";

const CHAIN = [
  { label: "Route", hint: "crossings" },
  { label: "Sequence", hint: "every 2" },
  { label: "Density", hint: "60%" },
];

export default function VariantBChain() {
  const [mode, setMode] = useState("vine");
  const reduced = usePrefersReducedMotion();
  const nodes = useMemo(() => layoutForMode(mode), [mode]);
  const order = useMemo(() => fillOrder(nodes), [nodes]);
  const trace = useTrace(order.length, { reducedMotion: reduced });
  const m = modeById(mode);
  const toCustom = () => mode !== "custom" && setMode("custom");

  // Which chain block the sweep is "in" right now (maps trace progress across
  // the chain so blocks light in placement order).
  const activeBlock =
    trace.index < 0 || order.length === 0
      ? -1
      : Math.min(CHAIN.length - 1, Math.floor(((trace.index + 1) / order.length) * CHAIN.length - 1e-6));

  return (
    <DeviceFrame title="Motif" subtitle="Chain" width={720}>
      <div className="flex gap-3">
        {/* left: mode column with full notation */}
        <div className="w-52 shrink-0">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Mode</p>
          <ModeColumn selectedId={mode} onSelect={setMode} layout="chain" />
        </div>

        {/* right: transport cluster + horizontal chain + canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* head cluster */}
          <div className="flex items-center gap-3 rounded-sm border border-hairline bg-paper-warm px-2.5 py-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-soft">{m.name}</span>
            <div className="ml-auto">
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
          </div>

          {/* horizontal chain (scrollable) */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CHAIN.map((b, i) => (
              <div
                key={b.label}
                className={[
                  "rounded-sm transition-colors duration-fast",
                  activeBlock === i ? "ring-2 ring-saffron" : "ring-0",
                ].join(" ")}
              >
                <MockBlock label={b.label} hint={b.hint} orientation="horizontal" onEdit={toCustom} />
              </div>
            ))}
          </div>

          {/* mock canvas strip */}
          <div className="flex items-center gap-3">
            <HostPreview
              modeId={mode}
              glyphRef={m.glyphRef}
              nodes={nodes}
              order={order}
              traceIndex={trace.index}
              size={140}
            />
            <p className="text-2xs text-ink-soft">{m.note}</p>
          </div>
        </div>
      </div>
    </DeviceFrame>
  );
}
