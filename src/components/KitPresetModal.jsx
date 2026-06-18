// KitPresetModal — the floating kit preset-asset picker (issue #18, Lane C / C9).
//
// Mirrors PatternPickerModal's floating-modal style (NOT a tool-strip tool).
// Lists the active kit's manifest assets as cards; picking one reports the
// asset's IMPORT-READY SVG string OUT through `onPick`, which Studio funnels
// straight into addImportedLayer — exactly like a File>Import (place-as-artwork).

import { useEffect } from 'react';
import { getKit } from '../kits/kitRegistry.js';

// A tiny inline thumbnail: render the asset SVG itself, scaled to fit the card.
function AssetThumb({ svg }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center p-2 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function KitPresetModal({ open, kitId, onPick, onClose }) {
  // Close on Escape (matches PatternPickerModal).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const kit = getKit(kitId);
  if (!kit) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center pt-10 px-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-card-border rounded-lg w-full max-w-[760px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink">{kit.name} — presets</h2>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Pick a preset to place it as artwork — imported just like File&nbsp;&gt;&nbsp;Import.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* body — asset grid */}
        <div className="overflow-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {kit.assetManifest.map((asset) => (
              <div
                key={asset.id}
                className="group flex flex-col rounded-[5px] border border-hairline bg-paper overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onPick?.(asset.svg, asset)}
                  aria-label={asset.name}
                  title={asset.name}
                  className="flex flex-col text-left hover:bg-paper-warm transition-colors cursor-pointer"
                >
                  <div className="aspect-[4/3] w-full bg-paper-warm overflow-hidden">
                    <AssetThumb svg={asset.svg} />
                  </div>
                  <span className="px-2 py-1.5 text-[11px] font-medium text-ink truncate">
                    {asset.name}
                  </span>
                </button>
                {/* Alternate variant (e.g. the flipped near-black logo) — a 2nd
                    reachable pick so BOTH staged logo files are usable. */}
                {asset.altSvg && (
                  <button
                    type="button"
                    onClick={() => onPick?.(asset.altSvg, asset)}
                    aria-label={`${asset.name} (dark variant)`}
                    title={`${asset.name} (dark variant)`}
                    className="border-t border-hairline px-2 py-1 text-[10px] text-ink-soft hover:text-ink hover:bg-paper-warm transition-colors text-left cursor-pointer"
                  >
                    + Dark variant
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
