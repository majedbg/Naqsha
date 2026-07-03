// S7 browser self-verification (issue #56). Drives the REAL app: upload a
// p4m-ish tiling (4-fold + mirror diamonds on a square lattice) → extraction →
// Review shows the DETECTED wallpaper group + confidence + the override
// dropdown (17 groups + auto + none) → override the group → save → Library
// detail shows the symmetry-group badge carrying the override.
//
// Ephemeral: screenshots → .playwright-mcp/s7-verification/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.S7_URL || 'http://localhost:5217';
const OUT = new URL('../.playwright-mcp/s7-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const WALLPAPER = /\b(p1|p2|pm|pg|cm|pmm|pmg|pgg|cmm|p4m|p4g|p4|p31m|p3m1|p3|p6m|p6)\b/;

const log = (...a) => console.log('[s7]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// A 4×4 lattice (period 64) of solid diamonds — each diamond has D4 (4-fold +
// mirror) symmetry, centered in its cell → the whole tiling is p4m. Proven to
// trace (the S8/S9 fixture); here the point is the SYMMETRY, not the palette.
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
        ctx.moveTo(cx, cy - 22);
        ctx.lineTo(cx + 22, cy);
        ctx.lineTo(cx, cy + 22);
        ctx.lineTo(cx - 22, cy);
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // ---- Extraction → Review ----
  await openStepper(page);
  await uploadImage(page);
  await page.getByRole('button', { name: /skip/i }).first().click();
  await page.getByRole('button', { name: /trace region/i }).click();

  // The symmetry proposal only appears with a detected lattice — its presence
  // proves lattice→symmetry ran end to end.
  const proposal = page.getByTestId('symmetry-proposal');
  await proposal.waitFor({ timeout: 30000 });
  check('Review shows the symmetry proposal (lattice detected → classified)', true);

  const badge = page.getByTestId('symmetry-badge');
  const badgeText = (await badge.textContent()) || '';
  const detected = (badgeText.match(WALLPAPER) || [])[0] || null;
  check('badge names a wallpaper group', WALLPAPER.test(badgeText), badgeText.trim());
  check('badge shows a confidence %', /%/.test(badgeText), badgeText.trim());
  log('detected group =', detected);

  const dropdown = page.getByLabel('Symmetry group');
  const optionCount = await dropdown.locator('option').count();
  check('override dropdown offers the 17 groups + auto + none', optionCount === 19, `options=${optionCount}`);
  await page.screenshot({ path: OUT + '01-review-detected.png', fullPage: false });

  // ---- Override the group ----
  await dropdown.selectOption('p6');
  const overText = (await badge.textContent()) || '';
  check('override updates the badge to the picked group', /p6/.test(overText), overText.trim());
  check('override is labelled manual', /manual/i.test(overText), overText.trim());
  await page.screenshot({ path: OUT + '02-review-override.png', fullPage: false });

  // ---- Save (guest → session-only; entity still registered + browsable) ----
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /save to library/i }).waitFor();
  await page.getByLabel('Title', { exact: true }).fill('Uppsala p6 vault');
  await page.getByRole('button', { name: /save to library/i }).click();
  await page.waitForTimeout(1000);
  const cont = page.getByRole('button', { name: /^continue$/i });
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- Library detail badge ----
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Pattern Library…', { exact: true }).click();
  await page.getByRole('heading', { name: /pattern library/i }).waitFor();
  await page.getByTestId('library-card').first().click();

  const libBadge = page.getByTestId('symmetry-badge');
  await libBadge.waitFor({ timeout: 8000 });
  const libText = (await libBadge.textContent()) || '';
  check('Library detail displays the symmetry badge', /p6/.test(libText), libText.trim());
  check('Library badge reflects the manual override', /manual/i.test(libText), libText.trim());
  await page.screenshot({ path: OUT + '03-library-badge.png', fullPage: true });

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
  console.error('[s7] fatal', e);
  process.exit(2);
});
