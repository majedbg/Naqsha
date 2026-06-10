// Single source of truth for physical constants shared across the plotter
// subsystem (pathOps, pipeline, svgExport, units).
//
// Values confirmed from original source files (pathOps.js, svgExport.js,
// units.js, PlotPreviewSection.jsx) on 2026-06-10. Do NOT change these
// without auditing every downstream consumer.

export const PPI = 96;
export const MM_PER_IN = 25.4;
export const PX_PER_MM = PPI / MM_PER_IN;

// AxiDraw V3 factory defaults used by estimateTimeSec and PlotPreviewSection.
export const DRAW_SPEED = 200;    // mm/s
export const TRAVEL_SPEED = 500;  // mm/s
