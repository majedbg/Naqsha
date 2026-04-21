import { useGate } from '../lib/useGate';
import UpgradePrompt from './UpgradePrompt';

/**
 * Wrapper that gates content behind a tier check.
 *
 * mode='dim':    renders children at reduced opacity with lock overlay
 * mode='inline': replaces children entirely with an upgrade prompt
 */
export default function GatedFeature({ feature, value, mode = 'dim', children }) {
  const { check } = useGate();
  const result = check(feature, value);

  if (result.allowed) return children;

  if (mode === 'inline') {
    return (
      <UpgradePrompt
        upgradeTarget={result.upgradeTarget}
        reason={result.reason}
        compact
      />
    );
  }

  // dim mode
  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-1.5 bg-panel/90 px-2 py-1 rounded text-[10px]">
          <LockIcon />
          <UpgradePrompt
            upgradeTarget={result.upgradeTarget}
            reason={result.reason}
            compact
          />
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
