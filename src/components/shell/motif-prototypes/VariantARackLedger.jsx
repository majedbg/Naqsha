// ============================================================================
// PROTOTYPE — THROWAWAY. Variant A "Rack ledger".
// Flex ROW: left = mode COLUMN (badge + name; rhythm strip revealed on the lit
// row only). Right = the block RACK flowing VERTICALLY (Route / Sequence /
// Density cards) as today. Trace lives in the device title bar and sweeps a
// mock mini-canvas preview strip along the BOTTOM of the device.
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

export default function VariantARackLedger() {
  const [mode, setMode] = useState("alternate");
  const reduced = usePrefersReducedMotion();
  const nodes = useMemo(() => layoutForMode(mode), [mode]);
  const order = useMemo(() => fillOrder(nodes), [nodes]);
  const trace = useTrace(order.length, { reducedMotion: reduced });
  const m = modeById(mode);

  // Editing a block slides selection to Custom (approved concept).
  const toCustom = () => mode !== "custom" && setMode("custom");

  return (
    <DeviceFrame
      title="Motif"
      subtitle="Leaf · on grid"
      width={600}
      titleAside={
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
      }
    >
      <div className="flex gap-3">
        {/* left: mode column */}
        <div className="w-44 shrink-0">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Mode</p>
          <ModeColumn selectedId={mode} onSelect={setMode} layout="ledger" />
        </div>

        {/* right: vertical block rack */}
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Blocks</p>
          <div className="flex flex-col gap-2">
            <MockBlock label="Route" hint="crossings" onEdit={toCustom} />
            <MockBlock label="Sequence" hint="every 2" onEdit={toCustom} />
            <MockBlock label="Density" hint="60%" onEdit={toCustom} />
          </div>
        </div>
      </div>

      {/* bottom: mock canvas preview strip the Trace sweeps */}
      <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3">
        <HostPreview
          modeId={mode}
          glyphRef={m.glyphRef}
          nodes={nodes}
          order={order}
          traceIndex={trace.index}
          size={132}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink">{m.name}</p>
          <p className="mt-0.5 text-2xs text-ink-soft">{m.note}</p>
          <p className="mt-2 text-2xs text-ink-soft">
            {trace.index < 0
              ? `${order.length} placements. Trace lays them down in order.`
              : `Laid ${trace.index + 1} of ${order.length}.`}
          </p>
        </div>
      </div>
    </DeviceFrame>
  );
}
