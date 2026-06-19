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

export function gridPlace(pieces, { sheetWMm, sheetHMm, gapMm = 0 }) {
  // Validate sheet config up front (before any piece is examined) so that a
  // bad sheet/gap throws a clear INVALID_SHEET, never a misleading
  // PIECE_TOO_LARGE and never NaN/undefined coordinates downstream.
  if (
    !Number.isFinite(sheetWMm) ||
    !Number.isFinite(sheetHMm) ||
    sheetWMm <= 0 ||
    sheetHMm <= 0 ||
    !Number.isFinite(gapMm) ||
    gapMm < 0
  ) {
    const err = new Error(
      `Invalid sheet config (sheetWMm=${sheetWMm}, sheetHMm=${sheetHMm}, gapMm=${gapMm})`,
    );
    err.code = 'INVALID_SHEET';
    throw err;
  }

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

    // Validate piece dims BEFORE the oversize guard: NaN/non-finite values
    // make every comparison false, so they would slip past and poison
    // cursorX with NaN. Reject any non-finite or non-positive dimension.
    if (
      !Number.isFinite(wMm) ||
      !Number.isFinite(hMm) ||
      wMm <= 0 ||
      hMm <= 0
    ) {
      const err = new Error(
        `Piece ${id} has invalid dimensions (${wMm}x${hMm}mm); ` +
          'wMm and hMm must be finite and > 0',
      );
      err.code = 'INVALID_PIECE';
      err.pieceId = id;
      throw err;
    }

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
