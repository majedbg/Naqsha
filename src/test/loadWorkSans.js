// Test fixture: load the bundled Work Sans OFL font as an opentype.js Font.
// Shared by the text-tool unit tests so the parse boilerplate lives in one place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Interop-robust: opentype.js exposes its API on either the default or the
// namespace depending on the loader (vitest vs vite-node vs bundler).
import * as opentypeModule from 'opentype.js';
const opentype = opentypeModule.default ?? opentypeModule;

export function loadWorkSans() {
  const path = fileURLToPath(
    new URL('../assets/fonts/WorkSans-Regular.ttf', import.meta.url),
  );
  const buf = readFileSync(path);
  return opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}
