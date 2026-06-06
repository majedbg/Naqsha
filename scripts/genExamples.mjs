// Authoring helper for curated example configs.
//
// Writes src/examples/<id>.json from the specs below, building each layer the
// same way the app's createLayer() does (importing the real DEFAULT_PARAMS) so
// the configs stay valid as the param schema evolves. Thumbnails are rendered
// separately by scripts/renderThumbs.mjs.
//
// Run:  node scripts/genExamples.mjs
import { DEFAULT_PARAMS } from '../src/constants.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../src/examples');
const PPI = 96;

function layer({ patternType, seed, color, name, opacity = 100, params = {} }) {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, '-')}-${patternType}`,
    name,
    color,
    opacity,
    visible: true,
    bgColor: '#ffffff',
    bgOpacity: 0,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType], ...params },
    seed,
    randomizeKeys: [],
    paramsCache: {},
    role: 'cut',
    penSlot: 1,
  };
}

const EXAMPLES = [
  {
    id: 'bloom',
    name: 'Bloom',
    description: 'Phyllotaxis spiral — sunflower geometry in saffron.',
    order: 1,
    config: {
      canvasW: 12 * PPI,
      canvasH: 12 * PPI,
      bgColor: '#0a1628',
      layers: [
        layer({
          name: 'Bloom',
          patternType: 'phyllotaxis',
          seed: 4211,
          color: '#f7dc6f',
          params: { count: 1400, maxSize: 14, minSize: 2, spacing: 13, strokeWeight: 1 },
        }),
      ],
    },
  },
  {
    id: 'drift',
    name: 'Drift',
    description: 'Flow field — particles tracing a curl-noise current.',
    order: 2,
    config: {
      canvasW: 12 * PPI,
      canvasH: 18 * PPI,
      bgColor: '#0a1628',
      layers: [
        layer({
          name: 'Drift',
          patternType: 'flowfield',
          seed: 9072,
          color: '#4ecdc4',
          params: { particleCount: 2000, stepLength: 4, curlStrength: 70, noiseScale: 0.0035 },
        }),
      ],
    },
  },
  {
    id: 'orbit',
    name: 'Orbit',
    description: 'Two spirographs overlaid — madder over cobalt.',
    order: 3,
    config: {
      canvasW: 12 * PPI,
      canvasH: 12 * PPI,
      bgColor: '#0a1628',
      layers: [
        layer({
          name: 'Inner',
          patternType: 'spirograph',
          seed: 1337,
          color: '#45b7d1',
          opacity: 70,
          params: { R: 360, r: 220, d: 160, revolutions: 40 },
        }),
        layer({
          name: 'Outer',
          patternType: 'spirograph',
          seed: 5150,
          color: '#ff6b6b',
          params: { R: 440, r: 565, d: 181, revolutions: 35 },
        }),
      ],
    },
  },
];

for (const ex of EXAMPLES) {
  const out = {
    id: ex.id,
    name: ex.name,
    description: ex.description,
    order: ex.order,
    thumb: `${ex.id}.png`,
    config: ex.config,
  };
  const path = join(outDir, `${ex.id}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  console.log('wrote', path);
}
