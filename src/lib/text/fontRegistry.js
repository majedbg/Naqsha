// Browser font registry for the text feature: a curated catalog of OFL fonts
// plus an async, memoized loader that fetches + parses each font ONCE.
//
// The pure registry (catalog lookups + the injectable loader core) is kept
// separate from the optional React hook so the registry can be unit-tested in
// Node without a DOM or a real network. `loadFont` is a thin wrapper over the
// injectable core `_loadWithParser`; the same memoization Map backs both.

import { useEffect, useState } from 'react';
// Vite resolves `?url` to the bundled asset URL string. Under vitest's node
// env this still resolves to a string (handled by Vite's resolver) — we never
// fetch it in tests, the loader's fetch/parse are injected.
import workSansUrl from '../../assets/fonts/WorkSans-Regular.ttf?url';

// opentype.js exposes its API on either the default or the namespace depending
// on the loader (vitest vs vite-node vs bundler) — mirror loadWorkSans.js.
import * as opentypeModule from 'opentype.js';
const opentype = opentypeModule.default ?? opentypeModule;

/**
 * Curated catalog. All entries must be OFL-licensed and bundled. More fonts
 * are added here later; the rest of the registry needs no changes.
 * @type {{ id: string, label: string, url: string }[]}
 */
export const FONT_CATALOG = [
  { id: 'work-sans', label: 'Work Sans', url: workSansUrl },
];

export const DEFAULT_FONT_ID = 'work-sans';

/** @returns {{ id: string, label: string }[]} catalog without urls. */
export function listFonts() {
  return FONT_CATALOG.map(({ id, label }) => ({ id, label }));
}

/**
 * @param {string} id
 * @returns {{ id: string, label: string, url: string } | null}
 */
export function getFontMeta(id) {
  const entry = FONT_CATALOG.find((f) => f.id === id);
  return entry ? { ...entry } : null;
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
  if (!meta) {
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

/** Real fetch: arrayBuffer over the bundled asset url. Browser-only. */
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
 * Font and never double-fetch. Throws a clear error for an unknown id.
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
 * Thin React hook over the pure registry. Loads `id` on mount/change and cancels
 * its state update on unmount. The registry itself stays free of React.
 * @param {string} [id]
 * @returns {{ font: import('opentype.js').Font | null, loading: boolean, error: Error | null }}
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
