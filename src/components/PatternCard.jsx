import { useEffect, useState } from 'react';
import { PATTERN_FAMILIES } from '../constants';
import { familyMetaFor } from '../lib/patternCatalog';
import { makePatternThumbnailSVG } from '../lib/patternThumbnail';

// Determinism badge dot. deterministic ● · seeded ◐ · stochastic ○.
function DetBadge({ det }) {
  const map = {
    deterministic: { ch: '●', title: 'Deterministic — same every time' },
    seeded: { ch: '◐', title: 'Seeded — varies with the random seed' },
    stochastic: { ch: '○', title: 'Stochastic — emergent / simulated' },
  };
  const m = map[det] || map.deterministic;
  return <span title={m.title} className="text-ink-soft leading-none">{m.ch}</span>;
}

// Mark-type badge — what the pattern lays down (matters for cut/score/engrave).
function MarkBadge({ mark }) {
  const map = {
    line: { ch: '╱', title: 'Continuous line' },
    dash: { ch: '┊', title: 'Dashes / stipple' },
    fill: { ch: '▣', title: 'Filled regions' },
  };
  const m = map[mark] || map.line;
  return <span title={m.title} className="text-ink-soft leading-none">{m.ch}</span>;
}

// Patient ease-out-quart — matches the Naqsha "hand setting something down" motion.
const EASE = 'cubic-bezier(0.165,0.84,0.44,1)';

// ── one card — a painted naqsheh cell with an element symbol ─────────────────
// `size` (px) drives the square box via INLINE style (a Tailwind arbitrary
// `w-[${size}px]` would not compile) — consistent with the card's other inline
// styles (transform / border). The Map view passes no size, so it stays 92px.
export default function PatternCard({ id, meta, symbol, label, ready, locked, lockReason, onPick, size = 92, animateIn = false, dimmed = false }) {
  // Route the family lookup through familyMetaFor so custom patterns
  // (meta.family === 'custom') resolve to the neutral CUSTOM_FAMILY gray instead
  // of the bare '#888' fallback. Real taxonomy families still map to the same
  // PATTERN_FAMILIES entry.
  const fam = familyMetaFor(meta.family) || { color: '#888' };
  const [svg, setSvg] = useState(null);
  const disabled = !ready || locked;

  // Lazily generate the thumbnail AFTER first paint so the grid renders fast.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const t = setTimeout(() => {
      const out = makePatternThumbnailSVG(id, { color: fam.color });
      if (alive) setSvg(out);
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [id, ready, fam.color]);

  return (
    <button
      type="button"
      disabled={disabled}
      // `dimmed` (off-family in Custom sort) is INERT: pointer-events:none plus an
      // onClick guard (jsdom ignores pointer-events for synthetic clicks, so the
      // guard is what actually makes it un-pickable). Distinct from `disabled`
      // (locked/SOON → opacity-45); the slot is still rendered so order stays real.
      onClick={() => !disabled && !dimmed && onPick(id)}
      title={locked ? (lockReason || 'Locked') : `${label} — ${meta.blurb || ''}`}
      className={`group relative rounded-[5px] border bg-paper overflow-hidden text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }${animateIn ? ' gallery-card-enter' : ''}`}
      style={{
        width: size,
        height: size,
        borderColor: 'var(--hairline)',
        transition: `transform 220ms ${EASE}, box-shadow 220ms ${EASE}, border-color 220ms ${EASE}`,
        ...(dimmed ? { opacity: 0.2, pointerEvents: 'none' } : null),
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = fam.color;
        e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(0,0,0,0.35)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = 'var(--hairline)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {/* the cell art, filling edge to edge */}
      <div className={`absolute inset-0 ${disabled ? 'opacity-45' : ''}`}>
        {ready && svg ? (
          <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
            <span className="w-6 h-6 rounded-full" style={{ background: fam.color, opacity: 0.22 }} />
          </div>
        )}
      </div>

      {/* coming-soon / lock marker, top-right */}
      {!ready && (
        <span className="absolute top-1 right-1 px-1 py-px text-[8px] font-medium tracking-wide rounded-sm bg-paper/85 text-ink-soft border border-hairline">
          SOON
        </span>
      )}
      {ready && locked && (
        <span className="absolute top-1 right-1 p-0.5 rounded-sm bg-paper/85 text-ink-soft border border-hairline" aria-hidden="true">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </span>
      )}

      {/* element symbol — hand-lettered caption, bottom-left */}
      <span
        className="absolute bottom-1 left-1 px-1 leading-none font-semibold text-[15px] rounded-sm bg-paper/75"
        style={{ color: disabled ? 'var(--ink-soft)' : fam.color, letterSpacing: '-0.02em' }}
      >
        {symbol}
      </span>

      {/* hover caption — full name + badges slide up from the bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-paper/95 border-t border-hairline translate-y-full group-hover:translate-y-0 pointer-events-none"
        style={{ transition: `transform 220ms ${EASE}` }}
      >
        <div className="text-[10px] font-medium text-ink leading-tight truncate">{label}</div>
        <div className="flex items-center gap-1 mt-0.5 text-[9px]">
          <DetBadge det={meta.det} />
          <MarkBadge mark={meta.mark} />
          {meta.sym && <span title="Supports radial symmetry" className="text-ink-soft leading-none">✦</span>}
          {meta.bridge && PATTERN_FAMILIES[meta.bridge] && (
            <span
              className="w-1.5 h-1.5 rounded-full ml-auto"
              style={{ background: PATTERN_FAMILIES[meta.bridge].color, opacity: 0.75 }}
            />
          )}
        </div>
      </div>
    </button>
  );
}
