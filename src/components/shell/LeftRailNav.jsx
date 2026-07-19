// LeftRailNav — the far-left surface switcher for the pro shell's left column
// (motif-shell, D). Replaces the ToolStrip in the w-12 rail (the tools re-home
// to a tab protruding onto the canvas — see Studio's canvas region): the rail
// now names app-level SURFACES, Ableton-browser style. "Layers" shows the
// existing object tree; "Motifs" swaps the left panel to the motif library.
//
// Presentational: Studio owns the surface state (persisted per device in
// localStorage) and passes it down, same ownership pattern as ToolStrip's
// activeTool.
import GlyphThumb from "../ui/GlyphThumb";
import { MOTIF_GLYPHS } from "../../lib/motif/glyphs";

const SURFACES = [
  {
    id: "layers",
    label: "Layers",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M12 4l8 4-8 4-8-4 8-4z" />
        <path d="M4 12l8 4 8-4" />
        <path d="M4 16l8 4 8-4" />
      </svg>
    ),
  },
  {
    id: "motifs",
    label: "Motifs",
    // The rosette built-in doubles as the feature's icon — the motif itself
    // is the best advertisement of what lives behind the tab.
    icon: <GlyphThumb glyph={MOTIF_GLYPHS.rosette} size={20} />,
  },
];

export default function LeftRailNav({ surface, onSurfaceChange }) {
  return (
    <div className="flex h-full flex-col items-center gap-1 py-2" data-testid="left-rail-nav">
      {SURFACES.map((s) => {
        const active = surface === s.id;
        return (
          <button
            key={s.id}
            type="button"
            title={`${s.label} (\\ toggles)`}
            aria-label={s.label}
            aria-pressed={active}
            onClick={() => onSurfaceChange(s.id)}
            className={`relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-sm transition-colors duration-fast ease-out-quart ${
              active
                ? "bg-paper-warm text-ink"
                : "text-ink-soft hover:bg-paper-warm hover:text-ink"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
            )}
            {s.icon}
            <span className="text-[8px] uppercase leading-none tracking-wide">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
