import { describe, it, expect } from "vitest";
import { buildExportReceipt } from "./exportReceipt";

// Lane H — the Export Receipt data builder. buildExportReceipt is the PURE
// receipt-data function Lane I calls after running the Run Plan model; it turns
// a runPlan into the calm one-line summary described in CONTEXT.md ("Export
// Receipt") and ADR 0001 (two-path export with receipt).
//
// runPlanModel output shape (Lane I passes it in):
//   { estimate:{ totalSec, perOp, penSwaps }, warnings:[{type, ...payload, locate}], ... }
// A 'cropped-paths' warning carries its count at top level (payload is spread):
//   { type: 'cropped-paths', count: N, locate }
//
// DELIBERATE CHOICE under test: `warningCount` EXCLUDES the 'cropped-paths'
// warning. The receipt copy keeps the "paths cropped at sheet edge" clause and
// the "N warnings" tally as SEPARATE clauses, so cropping is never double-counted
// in the warning tally.

// A cropped-paths warning as Lane I builds it (payload spread onto the object).
function croppedWarning(count) {
  return { type: "cropped-paths", count, locate: () => {} };
}

// Any other (non-cropping) warning kind.
function otherWarning(type = "off-bed") {
  return { type, locate: () => {} };
}

function runPlan({ totalSec = 0, warnings = [] } = {}) {
  return {
    opRows: [],
    estimate: { totalSec, perOp: [], penSwaps: 0 },
    warnings,
    route: [],
    crops: [],
  };
}

describe("buildExportReceipt — minutes + counts", () => {
  it("rounds estimate.totalSec to whole minutes", () => {
    expect(buildExportReceipt(runPlan({ totalSec: 90 })).minutes).toBe(2); // 1.5 → 2
    expect(buildExportReceipt(runPlan({ totalSec: 89 })).minutes).toBe(1); // 1.48 → 1
    expect(buildExportReceipt(runPlan({ totalSec: 0 })).minutes).toBe(0);
  });

  it("reads croppedCount from the cropped-paths warning payload count", () => {
    const r = buildExportReceipt(runPlan({ warnings: [croppedWarning(3)] }));
    expect(r.croppedCount).toBe(3);
  });

  it("croppedCount is 0 when there is no cropped-paths warning", () => {
    const r = buildExportReceipt(runPlan({ warnings: [otherWarning()] }));
    expect(r.croppedCount).toBe(0);
  });

  it("warningCount EXCLUDES the cropped-paths warning", () => {
    const r = buildExportReceipt(
      runPlan({ warnings: [croppedWarning(4), otherWarning("off-bed"), otherWarning("thin-stroke")] })
    );
    expect(r.croppedCount).toBe(4);
    expect(r.warningCount).toBe(2);
  });
});

describe("buildExportReceipt — variant selection", () => {
  it("clean: no crops and no other warnings", () => {
    expect(buildExportReceipt(runPlan({ totalSec: 120 })).variant).toBe("clean");
  });

  it("cropped: crops present, no other warnings", () => {
    expect(
      buildExportReceipt(runPlan({ warnings: [croppedWarning(2)] })).variant
    ).toBe("cropped");
  });

  it("warnings: other warnings present, no crops", () => {
    expect(
      buildExportReceipt(runPlan({ warnings: [otherWarning()] })).variant
    ).toBe("warnings");
  });

  it("warnings: other warnings present WITH crops too", () => {
    expect(
      buildExportReceipt(runPlan({ warnings: [croppedWarning(2), otherWarning()] })).variant
    ).toBe("warnings");
  });
});

describe("buildExportReceipt — line copy (principle 7: unhurried, no ! / no alarm glyphs)", () => {
  it("clean line", () => {
    const r = buildExportReceipt(runPlan({ totalSec: 300 }));
    expect(r.line).toBe("Exported — Estimated · 5 min");
  });

  it("cropped line (plural paths)", () => {
    const r = buildExportReceipt(
      runPlan({ totalSec: 300, warnings: [croppedWarning(3)] })
    );
    expect(r.line).toBe(
      "Exported — Estimated · 5 min · 3 paths cropped at sheet edge"
    );
  });

  it("cropped line (singular path)", () => {
    const r = buildExportReceipt(
      runPlan({ totalSec: 300, warnings: [croppedWarning(1)] })
    );
    expect(r.line).toBe(
      "Exported — Estimated · 5 min · 1 path cropped at sheet edge"
    );
  });

  it("warnings line: crops + warnings (plural both)", () => {
    const r = buildExportReceipt(
      runPlan({
        totalSec: 300,
        warnings: [croppedWarning(3), otherWarning("off-bed"), otherWarning("thin-stroke")],
      })
    );
    expect(r.line).toBe(
      "Exported — Estimated · 5 min · 3 paths cropped at sheet edge · 2 warnings"
    );
  });

  it("warnings line: singular warning, singular path", () => {
    const r = buildExportReceipt(
      runPlan({ totalSec: 300, warnings: [croppedWarning(1), otherWarning("off-bed")] })
    );
    expect(r.line).toBe(
      "Exported — Estimated · 5 min · 1 path cropped at sheet edge · 1 warning"
    );
  });

  it("warnings line OMITS the cropped clause when croppedCount is 0", () => {
    const r = buildExportReceipt(
      runPlan({ totalSec: 300, warnings: [otherWarning("off-bed")] })
    );
    expect(r.line).toBe("Exported — Estimated · 5 min · 1 warning");
  });

  it("contains no exclamation mark or alarm glyph in any variant", () => {
    const lines = [
      buildExportReceipt(runPlan({ totalSec: 60 })).line,
      buildExportReceipt(runPlan({ totalSec: 60, warnings: [croppedWarning(2)] })).line,
      buildExportReceipt(
        runPlan({ totalSec: 60, warnings: [croppedWarning(2), otherWarning()] })
      ).line,
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/[!⚠❗‼]/);
    }
  });
});

describe("buildExportReceipt — resilience to sparse input", () => {
  it("tolerates a runPlan with no warnings array", () => {
    const r = buildExportReceipt({ estimate: { totalSec: 120 } });
    expect(r).toEqual({
      minutes: 2,
      croppedCount: 0,
      warningCount: 0,
      variant: "clean",
      line: "Exported — Estimated · 2 min",
    });
  });
});
