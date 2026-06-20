export class SvgDimensionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SvgDimensionError';
    this.code = code;
  }
}

const MM_PER_IN = 25.4;
const PX_PER_IN = 96;
const PT_PER_IN = 72;

// Extract the root `<svg …>` opening tag only. Attribute reads must be scoped
// to this slice so a CHILD element's width/height (e.g. a background <rect> or
// <image>) is never mistaken for the document size.
function rootTag(svgString) {
  const m = /<svg\b[^>]*>/.exec(svgString);
  return m ? m[0] : '';
}

function getAttr(svgString, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`);
  const m = re.exec(svgString);
  return m ? m[2] : null;
}

// Classify a raw width/height attribute value into one of:
//   { kind: 'absent' }      — attribute not present
//   { kind: 'length', ... } — a usable absolute length (finite & > 0)
//   { kind: 'unusable' }    — present but not a usable absolute size:
//                             percentages/relative units, or a parsed
//                             length that is non-finite or ≤ 0. These route
//                             to the viewBox fallback (ambiguous), not a throw.
//   { kind: 'garbage' }     — syntactically unparseable (e.g. "abc"). Always
//                             throws INVALID_DIMENSION regardless of viewBox.
function classifyDim(raw) {
  if (raw == null) return { kind: 'absent' };
  // Percentages are relative to the viewport — not an absolute physical size.
  if (/^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*%\s*$/.test(raw)) {
    return { kind: 'unusable' };
  }
  const match =
    /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|px|pt)?\s*$/.exec(
      raw,
    );
  if (!match) return { kind: 'garbage' };
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return { kind: 'unusable' };
  return { kind: 'length', value, unit: match[2] || '' };
}

function toMm(length, dpi) {
  switch (length.unit) {
    case 'mm':
      return length.value;
    case 'cm':
      return length.value * 10;
    case 'in':
      return length.value * MM_PER_IN;
    case 'pt':
      return (length.value / PT_PER_IN) * MM_PER_IN;
    case 'px':
    case '':
      return (length.value / dpi) * MM_PER_IN;
    default:
      return null;
  }
}

export function parseDimensions(svgString) {
  const root = rootTag(svgString);
  const rawWidth = getAttr(root, 'width');
  const rawHeight = getAttr(root, 'height');
  const width = classifyDim(rawWidth);
  const height = classifyDim(rawHeight);

  // A dimension attribute that is syntactically unparseable (e.g. width="abc")
  // is corrupt input — fail loudly rather than silently falling back, even when
  // a viewBox is present.
  if (width.kind === 'garbage' || height.kind === 'garbage') {
    throw new SvgDimensionError(
      'SVG has an unparseable width/height attribute',
      'INVALID_DIMENSION',
    );
  }

  if (width.kind === 'length' && height.kind === 'length') {
    const dpi = pxDpiFor(root);
    const source = width.unit || 'px';
    return {
      widthMm: toMm(width, dpi),
      heightMm: toMm(height, dpi),
      ambiguous: false,
      source,
    };
  }

  // Explicit dims are absent, relative (%), or non-positive — fall back to the
  // viewBox. We can only express its user units as a physical size by assuming
  // a DPI, so the result is flagged ambiguous. Assumption: user units are
  // treated as px at 96dpi.
  const viewBox = parseViewBox(getAttr(root, 'viewBox'));
  if (viewBox) {
    return {
      widthMm: (viewBox.width / PX_PER_IN) * MM_PER_IN,
      heightMm: (viewBox.height / PX_PER_IN) * MM_PER_IN,
      ambiguous: true,
      source: 'viewbox',
    };
  }

  // No viewBox to fall back to. If a dimension was present-but-unusable
  // (non-positive or relative %), that is invalid input; otherwise the SVG
  // simply carries no dimensions at all.
  if (width.kind === 'unusable' || height.kind === 'unusable') {
    throw new SvgDimensionError(
      'SVG has a non-positive or relative width/height and no viewBox fallback',
      'INVALID_DIMENSION',
    );
  }

  throw new SvgDimensionError(
    'SVG has no width/height and no viewBox to derive dimensions from',
    'NO_DIMENSIONS',
  );
}

// Inkscape switched its default user-unit DPI from 90 to 96 in version 0.92.
// Files authored by an older Inkscape (< 0.92) used 90dpi, so px/user-unit
// dimensions must be converted at 90dpi to recover the intended physical size.
// (Absolute units like mm are unaffected and never call this.)
const PX_PER_IN_LEGACY = 90;
const INKSCAPE_DPI_SWITCH_VERSION = 0.92;

function pxDpiFor(svgString) {
  const version = getAttr(svgString, 'inkscape:version');
  if (version) {
    const m = /^\s*(\d+\.\d+)/.exec(version);
    if (m && parseFloat(m[1]) < INKSCAPE_DPI_SWITCH_VERSION) {
      return PX_PER_IN_LEGACY;
    }
  }
  return PX_PER_IN;
}

function parseViewBox(raw) {
  if (raw == null) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return { width: parts[2], height: parts[3] };
}
