// exportReceipt — the Export Receipt data builder (Wave-3 Lane H).
//
// This is the PURE receipt-data function that turns a Run Plan model into the
// calm one-line summary CONTEXT.md calls the "Export Receipt": estimated run
// time, anything cropped at the Sheet edge, and a warning tally, linking into
// the Run Plan. ADR 0001 ("two-path export with receipt") makes this the thing
// that keeps export from ever being silent — export always succeeds; the
// receipt reports what happened.
//
// Lane I owns running `runPlanModel` and calls buildExportReceipt(runPlan) with
// its output; this file computes NOTHING about the geometry itself — it only
// reads the model. It is the "quick-export handler extension" from the lane
// plan: a pure read, no side effects, no imports of app state.
//
// runPlanModel output shape (as Lane I passes it in):
//   { opRows, estimate:{ totalSec, perOp, penSwaps }, warnings, route, crops }
// where each warning is `{ type, ...payload, locate }` — the payload fields are
// spread onto the warning object. A cropped-paths warning therefore reads:
//   { type: 'cropped-paths', count: N, locate }
//
// DELIBERATE COUNTING CHOICE — `warningCount` EXCLUDES the 'cropped-paths'
// warning. The receipt copy keeps two SEPARATE clauses: "{n} paths cropped at
// sheet edge" and "{m} warnings". If the cropped-paths warning were folded into
// the tally the maker would see cropping counted twice (once as its own clause,
// once inside "warnings"). So cropping owns its clause, and the tally counts
// everything else. When `cropToSheet` is off upstream, Lane I passes a runPlan
// with no cropped-paths warning, so the cropped clause drops out automatically —
// this builder just reads the model it is given.

const CROPPED_TYPE = "cropped-paths";

// The count carried by a cropped-paths warning. Lane I spreads the payload onto
// the warning object, so the canonical read is the top-level `count`; the
// `payload.count` fallback keeps this robust if the model is ever restructured.
function croppedCountOf(warning) {
  if (!warning) return 0;
  const n = warning.count ?? warning.payload?.count ?? 0;
  return Number.isFinite(n) ? n : 0;
}

// English pluralization for the two nouns that appear in the receipt copy.
function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Build the Export Receipt view-model from a Run Plan model.
 *
 * @param {object} runPlan - runPlanModel output (from Lane I).
 * @returns {{ minutes:number, croppedCount:number, warningCount:number,
 *            variant:'clean'|'cropped'|'warnings', line:string }}
 */
export function buildExportReceipt(runPlan) {
  const totalSec = runPlan?.estimate?.totalSec ?? 0;
  const minutes = Math.round((Number.isFinite(totalSec) ? totalSec : 0) / 60);

  const warnings = Array.isArray(runPlan?.warnings) ? runPlan.warnings : [];
  const croppedWarning = warnings.find((w) => w?.type === CROPPED_TYPE);
  const croppedCount = croppedCountOf(croppedWarning);
  // Everything that is NOT the cropped-paths warning — cropping owns its own
  // clause, so it must not also be counted here (see header note).
  const warningCount = warnings.filter((w) => w?.type !== CROPPED_TYPE).length;

  let variant;
  if (warningCount > 0) variant = "warnings";
  else if (croppedCount > 0) variant = "cropped";
  else variant = "clean";

  // Build the line by joining clauses so all variants share one set of glyphs
  // and spacing — em-dash after "Exported", middot (·) between clauses. Always
  // leads with the word "Estimated". Principle 7: specific, unhurried, no "!"
  // and no alarm glyphs; a cropped path is an action taken, not a warning.
  const clauses = ["Estimated", `${minutes} min`];
  if (croppedCount > 0) {
    clauses.push(`${plural(croppedCount, "path", "paths")} cropped at sheet edge`);
  }
  if (warningCount > 0) {
    clauses.push(plural(warningCount, "warning", "warnings"));
  }
  const line = `Exported — ${clauses.join(" · ")}`;

  return { minutes, croppedCount, warningCount, variant, line };
}
