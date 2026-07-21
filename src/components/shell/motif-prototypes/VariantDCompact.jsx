// ============================================================================
// PROTOTYPE — THROWAWAY. Variant D "Compact ledger".
// The Ableton-research synthesis. Base = Variant A's ledger mode-column +
// Variant C's marker-on-strip as the Trace scrubber. Blocks are remade as
// COLLAPSED one-line rows (grip · name · summary control · anchor-count chip ·
// power; unfold for detail), using the compact-control vocabulary (scrub-
// numeral, editable cadence strip, role glyph-toggles). The Sequencer stays
// EXPANDED as the payload. The Trace preview reads as the CANVAS REGION itself
// (full-bleed behind the panel), simulating "Trace sweeps the live canvas" —
// the real build would sweep the actual canvas; the in-device thumbnail is cut.
// ============================================================================
import { useMemo, useState } from "react";
import {
  modeById,
  layoutForMode,
  fillOrder,
  sieveCounts,
  useTrace,
  usePrefersReducedMotion,
  HostPreview,
  GlyphMark,
} from "./prototypeShared";
import { ModeColumn, TraceTransport, DeviceFrame } from "./prototypeParts";
import { CompactBlock, ScrubNumeral, CadenceStrip, RoleGlyphToggles } from "./compactControls";

export default function VariantDCompact() {
  const [mode, setMode] = useState("alternate");
  const [density, setDensity] = useState(60);
  const [everyN, setEveryN] = useState(2);
  const reduced = usePrefersReducedMotion();
  const nodes = useMemo(() => layoutForMode(mode), [mode]);
  const order = useMemo(() => fillOrder(nodes), [nodes]);
  const trace = useTrace(order.length, { reducedMotion: reduced });
  const m = modeById(mode);

  const toCustom = () => mode !== "custom" && setMode("custom");
  const markerFrac =
    trace.index < 0 || order.length <= 1 ? null : trace.index / (order.length - 1);

  // Per-block anchor sieve: host anchors → … → placement count.
  const counts = useMemo(
    () => sieveCounts(nodes.length, order.length, 4),
    [nodes.length, order.length]
  );
  const [routeC, everyC, densityC, seqC] = counts;

  return (
    <>
      {/* Trace preview AS the canvas region (full-bleed behind the panel). */}
      <div className="pointer-events-none absolute inset-0">
        <HostPreview
          modeId={mode}
          glyphRef={m.glyphRef}
          nodes={nodes}
          order={order}
          traceIndex={trace.index}
          bleed
        />
        <div className="absolute left-3 top-3 rounded-xs border border-hairline bg-paper/85 px-1.5 py-0.5 text-2xs text-ink-soft">
          Trace sweeps the live canvas — simulated for prototype
        </div>
      </div>

      {/* Compact device panel, docked right like an inspector. */}
      <div className="pointer-events-auto absolute right-3 top-8">
        <DeviceFrame
          title="Motif"
          subtitle="Compact"
          width={392}
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
            {/* left: ledger mode column (strip on lit row carries the Trace marker) */}
            <div className="w-40 shrink-0">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Mode</p>
              <ModeColumn selectedId={mode} onSelect={setMode} layout="ledger" litMarkerFrac={markerFrac} />
            </div>

            {/* right: compact block rows + expanded Sequencer payload */}
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-soft">Blocks</p>
              <div className="flex flex-col gap-1.5">
                <CompactBlock
                  label="Route"
                  inN={routeC.in}
                  outN={routeC.out}
                  onEdit={toCustom}
                  summary={<RoleGlyphToggles onEdit={toCustom} compact />}
                >
                  <div className="space-y-2">
                    <RoleGlyphToggles onEdit={toCustom} />
                    <label className="flex items-center gap-1.5 text-2xs text-ink-soft">
                      <span>Paths</span>
                      <select
                        onChange={toCustom}
                        className="rounded-xs border border-hairline bg-paper px-1 py-0.5 text-2xs text-ink outline-none focus:border-violet"
                      >
                        <option>All</option>
                        <option>Open</option>
                        <option>Closed</option>
                      </select>
                    </label>
                  </div>
                </CompactBlock>

                <CompactBlock
                  label="Every N"
                  inN={everyC.in}
                  outN={everyC.out}
                  onEdit={toCustom}
                  summary={
                    <div className="flex items-center gap-1.5">
                      <CadenceStrip width={92} onEdit={toCustom} />
                      <ScrubNumeral value={everyN} min={1} max={8} suffix="×" width={40} onChange={(v) => { setEveryN(v); toCustom(); }} />
                    </div>
                  }
                >
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-2xs text-ink-soft">
                      <span>Every</span>
                      <ScrubNumeral value={everyN} min={1} max={8} width={48} onChange={(v) => { setEveryN(v); toCustom(); }} />
                    </label>
                    <div>
                      <p className="mb-1 text-2xs text-ink-soft">Cadence — tap steps to keep or skip</p>
                      <CadenceStrip width={200} steps={12} onEdit={toCustom} />
                    </div>
                  </div>
                </CompactBlock>

                <CompactBlock
                  label="Density"
                  inN={densityC.in}
                  outN={densityC.out}
                  onEdit={toCustom}
                  summary={<ScrubNumeral value={density} min={0} max={100} suffix="%" width={52} onChange={(v) => { setDensity(v); toCustom(); }} />}
                >
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-2xs text-ink-soft">
                      <span>Keep</span>
                      <ScrubNumeral value={density} min={0} max={100} suffix="%" width={56} onChange={(v) => { setDensity(v); toCustom(); }} />
                    </label>
                    <p className="text-2xs text-ink-soft">Random threshold on anchor weight.</p>
                  </div>
                </CompactBlock>

                {/* Sequencer — the payload, always expanded. */}
                <div className="rounded-sm border border-hairline bg-paper-warm p-2" data-testid="proto-sequencer">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-ink-soft">Sequencer</span>
                    <span className="text-2xs tabular-nums text-ink-soft">{seqC.out} placed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={toCustom}
                        title={`Slot ${i + 1}`}
                        className="flex h-8 w-8 items-center justify-center rounded-xs border border-hairline bg-paper text-ink-soft outline-none hover:border-violet focus-visible:ring-2 focus-visible:ring-violet"
                      >
                        <GlyphMark glyphRef={m.glyphRef} size={16} fill="var(--ink)" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={toCustom}
                      title="Add slot"
                      className="flex h-8 w-8 items-center justify-center rounded-xs border border-dashed border-hairline text-2xs text-ink-soft outline-none hover:border-violet focus-visible:ring-2 focus-visible:ring-violet"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-2xs text-ink-soft">{m.note}</p>
            </div>
          </div>
        </DeviceFrame>
      </div>
    </>
  );
}
