// motifLibraryEntitlement.test.js — P4-1
//
// The PREMIUM entitlement scaffold around "Save to my library" (D1). It ships
// OFF: everyone is entitled now (returns true), and flipping it to a real gate
// is a ONE-LINE change. This is DISTINCT from the login gate (D1's "requires
// login"), which is enforced separately in the UI — this module never encodes
// the login requirement.

import { describe, it, expect } from 'vitest';
import { canUseGlobalLibrary } from './motifLibraryEntitlement';

describe('canUseGlobalLibrary — premium scaffold (ships OFF = free for all)', () => {
  it('is entitled for a signed-in free user', () => {
    expect(canUseGlobalLibrary({ user: { id: 'u1' }, tier: 'free' })).toBe(true);
  });

  it('is entitled regardless of tier (scaffold OFF → everyone)', () => {
    expect(canUseGlobalLibrary({ user: { id: 'u1' }, tier: 'pro' })).toBe(true);
    expect(canUseGlobalLibrary({ user: { id: 'u1' }, tier: 'studio' })).toBe(true);
    expect(canUseGlobalLibrary({ user: { id: 'u1' }, tier: 'guest' })).toBe(true);
  });

  it('does NOT encode the login requirement (entitlement is premium-only)', () => {
    // The login gate is a separate UI concern; the entitlement stays true even
    // with no user so the two gates never get conflated.
    expect(canUseGlobalLibrary({ user: null, tier: 'guest' })).toBe(true);
  });

  it('tolerates being called with no argument', () => {
    expect(canUseGlobalLibrary()).toBe(true);
  });
});
