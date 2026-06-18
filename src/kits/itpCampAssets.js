// ITP Camp bundled assets (issue #18, Lane C / C9).
//
// Two staged logo SVGs (lime + flipped near-black) plus six authored cut-shape
// outlines. The logos carry <clipPath> defs whose <path> elements would be
// mis-read as drawable artwork by the SHARED svgImport regex; `prepareAssetSvg`
// strips <defs>…</defs> at the kit/asset layer so only the real drawing paths
// survive — leaving svgImport.js (and its locked tests) untouched.
//
// Assets are imported as raw strings via Vite's `?raw` suffix, which vitest's
// vite pipeline resolves identically in node + jsdom test environments.

import itpLogoRaw from './itp-camp/assets/itp-logo.svg?raw';
import itpLogoFlippedRaw from './itp-camp/assets/itp-logo-flipped.svg?raw';
import coasterRaw from './itp-camp/assets/coaster.svg?raw';
import keychainRaw from './itp-camp/assets/keychain.svg?raw';
import luggageTagRaw from './itp-camp/assets/luggage-tag.svg?raw';
import ornamentRaw from './itp-camp/assets/ornament.svg?raw';
import badgeRaw from './itp-camp/assets/badge.svg?raw';
import bookmarkRaw from './itp-camp/assets/bookmark.svg?raw';

export const itpLogoSvg = itpLogoRaw;
export const itpLogoFlippedSvg = itpLogoFlippedRaw;

// Strip every <defs>…</defs> block from an SVG string. The staged logos place
// their <clipPath> definitions (with rect-shaped <path> elements) inside <defs>,
// so removing <defs> drops the clip rects without touching the drawing paths.
// Defs hold non-drawable resources (clipPaths, gradients, symbols) — safe to
// drop for place-as-artwork import. Self-closing/empty <defs/> is handled too.
export function prepareAssetSvg(svg) {
  if (typeof svg !== 'string') return '';
  return svg
    .replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '')
    .replace(/<defs\b[^>]*\/>/gi, '');
}

// The kit asset manifest: 7 entries. The lime logo is the primary; the flipped
// near-black logo rides along on the SAME entry as `altSvg` (both staged files
// are usable, but they are one logo asset — so the manifest stays at 7). Each
// `svg` is the IMPORT-READY string (defs stripped) handed straight to
// addImportedLayer — exactly like a File>Import.
export const ITP_CAMP_ASSETS = [
  {
    id: 'logo',
    name: 'ITP Camp logo',
    svg: prepareAssetSvg(itpLogoSvg),
    altSvg: prepareAssetSvg(itpLogoFlippedSvg),
  },
  { id: 'coaster', name: 'Coaster 4×4″', svg: prepareAssetSvg(coasterRaw) },
  { id: 'keychain', name: 'Keychain', svg: prepareAssetSvg(keychainRaw) },
  { id: 'luggage-tag', name: 'Luggage / bag tag', svg: prepareAssetSvg(luggageTagRaw) },
  { id: 'ornament', name: 'Ornament / medallion', svg: prepareAssetSvg(ornamentRaw) },
  { id: 'badge', name: 'Badge / pin backing', svg: prepareAssetSvg(badgeRaw) },
  { id: 'bookmark', name: 'Bookmark', svg: prepareAssetSvg(bookmarkRaw) },
];
