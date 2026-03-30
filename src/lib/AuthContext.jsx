import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

// Derive effective tier from profile + subscription state
function getEffectiveTier(profile) {
  if (!profile) return 'guest';
  const { tier, subscription_status, subscription_current_period_end } = profile;

  // Pro with active or not-yet-expired canceled subscription
  if (tier === 'pro' || tier === 'studio') {
    if (subscription_status === 'active' || subscription_status === 'trialing') return tier;
    // Canceled but period hasn't ended yet — still Pro
    if (subscription_status === 'canceled' && subscription_current_period_end) {
      if (new Date(subscription_current_period_end) > new Date()) return tier;
    }
    // Past due — grace period, still Pro
    if (subscription_status === 'past_due') return tier;
    // No subscription info but tier is set (e.g. manually set in DB) — trust it
    if (!subscription_status) return tier;
    // Subscription fully expired
    return 'free';
  }

  return tier || 'free';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!supabase); // only loading if supabase is configured

  // Fetch profile from DB (upsert if missing — trigger may not have fired)
  const fetchProfile = useCallback(async (user) => {
    if (!supabase || !user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) {
      console.warn('Failed to fetch profile:', error.message, '— attempting upsert');
      // Profile row may not exist (trigger didn't fire); create it client-side
      const meta = user.user_metadata || {};
      const { data: upserted, error: upsertErr } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          display_name: meta.full_name || meta.name || user.email?.split('@')[0],
          avatar_url: meta.avatar_url || null,
        }, { onConflict: 'id' })
        .select('*')
        .single();
      if (upsertErr) {
        console.error('Profile upsert failed:', upsertErr.message);
        return null;
      }
      return upserted;
    }
    return data;
  }, []);

  // Initialize: restore session + listen for auth changes
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Get current session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        const p = await fetchProfile(s.user);
        if (mounted) setProfile(p);
      }
      if (mounted) setLoading(false);
    });

    // Timeout fallback: if session check takes >4s, stop loading
    const timeout = setTimeout(() => {
      if (mounted && loading) setLoading(false);
    }, 4000);

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        setSession(s);
        if (s?.user) {
          const p = await fetchProfile(s.user);
          if (mounted) setProfile(p);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async () => {
    if (!supabase) return;
    const redirectTo = `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign-out failed:', error.message);
    setSession(null);
    setProfile(null);
  }, []);

  const tier = getEffectiveTier(profile);
  console.log('[Auth] profile:', profile, 'tier:', tier);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    tier,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
