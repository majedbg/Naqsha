import { useTheme } from '../../lib/useTheme';

/*
 * ThemeToggle — a small button that flips between light and dark.
 *
 * Visually, the button's icon echoes the naqsheh metaphor: in light mode
 * the icon is a small painted cell (filled square) — the graph-paper ground
 * is showing. In dark mode the icon is a cell with a dot inside, like a
 * cell on indigo vellum with a lit candle behind it. Clicking flips the
 * theme; the button's tooltip says where you're going, not where you are.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light' : 'Switch to dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="
        inline-flex items-center justify-center
        w-[28px] h-[28px]
        rounded-xs
        text-ink-soft hover:text-ink
        transition-colors duration-fast ease-out-quart
        focus-visible:outline-violet
      "
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        {/* Outer cell — always present, subtly outlined. */}
        <rect
          x="2"
          y="2"
          width="10"
          height="10"
          rx="0"
        />
        {/* Interior mark — filled square in light, smaller dot in dark. */}
        {isDark ? (
          <circle cx="7" cy="7" r="1.75" fill="currentColor" stroke="none" />
        ) : (
          <rect x="4.5" y="4.5" width="5" height="5" fill="currentColor" stroke="none" />
        )}
      </svg>
    </button>
  );
}
