import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Note: `jimp` in package.json resolves to vendor/jimp-stub (file: dep) — a
// stub satisfying @realness.online/potrace's require('jimp') (extraction
// Vectorizer, issue #49); no Jimp code path is ever exercised.
export default defineConfig({
  plugins: [react()],
})
