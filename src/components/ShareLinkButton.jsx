import { useState, useCallback } from 'react';
import { buildShareUrlSafe } from '../lib/shareLink';

export default function ShareLinkButton({ buildState, size = 'sm' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);

  const onClick = useCallback(async () => {
    try {
      const state = buildState();
      const { url, tooLarge: oversized } = buildShareUrlSafe(state);
      if (oversized || !url) {
        setTooLarge(true);
        setFailed(false);
        setTimeout(() => setTooLarge(false), 2400);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
      setTooLarge(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 1800);
    }
  }, [buildState]);

  const sizeCls = size === 'sm'
    ? 'text-[11px] px-2 py-1'
    : 'text-[12px] px-2.5 py-1.5';

  const label = tooLarge
    ? 'Design too large to share'
    : failed
      ? 'Copy failed'
      : copied
        ? 'Link copied'
        : 'Copy share link';

  return (
    <button
      onClick={onClick}
      title="Copy a link that reproduces this design — includes pattern, params, seed, layers, and canvas."
      className={`${sizeCls} rounded-md border text-ink-soft transition-colors font-medium ${
        copied
          ? 'border-violet/50 text-accent bg-accent/10'
          : tooLarge
            ? 'border-amber-400/50 text-amber-600'
            : failed
              ? 'border-tone-strong/40 text-tone-strong'
              : 'border-hairline hover:text-ink hover:border-ink-soft'
      }`}
    >
      {label}
    </button>
  );
}
