import { useState } from 'react';
import LayerCard from './LayerCard';
import { useGate } from '../lib/useGate';
import UpgradePrompt from './UpgradePrompt';
import { isMoireMember, findMoirePartnerA } from '../lib/moirePair';

export default function LayersSection({
  layers,
  onUpdate,
  onChangePattern,
  onRemove,
  onAdd,
  onRandomize,
  onRandomizeParams,
  onRandomizeAllParams,
  onRandomizeAll,
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

  // Inline "Moiré needs a free slot" message (mirrors the Add-Layer block — the
  // app has no toast mechanism). Auto-clears on the next successful change.
  const [moireBlockedMsg, setMoireBlockedMsg] = useState(null);

  // Pair-aware adjacency helpers. A Moiré pair is two adjacent layers; the pair
  // moves/deletes as a block, so the per-card buttons need block-aware bounds.
  const pairBlockBounds = (i) => {
    const l = layers[i];
    if (!isMoireMember(l)) return { start: i, end: i };
    const g = l.moireGroupId;
    let start = i;
    while (start > 0 && layers[start - 1].moireGroupId === g) start--;
    let end = i;
    while (end < layers.length - 1 && layers[end + 1].moireGroupId === g) end++;
    return { start, end };
  };

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
          const { start, end } = pairBlockBounds(i);
          const blockIsWholeList = start === 0 && end === layers.length - 1;

          // Stage 5 — panel B→A resolution. When this card is a Moiré role-B
          // layer, route its params/defs/onChange to its partner A (so "edit
          // either layer" works and both reflect). If A is missing (orphan B),
          // degrade gracefully: a normal card whose pattern defs simply have no
          // resolvable source — the panel shows the (empty) B params without
          // crashing.
          let paramSourceLayer = layer;
          let paramOnUpdate = (patch) => onUpdate(layer.id, patch);
          if (isMoireMember(layer) && layer.moireRole === 'B') {
            const partnerA = findMoirePartnerA(layer, layers);
            if (partnerA) {
              paramSourceLayer = partnerA;
              paramOnUpdate = (patch) => onUpdate(partnerA.id, patch);
            }
          }

          return (
            <LayerCard
              key={layer.id}
              layer={layer}
              index={i}
              paramSourceLayer={paramSourceLayer}
              onParamUpdate={paramOnUpdate}
              // Pair-aware: deleting a pair removes 2; block if that would empty
              // the canvas. (A pair that IS the whole list can't be deleted.)
              canDelete={!blockIsWholeList && layers.length > (end - start + 1)}
              isFirst={start === 0}
              isLast={end === layers.length - 1}
              onUpdate={(patch) => onUpdate(layer.id, patch)}
              onChangePattern={(patch) => {
                const res = onChangePattern(layer.id, patch);
                if (res && res.blocked) {
                  setMoireBlockedMsg(
                    'Moiré needs a free layer slot for its second surface.'
                  );
                } else {
                  setMoireBlockedMsg(null);
                }
              }}
              onRemove={() => onRemove(layer.id)}
              onRandomize={() => onRandomize(layer.id)}
              onRandomizeParams={() => onRandomizeParams(paramSourceLayer.id)}
              onDuplicate={() => onDuplicate(layer.id)}
              onExport={() => onExportLayer(layer.id)}
              // Move the whole pair block: step the block's top/bottom index.
              onMoveUp={() => start > 0 && onReorder(start, start - 1)}
              onMoveDown={() =>
                end < layers.length - 1 && onReorder(end, end + 1)
              }
              onOpenAIChat={onOpenAIChat}
            />
          );
        })}
      </div>

      {moireBlockedMsg && (
        <div className="w-full py-2 text-center rounded border border-dashed border-hairline bg-paper-warm">
          <span className="text-[11px] text-ink-soft">{moireBlockedMsg}</span>
        </div>
      )}

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
