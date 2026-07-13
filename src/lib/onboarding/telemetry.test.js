// Guest onboarding S1 — instrumentation seam (D22). A no-op-by-default sink
// so later slices can emit events without a real analytics layer existing yet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitOnboardingEvent, ONBOARDING_EVENTS } from './telemetry';

describe('onboarding telemetry seam (S1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the locked event-name constants (D22)', () => {
    expect(ONBOARDING_EVENTS).toMatchObject({
      AHA_REACHED: expect.any(String),
      SHUFFLE_CLICK: expect.any(String),
      LENS_OPENED: expect.any(String),
      MODULATION_OPENED: expect.any(String),
      EXPORT_REACHED: expect.any(String),
      SECOND_PARAM_CHANGE: expect.any(String),
      SIGNUP_AFTER_VALUE: expect.any(String),
    });
    // Names should be distinct — a typo'd duplicate silently merges two events.
    const values = Object.values(ONBOARDING_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('emitting a known event never throws, with or without a payload', () => {
    expect(() => emitOnboardingEvent(ONBOARDING_EVENTS.AHA_REACHED)).not.toThrow();
    expect(() => emitOnboardingEvent(ONBOARDING_EVENTS.SHUFFLE_CLICK, { seed: 'phyllotaxis' })).not.toThrow();
  });

  it('emitting an unknown event name never throws (defensive no-op sink)', () => {
    expect(() => emitOnboardingEvent('not-a-real-event', { any: 'thing' })).not.toThrow();
  });

  it('emitting with a circular payload never throws (sink must not blindly JSON.stringify)', () => {
    const payload = {};
    payload.self = payload;
    expect(() => emitOnboardingEvent(ONBOARDING_EVENTS.AHA_REACHED, payload)).not.toThrow();
  });
});
