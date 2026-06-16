// Tracer-bullet artifact generator: hardcoded string -> opentype.js -> TextField
// -> the REAL buildLayerSVG export -> an engrave-ready .svg file for LightBurn.
// Run: node scripts/text-tracer-sample.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TextField } from '../src/lib/text/TextField.js';
import { buildLayerSVG } from '../src/lib/svgExport.js';
import { loadWorkSans } from '../src/test/loadWorkSans.js';

const font = loadWorkSans();
const CANVAS = 384; // px (= 101.6mm @ 96PPI), matches the studio's default bed
const tf = new TextField({ text: 'Sara', font, fontSize: 130, x: 36, y: 240, renderMode: 'fill' });

// Engrave role => black, per fabrication.js (LightBurn convention).
const layer = { id: 'text-1', name: 'Name', visible: true, color: '#000000', opacity: 100, bgOpacity: 0, role: 'engrave', patternType: 'textfield', seed: 0 };

const svg = buildLayerSVG(layer, tf, CANVAS, CANVAS, { metadata: true });
const out = fileURLToPath(new URL('../docs/text-tracer-sample.svg', import.meta.url));
writeFileSync(out, svg);
console.log('wrote', out, `(${svg.length} bytes)`);
