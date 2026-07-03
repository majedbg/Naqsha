// S12 browser self-verification (issue #61). Drives the REAL app end-to-end:
//   Upload a grid of Kaplan-style stars → Flatten(skip) → Trace(Select) → Review
// and checks the parameterize PROPOSAL:
//   - a star-like input surfaces the star proposal WITH a fit badge,
//   - adopting shows LIVE KNOBS (default-open tier) or the fixed-tile note,
//   - moving a knob re-renders the star preview,
//   - declining returns to the un-adopted proposal (traced tile kept),
//   - saving reaches the persist / session-only path.
//
// Diagnostic-honest: if the synthetic trace does not clear the EVAL ≥7 (a trace-
// fidelity matter, not evaluator logic — that is unit-proven), it says so and
// still reports what it observed. Uses the system Google Chrome (channel:'chrome').

import { mkdirSync } from 'node:fs';
const PW = process.env.PW_PATH || 'playwright';
const _pw = await import(PW);
const chromium = _pw.chromium || _pw.default?.chromium;

const BASE = process.env.S12_URL || 'http://localhost:5312';
const OUT = new URL('../.playwright-mcp/s12-verification/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[s12]', ...a);
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

// Draw a grid of filled n-pointed Kaplan stars on a SQUARE lattice. Matches the
// family's default geometry (n=8, contactAngle≈45 → r≈0.41R) so lattice=square,
// symmetry≈p4m, and the traced motif is a real star.
async function uploadStarGrid(page, { n = 8, cell = 60, cols = 6, rows = 5 } = {}) {
  await page.evaluate(
    ({ n, cell, cols, rows }) => {
      const W = cols * cell;
      const H = rows * cell;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const R = (cell / 2) * 0.82;
      const rInner = R * 0.41;
      ctx.fillStyle = '#000000';
      for (let jy = 0; jy < rows; jy++) {
        for (let ix = 0; ix < cols; ix++) {
          const cx = ix * cell + cell / 2;
          const cy = jy * cell + cell / 2;
          ctx.beginPath();
          for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
            const ox = cx + R * Math.cos(a);
            const oy = cy + R * Math.sin(a);
            if (k === 0) ctx.moveTo(ox, oy);
            else ctx.lineTo(ox, oy);
            const b = a + Math.PI / n;
            ctx.lineTo(cx + rInner * Math.cos(b), cy + rInner * Math.sin(b));
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      const dataURL = c.toDataURL('image/png');
      const bin = atob(dataURL.split(',')[1]);
      const raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      const file = new File([raw], 'stars.png', { type: 'image/png' });
      const input = document.querySelector('input[aria-label="Choose a photo"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { n, cell, cols, rows }
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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => m.type() === 'error' && log('page-error:', m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Object', exact: true }).waitFor({ timeout: 20000 });

  await openStepper(page);
  await uploadStarGrid(page, { n: 8 });
  await traceToReview(page);
  await page.screenshot({ path: OUT + '01-review.png', fullPage: false });

  const proposal = page.getByTestId('star-proposal');
  const hasProposal = (await proposal.count()) > 0;
  check('star-like input surfaces the parameterize proposal', hasProposal);

  if (hasProposal) {
    const badge = (await page.getByTestId('star-fit-badge').textContent()) || '';
    check('proposal shows a fit badge (fit N/10)', /fit\s*\d+\s*\/\s*10/i.test(badge), badge.trim());

    // Adopt → editable structure.
    await page.getByTestId('adopt-star').click();
    const hasKnobs = (await page.getByTestId('star-knobs').count()) > 0;
    const hasFixedNote = (await page.getByTestId('star-fixed-note').count()) > 0;
    check('adopting shows live knobs OR the fixed-tile note (exactly one)', hasKnobs !== hasFixedNote,
      `knobs=${hasKnobs} fixedNote=${hasFixedNote}`);
    check('star preview svg renders after adopt', (await page.getByTestId('star-preview').count()) > 0);
    await page.screenshot({ path: OUT + '02-adopted.png', fullPage: false });

    if (hasKnobs) {
      // Move the fold knob and confirm the preview geometry changes.
      const before = await page.getByTestId('star-preview').innerHTML();
      const fold = page.getByLabel('Star fold');
      await fold.fill('6');
      await page.waitForTimeout(200);
      const after = await page.getByTestId('star-preview').innerHTML();
      check('moving the "Star fold" knob re-renders the star preview', before !== after);
      await page.screenshot({ path: OUT + '03-knob-moved.png', fullPage: false });
    }

    // Decline → back to the un-adopted proposal (traced tile kept, not replaced).
    await page.getByRole('button', { name: /keep the traced tile( instead)?/i }).first().click();
    await page.waitForTimeout(150);
    check('declining returns to the un-adopted proposal (adopt button back)',
      (await page.getByTestId('adopt-star').count()) > 0);
    check('declining removes the live knobs (traced tile stands)',
      (await page.getByTestId('star-knobs').count()) === 0);

    // Re-adopt then save through the family path.
    await page.getByTestId('adopt-star').click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /save to library/i }).waitFor();
    await page.getByLabel('Title', { exact: true }).fill('S12 adopted star');
    await page.getByRole('button', { name: /save to library/i }).click();
    await page.waitForTimeout(1200);
    // Guest → session-only reason surfaces; signed-in → closes. Either is a valid
    // persist path — assert we left the save form without an error toast.
    const sessionOnly = await page.getByText(/saved for this session/i).count();
    const stillOpen = await page.getByRole('button', { name: /save to library/i }).count();
    check('save reached the persist / session-only path (no dead-end)',
      sessionOnly > 0 || stillOpen === 0, `sessionOnly=${sessionOnly} stillOpen=${stillOpen}`);
    await page.screenshot({ path: OUT + '04-saved.png', fullPage: true });
  } else {
    // Honest fallback: report what the trace produced so the gap is legible.
    const latConf = (await page.getByTestId('lattice-confidence').textContent().catch(() => '')) || '';
    log('proposal absent — traced lattice badge:', latConf.trim());
    await page.screenshot({ path: OUT + '01b-no-proposal.png', fullPage: true });
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  log('----');
  log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) log('FAILURES:', failed.map((f) => f.name).join('; '));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('[s12] fatal', e);
  process.exit(2);
});
