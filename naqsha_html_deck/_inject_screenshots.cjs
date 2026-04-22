/*
 * Inject the 9 pattern screenshots into the Naqsha Deck bundle and
 * replace the 3×3 placeholder grid on slide 08. One-shot script —
 * keep it around so the next refresh (new screenshots) is a re-run
 * away, not a regex hunt.
 *
 * Rows are re-ordered per request: Spirograph top, Voronoi middle,
 * Recursive bottom.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const HTML_PATH = path.join(HERE, 'Naqsha Deck _standalone_.html');

const ROWS = [
  {
    label: 'Spirograph',
    files: ['spirograph_1.png', 'spirograph_2.png', 'spirograph_3.png'],
  },
  {
    label: 'Voronoi',
    files: ['voronoi_1.png', 'voronoi_2.png', 'voronoi_3.png'],
  },
  {
    label: 'Recursive',
    files: ['recursive_1.png', 'recursive_2.png', 'recursive_3.png'],
  },
];

function uuid() {
  // Stable enough for a one-shot bundle. Not cryptographic — just a
  // unique token the loader can split the template on.
  return crypto.randomUUID();
}

function loadPngAsManifestEntry(filename) {
  const bytes = fs.readFileSync(path.join(HERE, filename));
  return {
    uuid: uuid(),
    filename,
    entry: {
      mime: 'image/png',
      compressed: false,
      data: bytes.toString('base64'),
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// 1. Read and parse the bundle
// ──────────────────────────────────────────────────────────────────
const html = fs.readFileSync(HTML_PATH, 'utf8');

const manifestMatch = html.match(
  /<script type="__bundler\/manifest">([\s\S]*?)<\/script>/
);
const templateMatch = html.match(
  /<script type="__bundler\/template">([\s\S]*?)<\/script>/
);

if (!manifestMatch || !templateMatch) {
  throw new Error('Bundle scripts not found in ' + HTML_PATH);
}

const manifest = JSON.parse(manifestMatch[1]);
let template = JSON.parse(templateMatch[1]);

// ──────────────────────────────────────────────────────────────────
// 2. Load the 9 PNGs into new manifest entries
// ──────────────────────────────────────────────────────────────────
const entriesByFilename = {};
for (const row of ROWS) {
  row.files = row.files.filter((f) => {
    if (fs.existsSync(path.join(HERE, f))) return true;
    console.log('Skipping missing file:', f);
    return false;
  });
  for (const f of row.files) {
    const rec = loadPngAsManifestEntry(f);
    entriesByFilename[f] = rec;
    manifest[rec.uuid] = rec.entry;
  }
}
console.log('Added', Object.keys(entriesByFilename).length, 'PNG manifest entries.');

// ──────────────────────────────────────────────────────────────────
// 3. Inject CSS — make .roll-row img look the same shape the .ph had
// ──────────────────────────────────────────────────────────────────
const CSS_PATCH = `
/* Pattern roll grid — screenshots replace the .ph placeholders. */
.roll-row img.roll-img {
  width: 100%;
  height: 150px;
  object-fit: cover;
  display: block;
  background: var(--paper-warm);
  border: 1px solid var(--hairline);
}
`;

// Append the patch at the end of the first <style> block.
const styleEnd = template.indexOf('</style>');
if (styleEnd < 0) throw new Error('No </style> found in template');
template = template.slice(0, styleEnd) + CSS_PATCH + template.slice(styleEnd);

// ──────────────────────────────────────────────────────────────────
// 4. Replace the .roll-grid markup on slide 08
// ──────────────────────────────────────────────────────────────────
// Locate the exact .roll-grid block to be surgical.
const rollGridStart = template.indexOf('<div class="roll-grid">');
if (rollGridStart < 0) throw new Error('roll-grid not found in template');
const rollGridEnd =
  template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', template.indexOf('</div>', rollGridStart) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1;
// That's 12 </div> closures: 3 roll-rows × (1 row-lab + 3 ph + row wrap), plus the roll-grid wrap. 3×4 + 1 (outer) = 13. Adjust — simpler to re-scan.

// Simpler: find the explicit closing of .roll-grid by tracking depth.
function findMatchingClose(src, openIdx) {
  // openIdx points at "<div class=...". Find the matching </div> using
  // a stack of <div> opens. Assumes there are no <div> fragments in attrs.
  let depth = 0;
  let i = openIdx;
  const openRe = /<div\b/g;
  const closeRe = /<\/div>/g;
  while (i < src.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(src);
    const c = closeRe.exec(src);
    if (!c) throw new Error('no close found');
    if (o && o.index < c.index) {
      depth++;
      i = o.index + 4;
    } else {
      depth--;
      i = c.index + 6;
      if (depth === 0) return c.index + 6;
    }
  }
  throw new Error('unbalanced tags');
}

const rollGridCloseIdx = findMatchingClose(template, rollGridStart);
const originalRollGrid = template.slice(rollGridStart, rollGridCloseIdx);
console.log(
  'Original .roll-grid block length:',
  originalRollGrid.length,
  'chars'
);

function renderRow(label, files, rowIndex) {
  const cells = files
    .map((f, colIndex) => {
      const rec = entriesByFilename[f];
      const alt = `${label} pattern, roll ${colIndex + 1}`;
      return `          <img class="roll-img" src="${rec.uuid}" alt="${alt}">`;
    })
    .join('\n');
  return `        <div class="roll-row">
          <div class="row-lab">${label}</div>
${cells}
        </div>`;
}

const newRollGrid = `<div class="roll-grid">
${ROWS.map((r, i) => renderRow(r.label, r.files, i)).join('\n')}
      </div>`;

template =
  template.slice(0, rollGridStart) + newRollGrid + template.slice(rollGridCloseIdx);

console.log('New .roll-grid block length:', newRollGrid.length, 'chars');

// ──────────────────────────────────────────────────────────────────
// 5. Re-encode and write back
// ──────────────────────────────────────────────────────────────────
// The template JSON contains embedded HTML with its own <script> tags.
// When that JSON is inlined inside <script type="__bundler/template">,
// a raw </script> inside it would prematurely terminate the outer
// script block and break the whole bundle on load. Escape the forward
// slash — valid JSON, inert to the outer HTML parser. The original
// bundler did this; we have to preserve the invariant when re-writing.
const escapeScript = (s) => s.split('</script>').join('<\\/script>');

const newManifestJson = escapeScript(JSON.stringify(manifest));
const newTemplateJson = escapeScript(JSON.stringify(template));

// Use function-form .replace so the replacement is treated literally —
// any $-sequence inside the JSON (e.g. base64 is clean, but future
// assets may embed CSS like `$foo`) can't be reinterpreted as a regex
// backreference.
let newHtml = html.replace(
  /<script type="__bundler\/manifest">[\s\S]*?<\/script>/,
  () => `<script type="__bundler/manifest">${newManifestJson}</script>`
);
newHtml = newHtml.replace(
  /<script type="__bundler\/template">[\s\S]*?<\/script>/,
  () => `<script type="__bundler/template">${newTemplateJson}</script>`
);

fs.writeFileSync(HTML_PATH, newHtml);
console.log('Wrote', HTML_PATH);
console.log('Manifest now has', Object.keys(manifest).length, 'entries.');
