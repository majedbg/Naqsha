// Security-critical SVG sanitizer for org-admin-mvp.
//
// Untrusted SVG (uploaded by org members) is run through DOMPurify's SVG
// profile before it is ever stored, rendered, or re-served. We return both the
// sanitized markup and a human-readable list of what was stripped so the caller
// can surface "we removed N unsafe things" to the submitter.
import createDOMPurify from 'dompurify';

// jsdom (test env) and the browser both expose a global `window`. DOMPurify must
// be bound to that window to gain a DOM to parse into.
const DOMPurify = createDOMPurify(window);

// Reference attributes that can trigger a network fetch or document-reference
// when they point off-document. DOMPurify's SVG profile keeps `http(s)` here
// because such URLs are not classically "XSS", but a stored SVG that fetches
// `http://evil/track.png` is a tracking-pixel / data-exfiltration vector, so we
// neutralize any non-local reference ourselves.
const REFERENCE_ATTRS = ['href', 'xlink:href', 'src'];

// A reference is considered safe only if it stays inside this document: a bare
// fragment (`#id`) into the same SVG. Everything else — absolute URLs, scheme-
// relative `//host`, path references, and any explicit scheme — is stripped.
function isLocalReference(value) {
  const v = (value || '').trim();
  return v.startsWith('#');
}

// Buffer of extra removals performed by our hook, drained per sanitize() call.
let externalRefRemovals = [];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!node.getAttribute) return;
  const tag = node.nodeName ? node.nodeName.toLowerCase() : 'element';
  for (const attr of REFERENCE_ATTRS) {
    if (!node.hasAttribute(attr)) continue;
    const value = node.getAttribute(attr);
    if (isLocalReference(value)) continue;
    node.removeAttribute(attr);
    externalRefRemovals.push(`attribute ${attr} on <${tag}> (external reference)`);
  }
});

/**
 * Sanitize an untrusted SVG string.
 *
 * @param {string} svgString raw, untrusted SVG markup
 * @returns {{ clean: string, removed: string[] }} sanitized markup and a list
 *   of the elements/attributes that were stripped.
 */
export function sanitizeSvg(svgString) {
  externalRefRemovals = [];

  const clean = DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // DOMPurify's SVG profile drops <use> by default. <use href="#localid"> is a
    // legitimate same-document reference, so we re-allow the element. Its href is
    // still constrained to a local fragment by the afterSanitizeAttributes hook
    // below — any external/remote reference (http(s), //, data:, javascript:) is
    // stripped there — so re-allowing <use> does not weaken our protections.
    ADD_TAGS: ['use'],
    // <style> blocks and inline style="" can smuggle remote references via CSS
    // url() (e.g. fill:url(http://evil/p.png)) — a tracking-pixel / exfiltration
    // vector our href hook can't reach. Laser cut/score/engrave geometry uses
    // presentation attributes (stroke/fill) directly, never CSS, so forbidding
    // both is safe for the domain.
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
  });

  const removed = (DOMPurify.removed || [])
    .filter(isRealRemoval)
    .map(describeRemoval)
    .concat(externalRefRemovals);

  return { clean, removed };
}

// DOMPurify records the removal of the `<body>`/`<html>`/`<head>` wrappers it
// itself injects while parsing a standalone SVG fragment. Those are sanitizer
// bookkeeping artifacts, not attacker-supplied content, so they must not be
// reported to the caller as "things we stripped".
const WRAPPER_ARTIFACTS = new Set(['body', 'html', 'head']);

function isRealRemoval(entry) {
  if (entry.attribute) return true;
  const node = entry.element || entry.node;
  const nodeName = node && node.nodeName ? node.nodeName.toLowerCase() : '';
  return !WRAPPER_ARTIFACTS.has(nodeName);
}

/**
 * Turn a DOMPurify `removed` entry into a short human-readable label.
 * Entries are either `{ element }` (a stripped node) or
 * `{ attribute, from }` (a stripped attribute and the node it was on).
 */
function describeRemoval(entry) {
  if (entry.attribute) {
    const attrName = entry.attribute.name || String(entry.attribute);
    const ownerName = entry.from && entry.from.nodeName
      ? entry.from.nodeName.toLowerCase()
      : 'element';
    return `attribute ${attrName} on <${ownerName}>`;
  }
  const node = entry.element || entry.node;
  const nodeName = node && node.nodeName ? node.nodeName.toLowerCase() : 'node';
  return `element <${nodeName}>`;
}
