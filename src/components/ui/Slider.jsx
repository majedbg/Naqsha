import { useState, useRef } from 'react';

export default function Slider({ label, value, min, max, step, onChange, tooltip }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  // Determine decimal places from step
  const decimals = step < 1 ? (String(step).split('.')[1]?.length || 1) : 0;
  const displayValue = Number(value).toFixed(decimals);

  const snapToStep = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / step) * step;
    return parseFloat(snapped.toFixed(decimals));
  };

  const startEditing = () => {
    setEditValue(displayValue);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(snapToStep(parsed));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="group/tooltip relative flex items-center gap-1">
          <span className="text-xs text-gray-400">{label}</span>
          {tooltip && (
            <>
              <span className="text-[10px] text-gray-600 cursor-help">?</span>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover/tooltip:block z-50 px-2 py-1 text-[10px] text-gray-300 bg-[#333] rounded whitespace-nowrap">
                {tooltip}
              </div>
            </>
          )}
        </div>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            className="text-xs text-accent font-mono w-16 text-right bg-[#333] border border-accent rounded px-1 py-0 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={editValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-xs text-accent font-mono w-12 text-right cursor-text hover:bg-[#333] rounded px-1 transition-colors"
            onClick={startEditing}
            title="Click to type a value"
          >
            {displayValue}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(snapToStep(parseFloat(e.target.value)))}
        className="w-full"
      />
    </div>
  );
}
