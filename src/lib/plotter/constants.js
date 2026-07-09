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

// --- Run Plan (ADR-0002) profile-aware time-model constants ------------------
// These feed runEstimate.js only. ADR-0002 splits the time model by Machine
// Profile: laser derives cut time from each Operation's OWN speed × passes,
// while its pen-up repositioning ("rapid" / G0 traverse) is a fixed machine
// characteristic, NOT a user setting — hence a constant here rather than a
// machineParams field. Plotter/drag keep the AxiDraw DRAW_SPEED/TRAVEL_SPEED
// above (per-op speed is out of scope for them per the PRD) and the plotter
// adds a flat Pen Swap allowance.

// Rapid (G0) traverse speed for laser Run Plan estimates, mm/s. Gantry lasers
// (grbl diode / Ruida CO₂) rapid in a ~300–500 mm/s band; 400 mm/s is a
// defensible mid-band figure. Deliberately DISTINCT from TRAVEL_SPEED (500) so
// the laser travel term is visibly a laser figure, not the AxiDraw pen-up rate.
export const LASER_RAPID_SPEED = 400; // mm/s

// Flat wall-clock allowance for one manual Pen Swap on a plotter, in seconds:
// the run pauses, the maker uncaps/loosens/swaps/re-clamps the pen and resumes.
// A per-swap allowance (not a rate) because it is human handling time, added
// once per adjacent Operation transition whose Pen differs.
export const PEN_SWAP_SEC = 30; // seconds
