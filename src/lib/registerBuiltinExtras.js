// Auto-loader for self-registering built-in pattern files.
//
// Every `*.js` file dropped into ./patterns/extras/ is eager-imported at app
// start. Each such file MUST self-register at module load by calling:
//
//   import { registerPattern } from '../../patternRegistry';
//   registerPattern(id, PatternClass, label, defaults, paramDefs, { isAI: false });
//
// Because the glob is eager, a new pattern lights up everywhere the moment its
// file exists — including the new-layer pattern picker, which derives "coming
// soon" from the ABSENCE of a registered class (see PatternPickerModal +
// docs/pattern-taxonomy.md §7). No edits to this file, constants.js, useCanvas,
// or PatternTabs are required to add a pattern this way.
//
// This is the ONLY wiring the parallel pattern-building session needs to know
// about: create the file in patterns/extras/, self-register, done.

const mods = import.meta.glob('./patterns/extras/*.js', { eager: true });

// Exposed for debugging / a sanity check in the console.
export const loadedBuiltinExtras = Object.keys(mods);
