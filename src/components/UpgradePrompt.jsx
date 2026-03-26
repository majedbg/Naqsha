import { useAuth } from '../lib/AuthContext';

/**
 * Context-aware upgrade CTA.
 * - upgradeTarget='free' + guest → Google sign-in button
 * - upgradeTarget='pro' + free → Upgrade to Pro button (placeholder)
 * - compact: smaller inline variant for parameter locks
 */
export default function UpgradePrompt({ upgradeTarget = 'free', reason, compact = false }) {
  const { signIn } = useAuth();

  if (upgradeTarget === 'free') {
    if (compact) {
      return (
        <button
          onClick={signIn}
          className="text-[10px] text-accent hover:text-accent-hover transition-colors"
        >
          Sign in to unlock
        </button>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        {reason && <p className="text-[11px] text-gray-500">{reason}</p>}
        <button
          onClick={signIn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-xs text-gray-700 font-medium hover:bg-gray-100 transition-colors"
        >
          <GoogleLogo />
          Sign in with Google
        </button>
      </div>
    );
  }

  // Pro upgrade
  if (compact) {
    return (
      <span className="text-[10px] text-accent font-medium">Pro</span>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      {reason && <p className="text-[11px] text-gray-500">{reason}</p>}
      <button
        className="px-3 py-1.5 rounded bg-accent/20 text-xs text-accent font-medium hover:bg-accent/30 transition-colors"
        onClick={() => { /* Stripe checkout placeholder */ }}
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
