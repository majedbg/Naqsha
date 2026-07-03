// S10 browser self-verification (issue #59). Drives the REAL app: extract THREE
// ornaments with distinct metadata (different-coloured fixtures + material /
// tradition / tags set on the Save step) → open the Library → the facet rail
// shows values with counts → single + combined filters narrow the grid →
// zero-result state + clear-all recover → a detail opens from a filtered grid.
//
// Ephemeral: screenshots → .playwright-mcp/s10-verification/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.S10_URL || 'http://localhost:5210';
const OUT = new URL('../.playwright-mcp/s10-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[s10]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// Solid coloured diamonds on white — the proven traceable lattice fixture, with
// a per-entry diamond colour so each entry's extracted palette differs.
async function uploadImage(page, color) {
  await page.evaluate(async (col) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = col;
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
  }, color);
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

// Extract one entry end-to-end with distinct provenance/metadata.
async function extractOne(page, { color, title, material, tradition, tags }) {
  await openStepper(page);
  await uploadImage(page, color);
  await walkToSave(page);
  const provFs = page.getByRole('group', { name: /provenance/i });
  await provFs.getByLabel('Material').selectOption(material);
  await provFs.getByLabel('Tradition or style').fill(tradition);
  const org = page.getByRole('group', { name: /organize/i });
  const tag = org.getByLabel('Add a tag');
  for (const t of tags) {
    await tag.fill(t);
    await tag.press('Enter');
  }
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: /save to library/i }).click();
  await page.waitForTimeout(800);
  const cont = page.getByRole('button', { name: /^continue$/i });
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function openLibrary(page) {
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Pattern Library…', { exact: true }).click();
  await page.getByRole('heading', { name: /pattern library/i }).waitFor();
}

const cardCount = (page) => page.getByTestId('library-card').count();

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // ---- Seed three distinct extractions ----
  await extractOne(page, { color: '#1e5fbf', title: 'Blue star', material: 'stone', tradition: 'Islamic geometric', tags: ['star'] });
  await extractOne(page, { color: '#d13438', title: 'Red rose', material: 'glass', tradition: 'Gothic tracery', tags: ['rose'] });
  await extractOne(page, { color: '#2f9e44', title: 'Green star', material: 'wood', tradition: 'Islamic geometric', tags: ['star'] });

  // ---- Library + facet rail ----
  await openLibrary(page);
  check('three cards before filtering', (await cardCount(page)) === 3, `count=${await cardCount(page)}`);
  const rail = page.getByTestId('facet-rail');
  await rail.waitFor({ timeout: 8000 });
  check('facet rail is present', await rail.isVisible());

  // Counts: material has three singletons; tradition groups Islamic ×2.
  const railText = await rail.textContent();
  check('material facet lists Stone/Glass/Wood', /Stone/.test(railText) && /Glass/.test(railText) && /Wood/.test(railText), railText.slice(0, 200));
  const islamic = page.getByTestId('facet-chip-tradition-Islamic geometric');
  check('tradition "Islamic geometric" shows count 2', /2/.test(await islamic.textContent()), await islamic.textContent());
  const colorGroup = page.getByTestId('facet-color');
  check('color facet present', (await colorGroup.count()) === 1);
  await page.screenshot({ path: OUT + '01-facet-rail.png', fullPage: true });

  // ---- Single facet ----
  await page.getByTestId('facet-chip-material-glass').click();
  await page.waitForTimeout(150);
  check('material=glass narrows to 1 card', (await cardCount(page)) === 1, `count=${await cardCount(page)}`);
  await page.getByTestId('facet-chip-material-glass').click(); // toggle off
  await page.waitForTimeout(150);
  check('toggling glass off restores 3', (await cardCount(page)) === 3);

  // ---- Combined (AND across) ----
  await islamic.click();
  await page.getByTestId('facet-chip-material-wood').click();
  await page.waitForTimeout(150);
  check('Islamic AND wood narrows to 1 (Green star)', (await cardCount(page)) === 1, `count=${await cardCount(page)}`);
  await page.screenshot({ path: OUT + '02-combined-filter.png', fullPage: true });

  // Open detail from the FILTERED grid.
  await page.getByTestId('library-card').first().click();
  check('detail opens from a filtered grid', (await page.getByRole('heading', { name: 'Green star' }).count()) === 1);
  await page.screenshot({ path: OUT + '03-detail-from-filtered.png', fullPage: false });
  await page.getByText(/back to library/i).click();
  await page.waitForTimeout(150);

  // ---- Zero-result + clear-all ----
  // Clear, then glass AND star (glass entry has no star) → empty.
  await page.getByTestId('facet-clear-all').click();
  await page.waitForTimeout(150);
  await page.getByTestId('facet-chip-material-glass').click();
  await page.getByTestId('facet-chip-tags-star').click();
  await page.waitForTimeout(150);
  check('zero-result state shown', (await page.getByTestId('facet-zero-result').count()) === 1);
  check('no cards in zero-result', (await cardCount(page)) === 0);
  await page.screenshot({ path: OUT + '04-zero-result.png', fullPage: true });
  // Clear CTA in the zero-result never dead-ends.
  await page.getByRole('button', { name: /clear filters/i }).click();
  await page.waitForTimeout(150);
  check('clear filters recovers all 3 cards', (await cardCount(page)) === 3, `count=${await cardCount(page)}`);
  await page.screenshot({ path: OUT + '05-cleared.png', fullPage: true });

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
  console.error('[s10] fatal', e);
  process.exit(2);
});
