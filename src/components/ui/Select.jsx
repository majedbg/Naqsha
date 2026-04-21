export default function Select({ label, value, options, onChange, tooltip }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="group/tooltip relative flex items-center gap-1">
          <span className="text-xs text-ink-soft">{label}</span>
          {tooltip && (
            <>
              <span className="text-[10px] text-ink-soft cursor-help">?</span>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tooltip:block z-50 px-2 py-1 text-[10px] text-ink bg-muted rounded whitespace-nowrap">
                {tooltip}
              </div>
            </>
          )}
        </div>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted text-ink text-xs px-2 py-1.5 rounded border border-hairline outline-none focus:border-violet"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
