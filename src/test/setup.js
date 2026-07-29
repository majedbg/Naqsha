// Global test setup (AR-P0). Loaded for every test file regardless of environment.
//
// `@testing-library/jest-dom` adds matchers like `toBeInTheDocument`. Its import
// is a no-op under the node environment (no DOM matchers are exercised there), so
// it is safe to load unconditionally.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount any React trees rendered during a test so DOM state never leaks
// between tests sharing the jsdom document.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia. The app intentionally has no
// prefers-color-scheme listener today, but later WIs (e.g. AR-3A canvas/UI
// hooks) may touch it — provide an inert stub so a missing API never masquerades
// as a behavior bug. Only define it when a window exists (jsdom environment).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom implements no Web Animations API, so `element.animate` is simply absent
// — the same situation as matchMedia above, handled the same way: an inert stub,
// so a missing API never masquerades as a behavior bug.
//
// `DragNumber`'s `flashSignal` drives its glow through `element.animate()`
// (PRD #184, PR 2 §3) precisely so the motion costs no React re-renders. The
// component guards on `typeof el.animate === "function"` and simply does not
// flash without one, which would make every flash assertion pass VACUOUSLY;
// this stub is what lets a spy see the call at all. It returns the one method
// the caller uses — `cancel`, for the effect's cleanup — plus the rest of the
// Animation surface as no-ops, so a future consumer does not hit `undefined`.
//
// Only defined when absent, so a real implementation (a browser-mode run) always
// wins. Guarded on `Element` because this file also loads under the node
// environment, where there is no DOM at all.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    return {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      currentTime: 0,
      playState: 'finished',
      onfinish: null,
      oncancel: null,
    };
  };
}
