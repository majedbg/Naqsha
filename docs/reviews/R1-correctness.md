# R1 — Correctness Review (adversarial)

Scope: `src/lib/svg/parseDimensions.js`, `src/lib/aggregate/gridPlace.js` (+ tests),
cross-checked against `src/lib/aggregate/composeSheet.js`.

Status of existing suites at review time: **19/19 pass**. The findings below are
gaps the passing tests do not cover, plus spec deviations.

Format: `SEVERITY — file:line — what's wrong — input → expected vs actual — fix`.

---

## A. parseDimensions.js — spec §16a

### A1. HIGH — parseDimensions.js:21,26-37 — `cm` and `in` units NOT supported; spec §16a explicitly requires them
The length regex only accepts `(mm|px|pt)`. The spec lists `8cm → 80mm` and asks
"`in` handled?". Both are rejected as garbage and throw `INVALID_DIMENSION`.
- Input `<svg width="8cm" height="6cm"/>` → expected `{widthMm:80, heightMm:60}` → **actual: THROW INVALID_DIMENSION**.
- Input `<svg width="2in" height="1in"/>` → expected `{widthMm:50.8, heightMm:25.4}` → **actual: THROW INVALID_DIMENSION**.
This is a spec-mandated unit silently failing. SVG/CSS absolute units are mm, cm, in, pt, pc, px — at minimum cm and in must be added.
- Fix: extend regex to `(mm|cm|in|pt|pc|px)?` and add cases in `toMm`: `cm → value*10`, `in → value*25.4`, `pc → (value/6)*25.4`.

### A0. HIGH (most impactful) — parseDimensions.js:13-17 — `getAttr` scans the WHOLE document and grabs a CHILD element's width/height as the document size, with false `ambiguous:false`
`getAttr` uses an unanchored regex `\bwidth\s*=\s*"([^"]*)"` against the entire SVG string and returns the **first** match. It is not scoped to the root `<svg …>` opening tag. Real-world SVGs (icons, graphics with a background `<rect>`, `<image>`, `<use>`) routinely have viewBox-only roots whose children carry their own `width`/`height`. This is exactly the spec §16a "viewBox-only → ambiguous" path — and it is silently defeated.
- Input `<svg viewBox="0 0 24 24"><rect width="10" height="20"/></svg>` → expected viewBox fallback `{widthMm:6.35, heightMm:6.35, ambiguous:true, source:"viewbox"}` → **actual `{widthMm:2.6458…, heightMm:5.2917…, ambiguous:false, source:"px"}`** — reads the `<rect>`'s 10×20 as the document size. Wrong number AND falsely confident (`ambiguous:false`).
- Input `<svg viewBox="0 0 100 100"><image width="50" height="40" href="x"/></svg>` → expected `{6.35,6.35,ambiguous:true,viewbox}` → **actual `{13.229…,10.583…,ambiguous:false,px}`** (the `<image>`'s 50×40).
- The existing `viewbox-only.svg` test passes only because that fixture happens to contain no child element with width/height. The bug is invisible to the current suite.
- Fix: extract the root `<svg …>` opening tag first (e.g. slice from `<svg` to the first `>` at depth 0, or `svgString.match(/<svg\b[^>]*>/)`) and run `getAttr` only against that slice. Also scope the `inkscape:version` lookup to the root tag for the same reason.

### A6. LOW — parseDimensions.js:14 — `getAttr` only matches double-quoted attributes; single-quoted root dims read as absent
The regex requires `"([^"]*)"`. SVG/XML permits single quotes.
- Input `<svg width='80mm' height='60mm'/>` → expected `{widthMm:80, heightMm:60}` → **actual THROW NO_DIMENSIONS** (both treated as missing, no viewBox to fall back to).
- Fix: accept either quote style, e.g. `=\s*(["'])(.*?)\1`.

### A2. HIGH — parseDimensions.js:21,48-53 — zero, negative, and `100%` dimensions are not rejected (no positivity validation)
The regex accepts `[+-]?` numbers, and there is no post-parse sanity check that the result is a finite positive length.
- Input `<svg width="0" height="60" .../>` → expected typed throw (a 0-width sheet/piece is invalid) → **actual `{widthMm:0, heightMm:15.875}`** (silently accepted, becomes a degenerate piece that flows into gridPlace).
- Input `<svg width="-100" height="60"/>` → expected typed throw → **actual `{widthMm:-26.458…, heightMm:15.875}`** (negative width — produces negative coords / mirrored placement downstream).
- Input `<svg width="100%" height="100%" viewBox="0 0 80 60"/>` → expected: ignore the percentage and fall back to viewBox `ambiguous:true` (browsers resolve `%` against the viewport, which we don't have) → **actual: THROW INVALID_DIMENSION** (the whole file is rejected even though a perfectly good viewBox is present).
- Fix: (a) after computing `widthMm/heightMm`, throw `INVALID_DIMENSION` if either is `<= 0` or not finite; (b) treat a `%`-valued width/height the same as "absent" so the viewBox fallback path runs, rather than throwing.

### A3. MEDIUM — parseDimensions.js:21 — scientific notation rejected
`3e2px` (a valid SVG length = 300px) is rejected because the number regex `\d+\.?\d*|\.\d+` has no exponent part.
- Input `<svg width="3e2px" height="150px"/>` → expected `widthMm ≈ 79.375` → **actual: THROW INVALID_DIMENSION**.
- Severity is MEDIUM because exponent notation is rare in real exports, but it is legal SVG and currently turns a valid file into a hard error.
- Fix: add optional exponent to the number regex: `[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`.

### A4. LOW/MEDIUM — parseDimensions.js:57 — `source` reports only the WIDTH unit when width and height use different units
`source = width.unit || 'px'` ignores height's unit entirely.
- Input `<svg width="80mm" height="300px"/>` → both dims are converted **correctly and independently** (good: `widthMm:80`, `heightMm:79.375`), but `source:"mm"` mislabels a mixed-unit file. Anything keying provenance/ambiguity decisions off `source` gets a half-truth.
- Numeric confirmation of the *conversion* correctness (this part is right):
  - `width="80mm" height="150px"` → `{80, 39.6875}` ✓ (each unit handled on its own).
  - `width="300px" height="72pt"` → `{79.375, 25.4}` ✓.
- Fix: either report `source: 'mixed'` when `width.unit !== height.unit`, or return `widthSource`/`heightSource` separately. (Conversion math itself needs no change.)

### A5. PASS (scrutinized) — Inkscape 90-vs-96 heuristic does NOT misfire on modern files
Concern from the brief: could a modern 96dpi Inkscape file be wrongly scaled to 90dpi?
Verified by feeding real modern version strings through `pxDpiFor`:
- `inkscape:version="0.92.4 (...)"` → matches `0.92`, `0.92 < 0.92` is false → **96dpi** ✓ (96px→25.4mm).
- `inkscape:version="1.0 (...)"` → matches `1.0`, not `<0.92` → **96dpi** ✓.
- `inkscape:version="1.3.2 (...)"` → matches `1.3` → **96dpi** ✓.
- Old `0.91 r13725` → `0.91 < 0.92` → **90dpi** ✓ (90px→25.4mm, intended legacy behavior).
The regex `^\s*(\d+\.\d+)` captures only major.minor, and float compare against `0.92` is correct for all these. No misfire found. One minor caveat (LOW): a malformed version like `0.9` (no patch, pre-0.92 era written sloppily) would be read as `0.9 < 0.92` → 90dpi; acceptable. The heuristic only ever affects `px`/unitless — absolute `mm` is immune (confirmed by the `inkscape-96.svg` mm test). **No fix required.**

---

## B. gridPlace.js

### B1. HIGH — gridPlace.js:35 — NaN / non-finite piece dimensions are silently accepted (NaN defeats the oversize guard)
The oversize check `wMm + 2*gapMm > sheetWMm` is the ONLY validation. With `wMm = NaN`, every comparison is `false`, so the guard passes and the piece is placed.
- Input `[{id:"a", wMm:NaN, hMm:10}]`, sheet 100×100 gap 0 → expected typed throw → **actual `[[{id:"a", xMm:0, yMm:0}]]`** then `cursorX += NaN` poisons the rest of the sheet; every subsequent piece's `xMm` is `NaN`. This propagates into composeSheet as `transform="translate(NaN,0)"`.
- Fix: at loop top, validate `Number.isFinite(wMm) && Number.isFinite(hMm) && wMm > 0 && hMm > 0`, else throw a typed `INVALID_PIECE` error with `pieceId`.

### B2. HIGH — gridPlace.js:16,19 — missing/undefined `gapMm` (and unvalidated sheet dims) produce NaN coordinates with no error
No defaulting or validation of the options object.
- Input `gridPlace([{id:"a",wMm:10,hMm:10}], {sheetWMm:100, sheetHMm:100})` (gap omitted) → expected either default `gapMm=0` or a typed throw → **actual `[[{id:"a"}]]`** — the placed object's `xMm`/`yMm` are set to `undefined` (`cursorX = gapMm = undefined`); `JSON.stringify` drops `undefined`-valued keys so the printed object looks like it's missing them, but the real shape is `{id:"a", xMm:undefined, yMm:undefined}`. composeSheet then emits `translate(undefined,undefined)`. Silent failure with a malformed coordinate.
- Fix: destructure with defaults `{ sheetWMm, sheetHMm, gapMm = 0 }` and validate all three are finite & `sheetW/H > 0`, throwing typed errors otherwise.

### B3. MEDIUM — gridPlace.js:60 — zero-width pieces with gap 0 stack at identical coords (infinite-loop-adjacent; degenerate overlap)
With `wMm:0, gapMm:0`, `cursorX += 0` never advances and the wrap guard `rowHeight > 0` lets them pile up.
- Input `[{wMm:0,hMm:5}×3]`, sheet 10×10 gap 0 → **actual all three at `{xMm:0,yMm:0}`** (overlapping). Not a literal infinite loop (the loop is `for…of` over a finite list, so it terminates), but it silently produces overlapping zero-area placements. Combined with B1's positivity check this is moot; flagged in case B1's fix only checks NaN and not `> 0`.
- Fix: covered by B1's `wMm > 0 && hMm > 0` validation.

### B4. LOW — gridPlace.js:35 — negative sheet dims throw `PIECE_TOO_LARGE` (misleading code) instead of a config error
- Input sheet `sheetWMm:-5` with a normal small piece → **actual THROW PIECE_TOO_LARGE** (the piece isn't too large; the *sheet* is invalid). Misattributes the fault.
- Fix: validate sheet dims up front (see B2) and throw a distinct `INVALID_SHEET` code.

### B5. PASS — packing math verified correct (no off-by-gap)
Concrete checks:
- **Trailing edge gap reserved (B-spec 1):** piece `w=90` on sheet `W=100 gap=5` → `x=5`, occupies 5..95, `+gap=100 == sheetW` → accepted, stays on one sheet. ✓ (`exact-trailing` → `[{xMm:5,yMm:5}]`).
- **Wrap fit boundary:** sheet `W=100 gap=5`, pieces `w=42`: a@5 (5+42+5=52≤100), b@52 (52+42+5=99≤100) → both same row ✓; a third `w=42` (99+42+5=146>100) would wrap. No off-by-one.
- **Row-height advance with tall mid-row piece (B-spec 3):** `[a 20×10, b 20×30, c 20×10]` sheet `60×100 gap 2`: a@(2,2), b@(24,2), c wraps to `y = 2 + max(10,30) + 2 = 34` → c@(2,34). ✓ Tall mid-row piece correctly sets the row height the next row advances by.
- **Spill (B-spec 2):** covered by existing test (sheet `35` tall, third row `y=35`, `35+10+5=50>35` → new sheet at origin+gap `(5,5)`). ✓
- **Zero-gap full sheet:** `w=h=100` on `100×100 gap 0` → accepted at `(0,0)`. ✓
- **Empty input → `[]`.** ✓

### B6. PASS — output contract matches composeSheet consumption
`gridPlace` emits `{id, xMm, yMm}` (top-left origin, 1uu=1mm). `composeSheet.pieceGroup`
reads exactly `piece.id`, `piece.xMm`, `piece.yMm` into `transform="translate(xMm,yMm)"`
on an SVG whose `viewBox="0 0 widthMm heightMm"` and `width/height` are in `mm` — so
1 user unit = 1 mm, top-left origin. Contracts align. ✓ (Caveat: NaN/undefined from B1/B2
flow straight into `translate(...)` — another reason to validate at the gridPlace boundary.)

---

## Verdict

**FINDINGS-MUST-FIX** — Highest-impact bug is **A0**: `getAttr` is not scoped to the root
`<svg>` tag, so a child element's width/height is read as the document size with a false
`ambiguous:false`, silently defeating the spec-required viewBox-only path. Plus two spec
deviations (A1 `cm`/`in` missing; A2 zero/negative/`%` not handled) and two silent
NaN/undefined holes in gridPlace (B1 NaN piece, B2 missing gapMm → malformed output).
Packing geometry and the Inkscape DPI heuristic are correct and need no change.
