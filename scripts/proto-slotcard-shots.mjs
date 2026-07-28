// PROTOTYPE HARNESS — THROWAWAY. Dies with the slot-card prototype.
//
// Screenshots the ?slotcard=A|B|C panel (plus A in Random mode) so the variants
// can be compared without a browser open. Reuses a dev server on :5199 or
// spawns one; hides the guest-onboarding chooser, which sits over the panel.
//
//   node scripts/proto-slotcard-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp/slotcard-shots';
const PORT = 5199;

function findChromium() {
  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ];
  const bins = [
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux/headless_shell',
    'chrome-linux/chrome',
  ];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const dir of readdirSync(r).sort().reverse()) {
      if (!/^chromium(_headless_shell)?-\d+$/.test(dir)) continue;
      for (const bin of bins) {
        const p = path.join(r, dir, bin);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error('no chromium found');
}

const responds = async () => {
  try {
    return (await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
};

let proc = null;
if (!(await responds())) {
  proc = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !(await responds())) await new Promise((r) => setTimeout(r, 500));
}

// The guest onboarding chooser sits over the left half. Hide it outright —
// clicking its dismiss races an entrance animation and never settles.
async function dismissOnboarding(page) {
  await page.addStyleTag({
    content:
      '[data-testid="guest-onboarding-chooser"],[data-testid="guest-onboarding-tip"]{display:none !important}',
  });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));

for (const v of ['A', 'B', 'C']) {
  await page.goto(`http://localhost:${PORT}/?slotcard=${v}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('[data-testid="proto-slot"]', { timeout: 30_000 });
  await dismissOnboarding(page);
  await page.waitForTimeout(600);
  const panel = page.locator('[data-testid="slot-card-proto-overlay"] .shadow-pop').first();
  const n = await page.locator('[data-testid="proto-slot"]').count();
  console.log(`variant ${v}: ${n} slot chips`);
  await panel.screenshot({ path: path.join(OUT, `slotcard-${v}.png`) });
}

// Also: variant A in Random mode (weight row) — click the "random" pill.
await page.goto(`http://localhost:${PORT}/?slotcard=A`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForSelector('[data-testid="proto-slot"]', { timeout: 30_000 });
await dismissOnboarding(page);
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'random', exact: true }).click();
await page.waitForTimeout(300);
await page.locator('[data-testid="slot-card-proto-overlay"] .shadow-pop').first()
  .screenshot({ path: path.join(OUT, 'slotcard-A-random.png') });
console.log('done');

await browser.close();
if (proc) { try { process.kill(-proc.pid); } catch { /* noop */ } }
process.exit(0);
