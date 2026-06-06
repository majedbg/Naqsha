// Emits the share-link token for each example so a headless browser can render
// it for thumbnailing. Mirrors src/lib/shareLink.js encodeShare(): the app's
// mount effect hydrates layers/canvas/bgColor from ?s=<token>.
//
// Run:  node scripts/shareTokens.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/examples');

function encodeShare(state) {
  const json = JSON.stringify({ v: 1, ...state });
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const out = [];
for (const f of files) {
  const ex = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const { layers, canvasW, canvasH, bgColor } = ex.config;
  const token = encodeShare({ layers, canvasW, canvasH, bgColor, presetIndex: 18 });
  out.push({ id: ex.id, token });
}
console.log(JSON.stringify(out));
