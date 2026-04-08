import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function AuthButton() {
  const { user, profile, tier, loading, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (loading) {
    return <span className="text-[10px] text-gray-600">...</span>;
  }

  // Guest: show sign-in button
  if (!user) {
    return (
      <button
        onClick={signIn}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white text-[11px] text-gray-700 font-medium hover:bg-gray-100 transition-colors"
      >
        <GoogleLogo />
        Sign in
      </button>
    );
  }

  // Logged in: avatar + dropdown
  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'studio' ? 'Studio' : 'Free';
  const tierColor = tier === 'pro' || tier === 'studio' ? 'text-accent' : 'text-gray-500';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-5 h-5 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-accent/30 flex items-center justify-center text-[9px] text-accent font-bold">
            {(profile?.display_name || user.email || '?')[0].toUpperCase()}
          </div>
        )}
        <span className={`text-[10px] font-medium ${tierColor}`}>{tierLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-7 bg-[#2a2a2a] border border-[#444] rounded-lg shadow-xl w-52 py-2 z-50">
          <div className="px-3 py-1.5 border-b border-[#333]">
            <p className="text-xs text-gray-200 truncate">{profile?.display_name || 'User'}</p>
            <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            <p className={`text-[10px] font-medium mt-0.5 ${tierColor}`}>{tierLabel} tier</p>
          </div>
          {(tier === 'pro' || tier === 'studio') && (
            <div className="px-3 py-1.5 border-b border-[#333]">
              <p className="text-[10px] text-gray-500">
                AI Credits: <span className="text-accent font-medium">{profile?.ai_credits ?? 0}</span>
              </p>
            </div>
          )}
          {tier === 'free' && (
            <button
              className="w-full px-3 py-1.5 text-left text-[11px] text-accent hover:bg-[#333] transition-colors"
              onClick={() => { setOpen(false); /* placeholder */ }}
            >
              Upgrade to Pro
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-left text-[11px] text-gray-400 hover:bg-[#333] hover:text-gray-200 transition-colors"
            onClick={() => { setOpen(false); signOut(); }}
          >
            Sign out
          </button>
        </div>
      )}
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
