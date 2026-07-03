// S9 browser self-verification (issue #58). Drives the REAL app: upload a
// multi-colour ornament → extraction → Save step shows PALETTE swatches +
// provenance fields + tags/favorite → save → Library detail shows palette
// chips, provenance, tags, favorite. Then edits metadata from the detail view.
//
// Ephemeral: screenshots → .playwright-mcp/s9-verification/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.S9_URL || 'http://localhost:5213';
const OUT = new URL('../.playwright-mcp/s9-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[s9]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// Draw a high-contrast repeating motif — the proven S8 fixture (solid black
// diamonds on white in a 4×4 lattice) — so the tracer reliably finds contours.
// The palette extractor surfaces the two dominant tones (white ground + black),
// exercising real multi-swatch rendering.
async function uploadImage(page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#000000';
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const cx = 32 + gx * 64;
        const cy = 32 + gy * 64;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx + 18, cy);
        ctx.lineTo(cx, cy + 18);
        ctx.lineTo(cx - 18, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    const dataURL = c.toDataURL('image/png');
    const bin = atob(dataURL.split(',')[1]);
    const raw = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
    const file = new File([raw], 'ornament.png', { type: 'image/png' });
    const input = document.querySelector('input[aria-label="Choose a photo"]');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function openStepper(page) {
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Extract from Photo…', { exact: true }).click();
  await page.getByRole('heading', { name: /extract pattern from photo/i }).waitFor();
}

async function walkToSave(page) {
  await page.getByRole('button', { name: /skip/i }).first().click();
  await page.getByRole('button', { name: /trace region/i }).click();
  await page.getByRole('button', { name: /continue/i }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /save to library/i }).waitFor();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // ---- Extraction → Save step ----
  await openStepper(page);
  await uploadImage(page);
  await walkToSave(page);

  const swatches = page.getByTestId('palette-swatches');
  await swatches.waitFor({ timeout: 8000 });
  const swText = await swatches.textContent();
  check('Save step shows palette swatches', /#[0-9a-f]{6}/i.test(swText), swText.slice(0, 80));
  const swatchCount = await swatches.locator('span[title]').count();
  check('palette has multiple swatches', swatchCount >= 2, `count=${swatchCount}`);

  // Provenance + organization — scoped to their fieldsets (the studio behind
  // the modal also has a "Material" control, so global getByLabel is ambiguous).
  const provFs = page.getByRole('group', { name: /provenance/i });
  await provFs.getByLabel('Source type').selectOption('in_person');
  await provFs.getByLabel('Material').selectOption('stone');
  await provFs.getByLabel('Tradition or style').fill('Gothic tracery');

  const org = page.getByRole('group', { name: /organize/i });
  await org.getByLabel('Note').fill('Uppsala vault rib crossing');
  const tag = org.getByLabel('Add a tag');
  await tag.fill('gothic');
  await tag.press('Enter');
  await tag.fill('vault');
  await tag.press('Enter');
  const chips = await page.getByTestId('tag-chip').count();
  check('two tag chips added', chips === 2, `chips=${chips}`);
  await org.getByRole('button', { name: /^favorite$/i }).click();
  check('favorite toggled on', (await org.getByRole('button', { name: /favorited/i }).count()) === 1);
  await page.getByLabel('Title', { exact: true }).fill('Uppsala vault');

  await page.screenshot({ path: OUT + '01-save-step.png', fullPage: false });

  // Save (guest → session-only; entity still registered + browsable).
  await page.getByRole('button', { name: /save to library/i }).click();
  await page.waitForTimeout(1000);
  const cont = page.getByRole('button', { name: /^continue$/i });
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- Library detail ----
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Pattern Library…', { exact: true }).click();
  await page.getByRole('heading', { name: /pattern library/i }).waitFor();
  check('favorite star on card', (await page.getByTestId('favorite-star').count()) >= 1);
  await page.getByTestId('library-card').first().click();

  const prov = page.getByTestId('provenance-meta');
  await prov.waitFor({ timeout: 8000 });
  const provText = await prov.textContent();
  check('detail shows source', /In person/.test(provText), provText.slice(0, 100));
  check('detail shows material', /Stone/.test(provText));
  check('detail shows tradition', /Gothic tracery/.test(provText));
  check('detail shows note', /rib crossing/.test(provText));
  const tags = await page.getByTestId('tag-list').textContent();
  check('detail shows tags', /gothic/.test(tags) && /vault/.test(tags), tags);
  const paletteChips = await page.getByTestId('palette-chip').count();
  check('detail shows palette chips', paletteChips >= 2, `chips=${paletteChips}`);
  await page.screenshot({ path: OUT + '02-library-detail.png', fullPage: true });

  // ---- Editable-later ----
  await page.getByTestId('edit-details').click();
  await page.getByLabel('Edit note').fill('Edited note from detail view');
  await page.getByLabel('Edit title').fill('Renamed vault');
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForTimeout(500);
  const provText2 = await page.getByTestId('provenance-meta').textContent();
  check('metadata edit persisted in-session', /Edited note from detail view/.test(provText2), provText2.slice(0, 100));
  check(
    'title edit reflected in detail',
    (await page.getByRole('heading', { name: 'Renamed vault' }).count()) === 1
  );
  await page.screenshot({ path: OUT + '03-after-edit.png', fullPage: false });

  // ---- Title edit propagates to the picker (adversarial-review MAJOR) ----
  // Close the Library, open the pattern picker via the Inspector's "Change"
  // trigger, and confirm the custom-family card carries the NEW title with no
  // stale copy left behind (one entity, two surfaces).
  await page.keyboard.press('Escape'); // detail → grid
  await page.keyboard.press('Escape'); // grid → closed
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /change/i }).first().click();
  await page.getByText('Renamed vault', { exact: true }).waitFor({ timeout: 8000 });
  check('picker card label follows the title edit', true);
  const stale = await page.getByText('Uppsala vault', { exact: true }).count();
  check('no stale title left in the picker', stale === 0, `stale=${stale}`);
  await page.screenshot({ path: OUT + '04-picker-renamed.png', fullPage: false });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  log('----');
  log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    log('FAILURES:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  log('ALL PASS');
}

main().catch((e) => {
  console.error('[s9] fatal', e);
  process.exit(2);
});
