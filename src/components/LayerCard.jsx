import { useState, useRef } from "react";
import ColorPicker from "./ui/ColorPicker";
import IconButton from "./ui/IconButton";
import PatternTabs from "./PatternTabs";
import PatternParams from "./PatternParams";
import Slider from "./ui/Slider";
import { DEFAULT_PARAMS, PATTERN_PARAM_DEFS } from "../constants";
import { getDynamicDefaults } from "../lib/patternRegistry";
import { useGate } from "../lib/useGate";

export default function LayerCard({
  layer,
  onUpdate,
  onRemove,
  onRandomize,
  onRandomizeParams,
  onExport,
  onDuplicate,
  canDelete,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onOpenAIChat,
}) {
  const { check } = useGate();
  const seedGate = check('seed');
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSeed, setEditingSeed] = useState(false);
  const nameRef = useRef(null);
  const seedRef = useRef(null);
  const bgColorRef = useRef(null);

  const handlePatternChange = (patternType) => {
    const defaults = DEFAULT_PARAMS[patternType] || getDynamicDefaults(patternType) || {};
    onUpdate({
      patternType,
      params: { ...defaults },
      randomizeKeys: [],
    });
  };

  const hasCheckedKeys = layer.randomizeKeys && layer.randomizeKeys.length > 0;

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex flex-col w-full items-start gap-1.5 px-3 py-2">
        <div className="flex flex-row w-full gap-2 items-center">
          {/* Up/Down arrows */}
          <div className="flex flex-col -my-1">
            <IconButton
              title="Move up (toward front)"
              onClick={onMoveUp}
              disabled={isFirst}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </IconButton>
            <IconButton
              title="Move down (toward back)"
              onClick={onMoveDown}
              disabled={isLast}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </IconButton>
          </div>

          {/* Name */}
          {editingName ? (
            <input
              ref={nameRef}
              className="bg-[#333] text-gray-200 text-sm px-1 py-0.5 rounded border border-accent outline-none flex-1 min-w-0"
              value={layer.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              autoFocus
            />
          ) : (
            <span
              className="text-sm text-gray-200 flex-1 min-w-0 truncate cursor-text"
              onDoubleClick={() => setEditingName(true)}
            >
              {layer.name}
            </span>
          )}

          {/* Duplicate layer */}
          <IconButton title="Duplicate layer" onClick={onDuplicate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </IconButton>

          {/* Export layer */}
          <div className="export-button ml-auto">
            <IconButton title="Export layer SVG" onClick={onExport}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </IconButton>
          </div>

          {/* Delete */}
          <IconButton
            title="Delete layer"
            onClick={onRemove}
            disabled={!canDelete}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </IconButton>

          {/* Collapse */}
          <IconButton
            title={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform duration-200 ${
                collapsed ? "-rotate-90" : ""
              }`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </IconButton>
        </div>
        <div className="flex flex-row gap-2 w-full items-center justify-start">
          {/* Color */}
          <ColorPicker
            color={layer.color}
            onChange={(color) => onUpdate({ color })}
          />
          {/* Opacity */}
          <input
            type="range"
            min={0}
            max={100}
            value={layer.opacity}
            onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) })}
            className="w-16 mr-auto"
            title={`Opacity: ${layer.opacity}%`}
          />

          {/* Visibility */}
          <IconButton
            title={layer.visible ? "Hide layer" : "Show layer"}
            onClick={() => onUpdate({ visible: !layer.visible })}
          >
            {layer.visible ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </IconButton>

          {/* Randomize seed */}
          <IconButton title="Randomize seed" onClick={onRandomize}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              <circle cx="16" cy="8" r="1.5" fill="currentColor" />
              <circle cx="8" cy="16" r="1.5" fill="currentColor" />
              <circle cx="16" cy="16" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </IconButton>

          {/* Seed display (hidden for guests) */}
          {seedGate.allowed && (
            editingSeed ? (
              <input
                ref={seedRef}
                className="bg-[#333] text-gray-500 text-[10px] font-mono w-14 px-1 py-0.5 rounded border border-accent outline-none"
                value={layer.seed}
                onChange={(e) =>
                  onUpdate({ seed: parseInt(e.target.value) || 0 })
                }
                onBlur={() => setEditingSeed(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingSeed(false)}
                autoFocus
              />
            ) : (
              <span
                className="text-[10px] text-gray-600 font-mono cursor-pointer hover:text-gray-400"
                onClick={() => setEditingSeed(true)}
                title="Click to edit seed"
              >
                {layer.seed}
              </span>
            )
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className={`transition-all duration-200 overflow-hidden ${
          collapsed ? "max-h-0" : "max-h-[2000px]"
        }`}
      >
        <div className="px-3 pb-3 space-y-3 border-t border-[#333] pt-3">
          {/* Background color with alpha */}
          <div className="space-y-2">
            <span className="text-xs text-gray-400">Background Fill</span>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className="w-6 h-6 rounded cursor-pointer border border-[#444] hover:border-accent transition-colors"
                  style={{
                    backgroundColor: layer.bgColor,
                    opacity: layer.bgOpacity / 100,
                    backgroundImage:
                      layer.bgOpacity === 0
                        ? "linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)"
                        : "none",
                    backgroundSize: "6px 6px",
                    backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0px",
                  }}
                  onClick={() => bgColorRef.current?.click()}
                  title="Layer background color"
                />
                <input
                  ref={bgColorRef}
                  type="color"
                  value={layer.bgColor}
                  onChange={(e) => onUpdate({ bgColor: e.target.value })}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                />
              </div>
              <div className="flex-1">
                <Slider
                  label="Fill Opacity"
                  value={layer.bgOpacity}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => onUpdate({ bgOpacity: v })}
                  tooltip="Background fill opacity — 0 means transparent (no fill)"
                />
              </div>
            </div>
          </div>

          <PatternTabs
            active={layer.patternType}
            onChange={handlePatternChange}
            onOpenAIChat={() => onOpenAIChat && onOpenAIChat(layer)}
          />

          {/* Randomize checked params button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRandomizeParams}
              disabled={!hasCheckedKeys}
              className="flex-1 py-1.5 text-[11px] font-medium rounded border transition-colors
                disabled:opacity-30 disabled:cursor-not-allowed
                border-accent/40 text-accent hover:bg-accent/10"
              title={
                hasCheckedKeys
                  ? `Randomize ${layer.randomizeKeys.length} checked param(s)`
                  : "Check params below to enable"
              }
            >
              Randomize Checked Params
              {hasCheckedKeys && ` (${layer.randomizeKeys.length})`}
            </button>
            <button
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap"
              onClick={() => {
                if (hasCheckedKeys) {
                  onUpdate({ randomizeKeys: [] });
                } else {
                  const defs = PATTERN_PARAM_DEFS[layer.patternType];
                  if (defs) {
                    onUpdate({ randomizeKeys: defs.map((d) => d.key) });
                  }
                }
              }}
            >
              {hasCheckedKeys ? "Clear all" : "Check all"}
            </button>
          </div>

          <PatternParams
            patternType={layer.patternType}
            params={layer.params}
            onChange={(params) => onUpdate({ params })}
            randomizeKeys={layer.randomizeKeys}
            onRandomizeKeysChange={(keys) => onUpdate({ randomizeKeys: keys })}
          />
        </div>
      </div>
    </div>
  );
}
