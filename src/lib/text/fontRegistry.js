// Browser font registry for the text feature: a curated catalog of OFL fonts
// plus an async, memoized loader that fetches + parses each font ONCE.
//
// The pure registry (catalog lookups + the injectable loader core) is kept
// separate from the optional React hooks so the registry can be unit-tested in
// Node without a DOM or a real network. `loadFont` is a thin wrapper over the
// injectable core `_loadWithParser`; the same memoization Map backs both.
//
// FONT KINDS. Every catalog entry carries a `kind`:
//   - 'outline'      — a normal glyph-outline font (opentype.js). Its strokes are
//                      CLOSED contours, so an OUTLINE-engrave traces each stroke's
//                      two edges → a DOUBLE line. Fill-engrave rasterizes solid.
//   - 'single-line'  — a single-stroke / "engraving" font (Hershey et al.) whose
//                      glyphs are open centre-line polylines. One pass per stroke,
//                      no double line. Backed by an adapter that quacks like an
//                      opentype Font (see singleLineFont.js), so the whole text
//                      pipeline (layout, draw, outline/SVG, cap-height) is unchanged.
//
// RUNTIME FONTS. Uploaded fonts (and the built-in single-line adapters) are
// registered at runtime via `registerFont` — they extend the catalog and seed
// the loader cache with an already-parsed Font, so `loadFont(id)` resolves them
// uniformly. Runtime fonts are SESSION-ONLY (not persisted): a saved design that
// references an uploaded fontId re-resolves to the default font on reload (the
// resolver's fallback), never an error.

import { useCallback, useEffect, useMemo, useState } from 'react';
// Vite resolves `?url` to the bundled asset URL string. Under vitest's node
// env this still resolves to a string (handled by Vite's resolver) — we never
// fetch it in tests, the loader's fetch/parse are injected.
import workSansUrl from '../../assets/fonts/WorkSans-Regular.ttf?url';

// opentype.js exposes its API on either the default or the namespace depending
// on the loader (vitest vs vite-node vs bundler) — mirror loadWorkSans.js.
import * as opentypeModule from 'opentype.js';
const opentype = opentypeModule.default ?? opentypeModule;

// Lazy fonts are SERVED from /public/fonts (not baked into the JS bundle), so a
// font's ~100–400 KB is fetched only when first used. BASE_URL keeps the path
// correct if the app is ever deployed under a sub-path. Every file here was
// verified to PARSE and getPath cleanly in opentype.js (scripts/validate step) —
// a handful of OFL families were rejected because opentype.js 2.x throws on their
// GSUB substitution lookups, which would crash text rendering.
const publicFont = (id) => `${import.meta.env.BASE_URL}fonts/${id}.ttf`;

/**
 * Curated STATIC catalog. All entries are OFL-1.1 licensed (license text ships
 * beside each file in /public/fonts) and reachable — `work-sans` is bundled via
 * `?url` as the always-offline default; the rest are lazy `/public/fonts` URLs.
 * `category` groups the picker; `kind` drives the engrave double-line warning.
 * Adding a font is a data change: a row here + a reachable url; the loader and
 * the whole text pipeline need no changes.
 * @type {{ id:string, label:string, url:string, kind:'outline'|'single-line', category:string }[]}
 */
export const FONT_CATALOG = [
  { id: 'work-sans', label: 'Work Sans', url: workSansUrl, kind: 'outline', category: 'Sans' },
  { id: 'archivo-black', label: 'Archivo Black', url: publicFont('archivo-black'), kind: 'outline', category: 'Sans' },
  { id: 'josefin-sans', label: 'Josefin Sans', url: publicFont('josefin-sans'), kind: 'outline', category: 'Sans' },
  { id: 'pt-serif', label: 'PT Serif', url: publicFont('pt-serif'), kind: 'outline', category: 'Serif' },
  { id: 'eb-garamond', label: 'EB Garamond', url: publicFont('eb-garamond'), kind: 'outline', category: 'Serif' },
  { id: 'abril-fatface', label: 'Abril Fatface', url: publicFont('abril-fatface'), kind: 'outline', category: 'Display' },
  { id: 'alfa-slab-one', label: 'Alfa Slab One', url: publicFont('alfa-slab-one'), kind: 'outline', category: 'Display' },
  { id: 'bungee', label: 'Bungee', url: publicFont('bungee'), kind: 'outline', category: 'Display' },
  { id: 'righteous', label: 'Righteous', url: publicFont('righteous'), kind: 'outline', category: 'Display' },
  { id: 'unica-one', label: 'Unica One', url: publicFont('unica-one'), kind: 'outline', category: 'Display' },
  { id: 'press-start-2p', label: 'Press Start 2P', url: publicFont('press-start-2p'), kind: 'outline', category: 'Display' },
  { id: 'lobster', label: 'Lobster', url: publicFont('lobster'), kind: 'outline', category: 'Script' },
  { id: 'pacifico', label: 'Pacifico', url: publicFont('pacifico'), kind: 'outline', category: 'Script' },
  { id: 'sacramento', label: 'Sacramento', url: publicFont('sacramento'), kind: 'outline', category: 'Script' },
  { id: 'cutive-mono', label: 'Cutive Mono', url: publicFont('cutive-mono'), kind: 'outline', category: 'Mono' },
  { id: 'vt323', label: 'VT323', url: publicFont('vt323'), kind: 'outline', category: 'Mono' },
];

export const DEFAULT_FONT_ID = 'work-sans';

// ── Runtime registry ──────────────────────────────────────────────────────────
// Runtime-registered fonts (uploads + built-in single-line adapters). Kept
// separate from the static FONT_CATALOG so the static catalog stays a pure data
// literal. Lookups (getFontMeta / detailed list) union both.
/** @type {Map<string, { id:string, label:string, kind:string, url?:string }>} */
const runtimeFonts = new Map();

// Subscribers notified when the runtime registry changes, so reactive UI (the
// font picker) re-renders when a font is uploaded/registered.
const listeners = new Set();
function notify() {
  for (const fn of listeners) fn();
}

/**
 * Subscribe to runtime-registry changes. Returns an unsubscribe fn.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function subscribeFonts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Register a runtime font (an uploaded file already parsed to a Font, or a
 * built-in single-line adapter). Adds it to the catalog AND seeds the loader
 * cache with the resolved Font, so `loadFont(id)` returns it without any fetch.
 *
 * @param {{ id:string, label:string, font:object, kind?:'outline'|'single-line',
 *           category?:string }} entry
 * @returns {{ id:string, label:string, kind:string, category:string }}
 */
export function registerFont({ id, label, font, kind = 'outline', category }) {
  if (!id || !font) throw new Error('registerFont requires an id and a font');
  const cat = category || (kind === 'single-line' ? 'Engraving' : 'Uploaded');
  const entry = { id, label: label || id, kind, category: cat };
  runtimeFonts.set(id, entry);
  // Seed the memoization cache so loadFont(id) resolves the parsed Font directly.
  fontCache.set(id, Promise.resolve(font));
  notify();
  return { ...entry };
}

// Monotonic id source for uploads (session-only, so a plain counter is enough —
// it never has to be stable across reloads).
let uploadSeq = 0;

/** WOFF2 files start with the ASCII tag 'wOF2'. opentype.js can't parse them. */
function isWoff2(buf) {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32; // w O F 2
}

/**
 * Parse an uploaded font File and register it (SESSION-ONLY). Rejects WOFF2 with
 * an actionable message (opentype.js can't decode its Brotli tables). The font
 * is an OUTLINE font, so — like every outline font — it double-lines in Outline
 * engrave mode; the caller surfaces that caution.
 *
 * @param {File} file
 * @returns {Promise<{ id:string, label:string }>}
 */
export async function registerUploadedFont(file) {
  const buf = await file.arrayBuffer();
  if (isWoff2(buf)) {
    throw new Error(
      'WOFF2 fonts aren’t supported — re-export the font as .ttf, .otf, or .woff.',
    );
  }
  let font;
  try {
    font = opentype.parse(buf);
  } catch {
    throw new Error('Could not read this font file. Use a .ttf, .otf, or .woff.');
  }
  const label = (file.name || 'Uploaded font').replace(/\.[a-z0-9]+$/i, '');
  const id = `upload-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${++uploadSeq}`;
  registerFont({ id, label, font, kind: 'outline', category: 'Uploaded' });
  return { id, label };
}

/** Test-only: forget all runtime fonts (and their cache entries). */
export function _resetRuntimeFonts() {
  for (const id of runtimeFonts.keys()) fontCache.delete(id);
  runtimeFonts.clear();
  notify();
}

/**
 * @returns {{ id: string, label: string }[]} STATIC catalog only, id+label.
 *   (Preserved shape for existing callers/tests; use `listFontsDetailed` for the
 *   full, runtime-inclusive list with `kind`.)
 */
export function listFonts() {
  return FONT_CATALOG.map(({ id, label }) => ({ id, label }));
}

/**
 * @returns {{ id:string, label:string, kind:string, category:string }[]} STATIC
 *   + runtime fonts, tagged with `kind` + `category`, for the picker (grouped by
 *   category). Static catalog entries first, then runtime (uploads / single-line).
 */
export function listFontsDetailed() {
  return [
    ...FONT_CATALOG.map(({ id, label, kind, category }) => ({ id, label, kind, category })),
    ...[...runtimeFonts.values()].map(({ id, label, kind, category }) => ({ id, label, kind, category })),
  ];
}

// Display order for the picker's category optgroups. Unknown categories sort
// last (alphabetically among themselves).
const CATEGORY_ORDER = ['Sans', 'Serif', 'Display', 'Script', 'Mono', 'Engraving', 'Uploaded'];

/**
 * Group a detailed font list into `<Select>` optgroup options, ordered by
 * CATEGORY_ORDER. Pure (testable). Preserves per-category insertion order.
 * @param {{ id:string, label:string, category?:string }[]} list
 * @returns {{ label:string, options:{ value:string, label:string }[] }[]}
 */
export function groupFontOptions(list) {
  const byCat = new Map();
  for (const f of list) {
    const cat = f.category || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({ value: f.id, label: f.label });
  }
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  return [...byCat.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => ({ label: cat, options: byCat.get(cat) }));
}

/**
 * @param {string} id
 * @returns {{ id:string, label:string, url?:string, kind:string, category?:string } | null}
 */
export function getFontMeta(id) {
  const entry = FONT_CATALOG.find((f) => f.id === id);
  if (entry) return { ...entry };
  const rt = runtimeFonts.get(id);
  return rt ? { ...rt } : null;
}

// Module-level cache. We memoize the PROMISE (not the resolved Font) keyed by
// id so concurrent calls that race before resolution dedupe to a single fetch.
/** @type {Map<string, Promise<import('opentype.js').Font>>} */
const fontCache = new Map();

/**
 * Injectable loader core: fetch the catalog url, parse it to an opentype Font,
 * memoized by id. `fetchImpl`/`parseImpl` are injected so the cache contract is
 * unit-testable with stubs (no real network, no DOM).
 *
 * On rejection the cache entry is dropped so a transient failure can be retried
 * rather than poisoning the id permanently.
 *
 * @param {string} id
 * @param {(url: string) => Promise<ArrayBuffer>} fetchImpl
 * @param {(buf: ArrayBuffer) => import('opentype.js').Font} parseImpl
 * @returns {Promise<import('opentype.js').Font>}
 */
export function _loadWithParser(id, fetchImpl, parseImpl) {
  const cached = fontCache.get(id);
  if (cached) return cached;

  const meta = getFontMeta(id);
  // A runtime font with no url must have been seeded into the cache by
  // registerFont; if it isn't there, treat it as unknown.
  if (!meta || !meta.url) {
    return Promise.reject(new Error(`Unknown font id: ${JSON.stringify(id)}`));
  }

  const promise = fetchImpl(meta.url)
    .then((buf) => parseImpl(buf))
    .catch((err) => {
      fontCache.delete(id); // allow retry after a transient failure
      throw err;
    });

  fontCache.set(id, promise);
  return promise;
}

/** Real fetch: arrayBuffer over the bundled/served asset url. Browser-only. */
async function defaultFetch(url) {
  const res = await fetch(url);
  return res.arrayBuffer();
}

/** Real parser: opentype.js parse. */
function defaultParse(buf) {
  return opentype.parse(buf);
}

/**
 * Load (fetch + parse) a catalog font by id, memoized so repeat calls share one
 * Font and never double-fetch. Throws a clear error for an unknown id. Runtime
 * fonts (uploads / single-line adapters) resolve from the seeded cache.
 * @param {string} id
 * @returns {Promise<import('opentype.js').Font>}
 */
export function loadFont(id) {
  return _loadWithParser(id, defaultFetch, defaultParse);
}

/** Test-only: clear the memoization cache so assertions aren't order-dependent. */
export function _resetFontCache() {
  fontCache.clear();
}

/**
 * Normalize the polymorphic `font` slot used across the text pipeline into a
 * resolver `(fontId) => Font|null`. Passing a resolver enables PER-NODE fonts;
 * passing a single Font (or null) keeps the legacy single-font behavior (every
 * node resolves to that one font). This is the single seam that let the whole
 * render/hit-test/export chain go multi-font without a broad signature change.
 *
 * @param {((fontId?: string) => object|null) | object | null} fontOrResolver
 * @returns {(fontId?: string) => object|null}
 */
export function asResolver(fontOrResolver) {
  if (typeof fontOrResolver === 'function') return fontOrResolver;
  return () => fontOrResolver ?? null;
}

/**
 * Thin React hook over the pure registry. Loads ONE `id` on mount/change and
 * cancels its state update on unmount. The registry itself stays free of React.
 * (Used where only the default font is needed — e.g. the properties panel.)
 * @param {string} [id]
 * @returns {{ font: object | null, loading: boolean, error: Error | null }}
 */
export function useFont(id = DEFAULT_FONT_ID) {
  const [font, setFont] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFont(null);

    loadFont(id)
      .then((f) => {
        if (cancelled) return;
        setFont(f);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { font, loading, error };
}

/** Collect the distinct fontIds referenced by the text layers (default always). */
function inUseFontIds(layers = []) {
  const ids = new Set([DEFAULT_FONT_ID]);
  for (const l of layers) {
    if (l?.type === 'text') ids.add(l.params?.fontId || DEFAULT_FONT_ID);
  }
  return [...ids];
}

/**
 * Load every font referenced by `layers` (plus the default) and expose a
 * PER-NODE resolver. `resolveFont(fontId)` returns that font once loaded, else
 * the default font, else null — so canvas render/hit-test degrade gracefully to
 * the default while a font streams in, and an unknown/lost id (e.g. a reloaded
 * design that referenced an upload) falls back instead of erroring.
 *
 * `ready` is true only once EVERY in-use id has SETTLED (loaded or definitively
 * failed). Export must gate on `ready`: a canvas flash of the fallback font is
 * harmless, but writing a fabrication file with the wrong glyphs is not.
 *
 * @param {Array<object>} layers
 * @returns {{ resolveFont: (fontId?: string) => object|null, fonts: Map<string,object>,
 *             ready: boolean }}
 */
export function useFonts(layers = []) {
  const [fonts, setFonts] = useState(() => new Map()); // id → Font
  const [settled, setSettled] = useState(() => new Set()); // ids whose load resolved OR failed
  // Re-run loads when a runtime font is (un)registered, so a just-uploaded id
  // resolves as soon as a layer starts using it.
  const [regVersion, setRegVersion] = useState(0);
  useEffect(() => subscribeFonts(() => setRegVersion((v) => v + 1)), []);

  const neededIds = useMemo(() => inUseFontIds(layers), [layers]);
  // Stable key so the load effect doesn't refire on every render (arrays differ
  // by reference each render even when the ids are identical).
  const neededKey = neededIds.join('|');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      neededIds.map((id) =>
        loadFont(id)
          .then((f) => ({ id, font: f }))
          .catch(() => ({ id, font: null })), // settled-but-failed → fallback later
      ),
    ).then((results) => {
      if (cancelled) return;
      setFonts((prev) => {
        const next = new Map(prev);
        for (const r of results) if (r.font) next.set(r.id, r.font);
        return next;
      });
      setSettled((prev) => {
        const next = new Set(prev);
        for (const r of results) next.add(r.id);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, regVersion]);

  const resolveFont = useCallback(
    (fontId) => fonts.get(fontId) || fonts.get(DEFAULT_FONT_ID) || null,
    [fonts],
  );

  const ready = neededIds.every((id) => settled.has(id)) && fonts.has(DEFAULT_FONT_ID);

  return { resolveFont, fonts, ready };
}

/**
 * Reactive catalog list for the font picker. Re-renders when a runtime font is
 * registered/unregistered. Returns the detailed (kind-tagged) list.
 * @returns {{ id:string, label:string, kind:string }[]}
 */
export function useFontCatalog() {
  const [, setV] = useState(0);
  useEffect(() => subscribeFonts(() => setV((v) => v + 1)), []);
  return listFontsDetailed();
}
