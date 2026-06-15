# patterns/extras — self-registering built-in patterns

Drop a pattern file here and it auto-loads at app start (via
`src/lib/registerBuiltinExtras.js`, an eager `import.meta.glob`). Each file must
self-register at the bottom of the module:

```js
import { registerPattern } from '../../patternRegistry';
registerPattern(id, PatternClass, label, defaults, paramDefs, { isAI: false });
```

No edits to `constants.js`, `useCanvas.js`, `PatternTabs.jsx`, or
`patterns/index.js` are needed — the pattern appears in the picker (and lights up
its taxonomy cell) the moment its file exists.

The taxonomy cell for each planned pattern is already declared in
`PATTERN_TAXONOMY` (`constants.js`). See `docs/session-b-build-patterns.md` for
the full build brief, and `docs/pattern-taxonomy.md` for the design.
