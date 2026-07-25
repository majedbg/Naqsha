// CadenceStripControl — the EDITABLE cadence notation for an Every-N block. A
// flattened step-sequencer on the naqsheh rule: `beats` positions, each PLACED
// (filled ink dot) when ((i - offset) mod n) === 0, else SKIPPED (faint hollow).
// It is the rhythm made touchable — clicking beat k edits the OFFSET so beat k
// lands on the grid (offset := k mod n); n itself is edited by the ScrubNumeral
// next to the strip, never here. Every click flows through onCommit(nextOffset).
//
// The same component serves the small collapsed-row summary and the larger
// unfolded detail (via `size`); marks are drawn currentColor (caller tints),
// two-tone by opacity only, no color. role="group" with one aria-labelled button
// per beat so the rhythm is legible and drivable by AT.
import { memo } from "react";

// A beat is placed when it sits on the n-grid offset by `offset`.
function isPlaced(i, n, offset) {
  const period = n >= 1 ? Math.floor(n) : 1;
  return ((((i - offset) % period) + period) % period) === 0;
}

function CadenceStripControl({
  n = 1,
  offset = 0,
  beats = 12,
  onCommit,
  size = "sm",
  label = "Cadence",
}) {
  const period = n >= 1 ? Math.floor(n) : 1;
  const dot = size === "lg" ? 8 : 6; // filled-dot diameter (px)
  const gap = size === "lg" ? "gap-1.5" : "gap-1";

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="cadence-strip"
      className={`inline-flex items-center ${gap}`}
    >
      {Array.from({ length: beats }, (_, i) => {
        const placed = isPlaced(i, period, offset);
        return (
          <button
            key={i}
            type="button"
            data-testid={`cadence-beat-${i}`}
            aria-pressed={placed}
            aria-label={`Beat ${i + 1} — ${placed ? "placed" : "skipped"}`}
            // Click beat k → make it placed: offset = k mod n (n unchanged).
            onClick={() => onCommit?.(((i % period) + period) % period)}
            // Small mark, generous invisible hit area (negative-margin pattern) so
            // touch targets stay ≥44px-effective without visually crowding.
            className="relative -m-1.5 flex items-center justify-center rounded-full p-1.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <span
              aria-hidden="true"
              className={placed ? "rounded-full bg-ink" : "rounded-full border border-ink-soft opacity-40"}
              style={
                placed
                  ? { width: dot, height: dot }
                  : { width: dot - 1.5, height: dot - 1.5 }
              }
            />
          </button>
        );
      })}
    </div>
  );
}

export default memo(CadenceStripControl);
