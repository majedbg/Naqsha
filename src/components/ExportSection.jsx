import { useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useGate } from '../lib/useGate';
import UpgradePrompt from './UpgradePrompt';
import ShareLinkButton from './ShareLinkButton';
import { PRESET_SIZES } from '../constants';
import { pxToUnit } from '../lib/units';

const FORMATS = [
  { value: 'svg',   label: 'SVG',    tier: null,     status: 'ready',   hint: 'Universal vector — Inkscape, LightBurn, Glowforge' },
  { value: 'dxf',   label: 'DXF',    tier: 'pro',    status: 'coming',  hint: 'Drawing Exchange — many laser workflows' },
  { value: 'hpgl',  label: 'HPGL',   tier: 'pro',    status: 'coming',  hint: 'Direct drive for HP and vintage plotters' },
  { value: 'gcode', label: 'G-code', tier: 'studio', status: 'coming',  hint: 'For GRBL / Marlin CNC plotters' },
];

function pickDefaultFilename({ layers, canvasW, canvasH, unit, outputMode, presetIndex }) {
  const primary = layers.find((l) => l.visible) || layers[0];
  const patternName = (primary?.patternType || 'design').replace(/[^a-z0-9]/gi, '');
  const seed = primary?.seed ?? Math.floor(Math.random() * 100000);
  const preset = PRESET_SIZES[presetIndex];
  const w = pxToUnit(canvasW, unit);
  const h = pxToUnit(canvasH, unit);
  const precision = unit === 'in' ? 1 : 0;
  const sizeTag = preset?.category === 'paper'
    ? preset.label.split(' — ')[0].replace(/\s/g, '').toLowerCase()
    : `${w.toFixed(precision)}x${h.toFixed(precision)}${unit}`;
  return `naqsha-${patternName}-${sizeTag}-${outputMode}-${seed}`;
}

function ReadyItem({ status, label, detail }) {
  const color =
    status === 'ok' ? 'text-green-400'
    : status === 'warn' ? 'text-yellow-400'
    : 'text-gray-500';
  const glyph = status === 'ok' ? '✓' : status === 'warn' ? '!' : '·';
  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug">
      <span className={`${color} font-mono w-3 shrink-0`} aria-hidden="true">{glyph}</span>
      <span className="text-gray-300">
        {label}
        {detail && <span className="text-gray-500"> — {detail}</span>}
      </span>
    </li>
  );
}

export default function ExportSection({
  onExportAll,
  onSaveLayerGroup,
  onSaveToCloud,
  onOpenCloudDesigns,
  // New — passed through from Studio so the Export tab has full context
  layers,
  canvasW,
  canvasH,
  presetIndex,
  unit,
  margin,
  outputMode,
  bgColor,
  onTabChange,
}) {
  const { user } = useAuth();
  const { limits } = useGate();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [format, setFormat] = useState('svg');
  const [customFilename, setCustomFilename] = useState('');

  const defaultFilename = useMemo(
    () => pickDefaultFilename({ layers, canvasW, canvasH, unit, outputMode, presetIndex }),
    [layers, canvasW, canvasH, unit, outputMode, presetIndex]
  );
  const filename = (customFilename || defaultFilename).replace(/\.svg$/i, '');

  // Ready-check — simple heuristics that reflect Prepare state
  const preset = PRESET_SIZES[presetIndex];
  const hasDefaultPreset = presetIndex === 1;
  const hasUntaggedLayers = outputMode === 'laser' && layers.some((l) => !l.role);
  const hasHiddenLayers = layers.some((l) => !l.visible);
  const readyItems = [
    {
      status: preset ? 'ok' : 'warn',
      label: 'Bed / paper',
      detail: preset?.label ?? 'not set',
    },
    {
      status: hasDefaultPreset ? 'info' : 'ok',
      label: 'Output mode',
      detail: outputMode === 'laser' ? 'Laser — colors will be remapped' : 'Pen plotter — colors preserved',
    },
    ...(outputMode === 'laser' ? [{
      status: hasUntaggedLayers ? 'warn' : 'ok',
      label: 'Layer roles',
      detail: hasUntaggedLayers ? 'Some layers untagged — will default to Cut' : 'All layers tagged',
    }] : []),
    ...(hasHiddenLayers ? [{
      status: 'info',
      label: 'Hidden layers',
      detail: includeHidden ? 'Will be included in export' : 'Will be excluded from export',
    }] : []),
    {
      status: margin > 0 ? 'ok' : 'info',
      label: 'Margin',
      detail: margin > 0 ? 'Applied' : 'None — art may touch the edge',
    },
  ];

  const buildShareState = () => ({
    canvasW,
    canvasH,
    presetIndex,
    unit,
    margin,
    bgColor,
    outputMode,
    layers,
  });

  return (
    <div className="space-y-5">
      {/* Format picker */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Format
        </h3>
        <div role="radiogroup" aria-label="Export format" className="grid grid-cols-2 gap-1.5">
          {FORMATS.map((f) => {
            const disabled = f.status !== 'ready';
            const active = format === f.value;
            return (
              <button
                key={f.value}
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => !disabled && setFormat(f.value)}
                className={`text-left p-2 rounded-md border transition-colors ${
                  active
                    ? 'border-accent/60 bg-accent/10 text-gray-100'
                    : disabled
                      ? 'border-[#222] bg-[#121212] text-gray-600 cursor-not-allowed'
                      : 'border-[#2a2a2a] bg-[#161616] text-gray-300 hover:border-[#3a3a3a]'
                }`}
                title={f.hint}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium">{f.label}</span>
                  {disabled && (
                    <span className="text-[9px] uppercase tracking-wider text-gray-600">
                      {f.tier === 'studio' ? 'Studio' : 'Pro'} · soon
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{f.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filename */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Filename
          </h3>
          <button
            onClick={() => setCustomFilename('')}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            title="Reset to auto-generated name"
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={customFilename || defaultFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder={defaultFilename}
            className="flex-1 bg-[#1e1e1e] text-gray-200 text-[11px] font-mono px-2 py-1.5 rounded border border-[#333] outline-none focus:border-accent"
          />
          <span className="text-[10px] text-gray-600">.svg</span>
        </div>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Seed is baked into the name so runs are reproducible.
        </p>
      </section>

      {/* Download + share */}
      <section className="space-y-2">
        <button
          onClick={() => onExportAll(includeHidden, { filename: `${filename}.svg` })}
          className="w-full py-2.5 text-sm font-medium rounded bg-accent text-black hover:bg-accent-hover transition-colors"
        >
          Download {format.toUpperCase()}
        </button>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-[11px] text-gray-500">Include hidden layers</span>
          </label>
          <ShareLinkButton buildState={buildShareState} />
        </div>
      </section>

      {/* Ready check */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Ready check
        </h3>
        <ul className="space-y-1 p-2.5 rounded-md bg-[#141414] border border-[#252525]">
          {readyItems.map((r, i) => (
            <ReadyItem key={i} status={r.status} label={r.label} detail={r.detail} />
          ))}
        </ul>
        {outputMode === 'laser' && hasUntaggedLayers && onTabChange && (
          <button
            onClick={() => onTabChange('prepare')}
            className="text-[11px] text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            → Open Prepare to tag layers
          </button>
        )}
      </section>

      {/* Persistent saves */}
      <section className="space-y-2 border-t border-[#2e2e2e] pt-4">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Save
        </h3>
        {user ? (
          <div className="space-y-2">
            <button
              onClick={onSaveToCloud}
              className="w-full py-2 text-[12px] font-medium rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
            >
              Save to Cloud
            </button>
            <button
              onClick={onOpenCloudDesigns}
              className="w-full py-1.5 text-[11px] text-gray-500 hover:text-accent transition-colors"
            >
              My Cloud Designs
            </button>
          </div>
        ) : (
          <div className="rounded border border-[#333] bg-[#1e1e1e] p-3 text-center">
            <UpgradePrompt upgradeTarget="free" reason="Sign in to save your designs to the cloud" />
          </div>
        )}
        {limits.localStorage && (
          <button
            onClick={onSaveLayerGroup}
            className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Save Local Backup
          </button>
        )}
      </section>

      {limits.svgMetadata && (
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Exported SVGs include a generativearts.studio attribution comment.
        </p>
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed">
        Each layer is a separate &lt;g&gt; group. Export carries real-world mm
        dimensions and an embedded manifest comment (seed, pattern, bed, output
        mode) for reproducibility.
      </p>
    </div>
  );
}
