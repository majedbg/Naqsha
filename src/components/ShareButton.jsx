import { useState } from 'react';
import { useGate } from '../lib/useGate';
import { enableSharing, revokeSharing } from '../lib/designService';

export default function ShareButton({ designId, userId, shareToken, shareMode, onUpdate }) {
  const { check } = useGate();
  const shareGate = check('share');
  const forkGate = check('fork');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!shareGate.allowed || !designId) return null;

  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const shareUrl = shareToken ? `${appUrl}/share/${shareToken}` : null;

  const handleEnable = async (mode = 'view') => {
    setLoading(true);
    try {
      const result = await enableSharing(designId, userId, mode);
      if (result && onUpdate) onUpdate(result);
    } catch (err) {
      console.error('Share failed:', err);
    }
    setLoading(false);
  };

  const handleRevoke = async () => {
    setLoading(true);
    try {
      await revokeSharing(designId, userId);
      if (onUpdate) onUpdate({ share_token: null, share_mode: 'none' });
    } catch (err) {
      console.error('Revoke failed:', err);
    }
    setLoading(false);
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!shareToken) {
    return (
      <button
        onClick={() => handleEnable('view')}
        disabled={loading}
        className="text-[11px] text-gray-500 hover:text-accent transition-colors disabled:opacity-50"
      >
        {loading ? 'Sharing...' : 'Share'}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          className="flex-1 bg-[#333] text-[10px] text-gray-400 font-mono px-2 py-1 rounded border border-[#444] outline-none"
          onClick={(e) => e.target.select()}
        />
        <button
          onClick={handleCopy}
          className="text-[10px] text-accent hover:text-accent-hover shrink-0"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        {forkGate.allowed && (
          <button
            onClick={() => handleEnable(shareMode === 'fork' ? 'view' : 'fork')}
            disabled={loading}
            className={`text-[10px] transition-colors ${
              shareMode === 'fork' ? 'text-accent' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {shareMode === 'fork' ? 'Forkable' : 'Allow forking'}
          </button>
        )}
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}
