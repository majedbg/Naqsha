// The DESIGNATED KEY LIGHT geometry (spec §3.6). PURE, three.js-free: lives on the
// 2D side of the dynamic-import boundary so the R3F <directionalLight>
// (SceneEnvironment.jsx) reads ONE source.
//
// The scene's IBL (`<Environment>`) is FILL; this directional light is the single
// directional source (it also feeds the bloom pass's `lights`). It once drove the
// edge-glow incidence trig too (EdgeGlow — removed with the additive shell,
// ADR 0003: acrylic edge brightness is now the lit edge-face material in
// edgeFace.js / Sheets.jsx, which responds to this light like any PBR surface).
// The light aims at the origin.
export const KEY_LIGHT_POSITION = [4, 6, 5];
export const KEY_LIGHT_TARGET = [0, 0, 0];
