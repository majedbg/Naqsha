#!/usr/bin/env node
// Calibration comparison page (render-vs-photo harness, ADR 0003).
//
// Builds docs/material-references/calibration/round-<NN>.html: one row per
// preview material — [render: studio] [render: hospital-room-2] [reference
// staged shot] [reference flat swatch] — with the LIVE constants that produced
// the renders (resolveAppearance over materialArchetypes.js + the
// hdriEnvironments.js calibrated intensities), so each round documents exactly
// what it shows. SELF-CONTAINED: every image is downscaled to ≤640px (macOS
// `sips`) and base64-embedded, so the file is a single sendable artifact.
//
// Usage:
//   node scripts/calibration-compose.mjs              # writes/overwrites round-01
//   node scripts/calibration-compose.mjs --round 2    # after tuning constants
//
// Reference photos (docs/material-references/canal-plastics, READ-ONLY):
// per STAGING-NOTES.md, `__1` is the staged "corner on the crystal cube" hero
// shot (optical-behavior reference), `__2` the flat top-down swatch (albedo
// reference). None of the five mapped handles are in the manifest's
// duplicate_image_groups. Plywood materials have no catalog reference.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAL_DIR = path.join(ROOT, 'docs/material-references/calibration');
const RENDER_DIR = path.join(CAL_DIR, 'renders');
const REF_DIR = path.join(ROOT, 'docs/material-references/canal-plastics');

const { DEFAULT_PREVIEW_MATERIALS } = await import(path.join(ROOT, 'src/lib/materialPreview.js'));
const { resolveAppearance } = await import(path.join(ROOT, 'src/lib/three3d/resolveAppearance.js'));
const { HDRI_ENVIRONMENTS } = await import(path.join(ROOT, 'src/lib/three3d/hdriEnvironments.js'));

const SCENES = ['studio', 'hospital-room-2'];
// materialId → Canal Plastics product handle. `__1` staged / `__2` swatch
// (verified against STAGING-NOTES.md; gotham's odd-resolution __1 confirmed a
// normal crystal-cube hero shot by direct viewing). null → render-only row.
const REF_HANDLE = {
  clear: 'clear-colorless-acrylic-sheet',
  'green-fluorescent': '5320-green-fluorescent-acrylic-sheet',
  'turquoise-opaque': '2324-turquoise-opaque-acrylic-sheet',
  'blue-translucent': '2051-blue-translucent-acrylic-sheet',
  'gotham-black-pearl': 'gotham-black-pearl-acrylic-sheet',
  'birch-plywood': null,
  'walnut-plywood': null,
};
const STAGED_INDEX = 1;
const SWATCH_INDEX = 2;
const MAX_EDGE = 640;
const JPEG_QUALITY = '80';

function parseArgs(argv) {
  const out = { round: 1 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--round') out.round = Number(argv[++i]);
  }
  if (!Number.isInteger(out.round) || out.round < 1) throw new Error('--round must be a positive integer');
  return out;
}

// Downscale to ≤MAX_EDGE and re-encode as JPEG via macOS `sips`, return a data URI.
function embedImage(srcPath, tmpDir) {
  const tmp = path.join(tmpDir, `${path.basename(srcPath).replace(/\.\w+$/, '')}.jpg`);
  execFileSync(
    'sips',
    ['-s', 'format', 'jpeg', '-s', 'formatOptions', JPEG_QUALITY, '-Z', String(MAX_EDGE), srcPath, '--out', tmp],
    { stdio: 'pipe' },
  );
  return `data:image/jpeg;base64,${readFileSync(tmp).toString('base64')}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cell(label, dataUri, meta = '') {
  const body = dataUri
    ? `<img src="${dataUri}" alt="${esc(label)}" loading="lazy">`
    : `<div class="missing">${esc(meta || 'missing')}</div>`;
  return `<figure>${body}<figcaption>${esc(label)}${dataUri && meta ? ` <span>${esc(meta)}</span>` : ''}</figcaption></figure>`;
}

const { round } = parseArgs(process.argv);
const roundName = `round-${String(round).padStart(2, '0')}`;
const outFile = path.join(CAL_DIR, `${roundName}.html`);
mkdirSync(CAL_DIR, { recursive: true });
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'calibration-compose-'));

try {
  const envMeta = SCENES.map((id) => {
    const e = HDRI_ENVIRONMENTS.find((x) => x.id === id);
    return `${id}: environmentIntensity ${e?.environmentIntensity}`;
  }).join(' · ');

  const rows = DEFAULT_PREVIEW_MATERIALS.map((material) => {
    const a = resolveAppearance(material);
    const constants = [
      ['tint', a.tintHex],
      ['transmission', a.transmission],
      ['roughness', a.roughness],
      ['metalness', a.metalness],
      ['ior', a.ior],
      ['edgeGain', a.edgeGain],
      ['clearcoat', a.clearcoat],
    ]
      .map(([k, v]) => `<span class="kv"><b>${k}</b> ${esc(v)}</span>`)
      .join('');

    const renderCells = SCENES.map((scene) => {
      const file = path.join(RENDER_DIR, `${material.id}__${scene}.png`);
      if (!existsSync(file)) return cell(`render — ${scene}`, null, 'no render (run calibration-capture)');
      const mtime = statSync(file).mtime.toISOString().slice(0, 16).replace('T', ' ');
      return cell(`render — ${scene}`, embedImage(file, tmpDir), mtime);
    }).join('');

    const handle = REF_HANDLE[material.id];
    const refCells = handle
      ? [
          [STAGED_INDEX, 'reference — staged (crystal cube)'],
          [SWATCH_INDEX, 'reference — flat swatch'],
        ]
          .map(([idx, label]) => {
            const file = path.join(REF_DIR, `${handle}__${idx}.jpg`);
            return existsSync(file)
              ? cell(label, embedImage(file, tmpDir), `${handle}__${idx}`)
              : cell(label, null, `missing ${handle}__${idx}.jpg`);
          })
          .join('')
      : `${cell('reference — staged', null, 'no catalog reference')}${cell('reference — flat swatch', null, 'no catalog reference')}`;

    return `
    <section class="row">
      <header>
        <h2>${esc(material.name)} <code>${esc(material.id)}</code></h2>
        <p class="archetype">archetype <code>${esc(a.archetype)}</code>${constants}</p>
      </header>
      <div class="cells">${renderCells}${refCells}</div>
    </section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Material calibration — ${roundName}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #101014; color: #e8e8ee;
         font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #9a9aa8; margin: 0 0 24px; font-size: 12px; }
  .row { margin-bottom: 32px; border-top: 1px solid #2a2a34; padding-top: 16px; }
  .row h2 { font-size: 15px; margin: 0 0 2px; }
  .row code { background: #1d1d26; border-radius: 4px; padding: 1px 6px; font-size: 12px; }
  .archetype { margin: 0 0 10px; color: #b8b8c6; font-size: 12px; }
  .kv { margin-left: 10px; white-space: nowrap; }
  .kv b { color: #8a8a9a; font-weight: 500; }
  .cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  figure { margin: 0; }
  figure img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #000;
               border-radius: 6px; display: block; }
  figcaption { font-size: 11px; color: #9a9aa8; margin-top: 4px; }
  figcaption span { color: #62626f; }
  .missing { width: 100%; aspect-ratio: 1; border: 1px dashed #3a3a46; border-radius: 6px;
             display: flex; align-items: center; justify-content: center;
             color: #62626f; font-size: 12px; text-align: center; padding: 8px; box-sizing: border-box; }
  @media (max-width: 900px) { .cells { grid-template-columns: repeat(2, 1fr); } }
</style>
<body>
  <h1>3D material preview calibration — ${roundName}</h1>
  <p class="meta">
    Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ·
    tone mapping: THREE.NeutralToneMapping · specimen: A5 210×148mm, 3mm, zoom-fit 3/4 view
    (35° elev / 45° azim) · ${esc(envMeta)} ·
    references: Canal Plastics (__1 staged hero, __2 flat swatch) ·
    columns: render(studio) / render(hospital-room-2) / reference staged / reference swatch
  </p>
  ${rows}
</body>
</html>`;

  writeFileSync(outFile, html);
  const kb = Math.round(statSync(outFile).size / 1024);
  console.log(`Wrote ${outFile} (${kb} KB)`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
