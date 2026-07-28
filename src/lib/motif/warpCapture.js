// warpCapture — the WARP-CAPTURE CONTRACT between a pattern and the motif
// capture prepass (#148, PRD #143).
//
// THE CONTRACT. A layer's WARP modulation is resolved from a GUIDE layer into
// `renderParams` for the paint pass (useCanvas.js, `composeModulationParam(
// resolveModulationsForTarget(...))`) — it is NOT stored on `layer.params`. So a
// capture probe run on bare `host.params` draws UNWARPED geometry while the
// canvas paints WARPED, and the motif then arc-length-samples its glyphs onto
// stale geometry, floating them off the visible curve (the D1 fail-unsafe ~24px
// drift, #103). Any pattern whose DRAWN geometry responds to a warp modulation
// must therefore have that SAME resolved modulation injected into its probe.
//
// WHY IT IS DECLARED BY THE PATTERN, NOT LISTED BY THE PREPASS. This was a
// private `WARP_CAPTURE_HOSTS = new Set(['grid','flowfield','topographic'])`
// literal inside useCanvas. Chladni applies warp to its final contour vertices
// and was simply absent from it, so a warped Chladni painted warped nodal lines
// and captured unwarped ones — and nothing in the codebase connected the fact
// that Chladni consumes warp to the fact that its capture needed it. The
// knowledge now lives on the pattern that owns the behaviour:
//
//     export default class Chladni extends Pattern {
//       static warpsDrawnGeometry = true;
//
// so registering the next warp-applying host cannot repeat the bug by omission.
//
// ONE BOOLEAN COVERS BOTH APPLICATION STYLES. The declaring patterns apply warp
// differently — Grid replaces each straight lattice line with a warped
// bezierVertex curve at geometry-BUILD time; FlowField, TopographicContours,
// RecursiveGeometry and Chladni displace FINAL vertices through
// stackWarpDisplacement after the geometry is built. That distinction is
// immaterial at this seam: both happen inside `generate()`, and both change the
// recorded draw stream, which is the only thing capture observes. A richer
// declaration (`warpMode: 'build-time' | 'final-vertices'`) would encode a
// difference no consumer can act on.
//
// WHY NOT REUSE `channelForTarget(type) === 'warp'` (fields/channelConsumers.js)?
// It returns exactly this set today, and that is a coincidence rather than a
// contract. It answers "which channel may the Modulator UI map onto this
// pattern" — a question about the authoring surface. This one answers "does this
// pattern's drawn geometry change when it receives one" — a question about
// capture fidelity. They already disagree in spirit: channelForTarget reports
// 'density' for grainfield, whose geometry also changes under modulation but
// which is not a capture host, and it is keyed by pattern TYPE, so a dynamically
// registered pattern would have to edit a static table in another module to
// participate. Binding capture to the UI's target-channel table would make every
// future Modulator-UI change a silent capture change.
//
// WHY NOT `hostCapability.js`? That module's header draws the line itself:
// capability answers there carry maker-facing copy ("can I put a motif here, and
// if not, why not?"), and it is kept apart from render-path classification
// precisely so classification does not grow UI strings. This is a render-path
// boolean with no reason string and nothing to show the maker.
//
// BYTE-IDENTITY — why injecting the composed modulation is safe. Every declaring
// pattern branches ONLY on `modulation.channel === 'warp'` with a `field`
// present (Grid.js:63, FlowField.js:70, TopographicContours.js:209,
// RecursiveGeometry.js:125, extras/Chladni.js:185), so a composed modulation
// carrying only non-warp channels is a geometric no-op and capture stays
// byte-identical to the bare-params probe. And warp is RNG-free — it is applied
// AFTER all noise/random consumption — so the probe never shifts the host's
// painted realization. Chladni is the strongest case of all: its field is pure
// trig, it consumes no random or noise at any point, and the extra `modulation`
// key is inert against its params destructuring.

/**
 * Whether `PatternClass` declares that its DRAWN geometry responds to a warp
 * modulation, and therefore that the motif capture probe must be handed the same
 * resolved modulation the paint pass gets.
 *
 * Takes the CLASS, not the type id, so this module imports no registry and the
 * answer is available for statically-mapped and dynamically-registered patterns
 * alike (the prepass has already resolved the class). Strict `=== true`: a
 * half-declared flag is a bug, not an opt-in. Missing/unknown ⇒ false, which is
 * the safe answer for every pattern that ignores modulation entirely.
 *
 * @param {Function|null|undefined} PatternClass
 * @returns {boolean}
 */
export function patternWarpsDrawnGeometry(PatternClass) {
  return PatternClass?.warpsDrawnGeometry === true;
}
