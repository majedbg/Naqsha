// S8 browser self-verification (issue #57). Drives the REAL app on the S8 dev
// server: upload an EXIF-bearing photo → EXIF auto-fills location/date/title →
// the geocode button fires exactly one request (intercepted + stubbed) →
// title refines → save. Then an EXIF-less PNG → clean empty fields.
//
// Ephemeral: playwright installed --no-save; screenshots → .playwright-mcp/s8-verification/.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.S8_URL || 'http://localhost:5212';
const OUT = new URL('../.playwright-mcp/s8-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const APP1 = JSON.parse(readFileSync('/tmp/s8-app1.json', 'utf8')); // EXIF APP1 octets

const NOMINATIM_STUB = {
  display_name: 'Uppsala Cathedral, Domkyrkoplan, Uppsala, Sweden',
  name: 'Uppsala Cathedral',
  address: { city: 'Uppsala', country: 'Sweden', country_code: 'se' },
};

const log = (...a) => console.log('[s8]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// In-page: draw a bold, high-contrast, repeating motif → export JPEG → splice
// the EXIF APP1 after SOI → assign to the file input → dispatch change.
async function uploadImage(page, { withExif, format = 'image/jpeg' }) {
  await page.evaluate(
    async ({ app1, withExif, format }) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#000';
      // A 4×4 lattice of solid diamonds — clean contours for the tracer.
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
      const dataURL = c.toDataURL(format, 0.95);
      const b64 = dataURL.split(',')[1];
      const bin = atob(b64);
      const raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);

      let bytes = raw;
      if (withExif) {
        // Splice APP1 right after SOI (FF D8).
        const a1 = Uint8Array.from(app1);
        bytes = new Uint8Array(2 + a1.length + (raw.length - 2));
        bytes.set(raw.subarray(0, 2), 0);
        bytes.set(a1, 2);
        bytes.set(raw.subarray(2), 2 + a1.length);
      }
      const ext = format === 'image/png' ? 'png' : 'jpg';
      const file = new File([bytes], `ornament.${ext}`, { type: format });
      const input = document.querySelector('input[aria-label="Choose a photo"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { app1: APP1, withExif, format }
  );
}

async function openStepper(page) {
  // Object menu → Extract from Photo…
  await page.getByRole('button', { name: 'Object', exact: true }).click();
  const item = page.getByText('Extract from Photo…', { exact: true });
  await item.click();
  await page.getByRole('heading', { name: /extract pattern from photo/i }).waitFor();
}

async function walkToSave(page) {
  // Flatten → skip.
  await page.getByRole('button', { name: /skip/i }).first().click();
  // Select → trace whole photo.
  const trace = page.getByRole('button', { name: /trace region/i });
  await trace.click();
  // Review (real extraction — allow generous time), then Continue.
  await page.getByRole('button', { name: /continue/i }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /save to library/i }).waitFor();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') log('page-error:', m.text());
  });

  // Intercept ALL Nominatim traffic — count + stub. Nothing real leaves.
  let geocodeCalls = 0;
  await page.route('**nominatim.openstreetmap.org/**', async (route) => {
    geocodeCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(NOMINATIM_STUB),
    });
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  // ---- Run 1: EXIF photo ----
  await openStepper(page);
  check('stepper opens from Object menu', true);
  await uploadImage(page, { withExif: true });
  await walkToSave(page);

  // Privacy: NO geocode request fired during upload → save.
  check('no geocode request before the button', geocodeCalls === 0, `calls=${geocodeCalls}`);

  const lat = await page.getByLabel(/latitude/i).inputValue();
  const lng = await page.getByLabel(/longitude/i).inputValue();
  check('latitude auto-filled from EXIF', Math.abs(parseFloat(lat) - 59.8586) < 0.001, lat);
  check('longitude auto-filled from EXIF', Math.abs(parseFloat(lng) - 17.6389) < 0.001, lng);

  const capture = await page.getByTestId('capture-date').textContent();
  check('capture date shown from EXIF', /June 28, 2026/.test(capture), capture);
  check('camera shown from EXIF', /iPhone 15 Pro/.test(capture), capture);

  const title1 = await page.getByLabel(/^title$/i).inputValue();
  check('title suggested from date (pre-geocode)', title1 === 'Ornament — June 2026', title1);

  await page.screenshot({ path: OUT + '01-exif-autofill.png', fullPage: false });

  // Explicit geocode — exactly one request.
  await page.getByRole('button', { name: /look up place name/i }).click();
  await page.getByLabel(/place name/i).filter({ hasNot: page.locator('none') });
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Place name"]')?.value === 'Uppsala, Sweden',
    { timeout: 10000 }
  );
  check('geocode fired exactly once', geocodeCalls === 1, `calls=${geocodeCalls}`);
  const place = await page.getByLabel(/place name/i).inputValue();
  check('place name filled from geocode', place === 'Uppsala, Sweden', place);
  const title2 = await page.getByLabel(/^title$/i).inputValue();
  check('title refined with place', title2 === 'Ornament — Uppsala, June 2026', title2);

  await page.screenshot({ path: OUT + '02-geocoded.png', fullPage: false });

  // Save it.
  await page.getByRole('button', { name: /save to library/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '03-after-save.png', fullPage: false });

  // ---- Run 2: EXIF-less PNG → clean empty fields ----
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor();
  await openStepper(page);
  await uploadImage(page, { withExif: false, format: 'image/png' });
  await walkToSave(page);

  const latEmpty = await page.getByLabel(/latitude/i).inputValue();
  check('EXIF-less: latitude empty', latEmpty === '', `"${latEmpty}"`);
  const hasCapture = await page.getByTestId('capture-date').count();
  check('EXIF-less: no capture-date line', hasCapture === 0);
  const hasGeoBtn = await page.getByRole('button', { name: /look up place name/i }).count();
  check('EXIF-less: no geocode button (no coords)', hasGeoBtn === 0);
  const titleEmpty = await page.getByLabel(/^title$/i).inputValue();
  check('EXIF-less: no fabricated title', titleEmpty === '', `"${titleEmpty}"`);
  await page.screenshot({ path: OUT + '04-exifless-clean.png', fullPage: false });

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
  console.error('[s8] fatal', e);
  process.exit(2);
});
