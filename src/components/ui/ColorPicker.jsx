import { useRef } from 'react';

export default function ColorPicker({ color, onChange }) {
  const inputRef = useRef(null);

  return (
    <div className="relative">
      <div
        className="w-6 h-6 rounded cursor-pointer border border-[#444] hover:border-accent transition-colors"
        style={{ backgroundColor: color }}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
      />
    </div>
  );
}
