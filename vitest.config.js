import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test harness for Naqsha (AR-P0).
//
// Default environment is `node` — most targets (geometry, shareLink, gating,
// paramOps, creditModel) are pure and run fastest there. A test that needs the
// DOM (component renders, DOMParser-based path extraction) opts in per-file with
// a docblock comment:
//
//     // @vitest-environment jsdom
//
// The React plugin is reused from the app build so JSX transforms identically in
// tests and production.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // The heavy full-shell renders (e.g. StudioRoute's eight-region gate) pass in
    // isolation but intermittently exceed Vitest's 5s default when the suite runs
    // all ~180 files concurrently under worker contention. Raised to 15s to absorb
    // that load-induced variance; per-test logic is unchanged.
    //
    // CAVEAT — this is NOT the only clock a test runs against (#170). Testing
    // Library's async helpers (`waitFor`, `findBy*`) have their OWN budget,
    // `asyncUtilTimeout`, which defaults to **1000ms** and does not consult
    // `testTimeout` at all. We deliberately leave that default alone rather than
    // raising it globally, so a genuine hang still fails fast in ~525 files. The
    // consequence is that a `waitFor` wrapping expensive synchronous work is
    // living on a 1000ms budget no matter what this number says — which is how
    // AnchorGhostOverlay.hiddenHost.test.jsx flaked for five false alarms during
    // PRD #143 while appearing to have 15s of headroom. If a file's `waitFor`
    // legitimately needs longer, pass `{ timeout }` at the call site.
    testTimeout: 15000,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
    },
  },
});
