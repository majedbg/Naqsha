// Decodes a canvas data-URI captured by the headless browser into a PNG in
// src/examples/. The MCP browser_evaluate saves its result one level above the
// app root, so we look there.
//
// Run:  node scripts/decodeThumb.mjs <id>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const id = process.argv[2];
if (!id) throw new Error('usage: node scripts/decodeThumb.mjs <id>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', `${id}.datauri.txt`);

let s = readFileSync(src, 'utf8').trim();
if (s.startsWith('"')) s = JSON.parse(s);
if (s.startsWith('ERR:')) throw new Error(s);

const b64 = s.replace(/^data:image\/png;base64,/, '');
const buf = Buffer.from(b64, 'base64');
const out = join(root, 'src', 'examples', `${id}.png`);
writeFileSync(out, buf);
console.log(`wrote ${out} (${buf.length} bytes)`);
