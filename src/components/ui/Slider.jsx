export default function Slider({ label, value, min, max, step, onChange, tooltip }) {
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
        <span className="text-xs text-accent font-mono w-12 text-right">{Number(value).toFixed(step < 1 ? String(step).split('.')[1]?.length || 1 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
