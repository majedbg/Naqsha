// gridPlace.test.js — Worker 1e
// Pure node environment (no DOM needed); uses vitest globals.
//
// gridPlace(pieces, { sheetWMm, sheetHMm, gapMm }) -> sheets
//   pieces = [{ id, wMm, hMm }]
//   sheets = [ [ { id, xMm, yMm } ], ... ]
//
// Deterministic shelf/row packer (no rotation). Packing rules:
//   - gapMm is applied at every sheet edge AND between pieces.
//   - First piece on a sheet is placed at (gapMm, gapMm).
//   - Row fills left->right; a piece fits in the current row when
//       xMm + wMm + gapMm <= sheetWMm   (trailing edge gap reserved).
//     Otherwise it wraps to a new row.
//   - Row height = max piece height in that row. Next row y advances by
//       rowHeight + gapMm. A row fits when
//       yMm + rowHeight + gapMm <= sheetHMm   (trailing edge gap reserved).
//     Otherwise the piece spills to a NEW sheet.
//   - Oversize piece (cannot fit even alone, respecting edge gaps) throws
//     a typed error (err.code === 'PIECE_TOO_LARGE').

import { gridPlace } from './gridPlace';

describe('gridPlace — tracer', () => {
  it('places a single piece at the gap offset on sheet 0', () => {
    const sheets = gridPlace([{ id: 'a', wMm: 10, hMm: 10 }], {
      sheetWMm: 100,
      sheetHMm: 100,
      gapMm: 2,
    });
    expect(sheets).toEqual([[{ id: 'a', xMm: 2, yMm: 2 }]]);
  });
});

describe('gridPlace — row fill & wrap', () => {
  it('fills a row left->right with a gap between pieces', () => {
    const sheets = gridPlace(
      [
        { id: 'a', wMm: 20, hMm: 10 },
        { id: 'b', wMm: 20, hMm: 10 },
      ],
      { sheetWMm: 100, sheetHMm: 100, gapMm: 5 },
    );
    expect(sheets).toEqual([
      [
        { id: 'a', xMm: 5, yMm: 5 },
        // b: x = 5 + 20 + 5 = 30
        { id: 'b', xMm: 30, yMm: 5 },
      ],
    ]);
  });

  it('wraps to the next row when the next piece would exceed sheetWMm', () => {
    // sheetW=50, gap=5. Piece w=20.
    // a at x=5 (fits: 5+20+5=30 <= 50)
    // b at x=30 (fits: 30+20+5=55 > 50 -> wrap)
    const sheets = gridPlace(
      [
        { id: 'a', wMm: 20, hMm: 10 },
        { id: 'b', wMm: 20, hMm: 10 },
      ],
      { sheetWMm: 50, sheetHMm: 100, gapMm: 5 },
    );
    expect(sheets).toEqual([
      [
        { id: 'a', xMm: 5, yMm: 5 },
        // wrapped: new row y = 5 + rowHeight(10) + gap(5) = 20
        { id: 'b', xMm: 5, yMm: 20 },
      ],
    ]);
  });
});

describe('gridPlace — sheet spill', () => {
  it('spills to a new sheet when a new row would exceed sheetHMm', () => {
    // sheetW=30 so each piece (w=20) takes its own row.
    // sheetH=35, gap=5, h=10.
    // a: row0 y=5  (fits: 5+10+5=20 <= 35)
    // b: row1 y=20 (fits: 20+10+5=35 <= 35)
    // c: row2 y=35 (35+10+5=50 > 35 -> spill to sheet 1, y=5)
    const sheets = gridPlace(
      [
        { id: 'a', wMm: 20, hMm: 10 },
        { id: 'b', wMm: 20, hMm: 10 },
        { id: 'c', wMm: 20, hMm: 10 },
      ],
      { sheetWMm: 30, sheetHMm: 35, gapMm: 5 },
    );
    expect(sheets).toEqual([
      [
        { id: 'a', xMm: 5, yMm: 5 },
        { id: 'b', xMm: 5, yMm: 20 },
      ],
      [{ id: 'c', xMm: 5, yMm: 5 }],
    ]);
  });
});

describe('gridPlace — oversize handling', () => {
  it('throws PIECE_TOO_LARGE when a piece is wider than the usable sheet', () => {
    // usable width = sheetW - 2*gap = 100 - 10 = 90; piece w=95 cannot fit.
    expect(() =>
      gridPlace([{ id: 'big', wMm: 95, hMm: 10 }], {
        sheetWMm: 100,
        sheetHMm: 100,
        gapMm: 5,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'PIECE_TOO_LARGE', pieceId: 'big' }),
    );
  });

  it('throws PIECE_TOO_LARGE when a piece is taller than the usable sheet', () => {
    // usable height = 100 - 10 = 90; piece h=95 cannot fit.
    expect(() =>
      gridPlace([{ id: 'tall', wMm: 10, hMm: 95 }], {
        sheetWMm: 100,
        sheetHMm: 100,
        gapMm: 5,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'PIECE_TOO_LARGE', pieceId: 'tall' }),
    );
  });

  it('accepts a piece that exactly fills the usable sheet', () => {
    // w = h = 100 - 10 = 90 fits exactly.
    const sheets = gridPlace([{ id: 'exact', wMm: 90, hMm: 90 }], {
      sheetWMm: 100,
      sheetHMm: 100,
      gapMm: 5,
    });
    expect(sheets).toEqual([[{ id: 'exact', xMm: 5, yMm: 5 }]]);
  });
});

describe('gridPlace — gap convention', () => {
  it('uses variable row heights (row height = max piece height in row)', () => {
    // sheetW=60, gap=2.
    // a w=20 h=30 at x=2
    // b w=20 h=10 at x=24 (2+20+2)
    // c w=20 h=10 -> 24+20+2=46; +20+2=... x for c = 46, 46+20+2=68 > 60 -> wrap
    //   new row y = 2 + rowHeight(max(30,10)=30) + gap(2) = 34
    const sheets = gridPlace(
      [
        { id: 'a', wMm: 20, hMm: 30 },
        { id: 'b', wMm: 20, hMm: 10 },
        { id: 'c', wMm: 20, hMm: 10 },
      ],
      { sheetWMm: 60, sheetHMm: 100, gapMm: 2 },
    );
    expect(sheets).toEqual([
      [
        { id: 'a', xMm: 2, yMm: 2 },
        { id: 'b', xMm: 24, yMm: 2 },
        { id: 'c', xMm: 2, yMm: 34 },
      ],
    ]);
  });

  it('packs tightly with gapMm = 0', () => {
    const sheets = gridPlace(
      [
        { id: 'a', wMm: 50, hMm: 10 },
        { id: 'b', wMm: 50, hMm: 10 },
        { id: 'c', wMm: 50, hMm: 10 },
      ],
      { sheetWMm: 100, sheetHMm: 100, gapMm: 0 },
    );
    expect(sheets).toEqual([
      [
        { id: 'a', xMm: 0, yMm: 0 },
        { id: 'b', xMm: 50, yMm: 0 },
        // c: 100+50=150 > 100 -> wrap to y = 0 + 10 = 10
        { id: 'c', xMm: 0, yMm: 10 },
      ],
    ]);
  });
});

describe('gridPlace — empty input', () => {
  it('returns no sheets for an empty piece list', () => {
    expect(
      gridPlace([], { sheetWMm: 100, sheetHMm: 100, gapMm: 5 }),
    ).toEqual([]);
  });
});
