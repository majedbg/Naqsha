// glyphClipboard — the per-glyph motif-settings copy buffer (#139).
//
// ONE session-scoped slot. Never the OS clipboard: these are motif settings,
// not text, and putting them on the system clipboard would clobber whatever the
// user was actually carrying between apps.
//
// It is a MODULE SINGLETON rather than React state, for a reason that is not
// convenience. Studio's document state is exactly what `captureDoc` snapshots
// for undo — a buffer living there would be captured and RESTORED by ⌘Z, so
// undoing a paste would also un-copy. The buffer is not part of the document;
// it is a property of the session. Charting: "survives layer/document switches,
// gone on reload" — which a module singleton is by construction.
//
// Payload is scale + angle only. `hidden` is deliberately excluded: copying a
// hidden glyph's settings onto a visible one must not make it vanish.
//
// The values stored are EFFECTIVE, not the raw record — the scale multiplier
// actually in force and the bearing actually being drawn. Copy therefore means
// "make that glyph look like this one", and copying from an UNMODIFIED glyph is
// consequently not a no-op: pasting it writes an explicit scale of 1 and the
// source's bearing, which on a vine will rotate the target off its tangent.
// That is the intended reading of "copy motif settings"; the alternative
// (copying an empty record) would make the command do nothing most of the time.

/** @typedef {{scale: number, angle: number}} GlyphSettings */

/** @type {GlyphSettings|null} */
let slot = null;

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

/**
 * Put a glyph's effective settings in the buffer. Ignores non-finite values so
 * a half-resolved glyph can never poison a later paste.
 *
 * @param {{scale?: number, angle?: number}} settings
 */
export function copyGlyphSettings(settings) {
  const scale = Number(settings?.scale);
  const angle = Number(settings?.angle);
  if (!Number.isFinite(scale) || !Number.isFinite(angle)) return;
  slot = { scale, angle };
  emit();
}

/**
 * The buffer's contents, or null when empty. Returns the SAME object identity
 * until the buffer changes, so `useSyncExternalStore` can use it as the
 * snapshot directly without looping.
 *
 * @returns {GlyphSettings|null}
 */
export function readGlyphClipboard() {
  return slot;
}

/** Subscribe to fills/clears. Returns an unsubscribe. */
export function subscribeGlyphClipboard(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Empty the buffer. Exists for tests — nothing in the UI clears it. */
export function clearGlyphClipboard() {
  if (slot === null) return;
  slot = null;
  emit();
}

/** Copy is not a mutation, so this never touches undo. */
export const GLYPH_PASTE_EMPTY_HINT = "paste unavailable — no motif settings copied";
