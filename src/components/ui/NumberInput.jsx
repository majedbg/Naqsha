export default function NumberInput({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-[#333] text-gray-200 text-xs px-2 py-1.5 rounded border border-[#444] outline-none focus:border-accent font-mono"
      />
    </div>
  );
}
