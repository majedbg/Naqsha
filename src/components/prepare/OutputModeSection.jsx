import { OUTPUT_MODES, LASER_ROLES, MAX_PEN_SLOTS } from '../../lib/fabrication';

function RoleIcon({ icon }) {
  const size = 12;
  const stroke = 'currentColor';
  if (icon === 'scissors') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
        <line x1="8.12" y1="8.12" x2="12" y2="12" />
      </svg>
    );
  }
  if (icon === 'dotted') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="12" x2="6" y2="12" />
        <line x1="10" y1="12" x2="12" y2="12" />
        <line x1="16" y1="12" x2="18" y2="12" />
      </svg>
    );
  }
  // shading
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" />
      <line x1="4" y1="9"  x2="20" y2="9" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="4" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export default function OutputModeSection({ outputMode, onOutputModeChange, layers, onUpdateLayer }) {
  const activeMode = OUTPUT_MODES.find((m) => m.value === outputMode) || OUTPUT_MODES[0];

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
          Output mode
        </h3>
      </header>

      {/* Mode radio */}
      <div role="radiogroup" aria-label="Output mode" className="grid grid-cols-2 gap-2">
        {OUTPUT_MODES.map((m) => {
          const active = outputMode === m.value;
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={active}
              onClick={() => onOutputModeChange(m.value)}
              className={`text-left p-2.5 rounded-md border transition-colors ${
                active
                  ? 'border-violet/60 bg-accent/10 text-ink'
                  : 'border-paper-warm bg-paper-warm text-ink-soft hover:border-ink-soft hover:text-ink'
              }`}
            >
              <div className="text-[12px] font-medium">{m.label}</div>
              <div className="text-[10px] text-ink-soft mt-0.5 leading-snug">{m.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Per-layer mapping */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-ink-soft">
            {outputMode === 'laser' ? 'Layer roles' : 'Pen assignment'}
          </label>
          <span
            className="text-[9px] text-ink-soft cursor-help"
            title={
              outputMode === 'laser'
                ? 'Red = cut, blue = score, black = engrave. LightBurn / Glowforge / xTool auto-detect these on import.'
                : 'Pen slot per layer — print a registration-cross template and swap pens between passes.'
            }
          >
            Why?
          </span>
        </div>
        <ul className="space-y-1.5">
          {layers.map((layer) => (
            <li
              key={layer.id}
              className="flex items-center gap-2 p-2 rounded-md bg-paper border border-paper-warm"
            >
              <span
                className="inline-block w-3 h-3 rounded-sm border border-hairline shrink-0"
                style={{
                  backgroundColor:
                    outputMode === 'laser'
                      ? (LASER_ROLES.find((r) => r.value === layer.role)?.color ?? '#000')
                      : layer.color,
                }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-ink truncate flex-1">
                {layer.name || 'Layer'}
              </span>
              {outputMode === 'laser' ? (
                <div className="flex items-center gap-0.5 bg-paper-warm border border-hairline rounded p-0.5">
                  {LASER_ROLES.map((r) => {
                    const active = (layer.role ?? 'cut') === r.value;
                    return (
                      <button
                        key={r.value}
                        onClick={() => onUpdateLayer(layer.id, { role: r.value })}
                        title={r.label}
                        className={`flex items-center justify-center w-6 h-5 rounded transition-colors ${
                          active
                            ? 'bg-paper-warm text-ink'
                            : 'text-ink-soft hover:text-ink'
                        }`}
                        style={active ? { color: r.color } : undefined}
                      >
                        <RoleIcon icon={r.icon} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={layer.penSlot ?? 1}
                  onChange={(e) => onUpdateLayer(layer.id, { penSlot: parseInt(e.target.value, 10) })}
                  className="bg-paper-warm border border-hairline text-ink text-[11px] rounded px-1.5 py-0.5 outline-none focus:border-violet"
                  aria-label={`Pen slot for ${layer.name || 'layer'}`}
                >
                  {Array.from({ length: MAX_PEN_SLOTS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>Pen {n}</option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      </div>

      {outputMode === 'laser' && (
        <p className="text-[10px] text-ink-soft leading-relaxed">
          On export, layer colors are overridden to pure RGB so
          {' '}
          <span className="text-ink-soft">{activeMode.label}</span>
          {' '}
          imports map automatically to cut / score / engrave passes.
        </p>
      )}
    </section>
  );
}
