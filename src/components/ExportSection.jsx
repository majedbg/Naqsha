import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useGate } from '../lib/useGate';
import UpgradePrompt from './UpgradePrompt';

export default function ExportSection({ onExportAll, onSaveLayerGroup, onSaveToCloud, onOpenCloudDesigns }) {
  const [includeHidden, setIncludeHidden] = useState(false);
  const { user } = useAuth();
  const { check, limits } = useGate();
  const saveGate = check('cloudSave');

  return (
    <div className="space-y-3 border-t border-[#2e2e2e] pt-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Save &amp; Export</h3>

      {/* Cloud save (logged in) or sign-in prompt (guest) */}
      {user ? (
        <div className="space-y-2">
          <button
            onClick={onSaveToCloud}
            className="w-full py-2.5 text-sm font-medium rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
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

      {/* Local save (for logged-in users with localStorage) */}
      {limits.localStorage && (
        <button
          onClick={onSaveLayerGroup}
          className="w-full py-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Save Local Backup
        </button>
      )}

      <button
        onClick={() => onExportAll(includeHidden)}
        className="w-full py-2.5 text-sm font-medium rounded bg-accent text-black hover:bg-accent-hover transition-colors"
      >
        Export All Layers
      </button>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={includeHidden}
          onChange={(e) => setIncludeHidden(e.target.checked)}
          className="accent-accent"
        />
        <span className="text-xs text-gray-500">Include hidden layers in export</span>
      </label>

      {limits.svgMetadata && (
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Exported SVGs include a generativearts.studio attribution comment.
        </p>
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed">
        Each layer is a separate &lt;g&gt; group — compatible with Inkscape, Illustrator, and laser cutter software.
      </p>
    </div>
  );
}
