// S5b browser self-verification (issue #66). Drives the REAL app on three
// synthetic repeating fixtures:
//   1. OBLIQUE tiling  → lattice detected, the Review overlay is the SHEARED
//      parallelogram cell (two basis handles), the preview tiles obliquely,
//      the saved entity shows the oblique tiling in the Library (one entity,
//      two surfaces).
//   2. HEX tiling      → detected + oblique (parallelogram) auto-tiling path.
//   3. RECTANGULAR     → regression: still the axis-aligned rect overlay
//      (NOT the sheared editor).
//
// Uses the system Google Chrome (channel:'chrome') — no downloaded browser.
// Ephemeral: screenshots → .playwright-mcp/s5b-verification/.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.S5B_URL || 'http://localhost:5233';
const OUT = new URL('../.playwright-mcp/s5b-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[s5b]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// Draw a tiling with a KNOWN basis: an asymmetric motif (filled triangle + a
// small offset disc) at every lattice point i*t1 + j*t2, so the only exact
// self-overlaps are true lattice translations → unambiguous detection.
async function uploadTiling(page, t1, t2, W = 264, H = 224) {
  await page.evaluate(
    async ({ t1, t2, W, H }) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const det = t1[0] * t2[1] - t1[1] * t2[0];
      let iMin = 1e9, iMax = -1e9, jMin = 1e9, jMax = -1e9;
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const i = (x * t2[1] - y * t2[0]) / det;
        const j = (y * t1[0] - x * t1[1]) / det;
        iMin = Math.min(iMin, Math.floor(i) - 1);
        iMax = Math.max(iMax, Math.ceil(i) + 1);
        jMin = Math.min(jMin, Math.floor(j) - 1);
        jMax = Math.max(jMax, Math.ceil(j) + 1);
      }
      for (let j = jMin; j <= jMax; j++)
        for (let i = iMin; i <= iMax; i++) {
          const x = i * t1[0] + j * t2[0];
          const y = i * t1[1] + j * t2[1];
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 3);
          ctx.lineTo(x + 15, y + 6);
          ctx.lineTo(x + 6, y + 15);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#3a3a3a';
          ctx.beginPath();
          ctx.arc(x + 20, y + 18, 3, 0, 2 * Math.PI);
          ctx.fill();
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
    },
    { t1, t2, W, H }
  );
}

async function openStepper(page) {
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Extract from Photo…', { exact: true }).click();
  await page.getByRole('heading', { name: /extract pattern from photo/i }).waitFor();
}

async function traceToReview(page) {
  await page.getByRole('button', { name: /skip/i }).first().click();
  await page.getByRole('button', { name: /trace region/i }).click();
  await page.getByTestId('lattice-cell-editor').waitFor({ timeout: 30000 });
}

async function closeAll(page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // ---- 1. OBLIQUE ----------------------------------------------------------
  await openStepper(page);
  await uploadTiling(page, [52, 0], [16, 44]);
  await traceToReview(page);

  const obliqueOverlay = await page.getByTestId('lattice-cell-oblique').count();
  check('oblique fixture → sheared parallelogram overlay (not an axis rect)', obliqueOverlay === 1);
  check('oblique overlay has the first basis handle', (await page.getByTestId('cell-handle-t1').count()) === 1);
  check('oblique overlay has the second basis handle', (await page.getByTestId('cell-handle-t2').count()) === 1);
  check('the cell is a polygon (sheared), not a rectangle div',
    (await page.getByTestId('lattice-cell').evaluate((el) => el.tagName.toLowerCase())) === 'polygon');
  const confText = (await page.getByTestId('lattice-confidence').textContent()) || '';
  check('confidence badge names a detected repeat with a %', /detected/i.test(confText) && /%/.test(confText), confText.trim());
  check('the Review preview tiles the motif (oblique tiling shown)', (await page.getByTestId('tiled-preview').count()) === 1);
  await page.screenshot({ path: OUT + '01-oblique-review.png', fullPage: false });

  // Save (guest → session-only; entity still registered + browsable).
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /save to library/i }).waitFor();
  await page.getByLabel('Title', { exact: true }).fill('Oblique ornament S5b');
  await page.getByRole('button', { name: /save to library/i }).click();
  await page.waitForTimeout(1000);
  const cont = page.getByRole('button', { name: /^continue$/i });
  if (await cont.count()) await cont.click();
  await closeAll(page);

  // Library shows the SAME oblique tiling (one entity, two surfaces). The grid
  // CARD shows the source photo (guest save has a photoURL); the DETAIL view
  // renders the tiled pattern through the shared placement source.
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Pattern Library…', { exact: true }).click();
  await page.getByRole('heading', { name: /pattern library/i }).waitFor();
  await page.getByTestId('library-card').first().waitFor({ timeout: 8000 });
  await page.screenshot({ path: OUT + '02-oblique-library.png', fullPage: true });
  await page.getByTestId('library-card').first().click();
  const libTiled = page.getByTestId('tiled-preview');
  await libTiled.waitFor({ timeout: 8000 });
  check('Library detail tiles the saved oblique pattern', (await libTiled.count()) >= 1);
  // Prove the detail preview is genuinely SHEARED: at least one tiled copy
  // carries a non-zero, non-axis translate (an oblique offset).
  const oblOffsets = await libTiled.locator('g').evaluateAll((gs) =>
    gs.map((g) => g.getAttribute('transform')).filter(Boolean)
  );
  const sheared = oblOffsets.some((t) => {
    const m = t.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
    return m && Math.abs(+m[1]) > 0.5 && Math.abs(+m[2]) > 0.5; // both axes shift → sheared row
  });
  check('detail tiling uses oblique (both-axis) offsets, not an axis grid', sheared,
    oblOffsets.slice(0, 6).join(' | '));
  await page.screenshot({ path: OUT + '03-oblique-library-detail.png', fullPage: true });
  await closeAll(page);

  // ---- 2. HEX --------------------------------------------------------------
  await openStepper(page);
  await uploadTiling(page, [48, 0], [24, 42]);
  await traceToReview(page);
  check('hex fixture → oblique (parallelogram) auto-tiling overlay',
    (await page.getByTestId('lattice-cell-oblique').count()) === 1);
  check('hex preview tiles', (await page.getByTestId('tiled-preview').count()) === 1);
  await page.screenshot({ path: OUT + '04-hex-review.png', fullPage: false });
  await closeAll(page);

  // ---- 3. RECTANGULAR regression ------------------------------------------
  await openStepper(page);
  await uploadTiling(page, [48, 0], [0, 48]);
  await traceToReview(page);
  check('rect fixture → NO sheared overlay (regression: rectangle path intact)',
    (await page.getByTestId('lattice-cell-oblique').count()) === 0);
  check('rect cell is a rectangle div (unchanged S5 overlay)',
    (await page.getByTestId('lattice-cell').evaluate((el) => el.tagName.toLowerCase())) === 'div');
  check('rect preview still tiles', (await page.getByTestId('tiled-preview').count()) === 1);
  await page.screenshot({ path: OUT + '05-rect-review.png', fullPage: false });

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
  console.error('[s5b] fatal', e);
  process.exit(2);
});
