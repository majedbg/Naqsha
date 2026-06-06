// Curated, compile-time example patterns.
//
// Each example is one `<name>.json` file in this directory, paired with a
// pre-rendered `<name>.png` thumbnail. Vite glob-imports both at build time —
// to publish a new example, drop in the JSON + PNG pair and rebuild; nothing
// else to wire. (Unlike user designs, these are not pulled from the database.)
//
// Example JSON shape:
//   {
//     "id":          "bloom",            // stable, unique
//     "name":        "Bloom",            // shown on the card
//     "description": "Radial spirograph",// card tooltip
//     "thumb":       "bloom.png",        // basename of the paired thumbnail
//     "order":       1,                  // optional; lower sorts first
//     "config": {                        // reuses the saved-design config shape
//       "layers":  [ ... ],              // applied verbatim via loadLayerSet
//       "canvasW": 1152,                 // px (96 PPI); presetIndex is recomputed
//       "canvasH": 1152,
//       "bgColor": "#0a1628"
//     }
//   }

const dataModules = import.meta.glob('./*.json', { eager: true });
const thumbModules = import.meta.glob('./*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Map a thumbnail basename ("bloom.png") to its bundled, hashed asset URL.
// A bare string path inside the JSON would never resolve through the bundler,
// so we resolve it here against the glob's hashed output.
const thumbByFile = {};
for (const [path, url] of Object.entries(thumbModules)) {
  thumbByFile[path.replace('./', '')] = url;
}

export const EXAMPLES = Object.entries(dataModules)
  .map(([path, mod]) => {
    const data = mod.default ?? mod;
    return {
      ...data,
      // Resolve the declared thumb basename to its hashed URL (null if absent).
      thumbUrl: data.thumb ? thumbByFile[data.thumb] ?? null : null,
      _file: path,
    };
  })
  // Intentional, stable ordering: explicit `order` first, then name.
  .sort(
    (a, b) =>
      (a.order ?? 999) - (b.order ?? 999) ||
      String(a.name).localeCompare(String(b.name))
  );

export const EXAMPLE_COUNT = EXAMPLES.length;
