// composeSheet(placedPieces, sheetDims) -> svgString
//
// Wrap each placed piece in a labeled, translated <g>.

// Extract the inner markup of an `svg` field, dropping the outer <svg> wrapper
// (and any XML prolog/comments) so the content composes into our sheet group.
function unwrapSvg(markup) {
  const open = markup.indexOf('<svg');
  if (open === -1) return markup;
  const close = markup.indexOf('>', open);
  const end = markup.lastIndexOf('</svg>');
  if (close === -1 || end === -1) return markup;
  return markup.slice(close + 1, end);
}

function pieceInner(piece) {
  if (typeof piece.svg === 'string') return unwrapSvg(piece.svg);
  return piece.content ?? '';
}

// Stroke convention, matching the Studio's seed operations (src/lib/operations.js):
//   cut -> red, score -> blue, engrave -> black. Unknown processes default to cut.
const OP_STROKE = { cut: '#FF0000', score: '#0000FF', engrave: '#000000' };

function processOf(op) {
  return typeof op === 'string' ? op : op?.process;
}

// Given a piece's `ops`, return the normalized stroke attributes for its group.
// We take the first declared op as the piece's process (one piece = one op here).
function opAttrs(piece) {
  const ops = piece.ops;
  if (!Array.isArray(ops) || ops.length === 0) return '';
  const process = processOf(ops[0]);
  const stroke = OP_STROKE[process] ?? OP_STROKE.cut;
  return ` data-op="${process}" stroke="${stroke}" fill="none"`;
}

function pieceGroup(piece) {
  const inner = pieceInner(piece);
  return `<g data-submission="${piece.id}"${opAttrs(piece)} transform="translate(${piece.xMm},${piece.yMm})">${inner}</g>`;
}

export function composeSheet(placedPieces, sheetDims) {
  const { widthMm, heightMm } = sheetDims;
  const body = (placedPieces ?? []).map(pieceGroup).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${widthMm}mm" height="${heightMm}mm" ` +
    `viewBox="0 0 ${widthMm} ${heightMm}">${body}</svg>`
  );
}
