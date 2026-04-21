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
      className={`${sizeCls} rounded-md border text-ink-soft transition-colors font-medium ${
        copied
          ? 'border-violet/50 text-accent bg-accent/10'
          : failed
            ? 'border-tone-strong/40 text-tone-strong'
            : 'border-hairline hover:text-ink hover:border-ink-soft'
      }`}
    >
      {label}
    </button>
  );
}
