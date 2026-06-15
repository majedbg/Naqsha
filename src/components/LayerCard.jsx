import { useState, useRef } from "react";
import ColorPicker from "./ui/ColorPicker";
import IconButton from "./ui/IconButton";
import PatternTabs from "./PatternTabs";
import PatternParams from "./PatternParams";
import Slider from "./ui/Slider";
import { DEFAULT_PARAMS } from "../constants";
import { getDynamicDefaults } from "../lib/patternRegistry";
import { useGate } from "../lib/useGate";
import usePatternCache from "../lib/usePatternCache";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../lib/useLayerParams";
import LayerBgFill from "./LayerBgFill";

export default function LayerCard({
  layer,
  onUpdate,
  onChangePattern,
  paramSourceLayer,
  onParamUpdate,
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
  const { check, limits } = useGate();
  const seedGate = check("seed");
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSeed, setEditingSeed] = useState(false);
  const nameRef = useRef(null);
  const seedRef = useRef(null);

  // Pattern-switch cache machine (save current pattern's params, restore a prior
  // type's, or seed fresh defaults). Extracted verbatim to usePatternCache. Its
  // computed patch is APPLIED by the pair-aware router (onChangePattern) so that
  // selecting "Moiré" spawns a linked pair and switching away dissolves it. When
  // no router is wired (defensive), fall back to a plain self-update.
  const applyPatternPatch = onChangePattern || ((patch) => onUpdate(patch));
  const { handlePatternChange } = usePatternCache(layer, applyPatternPatch);

  // Param SOURCE: for a Moiré role-B card this is the partner A layer (B reads
  // A); for everything else it's this card's own layer. `onParamUpdate` is
  // bound to the source layer's id by the parent. Defaults keep standalone use
  // working (tests / non-paired callers).
  const srcLayer = paramSourceLayer || layer;
  const writeParams = onParamUpdate || ((patch) => onUpdate(patch));

  // Param context value (params + toggle/randomize/reset handlers). Provided at
  // this boundary so PatternParams/ParamGroup/ParamRow/ParamControl read it
  // directly instead of threading callbacks through every level.
  const layerParamsValue = buildLayerParamsValue({
    patternType: srcLayer.patternType,
    params: srcLayer.params,
    onChange: (params) => writeParams({ params }),
    randomizeKeys: srcLayer.randomizeKeys,
    onRandomizeKeysChange: (keys) => writeParams({ randomizeKeys: keys }),
  });

  const hasCheckedKeys = srcLayer.randomizeKeys && srcLayer.randomizeKeys.length > 0;

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
              className="bg-muted text-ink text-sm px-1 py-0.5 rounded border border-violet outline-none flex-1 min-w-0"
              value={layer.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              autoFocus
            />
          ) : (
            <span
              className="text-sm text-ink flex-1 min-w-0 truncate cursor-text"
              onDoubleClick={() => setEditingName(true)}
            >
              {layer.name}
            </span>
          )}

          {/* Duplicate layer (hidden when only 1 layer allowed) */}
          {limits.maxLayers > 1 && (
            <IconButton title="Duplicate layer" onClick={onDuplicate}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </IconButton>
          )}

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

          {/* Delete (hidden when only 1 layer allowed) */}
          {limits.maxLayers > 1 && (
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
          )}

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
          {seedGate.allowed &&
            (editingSeed ? (
              <input
                ref={seedRef}
                className="bg-muted text-ink-soft text-[10px] font-mono w-14 px-1 py-0.5 rounded border border-violet outline-none"
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
                className="text-[10px] text-ink-soft font-mono cursor-pointer hover:text-ink-soft"
                onClick={() => setEditingSeed(true)}
                title="Click to edit seed"
              >
                {layer.seed}
              </span>
            ))}
        </div>
      </div>

      {/* Body */}
      <div
        className={`transition-all duration-200 overflow-hidden ${
          collapsed ? "max-h-0" : "max-h-[2000px]"
        }`}
      >
        <div className="px-3 pb-3 space-y-3 border-t border-hairline pt-3">
          {/* Background color with alpha */}
          {/* <LayerBgFill layer={layer} onUpdate={onUpdate} /> */}

          <PatternTabs
            active={layer.patternType}
            onChange={handlePatternChange}
            onOpenAIChat={() => onOpenAIChat && onOpenAIChat(layer)}
          />

          {/* Layer-wide action buttons. Read/write the param SOURCE (= partner
              A for a Moiré role-B card) so reset/randomize act on the surface
              that actually holds the params. */}
          {(() => {
            const defaults =
              DEFAULT_PARAMS[srcLayer.patternType] ||
              getDynamicDefaults(srcLayer.patternType) ||
              {};
            const changedCount = Object.keys(defaults).filter(
              (k) => srcLayer.params[k] !== defaults[k]
            ).length;
            const checkedCount = srcLayer.randomizeKeys?.length || 0;
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => writeParams({ params: { ...defaults } })}
                  disabled={changedCount === 0}
                  className="ml-auto flex items-center gap-1 py-1 px-2 rounded border transition-colors
                    disabled:opacity-30 disabled:cursor-not-allowed
                    border-tone-mild/30 text-tone-mild hover:bg-tone-mild/10"
                  title={
                    changedCount > 0
                      ? `Reset ${changedCount} changed param(s) to defaults`
                      : "All params at defaults"
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 4v6h6" />
                    <path d="M23 20v-6h-6" />
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
                    <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14" />
                  </svg>
                  {changedCount > 0 && (
                    <span className="text-[10px] font-medium">
                      x{changedCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={onRandomizeParams}
                  disabled={!hasCheckedKeys}
                  className="flex items-center gap-1 py-1 px-2 rounded border transition-colors
                    disabled:opacity-30 disabled:cursor-not-allowed
                    border-violet/40 text-accent hover:bg-accent/10"
                  title={
                    hasCheckedKeys
                      ? `Randomize ${checkedCount} checked param(s)`
                      : "Check params in groups below to enable"
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M16 3h5v5" />
                    <path d="M4 20L21 3" />
                    <path d="M21 16v5h-5" />
                    <path d="M15 15l6 6" />
                    <path d="M4 4l5 5" />
                  </svg>
                  {checkedCount > 0 && (
                    <span className="text-[10px] font-medium">
                      x{checkedCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })()}

          {layerParamsValue && (
            <LayerParamsProvider value={layerParamsValue}>
              <PatternParams />
            </LayerParamsProvider>
          )}
        </div>
      </div>
    </div>
  );
}
