#!/usr/bin/env node
// Calibration capture (render-vs-photo harness, ADR 0003).
//
// Screenshots every DEFAULT_PREVIEW_MATERIALS material × every CAL scene through
// the dev-only calibration route (src/dev/CalibrationRoot.jsx — the REAL
// Scene3D/Sheets/Marks/SceneEnvironment stack) at a fixed 900×900 viewport with
// the deterministic zoom-fit 3/4 camera, then writes PNGs to
// docs/material-references/calibration/renders/<materialId>__<sceneId>.png.
//
// Usage:
//   node scripts/calibration-capture.mjs                 # all materials × scenes
//   node scripts/calibration-capture.mjs --material clear --scene studio
//   node scripts/calibration-capture.mjs --port 5199     # dev server port
//
// Reuses a running vite dev server on the port if one responds; otherwise spawns
// `npm run dev` itself and kills it on exit. Browser: playwright-core driving the
// Playwright-cached chromium headless shell (no download; set CALIBRATION_CHROMIUM
// to a chromium binary to override discovery).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs/material-references/calibration/renders');

// Calibration matrix: read the material ids LIVE from the app module so the
// harness tracks the catalog; scenes are the calibration pair (ADR 0003 #9).
const { DEFAULT_PREVIEW_MATERIALS } = await import(
  path.join(ROOT, 'src/lib/materialPreview.js')
);
const ALL_MATERIALS = DEFAULT_PREVIEW_MATERIALS.map((m) => m.id);
const ALL_SCENES = ['studio', 'hospital-room-2'];

const VIEWPORT = { width: 900, height: 900 };
// Match a retina desktop (Marks.jsx D6 routing: DPR≥1.5 → ribbon-eligible marks).
const DEVICE_SCALE = 2;
// Post-networkidle settle: HDRI decode + PMREM + transmission FBO + camera fit are
// all done well inside this on an M-series machine; generous for cold caches.
const SETTLE_MS = 3000;
const NAV_TIMEOUT_MS = 90_000;

function parseArgs(argv) {
  const out = { materials: ALL_MATERIALS, scenes: ALL_SCENES, port: 5173 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--material') out.materials = [argv[++i]];
    else if (argv[i] === '--scene') out.scenes = [argv[++i]];
    else if (argv[i] === '--port') out.port = Number(argv[++i]);
  }
  return out;
}

/** Newest Playwright-cached chromium headless-shell binary (mac/linux layouts). */
function findChromium() {
  if (process.env.CALIBRATION_CHROMIUM) return process.env.CALIBRATION_CHROMIUM;
  const cacheRoots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ];
  const candidates = [];
  for (const cacheRoot of cacheRoots) {
    if (!existsSync(cacheRoot)) continue;
    for (const dir of readdirSync(cacheRoot)) {
      const m = /^chromium_headless_shell-(\d+)$/.exec(dir);
      if (!m) continue;
      const base = path.join(cacheRoot, dir);
      for (const sub of readdirSync(base)) {
        for (const bin of ['chrome-headless-shell', 'headless_shell']) {
          const p = path.join(base, sub, bin);
          if (existsSync(p)) candidates.push({ build: Number(m[1]), p });
        }
      }
    }
  }
  candidates.sort((a, b) => b.build - a.build);
  if (!candidates.length) {
    throw new Error(
      'No Playwright-cached chromium found. Run `npx playwright install chromium` ' +
        'or set CALIBRATION_CHROMIUM=/path/to/chromium.',
    );
  }
  return candidates[0].p;
}

async function serverResponds(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Reuse a responding dev server, else spawn one. Returns { proc|null }. */
async function ensureDevServer(port) {
  if (await serverResponds(port)) {
    console.log(`Reusing dev server on :${port}`);
    return { proc: null };
  }
  console.log(`Starting vite dev server on :${port} …`);
  const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group → we can kill vite + its children together
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await serverResponds(port)) return { proc };
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    process.kill(-proc.pid);
  } catch {
    /* already dead */
  }
  throw new Error(`vite dev server did not respond on :${port} within 60s`);
}

const { materials, scenes, port } = parseArgs(process.argv);
mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();
const { proc: viteProc } = await ensureDevServer(port);
let browser;
try {
  browser = await chromium.launch({ executablePath: findChromium(), headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  [page error]', e.message));

  for (const materialId of materials) {
    for (const sceneId of scenes) {
      const shotStart = Date.now();
      const url = `http://localhost:${port}/?calibration=${materialId}&scene=${sceneId}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
      const err = await page.$('[data-calibration-error]');
      if (err) throw new Error(`Calibration route rejected: ${await err.textContent()}`);
      await page.waitForSelector('canvas', { timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(SETTLE_MS); // HDRI/PMREM/transmission settle
      const file = path.join(OUT_DIR, `${materialId}__${sceneId}.png`);
      await page.screenshot({ path: file });
      console.log(
        `✓ ${materialId} × ${sceneId}  (${((Date.now() - shotStart) / 1000).toFixed(1)}s)`,
      );
    }
  }
} finally {
  await browser?.close();
  if (viteProc) {
    try {
      process.kill(-viteProc.pid);
    } catch {
      /* already dead */
    }
  }
}
console.log(
  `Done: ${materials.length * scenes.length} renders in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT_DIR}`,
);
