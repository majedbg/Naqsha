// extractOps — derive operation rows from an SVG.
//
//   extractOps(svgString, { source }) -> [{ key, label, defaultOp }]
//
// source 'upload': one row per distinct stroke color (key = the color).

function extractUpload(doc) {
  const seen = new Set();
  const rows = [];
  for (const el of doc.querySelectorAll('[stroke]')) {
    const raw = el.getAttribute('stroke');
    if (!raw) continue;
    const color = raw.trim().toLowerCase();
    if (color === 'none' || seen.has(color)) continue;
    seen.add(color);
    rows.push({ key: color, label: color, defaultOp: 'cut' });
  }
  return rows;
}

// app-exported SVGs encode each layer as a <g> with an id and a data-role
// attribute whose value (cut/score/engrave) is the operation.
const ROLE_OPS = { cut: 'cut', score: 'score', engrave: 'engrave' };

function extractDesign(doc) {
  const rows = [];
  for (const g of doc.querySelectorAll('g[data-role]')) {
    const role = (g.getAttribute('data-role') || '').trim().toLowerCase();
    const op = ROLE_OPS[role];
    if (!op) continue;
    rows.push({
      key: g.getAttribute('id'),
      label: op.charAt(0).toUpperCase() + op.slice(1),
      defaultOp: op,
    });
  }
  return rows;
}

export function extractOps(svgString, { source } = {}) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (source === 'design') return extractDesign(doc);
  if (source === 'upload') return extractUpload(doc);
  return [];
}
