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

function getAttr(svgString, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(svgString);
  return m ? m[1] : null;
}

function parseLength(raw) {
  if (raw == null) return null;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(mm|px|pt)?\s*$/.exec(raw);
  if (!match) return null;
  return { value: parseFloat(match[1]), unit: match[2] || '' };
}

function toMm(length, dpi) {
  switch (length.unit) {
    case 'mm':
      return length.value;
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
  const rawWidth = getAttr(svgString, 'width');
  const rawHeight = getAttr(svgString, 'height');
  const width = parseLength(rawWidth);
  const height = parseLength(rawHeight);

  // A dimension attribute that is present but unparseable (e.g. width="abc")
  // is corrupt input — fail loudly rather than silently falling back.
  if ((rawWidth != null && !width) || (rawHeight != null && !height)) {
    throw new SvgDimensionError(
      'SVG has an unparseable width/height attribute',
      'INVALID_DIMENSION',
    );
  }

  if (width && height) {
    const dpi = pxDpiFor(svgString);
    const source = width.unit || 'px';
    return {
      widthMm: toMm(width, dpi),
      heightMm: toMm(height, dpi),
      ambiguous: false,
      source,
    };
  }

  // No explicit width/height: fall back to the viewBox. We can only express
  // its user units as a physical size by assuming a DPI, so the result is
  // flagged ambiguous. Assumption: user units are treated as px at 96dpi.
  const viewBox = parseViewBox(getAttr(svgString, 'viewBox'));
  if (viewBox) {
    return {
      widthMm: (viewBox.width / PX_PER_IN) * MM_PER_IN,
      heightMm: (viewBox.height / PX_PER_IN) * MM_PER_IN,
      ambiguous: true,
      source: 'viewbox',
    };
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
