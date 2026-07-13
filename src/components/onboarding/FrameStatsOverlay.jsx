// P0-B — frame-time / FPS readout (D19). Enable with `?fps=1` in the URL
// (see frameStatsFlag.js). Off by default for every user, guest or signed-in,
// dev or prod build. Purely a measurement instrument — it renders nothing and
// runs no rAF loop when disabled (useFrameStats short-circuits), so mounting
// it unconditionally in Studio.jsx costs nothing for the 99.9% case where the
// query param is absent.

import { useFrameStats } from "../../lib/onboarding/useFrameStats";
import { isFrameStatsEnabled } from "../../lib/onboarding/frameStatsFlag";

export default function FrameStatsOverlay({ search } = {}) {
  const enabled = isFrameStatsEnabled(search);
  const stats = useFrameStats(enabled);

  if (!enabled) return null;

  const fpsLabel = stats.samples > 0 ? stats.fps.toFixed(0) : "…";
  const avgLabel = stats.samples > 0 ? stats.avgFrameMs.toFixed(1) : "…";
  const maxLabel = stats.samples > 0 ? stats.maxFrameMs.toFixed(1) : "…";

  return (
    <div
      className="fixed top-2 right-2 z-[9999] rounded-md border border-hairline bg-ink/85 px-2 py-1 font-mono text-[11px] leading-tight text-paper shadow-pop pointer-events-none"
      data-testid="frame-stats-overlay"
      aria-hidden="true"
    >
      <div>{fpsLabel} fps</div>
      <div className="opacity-70">
        avg {avgLabel}ms · max {maxLabel}ms
      </div>
    </div>
  );
}
