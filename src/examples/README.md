# Example patterns

Curated starting points shown in the left-panel **Examples** gallery (the
`Examples (n)` button in the top bar, left of *Load existing*). Unlike the
user's saved designs, these are bundled at build time from this directory.

## What's here

Each example is a pair of files sharing a base name:

- `<id>.json` — metadata + the design config (see shape below)
- `<id>.png` — a pre-rendered thumbnail (square or matching the canvas aspect)

`index.js` glob-imports both at build time and resolves each example's `thumb`
basename to its hashed asset URL. **To publish a new example, drop in the pair
and rebuild — nothing else to wire.**

### JSON shape

```jsonc
{
  "id":          "bloom",             // stable, unique
  "name":        "Bloom",             // card label
  "description": "Phyllotaxis spiral",// card tooltip
  "order":       1,                   // optional; lower sorts first
  "thumb":       "bloom.png",         // basename of the paired thumbnail
  "config": {                         // same shape as a saved design
    "layers":  [ /* Layer[] — applied verbatim via loadLayerSet */ ],
    "canvasW": 1152,                  // px @ 96 PPI; presetIndex is recomputed
    "canvasH": 1152,
    "bgColor": "#0a1628"
  }
}
```

## Regenerating the seeds (or rendering thumbnails for new patterns)

The three seeds (`bloom`, `drift`, `orbit`) are authored in
`scripts/genExamples.mjs` and built from the app's real `DEFAULT_PARAMS`, so
they stay valid as the param schema evolves.

1. **Author / edit configs** → `node scripts/genExamples.mjs` writes the JSONs.
2. **Render thumbnails** — the app already restores a full design from a
   `?s=<token>` share link, so:
   - `node scripts/shareTokens.mjs` prints each example's share token.
   - Open `http://localhost:5173/?s=<token>` in a browser (dev server running).
   - In the console, downscale + export the canvas:
     ```js
     const c = document.querySelector('canvas');
     const max = 512, s = Math.min(1, max / Math.max(c.width, c.height));
     const o = Object.assign(document.createElement('canvas'),
       { width: Math.round(c.width*s), height: Math.round(c.height*s) });
     const x = o.getContext('2d');
     x.imageSmoothingQuality = 'high';
     x.drawImage(c, 0, 0, o.width, o.height);
     copy(o.toDataURL('image/png'));   // data URI now on clipboard
     ```
   - Save the data URI to `<id>.datauri.txt` and run
     `node scripts/decodeThumb.mjs <id>` to write `src/examples/<id>.png`.

> Note: guest tier clamps some params (e.g. flow-field particle count) on load,
> so a signed-out visitor may see a sparser render than a full-fidelity
> thumbnail. Author within guest limits if you want them to match exactly.
