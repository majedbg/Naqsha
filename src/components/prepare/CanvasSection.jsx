import { PRESET_SIZES, PPI } from '../../constants';
import { UNIT_OPTIONS, pxToUnit, unitToPx, unitStep, unitMin, unitMax } from '../../lib/units';
import { useGate } from '../../lib/useGate';
import NumberInput from '../ui/NumberInput';

function groupPresets() {
  const groups = { artwork: [], paper: [], plotter: [], laser: [], custom: [] };
  PRESET_SIZES.forEach((p, i) => {
    const cat = p.category || 'artwork';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ ...p, index: i });
  });
  return groups;
}

const GROUP_LABELS = {
  artwork: 'Artwork',
  paper:   'Paper',
  plotter: 'Pen Plotter',
  laser:   'Laser Cutter',
  custom:  'Custom',
};

export default function CanvasSection({
  width,
  height,
  presetIndex,
  unit,
  onUnitChange,
  margin,
  onMarginChange,
  onPresetChange,
  onCustomChange,
}) {
  const { check } = useGate();
  const preset = PRESET_SIZES[presetIndex];
  const isCustom = preset?.width === null;
  const customGate = check('customSize');
  const grouped = groupPresets();

  const step  = unitStep(unit);
  const minV  = unitMin(unit);
  const maxV  = unitMax(unit);
  const marginMax = unit === 'mm' ? 50 : unit === 'in' ? 2 : 192;

  const displayW = pxToUnit(width,  unit);
  const displayH = pxToUnit(height, unit);
  const displayM = pxToUnit(margin, unit);

  const handleCustomW = (v) => {
    const px = Math.max(unitToPx(1, unit), unitToPx(v, unit));
    onCustomChange(px, height);
  };
  const handleCustomH = (v) => {
    const px = Math.max(unitToPx(1, unit), unitToPx(v, unit));
    onCustomChange(width, px);
  };
  const handleMargin = (v) => {
    const px = Math.max(0, unitToPx(v, unit));
    onMarginChange(px);
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
          Canvas
        </h3>
        <div
          role="radiogroup"
          aria-label="Display units"
          className="flex items-center bg-paper-warm border border-paper-warm rounded-md p-0.5"
        >
          {UNIT_OPTIONS.map((u) => (
            <button
              key={u.value}
              role="radio"
              aria-checked={unit === u.value}
              onClick={() => onUnitChange(u.value)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                unit === u.value
                  ? 'bg-paper-warm text-ink'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      </header>

      {/* Bed/paper preset */}
      <div className="space-y-1.5">
        <label className="block text-[10px] text-ink-soft">Bed / paper</label>
        <select
          value={presetIndex}
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            const isCustomIdx = PRESET_SIZES[idx]?.width === null;
            if (isCustomIdx && !customGate.allowed) return;
            const presetGate = check('preset', idx);
            if (!isCustomIdx && !presetGate.allowed) return;
            onPresetChange(idx);
          }}
          className="w-full bg-paper-warm text-ink text-sm px-2.5 py-2 rounded border border-hairline outline-none focus:border-violet"
        >
          {Object.entries(grouped).map(([cat, items]) =>
            items.length > 0 ? (
              <optgroup key={cat} label={GROUP_LABELS[cat] || cat}>
                {items.map((p) => {
                  const gate = p.width === null ? customGate : check('preset', p.index);
                  return (
                    <option key={p.index} value={p.index} disabled={!gate.allowed}>
                      {p.label}{!gate.allowed ? ' 🔒' : ''}
                    </option>
                  );
                })}
              </optgroup>
            ) : null
          )}
        </select>
      </div>

      {/* Dimensions */}
      <div className="space-y-1.5">
        <label className="block text-[10px] text-ink-soft">Dimensions</label>
        {isCustom ? (
          <div className="flex gap-2">
            <NumberInput
              label={`Width (${unit})`}
              value={Number(displayW.toFixed(unit === 'in' ? 2 : 0))}
              onChange={handleCustomW}
              min={minV}
              max={maxV}
              step={step}
            />
            <NumberInput
              label={`Height (${unit})`}
              value={Number(displayH.toFixed(unit === 'in' ? 2 : 0))}
              onChange={handleCustomH}
              min={minV}
              max={maxV}
              step={step}
            />
          </div>
        ) : (
          <div className="text-[13px] text-ink flex items-baseline gap-2">
            <span>{displayW.toFixed(unit === 'in' ? 2 : 0)}</span>
            <span className="text-ink-soft">×</span>
            <span>{displayH.toFixed(unit === 'in' ? 2 : 0)}</span>
            <span className="text-[10px] text-ink-soft ml-1">{unit}</span>
            <span className="text-[10px] text-ink-soft ml-auto">
              {Math.round(width)} × {Math.round(height)} px
            </span>
          </div>
        )}
      </div>

      {/* Margin */}
      <div className="space-y-1.5">
        <label
          className="block text-[10px] text-ink-soft cursor-help"
          title="Safe margin — plotters can't draw to the very edge; lasers often need clearance for material warping. Dashed inset on the canvas shows the unsafe zone."
        >
          Margin ({unit})
        </label>
        <NumberInput
          label=""
          value={Number(displayM.toFixed(unit === 'in' ? 2 : 0))}
          onChange={handleMargin}
          min={0}
          max={marginMax}
          step={step}
        />
      </div>

      <p className="text-[10px] text-ink-soft leading-relaxed">
        Canvas storage is 96&nbsp;PPI pixels internally. Output SVG carries real-world dimensions.
      </p>
    </section>
  );
}
