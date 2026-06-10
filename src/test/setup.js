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
