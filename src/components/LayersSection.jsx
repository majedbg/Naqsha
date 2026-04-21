import LayerCard from './LayerCard';
import { useGate } from '../lib/useGate';
import UpgradePrompt from './UpgradePrompt';

export default function LayersSection({
  layers,
  onUpdate,
  onRemove,
  onAdd,
  onRandomize,
  onRandomizeAll,
  onRandomizeParams,
  onRandomizeAllParams,
  onReorder,
  onExportLayer,
  onDuplicate,
  onOpenAIChat,
  mobileActiveIndex,
}) {
  const isMobileSingle = typeof mobileActiveIndex === "number";
  const { check, limits } = useGate();
  const anyChecked = layers.some((l) => l.randomizeKeys && l.randomizeKeys.length > 0);
  const layerGate = check('layers', layers.length + 1);
  const atMax = layers.length >= limits.maxLayers;

  return (
    <div className="space-y-3">
      {!isMobileSingle && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
            Layers <span className="text-ink-soft normal-case font-normal">(top = front)</span>
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={onRandomizeAllParams}
              disabled={!anyChecked}
              className="text-[11px] text-ink-soft hover:text-saffron transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Randomize all checked params across all layers"
            >
              Rand Params
            </button>
            <button
              onClick={onRandomizeAll}
              className="text-[11px] text-ink-soft hover:text-saffron transition-colors"
              title="Randomize seeds for all layers"
            >
              Rand Seeds
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(isMobileSingle
          ? layers.filter((_, i) => i === mobileActiveIndex)
          : layers
        ).map((layer) => {
          const i = layers.indexOf(layer);
          return (
            <LayerCard
              key={layer.id}
              layer={layer}
              index={i}
              canDelete={layers.length > 1}
              isFirst={i === 0}
              isLast={i === layers.length - 1}
              onUpdate={(patch) => onUpdate(layer.id, patch)}
              onRemove={() => onRemove(layer.id)}
              onRandomize={() => onRandomize(layer.id)}
              onRandomizeParams={() => onRandomizeParams(layer.id)}
              onDuplicate={() => onDuplicate(layer.id)}
              onExport={() => onExportLayer(layer.id)}
              onMoveUp={() => i > 0 && onReorder(i, i - 1)}
              onMoveDown={() => i < layers.length - 1 && onReorder(i, i + 1)}
              onOpenAIChat={onOpenAIChat}
            />
          );
        })}
      </div>

      {atMax && !layerGate.allowed ? (
        <div className="w-full py-2 text-center rounded border border-dashed border-hairline bg-paper-warm">
          <div className="flex items-center justify-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-[11px] text-ink-soft">
              {layerGate.reason || 'Layer limit reached'}
            </span>
            <UpgradePrompt upgradeTarget={layerGate.upgradeTarget || 'free'} compact />
          </div>
        </div>
      ) : (
        <button
          onClick={onAdd}
          disabled={atMax}
          className="w-full py-2 text-sm rounded border border-dashed border-hairline text-ink-soft hover:text-saffron hover:border-violet disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          + Add Layer {atMax && `(max ${limits.maxLayers})`}
        </button>
      )}
    </div>
  );
}
