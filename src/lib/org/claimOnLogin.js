// claimOnLogin.js — login-wiring layer (Phase 3).
// Client-side gate that triggers the membership claim RPC once per verified
// session. Mirrors the server-side jwt_email_verified() gate in the
// claim_memberships() RPC (defense in depth).

import { claimOnLogin } from './membershipService';

// Tracks user ids whose claim has been triggered, so repeated auth events
// (INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED all fire onAuthStateChange)
// don't re-fire the claim. Marked optimistically and un-marked on error so a
// transient failure can still retry on the next auth event.
const claimed = new Set();

function isEmailVerified(session) {
  return !!session?.user?.email_confirmed_at;
}

export async function maybeClaimOnLogin(session) {
  if (!isEmailVerified(session)) return { claimed: false };

  const uid = session.user.id;
  if (claimed.has(uid)) return { claimed: false, alreadyClaimed: true };

  claimed.add(uid); // optimistic — also dedupes concurrent in-flight calls
  try {
    await claimOnLogin();
    return { claimed: true };
  } catch (error) {
    claimed.delete(uid); // un-mark so a later auth event can retry
    return { claimed: false, error };
  }
}
