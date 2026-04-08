import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

const PROFILE_CACHE_KEY = "sonoform-profile";
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function cacheProfile(profile) {
  try {
    localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ profile, ts: Date.now() })
    );
  } catch {
    /* storage full or unavailable */
  }
}

function loadCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const { profile, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* */
  }
}

// Derive effective tier from profile + subscription state
function getEffectiveTier(profile) {
  if (!profile) return "guest";
  const { tier, subscription_status, subscription_current_period_end } =
    profile;

  // Pro with active or not-yet-expired canceled subscription
  if (tier === "pro" || tier === "studio") {
    if (subscription_status === "active" || subscription_status === "trialing")
      return tier;
    // Canceled but period hasn't ended yet — still Pro
    if (subscription_status === "canceled" && subscription_current_period_end) {
      if (new Date(subscription_current_period_end) > new Date()) return tier;
    }
    // Past due — grace period, still Pro
    if (subscription_status === "past_due") return tier;
    // No subscription info but tier is set (e.g. manually set in DB) — trust it
    if (!subscription_status) return tier;
    // Subscription fully expired
    return "free";
  }

  return tier || "free";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // Hydrate profile from cache immediately — no loading flash
  const [profile, setProfile] = useState(() => loadCachedProfile());
  const [loading, setLoading] = useState(!!supabase); // only loading if supabase is configured

  // Fetch profile from DB (upsert if missing — trigger may not have fired)
  const fetchProfile = useCallback(async (user) => {
    if (!supabase || !user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) {
      console.warn(
        "Failed to fetch profile:",
        error.message,
        "— attempting upsert"
      );
      // Profile row may not exist (trigger didn't fire); create it client-side
      const meta = user.user_metadata || {};
      const { data: upserted, error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email,
            display_name:
              meta.full_name || meta.name || user.email?.split("@")[0],
            avatar_url: meta.avatar_url || null,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();
      if (upsertErr) {
        console.error("Profile upsert failed:", upsertErr.message);
        // Fallback: construct minimal profile from user metadata
        // so tier resolves to "free" (authenticated) not "guest"
        const fallbackMeta = user.user_metadata || {};
        return {
          id: user.id,
          email: user.email,
          display_name:
            fallbackMeta.full_name || fallbackMeta.name || user.email?.split("@")[0],
          avatar_url: fallbackMeta.avatar_url || null,
          tier: "free",
        };
      }
      return upserted;
    }
    return data;
  }, []);

  // Initialize: use onAuthStateChange as single source of truth.
  // Sequence counter ensures only the latest event's profile fetch wins,
  // preventing stale results from overwriting fresh ones.
  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    let seq = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;
      setSession(s);

      if (s?.user) {
        const mySeq = ++seq;
        const p = await fetchProfile(s.user);
        // Only apply if this is still the latest event (prevents race)
        if (mySeq === seq && mounted) {
          setProfile(p);
          if (p) cacheProfile(p);
        }
      } else {
        seq++;
        setProfile(null);
        clearCachedProfile();
      }
      if (mounted) setLoading(false);
    });

    // Timeout fallback: if auth check takes >4s, stop loading
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async () => {
    if (!supabase) return;
    const redirectTo = `${
      import.meta.env.VITE_APP_URL || window.location.origin
    }/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign-out failed:", error.message);
    setSession(null);
    setProfile(null);
    clearCachedProfile();
  }, []);

  const tier = getEffectiveTier(profile);

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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
