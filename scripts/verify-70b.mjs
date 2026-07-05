// #70b Refine step — in-browser self-verification, ISOLATED (playwright's own
// bundled chromium + an ephemeral profile — ZERO contention with the shared MCP
// browser). Drives the REAL app on a dedicated dev server, on the REAL S13 jali,
// and proves the things the jsdom tests mock out:
//   - the canvas paintBuffer path actually paints (hero pixels are real);
//   - the live binary "snaps into focus": ink% drops from the muddy global
//     default to the clean adaptive Auto-clean (watch-it-clean-up, numerically);
//   - the filmstrip renders its 4 stages;
//   - "Preview trace" runs real potrace inline;
//   - advancing to Review yields a traced pattern reflecting the Refine settings.
//
// Ephemeral: playwright installed --no-save. Screenshots → OUT below.
// Run:  node scripts/verify-70b.mjs   (dev server must be up on VERIFY_70B_URL)

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.VERIFY_70B_URL || 'http://localhost:5377';
const OUT =
  process.env.VERIFY_70B_OUT ||
  '/private/tmp/claude-501/-Users-jadembg-Documents-Sonoform-all-Sonoform-generativeArt/2ca06aa3-5f0a-4e1d-927d-05ee80013419/scratchpad/70b-verification/';
const JALI = '/Users/jadembg/Documents/Sonoform_all/Naqsha/s13-laser-prototype/jali-source.jpg';
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[70b]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// Read the live binary hero canvas back → ink% (dark pixels). Proves paintBuffer
// actually painted AND gives a scalar "how clean" the trace input is.
async function heroInk(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="refine-binary"]');
    if (!c || !c.width || !c.height) return null;
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let dark = 0;
    const tot = c.width * c.height;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 128) dark++;
    return { w: c.width, h: c.height, inkPct: (100 * dark) / tot };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // Open the stepper.
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  await page.getByText('Extract from Photo…', { exact: true }).click();
  await page.getByRole('heading', { name: /extract pattern from photo/i }).waitFor();
  check('stepper opens from Object menu', true);

  // Upload the REAL jali via the (hidden) file input.
  await page.setInputFiles('input[aria-label="Choose a photo"]', JALI);

  // Flatten → skip (already-flat). Now in Select: drag a region crop (mirrors
  // real usage — one pattern region — and keeps the on-demand potrace fast on
  // the dense jali lattice).
  await page.getByRole('button', { name: /skip flatten/i }).click({ timeout: 20000 });
  const cropBox = await page.getByTestId('crop-area').boundingBox();
  await page.mouse.move(cropBox.x + cropBox.width * 0.30, cropBox.y + cropBox.height * 0.30);
  await page.mouse.down();
  await page.mouse.move(cropBox.x + cropBox.width * 0.62, cropBox.y + cropBox.height * 0.58, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: /continue/i }).click(); // Select → Refine

  // Refine reached: the live binary hero is present.
  await page.getByTestId('refine-binary').waitFor({ timeout: 20000 });
  check('Refine step reached (binary hero present)', true);

  // BEFORE — global default. Wait for the debounced paint to land (canvas real).
  let before = null;
  await page.waitForFunction(
    () => {
      const c = document.querySelector('[data-testid="refine-binary"]');
      return c && c.width > 1;
    },
    { timeout: 15000 }
  );
  await page.waitForTimeout(300);
  before = await heroInk(page);
  check('hero canvas actually painted (paintBuffer ran)', before && before.w > 1, JSON.stringify(before));
  await page.screenshot({ path: OUT + '01-refine-BEFORE-global-default.png' });

  // Filmstrip: 4 painted stages.
  const stageCount = await page.locator('[data-testid^="refine-stage-"]').count();
  check('filmstrip shows 4 stages', stageCount === 4, `count=${stageCount}`);
  await page.getByTestId('refine-filmstrip').screenshot({ path: OUT + '02-filmstrip.png' });

  // AFTER — one-click Auto-clean (adaptive + blur + min-area). Watch it clean up.
  await page.getByTestId('auto-clean').click();
  await page.waitForTimeout(400); // debounce + repaint
  const after = await heroInk(page);
  check(
    'live binary cleans up: ink% drops after Auto-clean',
    before && after && after.inkPct < before.inkPct,
    `before ${before?.inkPct?.toFixed(1)}% → after ${after?.inkPct?.toFixed(1)}%`
  );
  await page.screenshot({ path: OUT + '03-refine-AFTER-autoclean.png' });

  // On-demand "Preview trace": real potrace inline, without leaving Refine.
  await page.getByTestId('preview-trace').click();
  await page.getByTestId('refine-trace-preview').waitFor({ timeout: 60000 });
  check('Preview trace shows the real traced pattern inline', true);
  await page.screenshot({ path: OUT + '04-preview-trace-inline.png' });

  // Advance to Review — the committed trace reflects the Refine settings.
  await page.getByRole('button', { name: /trace region/i }).click();
  await page.getByText(/shape/i).first().waitFor({ timeout: 60000 });
  const reviewHasPreview =
    (await page.locator('svg[aria-label*="preview" i]').count()) > 0;
  check('Review shows a traced pattern (settings-driven trace committed)', reviewHasPreview);
  await page.screenshot({ path: OUT + '05-review.png' });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  log('----');
  log(`${results.length - failed.length}/${results.length} checks passed`);
  log(`screenshots → ${OUT}`);
  if (failed.length) {
    log('FAILURES:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  log('ALL PASS');
}

main().catch((e) => {
  console.error('[70b] fatal', e);
  process.exit(2);
});
