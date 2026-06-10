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
