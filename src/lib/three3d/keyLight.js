// The DESIGNATED KEY LIGHT geometry (spec §3.6). PURE, three.js-free: lives on the
// 2D side of the dynamic-import boundary so both the R3F <directionalLight>
// (SceneEnvironment.jsx) and the edge-glow rim math (EdgeGlow.jsx) read ONE source.
//
// The scene's IBL (`<Environment>`) is FILL; this directional light is the single
// source whose normalized world direction drives the edge-glow incidence term
// (edgeGlow.keyLightDirection). Wiring the glow to a light the scene doesn't have —
// or letting the light and the glow drift to different positions — is the §3.6
// "constant/zero glow that still passes green" trap, so the position is defined
// exactly once, here, and imported by both sides. The light aims at the origin.
export const KEY_LIGHT_POSITION = [4, 6, 5];
export const KEY_LIGHT_TARGET = [0, 0, 0];
