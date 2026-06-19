// gridPlace.js — Worker 1e
// Deterministic shelf/row packer for laying out cut pieces onto sheets.
//
// gridPlace(pieces, { sheetWMm, sheetHMm, gapMm }) -> sheets
//   pieces = [{ id, wMm, hMm }]
//   sheets = [ [ { id, xMm, yMm } ], ... ]
//
// Rules (see test file for the full contract):
//   - gapMm is reserved at every sheet edge AND between pieces.
//   - First piece on a sheet sits at (gapMm, gapMm).
//   - Row fills left->right; fits when xMm + wMm + gapMm <= sheetWMm.
//   - Row height = max piece height in that row; next row advances by
//     rowHeight + gapMm; fits when yMm + rowHeight + gapMm <= sheetHMm.
//   - No rotation.

export function gridPlace(pieces, { sheetWMm, sheetHMm, gapMm }) {
  const sheets = [];
  let current = null; // current sheet (array of placed pieces)
  let cursorX = gapMm;
  let cursorY = gapMm;
  let rowHeight = 0;

  const startSheet = () => {
    current = [];
    sheets.push(current);
    cursorX = gapMm;
    cursorY = gapMm;
    rowHeight = 0;
  };

  for (const piece of pieces) {
    const { id, wMm, hMm } = piece;

    // A piece that cannot fit even alone (respecting edge gaps) is fatal.
    if (wMm + 2 * gapMm > sheetWMm || hMm + 2 * gapMm > sheetHMm) {
      const err = new Error(
        `Piece ${id} (${wMm}x${hMm}mm) is larger than the usable sheet area`,
      );
      err.code = 'PIECE_TOO_LARGE';
      err.pieceId = id;
      throw err;
    }

    if (current === null) startSheet();

    // Wrap to a new row if this piece would exceed the right edge.
    if (cursorX + wMm + gapMm > sheetWMm && rowHeight > 0) {
      const nextRowY = cursorY + rowHeight + gapMm;
      // Spill to a new sheet if the wrapped row would exceed the bottom edge.
      if (nextRowY + hMm + gapMm > sheetHMm) {
        startSheet();
      } else {
        cursorX = gapMm;
        cursorY = nextRowY;
        rowHeight = 0;
      }
    }

    current.push({ id, xMm: cursorX, yMm: cursorY });
    cursorX += wMm + gapMm;
    if (hMm > rowHeight) rowHeight = hMm;
  }

  return sheets;
}
