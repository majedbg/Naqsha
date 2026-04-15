import { useState, useCallback } from 'react';
import { buildShareUrl } from '../lib/shareLink';

export default function ShareLinkButton({ buildState, size = 'sm' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onClick = useCallback(async () => {
    try {
      const state = buildState();
      const url = buildShareUrl(state);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 1800);
    }
  }, [buildState]);

  const sizeCls = size === 'sm'
    ? 'text-[11px] px-2 py-1'
    : 'text-[12px] px-2.5 py-1.5';

  const label = failed ? 'Copy failed' : copied ? 'Link copied' : 'Copy share link';

  return (
    <button
      onClick={onClick}
      title="Copy a link that reproduces this design — includes pattern, params, seed, layers, and canvas."
      className={`${sizeCls} rounded-md border text-gray-400 transition-colors font-medium ${
        copied
          ? 'border-accent/50 text-accent bg-accent/10'
          : failed
            ? 'border-red-400/40 text-red-400'
            : 'border-[#2e2e2e] hover:text-gray-200 hover:border-[#3a3a3a]'
      }`}
    >
      {label}
    </button>
  );
}
