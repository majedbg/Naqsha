// Canvas/bed presets. Width/height in inches (internal canonical unit).
// IMPORTANT: Indices 0-2 are the guest-tier allowed set (see tierLimits.js
// `presetIndices: [0, 1, 2]`). Keep those three entries in place.
// `category` groups entries in the UI; `unitHint` is the unit used in labels
// and default-display for that preset.
export const PRESET_SIZES = [
  // 0-2: Guest-tier artwork sizes (do not reorder)
  { label: '6 × 12"',  width: 6,  height: 12, category: 'artwork', unitHint: 'in' },
  { label: '12 × 12"', width: 12, height: 12, category: 'artwork', unitHint: 'in' },
  { label: '12 × 18"', width: 12, height: 18, category: 'artwork', unitHint: 'in' },
  // Larger artwork
  { label: '12 × 24"', width: 12, height: 24, category: 'artwork', unitHint: 'in' },
  { label: '18 × 24"', width: 18, height: 24, category: 'artwork', unitHint: 'in' },
  { label: '18 × 32"', width: 18, height: 32, category: 'artwork', unitHint: 'in' },
  { label: '24 × 24"', width: 24, height: 24, category: 'artwork', unitHint: 'in' },
  { label: '24 × 36"', width: 24, height: 36, category: 'artwork', unitHint: 'in' },
  { label: '24 × 48"', width: 24, height: 48, category: 'artwork', unitHint: 'in' },
  // Paper sizes
  { label: 'A5 — 148 × 210 mm',  width: 148 / 25.4, height: 210 / 25.4, category: 'paper', unitHint: 'mm' },
  { label: 'A4 — 210 × 297 mm',  width: 210 / 25.4, height: 297 / 25.4, category: 'paper', unitHint: 'mm' },
  { label: 'A3 — 297 × 420 mm',  width: 297 / 25.4, height: 420 / 25.4, category: 'paper', unitHint: 'mm' },
  { label: 'US Letter — 8.5 × 11"', width: 8.5, height: 11, category: 'paper', unitHint: 'in' },
  // Pen plotter beds
  { label: 'AxiDraw V3 — 6 × 8"',        width: 6,    height: 8,    category: 'plotter', unitHint: 'in' },
  { label: 'AxiDraw Mini — 6 × 4"',      width: 6,    height: 4,    category: 'plotter', unitHint: 'in' },
  { label: 'AxiDraw SE/A3 — 11.7 × 16.5"', width: 11.7, height: 16.5, category: 'plotter', unitHint: 'in' },
  // Laser cutter beds
  { label: 'Glowforge Plus — 11 × 19.5"', width: 11, height: 19.5, category: 'laser', unitHint: 'in' },
  { label: 'xTool P2 — 16 × 24"',         width: 16, height: 24,   category: 'laser', unitHint: 'in' },
  // Custom (sentinel: null dims)
  { label: 'Custom', width: null, height: null, category: 'custom', unitHint: 'in' },
];

export const PPI = 96;

// `hasVariableWeight` (issue #4, A5-F4) marks the patterns that emit genuine
// per-element stroke-weight VARIATION — i.e. their generate() computes a
// different `strokeWeight` for different elements (so variable-weight banding
// has something to quantize). It is true for the structural capability ("this
// code path CAN emit weight variation"), independent of whether the current
// params actually exercise it. Only `recursive` (RecursiveGeometry, `sw =
// strokeAtLevel(level)`) varies among the registered patterns; every other
// pattern pushes the single constant `strokeWeight` param for every element,
// so the flag is absent (treated as false). Off by default + capability-gated.
export const PATTERN_TYPES = [
  { id: 'spirograph', label: 'Spirograph' },
  { id: 'flowfield', label: 'Flow Field' },
  { id: 'phyllotaxis', label: 'Phyllotaxis' },
  { id: 'wave', label: 'Waves' },
  { id: 'voronoi', label: 'Voronoi' },
  { id: 'recursive', label: 'Recursive', hasVariableWeight: true },
  { id: 'phyllodash', label: 'Phyllotaxis Dash' },
  { id: 'grainfield', label: 'Grain Field' },
  { id: 'flowhatch', label: 'Flow Hatch' },
  { id: 'feather', label: 'Feather' },
  { id: 'turing', label: 'Turing' },
  { id: 'duality', label: 'Duality' },
  { id: 'radialetch', label: 'Radial Etch' },
  { id: 'grid', label: 'Grid' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'modulegrid', label: 'Module Grid' },
  { id: 'topographic', label: 'Topographic Contours' },
  { id: 'diffgrowth', label: 'Differential Growth' },
  { id: 'girih', label: 'Islamic Star (Girih)' },
  { id: 'moire', label: 'Moiré' },
  { id: 'circlepacking', label: 'Circle Packing' },
  { id: 'dendrite', label: 'Dendrite' },
];

export const MAX_LAYERS = 6;

export const DEFAULT_PARAMS = {
  spirograph: {
    R: 440,
    r: 565,
    d: 181,
    revolutions: 35,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  flowfield: {
    particleCount: 800,
    stepLength: 5,
    noiseScale: 0.004,
    curlStrength: 90,
    patternScale: 1,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  phyllotaxis: {
    count: 500,
    angle: 137.508,
    spacing: 6,
    minSize: 2,
    maxSize: 16,
    sizeGrowth: 0.5,
    shape: 'circle',
    fillMode: 'outline',
    rotation: 0,
    strokeWeight: 1,
    jitter: 0,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  wave: {
    waveCount: 5,
    frequency: 6,
    amplitude: 45,
    lineSpacing: 12,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  voronoi: {
    cellCount: 80,
    jitter: 40,
    drawMode: 'outlines',
    relaxationSteps: 2,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  recursive: {
    shape: 'hexagon',
    depth: 5,
    startScale: 70,
    rotationPerLevel: 15,
    scaleFactor: 0.7,
    scaleNonLinearity: 0,
    strokeWeight: 1,
    strokeDepthDecay: 0,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  phyllodash: {
    seedCount: 2000,
    spacingC: 9,
    innerMax: 8,
    outerMax: 18,
    noiseScale: 0.008,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  grainfield: {
    pointCount: 150,
    relaxPasses: 4,
    neighborK: 3,
    minDashLen: 6,
    maxDashLen: 28,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  flowhatch: {
    particleCount: 200,
    stepsPerParticle: 80,
    stepLength: 5,
    sampleEvery: 3,
    noiseScale: 0.005,
    minDashLen: 8,
    maxDashLen: 24,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  feather: {
    curveType: 'hypotrochoid',
    R: 180,
    r: 60,
    d: 80,
    roseK: 5,
    roseA: 200,
    sampleCount: 1200,
    harmonicK: 6,
    innerBase: 2,
    innerAmp: 10,
    outerBase: 2,
    outerAmp: 14,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  turing: {
    preset: 'spots',
    simIterations: 80,
    gridRes: 150,
    targetPoints: 600,
    minSpacing: 8,
    minDashLen: 4,
    maxDashLen: 20,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  duality: {
    // Spiral + dashes
    innerRadius: 15, outerRadius: 450,
    spiralTurns: 8, spiralGrowth: 1.0,
    dashCount: 400, dashLength: 18, dashLenJitter: 0.4,
    dashSparsity: 0.12, angleJitter: 0.2,
    dashStrokeWeight: 1.2,
    // Arcs
    arcCount: 14, arcSpacingNL: 1.8, arcRadiusJitter: 3,
    arcMinAngle: 40, arcMaxAngle: 260, arcMaxLength: 700,
    arcAngleJitter: 1.0, arcStrokeWeight: 0.8,
    // Intersection
    overlapGap: 5, overlapPriority: 0.0,
    originX: 0.5, originY: 0.5, symmetry: 1, startAngle: 0,
  },
  radialetch: {
    lineCount: 120,
    innerRadius: 20,
    outerRadius: 400,
    lengthJitter: 0.3,
    angleJitter: 0,
    noiseWarp: 0,
    noiseScale: 0.005,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  grid: {
    cols: 12,
    rows: 12,
    spacing: 40,
    nonLinear: 0,
    nonLinearGain: 0,
    jitter: 0,
    drawHorizontal: 1,
    drawVertical: 1,
    margin: 20,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  spiral: {
    armCount: 3,
    turns: 8,
    innerRadius: 5,
    outerRadius: 400,
    growth: 1.0,
    distortAmount: 0,
    distortScale: 0.01,
    wobbleAmp: 0,
    wobbleFreq: 8,
    stepsPerTurn: 120,
    strokeWeight: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  modulegrid: {
    module: 'sideSweep',
    tilesX: 10,
    tilesY: 10,
    lineCount: 10,
    rotateMode: 'seeded',
    jitter: 0,
    scale: 1,
    scaleMode: 'uniform',
    sweepCurve: 0,
    fanSpread: 180,
    fanApex: 'center',
    ringEccentricity: 0,
    ringSpacing: 0,
    chevronDepth: 1,
    diamondAspect: 1,
    diamondNesting: 0,
    strokeCap: 'round',
    strokeWeight: 0.6,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  topographic: {
    levels: 16,
    noiseScale: 2.5,
    octaves: 3,
    warp: 0,
    levelBias: 0,
    resolution: 160,
    strokeWeight: 0.6,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  diffgrowth: {
    topology: 'closed',
    maxNodes: 1200,
    repulsionRadius: 12,
    attraction: 0.5,
    repulsion: 0.5,
    smoothing: 0.45,
    growthStyle: 'curvature',
    strokeWeight: 0.8,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  girih: {
    tiling: 'square8',
    contactAngle: 60,
    density: 4,
    render: 'interlaced',
    bandWidth: 4,
    irregularity: 0,
    strokeWeight: 0.8,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  moire: {
    fieldType: 'parallelLines',
    density: 120,
    moireRotation: 5,
    moireOffsetX: 0,
    moireOffsetY: 0,
    moireScale: 1,
    strokeWeight: 0.5,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  circlepacking: {
    boundary: 'rectangle',
    render: 'outlines',
    minRadius: 4,
    maxRadius: 60,
    attempts: 2000,
    linkDistance: 40,
    ringCount: 3,
    strokeWeight: 0.6,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
  dendrite: {
    seedMode: 'center',
    render: 'bonds',
    maxNodes: 1200,
    stickiness: 0.8,
    nodeSpacing: 6,
    strokeWeight: 0.7,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
  },
};

const SYMMETRY_PARAM = { key: 'symmetry', label: 'Radial Symmetry', type: 'iconselect', glyph: 'symmetry', range: { min: 1, max: 11, step: 1 }, min: 1, max: 11, step: 1, randomMax: 10, tooltip: 'Radial copies — 1 = none, 2 = 180°, 3 = 120°, 4 = +, …' };
const START_ANGLE_PARAM = { key: 'startAngle', label: 'Start Angle', type: 'dial', wrap: true, min: 0, max: 360, step: 1, tooltip: 'Rotates the entire pattern by this many degrees' };
// Composite 2D pad (WI-3): one draggable nub writes both offsetX + offsetY.
// `key: 'offset'` is the synthetic primary key (grouping/gating/reset/randomize);
// `keys` is the real value set. DEFAULT_PARAMS still carries offsetX/offsetY.
const OFFSET_PAD_PARAM = { key: 'offset', type: 'pad2d', label: 'Offset', keys: ['offsetX', 'offsetY'], min: -500, max: 500, step: 1, tooltip: 'Drag to shift the pattern. Center = no offset.' };

// Composite 2D plot (Outer × Inner radius): the two spirograph radii — which
// have DIFFERENT ranges and no shared origin — share one labelled plane instead
// of two sliders. `key: 'radii'` is the synthetic primary key (grouping/gating/
// reset/randomize); `keys` is the real value set; `axes` carries each axis's own
// range + default. DEFAULT_PARAMS still carries R / r. The R/r ratio sets the
// number of lobes, so plotting them together makes that relationship legible.
const RADII_PLOT_PARAM = {
  key: 'radii', type: 'plot2d', label: 'Radii', keys: ['R', 'r'],
  axes: [
    { key: 'R', label: 'Outer Radius', short: 'Outer', min: 50, max: 1200, step: 1, default: 440 },
    { key: 'r', label: 'Inner Radius', short: 'Inner', min: 10, max: 600, step: 1, default: 565 },
  ],
  tooltip: 'Outer × inner radius on one plane — right is a wider outer circle, up is a larger rolling circle. Their ratio sets how many lobes the curve has.',
};

// Phyllotaxis count + spacing share one plane: they jointly control how densely the
// spiral fills the frame, so plotting them together makes that trade-off legible.
// `key: 'density'` is the synthetic primary key (grouping/gating/reset/randomize);
// `keys` is the real value set; `axes` carries each axis's own range + default.
// DEFAULT_PARAMS still carries count / spacing. Ranges match the prior sliders.
const DENSITY_PLOT_PARAM = {
  key: 'density', type: 'plot2d', label: 'Count × Spacing', keys: ['count', 'spacing'],
  axes: [
    { key: 'count', label: 'Count', short: 'Count', min: 10, max: 5000, step: 10, default: 500 },
    { key: 'spacing', label: 'Spacing', short: 'Spacing', min: 0.5, max: 30, step: 0.5, default: 6 },
  ],
  tooltip: 'Number of elements × radial spacing on one plane — right is more elements, up is wider spacing. Together they set how densely the spiral fills the frame.',
};

// Grid columns × rows share one plane: both set line counts over the same 2..60
// range, so plotting them together makes the lattice aspect legible (a point off
// the diagonal is a non-square grid). `key: 'gridSize'` is the synthetic primary
// key (grouping/gating/reset/randomize); `keys` is the real value set; `axes`
// carries each axis's range + default. DEFAULT_PARAMS still carries cols / rows.
const GRID_SIZE_PLOT_PARAM = {
  key: 'gridSize', type: 'plot2d', label: 'Columns × Rows', keys: ['cols', 'rows'],
  axes: [
    { key: 'cols', label: 'Columns', short: 'Cols', min: 2, max: 60, step: 1, default: 12 },
    { key: 'rows', label: 'Rows', short: 'Rows', min: 2, max: 60, step: 1, default: 12 },
  ],
  tooltip: 'Columns × rows on one plane — right is more vertical lines, up is more horizontal lines. Off the diagonal is a non-square lattice.',
};

// Grid horizontal × vertical line toggles share one plane. Each axis is a 0/1
// switch, so the plane is a 4-corner selector (neither · V-only · H-only · both):
// right enables vertical lines, up enables horizontal lines. `key: 'gridLines'`
// is the synthetic primary key; DEFAULT_PARAMS still carries drawHorizontal /
// drawVertical.
const GRID_LINES_PLOT_PARAM = {
  key: 'gridLines', type: 'plot2d', label: 'Horizontal × Vertical', keys: ['drawHorizontal', 'drawVertical'],
  axes: [
    { key: 'drawVertical', label: 'Vertical', short: 'Vert', min: 0, max: 1, step: 1, default: 1 },
    { key: 'drawHorizontal', label: 'Horizontal', short: 'Horiz', min: 0, max: 1, step: 1, default: 1 },
  ],
  tooltip: 'Which line families draw, as a 4-corner toggle: right turns vertical lines on, up turns horizontal lines on. A corner can be neither, one, or both.',
};

// Grid non-linearity as a 2D plane: two INDEPENDENT ways to ease line spacing.
// X = concentration (the gamma/power s^(1+n)) — center vs edge bunching, the
// original control. Y = sharpness (an iq/Schlick gain composed on top, k = 3^g)
// — how abrupt the dense->sparse transition is, independent of strength. Y = 0
// is the identity, so existing grids render unchanged. `key: 'easing'` is the
// synthetic primary key; DEFAULT_PARAMS carries nonLinear / nonLinearGain.
const NONLINEAR_PLOT_PARAM = {
  key: 'easing', type: 'plot2d', label: 'Non-Linear', keys: ['nonLinear', 'nonLinearGain'],
  axes: [
    { key: 'nonLinear', label: 'Concentration', short: 'Conc', min: -2, max: 2, step: 0.1, default: 0 },
    { key: 'nonLinearGain', label: 'Sharpness', short: 'Sharp', min: -1, max: 1, step: 0.05, default: 0 },
  ],
  tooltip: 'Two independent eases for line spacing. Left/right = concentration (bunch toward edges or center). Down/up = sharpness of the falloff (how abrupt the dense-to-sparse transition is). Center = even spacing.',
};

// ModuleGrid columns × rows share one plane (same idea as GRID_SIZE_PLOT_PARAM):
// right is more columns, up is more rows; off the diagonal is a non-square grid.
// `key: 'grid'` is the synthetic primary key (grouping/gating/reset/randomize);
// `keys` is the real value set; `axes` carries each axis's range + default.
// DEFAULT_PARAMS still carries tilesX / tilesY.
const MODULE_GRID_TILES_PLOT_PARAM = {
  key: 'grid', type: 'plot2d', label: 'Columns × Rows', keys: ['tilesX', 'tilesY'],
  axes: [
    { key: 'tilesX', label: 'Columns', short: 'Cols', min: 2, max: 40, step: 1, default: 10 },
    { key: 'tilesY', label: 'Rows', short: 'Rows', min: 2, max: 40, step: 1, default: 10 },
  ],
  tooltip: 'Drag to set columns × rows',
};

export const PATTERN_PARAM_DEFS = {
  spirograph: [
    RADII_PLOT_PARAM,
    { key: 'd', label: 'Pen Offset', min: 10, max: 600, step: 1, tooltip: 'Distance from center of inner circle to pen point' },
    { key: 'revolutions', label: 'Revolutions', min: 1, max: 40, step: 1, tooltip: 'Number of full rotations to draw' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  flowfield: [
    { key: 'particleCount', label: 'Particle Count', min: 100, max: 3000, step: 10, tooltip: 'Number of particles tracing the flow field' },
    { key: 'stepLength', label: 'Step Length', min: 1, max: 20, step: 1, tooltip: 'Distance each particle moves per step' },
    { key: 'noiseScale', label: 'Noise Scale', min: 0.001, max: 0.02, step: 0.001, tooltip: 'Scale of Perlin noise — smaller = smoother' },
    { key: 'curlStrength', label: 'Curl Strength', min: 1, max: 360, step: 1, tooltip: 'Angle multiplier for noise-based direction' },
    { key: 'patternScale', label: 'Pattern Scale', min: 1, max: 2, step: 0.05, tooltip: 'Expands the generation area — increase to hide edges when using symmetry' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 4, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  phyllotaxis: [
    DENSITY_PLOT_PARAM,
    { key: 'angle', label: 'Divergence Angle', type: 'dial', detent: 137.508, detentLabel: 'Golden', min: 100, max: 170, step: 0.01, tooltip: 'Angle between elements — 137.508° is the golden angle' },
    { key: 'minSize', label: 'Min Size', min: 0.5, max: 40, step: 0.5, tooltip: 'Size of innermost elements' },
    { key: 'maxSize', label: 'Max Size', min: 1, max: 120, step: 0.5, tooltip: 'Size of outermost elements' },
    { key: 'sizeGrowth', label: 'Size Growth', min: 0, max: 3, step: 0.05, tooltip: 'How size scales from center to edge — 0 = uniform, 1 = linear, >1 = accelerating' },
    { key: 'shape', label: 'Shape', type: 'iconselect', options: [
      { value: 'circle', label: 'Circle', glyph: 'circle' },
      { value: 'square', label: 'Square', glyph: 'square' },
      { value: 'triangle', label: 'Triangle', glyph: 'triangle' },
      { value: 'hexagon', label: 'Hexagon', glyph: 'hexagon' },
      { value: 'star', label: 'Star', glyph: 'star' },
    ], tooltip: 'Shape of each element' },
    { key: 'fillMode', label: 'Fill Mode', type: 'iconselect', options: [
      { value: 'outline', label: 'Outline (cut)', glyph: 'outline' },
      { value: 'fill', label: 'Fill (engrave)', glyph: 'fill' },
      { value: 'both', label: 'Fill + Outline', glyph: 'both' },
    ], tooltip: 'Outline for laser cut, fill for engraving' },
    { key: 'rotation', label: 'Element Rotation', min: 0, max: 360, step: 1, tooltip: 'Base rotation of each element in degrees' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 4, step: 0.1, tooltip: 'Outline thickness' },
    { key: 'jitter', label: 'Jitter', min: 0, max: 100, step: 1, tooltip: 'Random displacement of each element' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  wave: [
    { key: 'waveCount', label: 'Wave Count', min: 2, max: 12, step: 1, tooltip: 'Number of overlapping wave layers' },
    { key: 'frequency', label: 'Frequency', min: 1, max: 20, step: 0.5, tooltip: 'Number of wave cycles across the canvas' },
    { key: 'amplitude', label: 'Amplitude', min: 5, max: 500, step: 1, tooltip: 'Maximum wave height in pixels — can exceed frame for edge bleed' },
    { key: 'lineSpacing', label: 'Line Spacing', min: 4, max: 40, step: 1, tooltip: 'Vertical space between wave lines' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  voronoi: [
    { key: 'cellCount', label: 'Cell Count', min: 10, max: 800, step: 1, tooltip: 'Number of Voronoi seed points' },
    { key: 'jitter', label: 'Jitter', min: 0, max: 100, step: 1, tooltip: 'Randomness of seed point placement' },
    { key: 'drawMode', label: 'Draw Mode', type: 'select', options: [
      { value: 'outlines', label: 'Cell Outlines' },
      { value: 'delaunay', label: 'Delaunay Triangles' },
      { value: 'both', label: 'Both' },
      { value: 'spokes', label: 'Centroids + Spokes' },
    ], tooltip: 'How to render the Voronoi diagram' },
    { key: 'relaxationSteps', label: 'Relaxation Steps', min: 0, max: 5, step: 1, tooltip: "Lloyd's relaxation passes for more even cells" },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  recursive: [
    { key: 'shape', label: 'Shape', type: 'iconselect', options: [
      { value: 'square', label: 'Square', glyph: 'square' },
      { value: 'triangle', label: 'Triangle', glyph: 'triangle' },
      { value: 'pentagon', label: 'Pentagon', glyph: 'pentagon' },
      { value: 'hexagon', label: 'Hexagon', glyph: 'hexagon' },
      { value: 'circle', label: 'Circle (72-gon)', glyph: 'circle' },
    ], tooltip: 'Base shape for recursive subdivision' },
    { key: 'depth', label: 'Depth', min: 1, max: 12, step: 1, randomMax: 5, tooltip: 'Recursion depth — more = more nested shapes' },
    { key: 'startScale', label: 'Start Size %', min: 20, max: 200, step: 5, tooltip: 'Starting radius as % of half-canvas — over 100% extends beyond the frame edges' },
    { key: 'rotationPerLevel', label: 'Rotation/Level', min: 0, max: 90, step: 1, tooltip: 'Rotation applied at each recursion level' },
    { key: 'scaleFactor', label: 'Scale Factor', min: 0.3, max: 0.95, step: 0.01, randomMin: 0.4, randomMax: 0.8, tooltip: 'Size multiplier per recursion level' },
    { key: 'scaleNonLinearity', type: 'curve', label: 'Scale Non-Linearity', min: -1, max: 1, step: 0.05, tooltip: 'Curves the scale decay — negative = slower start/faster end, positive = faster start/slower end' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Base line thickness at level 0' },
    { key: 'strokeDepthDecay', label: 'Stroke Depth Decay', min: 0, max: 1, step: 0.05, tooltip: 'How much stroke thins per recursion level — 0 = uniform, 1 = max thinning' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  phyllodash: [
    { key: 'seedCount', label: 'Seed Count', min: 200, max: 8000, step: 50, tooltip: 'Number of anchor points in the phyllotaxis spiral' },
    { key: 'spacingC', label: 'Spacing', min: 4, max: 20, step: 0.5, tooltip: 'Spacing constant — controls how dense the spiral is' },
    { key: 'innerMax', label: 'Inner Extent', min: 0, max: 30, step: 1, tooltip: 'Max inward dash extent from anchor (pixels)' },
    { key: 'outerMax', label: 'Outer Extent', min: 2, max: 50, step: 1, tooltip: 'Max outward dash extent from anchor (pixels)' },
    { key: 'noiseScale', label: 'Noise Scale', min: 0.002, max: 0.03, step: 0.001, tooltip: 'Perlin noise frequency for dash modulation' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  grainfield: [
    { key: 'pointCount', label: 'Point Count', min: 40, max: 600, step: 10, tooltip: 'Number of seed points for CVT relaxation' },
    { key: 'relaxPasses', label: 'Relaxation Passes', min: 0, max: 8, step: 1, tooltip: '0 = random, higher = more uniform spacing' },
    { key: 'neighborK', label: 'Neighbor Count', min: 2, max: 6, step: 1, tooltip: 'Number of neighbors for grain angle averaging' },
    { key: 'minDashLen', label: 'Min Dash Length', min: 2, max: 30, step: 1, tooltip: 'Shortest dashes (dense regions)' },
    { key: 'maxDashLen', label: 'Max Dash Length', min: 10, max: 80, step: 1, tooltip: 'Longest dashes (sparse regions)' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  flowhatch: [
    { key: 'particleCount', label: 'Particle Count', min: 50, max: 1000, step: 10, tooltip: 'Number of particles walking the flow field' },
    { key: 'stepsPerParticle', label: 'Steps/Particle', min: 20, max: 300, step: 10, tooltip: 'How far each particle walks' },
    { key: 'stepLength', label: 'Step Length', min: 2, max: 15, step: 1, tooltip: 'Pixels per step' },
    { key: 'sampleEvery', label: 'Sample Every N', min: 1, max: 10, step: 1, tooltip: 'Place an anchor every N steps — lower = denser' },
    { key: 'noiseScale', label: 'Noise Scale', min: 0.002, max: 0.02, step: 0.001, tooltip: 'Perlin noise frequency for the flow field' },
    { key: 'minDashLen', label: 'Min Dash Length', min: 4, max: 40, step: 1, tooltip: 'Minimum perpendicular dash length' },
    { key: 'maxDashLen', label: 'Max Dash Length', min: 6, max: 60, step: 1, tooltip: 'Maximum perpendicular dash length' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  feather: [
    { key: 'curveType', label: 'Curve Type', type: 'select', options: [
      { value: 'hypotrochoid', label: 'Hypotrochoid' },
      { value: 'rose', label: 'Rose Curve' },
    ], tooltip: 'Skeleton curve type' },
    { key: 'R', label: 'Outer Radius (R)', min: 50, max: 600, step: 1, tooltip: 'Hypotrochoid outer radius' },
    { key: 'r', label: 'Inner Radius (r)', min: 10, max: 300, step: 1, tooltip: 'Hypotrochoid inner radius' },
    { key: 'd', label: 'Pen Offset (d)', min: 10, max: 300, step: 1, tooltip: 'Hypotrochoid pen distance' },
    { key: 'roseK', label: 'Rose Petals (k)', min: 1, max: 12, step: 1, tooltip: 'Rose curve petal count' },
    { key: 'roseA', label: 'Rose Amplitude', min: 50, max: 600, step: 5, tooltip: 'Rose curve size' },
    { key: 'sampleCount', label: 'Sample Count', min: 200, max: 4000, step: 50, tooltip: 'Number of dash positions along the skeleton' },
    { key: 'harmonicK', label: 'Harmonic K', min: 1, max: 20, step: 1, tooltip: 'Frequency of the breathing envelope' },
    { key: 'innerBase', label: 'Inner Base', min: 0, max: 40, step: 1, tooltip: 'Minimum inward dash extent' },
    { key: 'innerAmp', label: 'Inner Amplitude', min: 0, max: 40, step: 1, tooltip: 'Inward extent modulation range' },
    { key: 'outerBase', label: 'Outer Base', min: 0, max: 40, step: 1, tooltip: 'Minimum outward dash extent' },
    { key: 'outerAmp', label: 'Outer Amplitude', min: 0, max: 40, step: 1, tooltip: 'Outward extent modulation range' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 2, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  turing: [
    { key: 'preset', label: 'Pattern Preset', type: 'select', options: [
      { value: 'spots', label: 'Spots' },
      { value: 'stripes', label: 'Stripes' },
      { value: 'labyrinth', label: 'Labyrinth' },
      { value: 'coral', label: 'Coral' },
    ], tooltip: 'Reaction-diffusion parameter preset' },
    { key: 'simIterations', label: 'Sim Iterations', min: 20, max: 200, step: 5, tooltip: 'Fewer = embryonic, more = fully developed' },
    { key: 'gridRes', label: 'Grid Resolution', min: 80, max: 200, step: 10, tooltip: 'Simulation grid size — higher = more detailed' },
    { key: 'targetPoints', label: 'Target Points', min: 100, max: 2000, step: 50, tooltip: 'Number of dash anchor points' },
    { key: 'minSpacing', label: 'Min Spacing', min: 3, max: 30, step: 1, tooltip: 'Minimum distance between anchor points' },
    { key: 'minDashLen', label: 'Min Dash Length', min: 2, max: 30, step: 1, tooltip: 'Shortest dashes' },
    { key: 'maxDashLen', label: 'Max Dash Length', min: 4, max: 50, step: 1, tooltip: 'Longest dashes' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  duality: [
    // Spiral + dashes
    { key: 'innerRadius', label: 'Inner Radius', min: 0, max: 200, step: 1, tooltip: 'Dead zone at center — no dashes or arcs inside this' },
    { key: 'outerRadius', label: 'Outer Radius', min: 50, max: 2000, step: 5, tooltip: 'Maximum extent of both dashes and arcs' },
    { key: 'spiralTurns', label: 'Spiral Turns', min: 1, max: 30, step: 0.5, tooltip: 'How many full rotations the dash spiral makes — controls arm spacing' },
    { key: 'spiralGrowth', label: 'Spiral Growth', min: 0.3, max: 3, step: 0.05, tooltip: '1 = linear (Archimedean), >1 = tighter center / looser edge, <1 = opposite' },
    { key: 'dashCount', label: 'Dash Count', min: 30, max: 2000, step: 10, tooltip: 'Total number of radial dashes along the spiral' },
    { key: 'dashLength', label: 'Dash Length', min: 2, max: 80, step: 1, tooltip: 'Base radial length of each dash' },
    { key: 'dashLenJitter', label: 'Dash Len Jitter', min: 0, max: 1, step: 0.05, tooltip: 'Randomizes each dash length — 0 = uniform, 1 = 0×–2× base' },
    { key: 'dashSparsity', label: 'Dash Sparsity', min: 0, max: 0.8, step: 0.05, tooltip: 'Probability of skipping a dash — creates irregular gaps' },
    { key: 'angleJitter', label: 'Angle Jitter', min: 0, max: 1, step: 0.05, tooltip: 'Angular scatter per dash — 0 = perfect spiral, 1 = noisy' },
    { key: 'dashStrokeWeight', label: 'Dash Stroke', min: 0.3, max: 4, step: 0.1, tooltip: 'Dash line thickness' },
    // Arcs
    { key: 'arcCount', label: 'Arc Count', min: 0, max: 60, step: 1, tooltip: 'Number of concentric arcs sharing the same radial range' },
    { key: 'arcSpacingNL', label: 'Arc Spacing NL', min: 0.2, max: 5, step: 0.05, tooltip: '1 = even, >1 = arcs spread outward (wavefront), <1 = cluster outward' },
    { key: 'arcRadiusJitter', label: 'Arc R Jitter', min: 0, max: 30, step: 1, tooltip: 'Random radius perturbation per arc' },
    { key: 'arcMinAngle', label: 'Arc Min Angle', min: 10, max: 180, step: 5, tooltip: 'Minimum arc span in degrees' },
    { key: 'arcMaxAngle', label: 'Arc Max Angle', min: 30, max: 358, step: 5, tooltip: 'Maximum arc span in degrees' },
    { key: 'arcMaxLength', label: 'Arc Max Length', min: 20, max: 3000, step: 10, tooltip: 'Cap arc physical length — prevents huge outer arcs' },
    { key: 'arcAngleJitter', label: 'Arc Angle Jitter', min: 0, max: 1, step: 0.01, tooltip: '0 = arcs start at 0°, 1 = fully random start angle' },
    { key: 'arcStrokeWeight', label: 'Arc Stroke', min: 0.3, max: 4, step: 0.1, tooltip: 'Arc line thickness' },
    // Interaction
    { key: 'overlapGap', label: 'Overlap Gap', min: 0, max: 40, step: 1, tooltip: 'Gap width cut at each dash/arc crossing (0 = no gaps)' },
    { key: 'overlapPriority', label: 'Overlap Priority', min: -1, max: 1, step: 0.05, tooltip: '-1 = waves dominate, 0 = equal, +1 = particles dominate' },
    { key: 'originX', label: 'Origin X', min: 0, max: 1, step: 0.01, tooltip: 'Horizontal origin (0=left, 0.5=center, 1=right)' },
    { key: 'originY', label: 'Origin Y', min: 0, max: 1, step: 0.01, tooltip: 'Vertical origin (0=top, 0.5=center, 1=bottom)' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  radialetch: [
    { key: 'lineCount', label: 'Line Count', min: 10, max: 500, step: 1, tooltip: 'Number of radial lines emanating from center' },
    { key: 'innerRadius', label: 'Inner Radius', min: 0, max: 400, step: 1, tooltip: 'Distance from center where lines begin' },
    { key: 'outerRadius', label: 'Outer Radius', min: 50, max: 2000, step: 5, tooltip: 'Distance from center where lines end' },
    { key: 'lengthJitter', label: 'Length Jitter', min: 0, max: 1, step: 0.05, tooltip: 'Randomizes inner and outer extent of each line' },
    { key: 'angleJitter', label: 'Angle Jitter', min: 0, max: 1, step: 0.05, tooltip: 'Random angular displacement per line' },
    { key: 'noiseWarp', label: 'Noise Warp', min: 0, max: 2, step: 0.05, tooltip: 'Perlin noise warps line angles for organic feel' },
    { key: 'noiseScale', label: 'Noise Scale', min: 0.001, max: 0.02, step: 0.001, tooltip: 'Frequency of warp noise — smaller = smoother' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  grid: [
    GRID_SIZE_PLOT_PARAM,
    { key: 'spacing', label: 'Spacing', min: 5, max: 100, step: 1, tooltip: 'Base distance between lines' },
    NONLINEAR_PLOT_PARAM,
    { key: 'jitter', label: 'Jitter', min: 0, max: 30, step: 0.5, tooltip: 'Random displacement of each line position' },
    GRID_LINES_PLOT_PARAM,
    { key: 'margin', label: 'Margin', min: 0, max: 100, step: 1, tooltip: 'Extra line overshoot beyond grid bounds' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  spiral: [
    { key: 'armCount', label: 'Arms', min: 1, max: 12, step: 1, tooltip: 'Number of spiral arms evenly spaced' },
    { key: 'turns', label: 'Turns', min: 1, max: 30, step: 0.5, tooltip: 'Number of full rotations per arm' },
    { key: 'innerRadius', label: 'Inner Radius', min: 0, max: 200, step: 1, tooltip: 'Starting radius at center' },
    { key: 'outerRadius', label: 'Outer Radius', min: 50, max: 2000, step: 5, tooltip: 'Maximum extent of spiral arms' },
    { key: 'growth', label: 'Growth', min: 0.3, max: 3, step: 0.05, tooltip: '1 = linear (Archimedean), >1 = tighter center, <1 = tighter edge' },
    { key: 'distortAmount', label: 'Distortion', min: 0, max: 80, step: 1, tooltip: 'Perlin noise displacement amount' },
    { key: 'distortScale', label: 'Distort Scale', min: 0.002, max: 0.05, step: 0.001, tooltip: 'Noise frequency — smaller = smoother warps' },
    { key: 'wobbleAmp', label: 'Wobble Amp', min: 0, max: 30, step: 0.5, tooltip: 'Sinusoidal angle wobble in degrees' },
    { key: 'wobbleFreq', label: 'Wobble Freq', min: 1, max: 40, step: 1, tooltip: 'Number of wobble oscillations per arm' },
    { key: 'stepsPerTurn', label: 'Resolution', min: 30, max: 300, step: 10, tooltip: 'Points per full rotation — higher = smoother' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  modulegrid: [
    { key: 'module', label: 'Module', type: 'iconselect', options: [
      { value: 'sideSweep', label: 'Side Sweep', glyph: 'sweep' },
      { value: 'fan', label: 'Converging Fan', glyph: 'fan' },
      { value: 'rings', label: 'Nested Rings', glyph: 'rings' },
      { value: 'chevron', label: 'Chevron', glyph: 'chevron' },
      { value: 'diamond', label: 'Diamond', glyph: 'diamond' },
    ], tooltip: 'Geometry drawn inside every grid cell' },
    MODULE_GRID_TILES_PLOT_PARAM,
    { key: 'lineCount', label: 'Line Count', min: 1, max: 40, step: 1, tooltip: 'Lines / arcs per cell' },
    { key: 'rotateMode', label: 'Rotation', type: 'select', options: [
      { value: 'seeded', label: 'Random (seed)' },
      { value: 'gradient', label: 'Gradient' },
      { value: 'aligned', label: 'Aligned' },
    ], tooltip: 'Per-cell rotation' },
    { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.05, tooltip: 'Per-cell positional scatter (seeded)' },
    // Universal per-cell scale — multiplies module size around the cell center.
    // >1 overflows into neighbors (not clipped). scaleMode picks how the factor
    // varies across the grid.
    { key: 'scale', label: 'Scale', min: 0.1, max: 3, step: 0.05, tooltip: 'Per-cell module size — over 1 overflows into neighboring cells' },
    { key: 'scaleMode', label: 'Scale Mode', type: 'select', options: [
      { value: 'uniform', label: 'Uniform' },
      { value: 'gradient', label: 'Gradient' },
      { value: 'seeded', label: 'Random (seed)' },
    ], tooltip: 'How scale varies per cell — uniform, a smooth grid ramp, or a seeded random factor' },
    // Per-module knobs — each only shown (and only read) for its module.
    { key: 'sweepCurve', label: 'Sweep Curve', min: 0, max: 1, step: 0.05, showIf: (p) => p.module === 'sideSweep', tooltip: 'Bows the swept spokes — 0 = straight bundle, 1 = curved sweep' },
    { key: 'fanSpread', label: 'Fan Spread', min: 30, max: 360, step: 5, showIf: (p) => p.module === 'fan', tooltip: 'Angle the fan subtends, in degrees' },
    { key: 'fanApex', label: 'Fan Apex', type: 'select', options: [
      { value: 'center', label: 'Center' },
      { value: 'corner', label: 'Corner' },
    ], showIf: (p) => p.module === 'fan', tooltip: 'Where the fan converges — cell center or corner' },
    { key: 'ringEccentricity', label: 'Ring Eccentricity', min: 0, max: 1, step: 0.05, showIf: (p) => p.module === 'rings', tooltip: 'Squashes rings into ellipses — 0 = circles, 1 = flat ellipse' },
    { key: 'ringSpacing', label: 'Ring Spacing', min: -1, max: 1, step: 0.05, showIf: (p) => p.module === 'rings', tooltip: 'Nesting curve — 0 = even, <0 = cluster inward, >0 = spread outward' },
    { key: 'chevronDepth', label: 'Chevron Depth', min: 0.2, max: 2, step: 0.05, showIf: (p) => p.module === 'chevron', tooltip: 'V steepness — higher dips the chevrons deeper' },
    { key: 'diamondAspect', label: 'Diamond Aspect', min: 0.4, max: 2.5, step: 0.05, showIf: (p) => p.module === 'diamond', tooltip: 'Width / height ratio — 1 = square diamond' },
    { key: 'diamondNesting', label: 'Diamond Nesting', min: -1, max: 1, step: 0.05, showIf: (p) => p.module === 'diamond', tooltip: 'Nesting curve — 0 = even, <0 = cluster inward, >0 = spread outward' },
    { key: 'strokeCap', label: 'Stroke Cap', type: 'select', options: [
      { value: 'round', label: 'Round' },
      { value: 'butt', label: 'Square' },
      { value: 'square', label: 'Project' },
    ], tooltip: 'Line end caps' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  topographic: [
    { key: 'levels', label: 'Levels', min: 2, max: 60, step: 1, tooltip: 'Number of contour lines' },
    { key: 'noiseScale', label: 'Zoom / Feature Size', min: 0.5, max: 8, step: 0.1, tooltip: 'Noise frequency — higher = more, smaller features across the canvas' },
    { key: 'octaves', label: 'Detail', min: 1, max: 6, step: 1, tooltip: 'fBm octaves — more = finer fractal detail' },
    { key: 'warp', label: 'Domain Warp', min: 0, max: 1, step: 0.05, tooltip: 'Distorts the field with a second noise lookup — 0 = none' },
    { key: 'levelBias', label: 'Level Bias', min: -1, max: 1, step: 0.05, tooltip: '−1 concentrate toward peaks, +1 toward valleys, 0 even' },
    { key: 'resolution', label: 'Resolution', min: 60, max: 300, step: 10, tooltip: 'Marching-squares density — smoothness vs compute' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  diffgrowth: [
    { key: 'topology', label: 'Topology', type: 'select', options: [
      { value: 'closed', label: 'Closed Loop' },
      { value: 'open', label: 'Open Line' },
    ], tooltip: 'Brain-coral loop vs fingerprint meander' },
    { key: 'maxNodes', label: 'Growth Budget', min: 200, max: 3000, step: 50, tooltip: 'More = more folded + more compute' },
    { key: 'repulsionRadius', label: 'Spacing', min: 4, max: 40, step: 1, tooltip: 'Self-avoidance distance — meander thickness' },
    { key: 'attraction', label: 'Attraction', min: 0, max: 1, step: 0.05, tooltip: 'Pull toward neighbors — keeps the curve connected' },
    { key: 'repulsion', label: 'Repulsion', min: 0, max: 1, step: 0.05, tooltip: 'Push apart from nearby nodes — self-avoidance strength' },
    { key: 'smoothing', label: 'Smoothing', min: 0, max: 1, step: 0.05, tooltip: 'Blend toward neighbor midpoint — curve regularity' },
    { key: 'growthStyle', label: 'Growth Style', type: 'select', options: [
      { value: 'uniform', label: 'Uniform' },
      { value: 'curvature', label: 'Curvature' },
      { value: 'scattered', label: 'Scattered' },
    ], tooltip: 'Where new nodes are injected' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  girih: [
    // Hankin polygons-in-contact star patterns. NOTE: only the two correct
    // tilings ship — square8 (4.8.8 → 8★) and hex12 (3.12.12 → 12★). The
    // decagonal (10★) and 4.6.12 variants were excluded (broken filler tiling).
    { key: 'tiling', label: 'Tiling', type: 'select', options: [
      { value: 'square8', label: 'Square (8★)' },
      { value: 'hex12', label: 'Hex (12★)' },
    ], tooltip: 'Underlying polygon tiling — sets the star symmetry' },
    { key: 'density', label: 'Repeats', min: 2, max: 12, step: 1, tooltip: 'Tiling repeats across the canvas' },
    { key: 'contactAngle', label: 'Contact Angle', min: 15, max: 75, step: 1, tooltip: 'Star sharpness — low = acute/spiky, high = obtuse/soft' },
    { key: 'render', label: 'Render', type: 'select', options: [
      { value: 'skeleton', label: 'Skeleton' },
      { value: 'interlaced', label: 'Interlaced' },
    ], tooltip: 'Skeleton strapwork lines, or woven interlaced bands' },
    { key: 'bandWidth', label: 'Band Width', min: 1, max: 12, step: 0.5, showIf: (p) => p.render === 'interlaced', tooltip: 'Width of the woven strapwork bands' },
    { key: 'irregularity', label: 'Hand Irregularity', min: 0, max: 1, step: 0.05, tooltip: 'Seeded wobble — 0 = perfect, higher = hand-cut feel' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  moire: [
    // A Moiré pair = two layers (A + B). These params live on layer A; B reads
    // them. The three transform knobs below (rotation/offset/scale) move the B
    // surface RELATIVE to A — that relative offset is what produces the fringes.
    { key: 'fieldType', label: 'Field', type: 'select', options: [
      { value: 'parallelLines', label: 'Parallel Lines' },
      { value: 'concentricRings', label: 'Concentric Rings' },
      { value: 'radialLines', label: 'Radial Lines' },
    ], tooltip: 'The base grating both surfaces draw' },
    { key: 'density', label: 'Density', min: 20, max: 400, step: 1, tooltip: 'Number of lines / rings — finer fields give tighter fringes' },
    { key: 'moireRotation', label: 'B Rotation', type: 'dial', wrap: true, min: 0, max: 360, step: 1, tooltip: 'Rotates the B surface relative to A — a few degrees produces fringe bands' },
    { key: 'moireOffset', label: 'B Offset', type: 'pad2d', keys: ['moireOffsetX', 'moireOffsetY'], min: -200, max: 200, step: 1, tooltip: 'Shifts the B surface relative to A. Radial moiré needs an offset to show fringes.' },
    { key: 'moireScale', label: 'B Scale', min: 0.8, max: 1.2, step: 0.005, tooltip: 'Scales the B surface relative to A — a slight mismatch gives concentric zone-plate fringes' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  circlepacking: [
    { key: 'boundary', label: 'Boundary', type: 'select', options: [
      { value: 'rectangle', label: 'Rectangle' },
      { value: 'circle', label: 'Circle' },
    ], tooltip: 'Pack region — Circle = self-contained medallion' },
    { key: 'render', label: 'Render', type: 'select', options: [
      { value: 'outlines', label: 'Outlines' },
      { value: 'links', label: '+ Neighbor Links' },
      { value: 'nested', label: 'Nested Rings' },
    ], tooltip: 'How each packed circle is drawn' },
    { key: 'attempts', label: 'Density', min: 200, max: 8000, step: 100, tooltip: 'Placement attempts — higher = tighter pack, more circles' },
    { key: 'minRadius', label: 'Min Radius', min: 1, max: 40, step: 1, tooltip: 'Smallest circle that may be placed' },
    { key: 'maxRadius', label: 'Max Radius', min: 10, max: 200, step: 1, tooltip: 'Largest circle that may be placed' },
    { key: 'linkDistance', label: 'Link Distance', min: 0, max: 120, step: 2, showIf: (p) => p.render === 'links', tooltip: 'Connect neighbors whose gap is within this distance of touching' },
    { key: 'ringCount', label: 'Rings / Circle', min: 2, max: 10, step: 1, showIf: (p) => p.render === 'nested', tooltip: 'Concentric outlines drawn inside each packed circle' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
  dendrite: [
    { key: 'seedMode', label: 'Seed', type: 'select', options: [
      { value: 'center', label: 'Center' },
      { value: 'ground', label: 'Ground' },
      { value: 'ring', label: 'Ring' },
    ], tooltip: 'Nucleation — Center=snowflake, Ground=frost, Ring=band' },
    { key: 'render', label: 'Render', type: 'select', options: [
      { value: 'bonds', label: 'Branches' },
      { value: 'nodesBonds', label: 'Branches + Nodes' },
    ], tooltip: 'Branch skeleton, optionally with a dot at each particle' },
    { key: 'maxNodes', label: 'Size', min: 200, max: 4000, step: 50, tooltip: 'Particle count — bigger + more compute' },
    { key: 'stickiness', label: 'Stickiness', min: 0.05, max: 1, step: 0.05, tooltip: 'Capture probability — low = denser/smoother, high = feathery/branchy' },
    { key: 'nodeSpacing', label: 'Branch Spacing', min: 2, max: 20, step: 1, tooltip: 'Distance between particles — branch thickness' },
    { key: 'strokeWeight', label: 'Stroke Weight', min: 0.3, max: 3, step: 0.1, tooltip: 'Line thickness' },
    SYMMETRY_PARAM,
    START_ANGLE_PARAM,
    OFFSET_PAD_PARAM,
  ],
};

export const DEFAULT_COLORS = ['#00c9b1', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', '#bb8fce'];

// Keys excluded from randomization by default (unchecked when a new layer is created).
// Users can still check them manually. Edit this list to change defaults.
export const RANDOMIZE_EXCLUDED_KEYS = [
  // Transform
  'startAngle', 'offsetX', 'offsetY', 'offset', 'symmetry', 'originX', 'originY',
  // Stroke
  'strokeWeight', 'dashStrokeWeight', 'arcStrokeWeight',
  // Scale
  'patternScale',
];

// Groups collapsed by default
export const COLLAPSED_GROUPS = ['stroke', 'transform'];

// Parameter grouping — order determines display order
export const PARAM_GROUPS = [
  { id: 'structure', label: 'Structure' },
  { id: 'scale',     label: 'Scale' },
  { id: 'variation', label: 'Variation' },
  { id: 'stroke',    label: 'Stroke' },
  { id: 'transform', label: 'Transform' },
];

// One param rendered above all groups, always visible, ungrouped. Keyed by
// patternType. Symmetry leads on the patterns where it's most structural.
export const FEATURED_PARAMS = {
  flowfield: 'symmetry',
  recursive: 'symmetry',
};

// Maps every param key to its group. Edit to re-group params.
export const PARAM_GROUP_MAP = {
  // Structure — skeleton, topology, counts
  R: 'structure', r: 'structure', radii: 'structure', d: 'structure', revolutions: 'structure',
  particleCount: 'structure', stepLength: 'structure',
  count: 'structure', angle: 'structure', spacing: 'structure',
  shape: 'structure', fillMode: 'structure',
  waveCount: 'structure', frequency: 'structure', amplitude: 'structure',
  lineSpacing: 'structure',
  cellCount: 'structure', drawMode: 'structure', relaxationSteps: 'structure',
  depth: 'structure', scaleFactor: 'structure',
  seedCount: 'structure', spacingC: 'structure',
  pointCount: 'structure', relaxPasses: 'structure', neighborK: 'structure',
  stepsPerParticle: 'structure', sampleEvery: 'structure',
  curveType: 'structure', roseK: 'structure', roseA: 'structure',
  sampleCount: 'structure',
  preset: 'structure', simIterations: 'structure', gridRes: 'structure',
  targetPoints: 'structure',
  spiralTurns: 'structure', dashCount: 'structure', arcCount: 'structure',
  lineCount: 'structure',
  cols: 'structure', rows: 'structure', margin: 'structure',
  drawHorizontal: 'structure', drawVertical: 'structure',
  armCount: 'structure', turns: 'structure', stepsPerTurn: 'structure',
  module: 'structure', grid: 'structure', tilesX: 'structure', tilesY: 'structure',
  // ModuleGrid per-module knobs share the geometry-ish 'structure' group with
  // module/grid (only one set is visible at a time via showIf).
  sweepCurve: 'structure', fanSpread: 'structure', fanApex: 'structure',
  ringEccentricity: 'structure', ringSpacing: 'structure',
  chevronDepth: 'structure', diamondAspect: 'structure', diamondNesting: 'structure',
  // Topographic contours: line count + marching-squares density are structural.
  levels: 'structure', resolution: 'structure',
  // Girih (Islamic star): tiling + repeat count are structural; the look knobs
  // (contact angle / render mode / band width / irregularity) are variation.
  tiling: 'structure', density: 'structure',
  contactAngle: 'variation', render: 'variation',
  bandWidth: 'variation', irregularity: 'variation',
  // Differential growth: topology + growth budget are structural; the force
  // knobs (repulsion radius/attraction/repulsion/smoothing/growth style) live in
  // the variation group.
  topology: 'structure', maxNodes: 'structure',
  // Circle packing: boundary/render mode + density (attempts) are structural;
  // the radii live in scale; link distance / ring count are variation.
  boundary: 'structure', attempts: 'structure',
  minRadius: 'scale', maxRadius: 'scale',
  linkDistance: 'variation', ringCount: 'variation',
  // Dendrite (DLA): nucleation mode + particle count are structural; the look
  // knobs (render mode / capture probability / branch spacing) are variation.
  seedMode: 'structure',
  stickiness: 'variation', nodeSpacing: 'variation',

  // Scale — size, extent, radii, lengths
  scale: 'scale', scaleMode: 'scale',
  minSize: 'scale', maxSize: 'scale', sizeGrowth: 'scale',
  startScale: 'scale', scaleNonLinearity: 'scale',
  innerMax: 'scale', outerMax: 'scale',
  minDashLen: 'scale', maxDashLen: 'scale',
  innerBase: 'scale', innerAmp: 'scale', outerBase: 'scale',
  outerAmp: 'scale', harmonicK: 'scale',
  minSpacing: 'scale',
  innerRadius: 'scale', outerRadius: 'scale',
  dashLength: 'scale',
  arcMinAngle: 'scale', arcMaxAngle: 'scale', arcMaxLength: 'scale',
  arcRadiusJitter: 'scale',
  patternScale: 'scale',

  // Variation — noise, jitter, distortion
  noiseScale: 'variation', curlStrength: 'variation',
  octaves: 'variation', warp: 'variation', levelBias: 'variation',
  rotation: 'variation', rotateMode: 'variation', jitter: 'variation',
  rotationPerLevel: 'variation', strokeDepthDecay: 'variation',
  spiralGrowth: 'variation',
  dashLenJitter: 'variation', dashSparsity: 'variation',
  angleJitter: 'variation',
  arcSpacingNL: 'variation', arcAngleJitter: 'variation',
  overlapGap: 'variation', overlapPriority: 'variation',
  lengthJitter: 'variation', noiseWarp: 'variation',
  nonLinear: 'variation',
  growth: 'variation',
  distortAmount: 'variation', distortScale: 'variation',
  wobbleAmp: 'variation', wobbleFreq: 'variation',
  repulsionRadius: 'variation', attraction: 'variation', repulsion: 'variation',
  smoothing: 'variation', growthStyle: 'variation',

  // Stroke — line weight, rendering
  strokeWeight: 'stroke', strokeCap: 'stroke',
  dashStrokeWeight: 'stroke', arcStrokeWeight: 'stroke',

  // Transform — position, rotation, symmetry
  symmetry: 'transform', startAngle: 'transform',
  offsetX: 'transform', offsetY: 'transform', offset: 'transform',
  originX: 'transform', originY: 'transform',

  // Moiré — fieldType is structural; the B-relative transform knobs live in the
  // transform group; the B-relative scale lives in the scale group. (`density`
  // is already mapped to 'structure' above.)
  fieldType: 'structure',
  moireRotation: 'transform',
  moireOffset: 'transform', moireOffsetX: 'transform', moireOffsetY: 'transform',
  moireScale: 'scale',
};

// ============================================================================
// PATTERN TAXONOMY — "Periodic Table of Patterns"
// ----------------------------------------------------------------------------
// Drives the new-layer pattern-picker modal (see docs/pattern-taxonomy.md).
// Two real, independent axes + a family colour overlay:
//   • X (columns) = geom 0..4  — geometric → organic  (order → emergence)
//   • Y (rows)    = form        — spatial archetype (radial → packed)
//   • colour      = family      — the generative mechanism ("chemistry")
// Per-card badges refine a cell: determinism · mark type · radial symmetry.
//
// Kept as a PARALLEL map (not folded into PATTERN_TYPES) so the existing array
// shape, tier gate, and PatternTabs are untouched. The picker reads a pattern's
// label from PATTERN_TYPES (or `label` here for not-yet-built placeholders) and
// everything else from this map.
//
// Placeholders (hilbert/chladni/lissajous/truchet) have NO `comingSoon` flag:
// the picker derives "coming soon" from the ABSENCE of a registered pattern
// class. The moment those patterns self-register (see registerPattern), their
// cards light up — no edit here required. This lets a second session build the
// pattern files without touching this file. See docs/pattern-taxonomy.md §7.
// ============================================================================

// Family colour legend (the "chemistry"). Ordered by geometric→organic.
// `color` = accent (border/text/dot); `tint` = faint card wash on the paper panel.
export const PATTERN_FAMILIES = {
  H: { key: 'H', label: 'Harmonic Curves',        color: '#d9a441', tint: 'rgba(217,164,65,0.10)' },
  W: { key: 'W', label: 'Waves & Interference',   color: '#2fa4a8', tint: 'rgba(47,164,168,0.10)' },
  T: { key: 'T', label: 'Lattices & Tilings',     color: '#5b6ee1', tint: 'rgba(91,110,225,0.10)' },
  R: { key: 'R', label: 'Recursion & Fractals',   color: '#9b6dd6', tint: 'rgba(155,109,214,0.10)' },
  F: { key: 'F', label: 'Fields & Flow',          color: '#4fa86b', tint: 'rgba(79,168,107,0.10)' },
  P: { key: 'P', label: 'Partition & Packing',    color: '#e08a4b', tint: 'rgba(224,138,75,0.10)' },
  G: { key: 'G', label: 'Growth & Agents',        color: '#d65d7a', tint: 'rgba(214,93,122,0.10)' },
  C: { key: 'C', label: 'Reaction-Diffusion',     color: '#6b7a99', tint: 'rgba(107,122,153,0.10)' },
};

// X axis (columns): geometric → organic. Index === a pattern's `geom`.
export const GEOM_ORGANIC_BANDS = [
  { level: 0, label: 'Crystalline', hint: 'pure equation' },
  { level: 1, label: 'Parametric',  hint: 'rule-rich' },
  { level: 2, label: 'Seeded',      hint: 'noise / relaxation' },
  { level: 3, label: 'Flowing',     hint: 'fields / scatter' },
  { level: 4, label: 'Emergent',    hint: 'grown / rules' },
];

// Y axis (rows): spatial archetype. `key` === a pattern's `form`.
export const SPATIAL_FORM_ROWS = [
  { key: 'radial',    label: 'Radial / Spiral' },
  { key: 'wave',      label: 'Wave / Concentric' },
  { key: 'grid',      label: 'Grid / Woven' },
  { key: 'nested',    label: 'Nested / Fractal' },
  { key: 'flowing',   label: 'Flowing / Directional' },
  { key: 'cellular',  label: 'Cellular / Reticulate' },
  { key: 'branching', label: 'Branching / Dendritic' },
  { key: 'packed',    label: 'Packed / Scattered' },
];

// One entry per pattern. `family` keys PATTERN_FAMILIES; `geom` indexes
// GEOM_ORGANIC_BANDS; `form` keys SPATIAL_FORM_ROWS. `det`: deterministic |
// seeded | stochastic. `mark`: line | dash | fill. `sym`: supports radial copies.
// `bridge`: a secondary family it straddles (drawn as a hint). `label` only on
// placeholders not present in PATTERN_TYPES. `pickerHidden`: omitted from the
// picker (Moiré — a two-surface pair pattern reached by switching a layer).
export const PATTERN_TAXONOMY = {
  // ── Harmonic Curves ──────────────────────────────────────────────────────
  spirograph: { family: 'H', geom: 0, form: 'radial', det: 'deterministic', mark: 'line', sym: true, blurb: 'Hypotrochoid curves — symmetric looping lobes.' },
  spiral:     { family: 'H', geom: 0, form: 'radial', det: 'deterministic', mark: 'line', sym: true, blurb: 'Multi-armed Archimedean / exponential spirals.' },
  phyllotaxis:{ family: 'H', geom: 1, form: 'radial', det: 'deterministic', mark: 'fill', sym: true, bridge: 'P', blurb: 'Golden-angle spiral of elements — a packing, too.' },
  feather:    { family: 'H', geom: 1, form: 'radial', det: 'deterministic', mark: 'dash', sym: true, blurb: 'Oscillating dashes around a rose / hypotrochoid skeleton.' },
  phyllodash: { family: 'H', geom: 2, form: 'radial', det: 'deterministic', mark: 'dash', sym: true, blurb: 'Golden-spiral seeds with radiating dashes.' },
  duality:    { family: 'H', geom: 1, form: 'radial', det: 'deterministic', mark: 'dash', sym: true, bridge: 'W', blurb: 'A spiral of dashes plus concentric wave arcs.' },

  // ── Waves & Interference ─────────────────────────────────────────────────
  wave:       { family: 'W', geom: 0, form: 'wave', det: 'deterministic', mark: 'line', sym: true, blurb: 'Stacked, interfering sine waves.' },
  moire:      { family: 'W', geom: 0, form: 'wave', det: 'deterministic', mark: 'line', sym: false, pickerHidden: true, blurb: 'Two-surface interference fringes (added by switching a layer).' },

  // ── Lattices & Tilings ───────────────────────────────────────────────────
  grid:       { family: 'T', geom: 0, form: 'grid', det: 'deterministic', mark: 'line', sym: true, blurb: 'Lattice of eased horizontal / vertical lines.' },
  modulegrid: { family: 'T', geom: 0, form: 'grid', det: 'deterministic', mark: 'line', sym: false, blurb: 'Grid of repeating, per-cell-rotated modules.' },
  girih:      { family: 'T', geom: 0, form: 'grid', det: 'deterministic', mark: 'line', sym: true, blurb: 'Islamic star tiling (polygons-in-contact).' },

  // ── Recursion & Fractals ─────────────────────────────────────────────────
  recursive:  { family: 'R', geom: 0, form: 'nested', det: 'deterministic', mark: 'line', sym: true, blurb: 'Recursively nested, rotating polygons.' },

  // ── Fields & Flow ────────────────────────────────────────────────────────
  topographic:{ family: 'F', geom: 2, form: 'wave', det: 'seeded', mark: 'line', sym: false, blurb: 'Contour lines from an fBm noise field.' },
  radialetch: { family: 'F', geom: 2, form: 'radial', det: 'seeded', mark: 'line', sym: true, bridge: 'H', blurb: 'Radial rays warped by Perlin noise.' },
  flowfield:  { family: 'F', geom: 3, form: 'flowing', det: 'seeded', mark: 'line', sym: true, blurb: 'Particles tracing a Perlin flow field.' },
  flowhatch:  { family: 'F', geom: 3, form: 'flowing', det: 'seeded', mark: 'dash', sym: true, blurb: 'Hatching dashes following a flow field.' },
  grainfield: { family: 'F', geom: 3, form: 'flowing', det: 'stochastic', mark: 'dash', sym: true, bridge: 'G', blurb: 'Flow-aligned dashes like wood grain.' },

  // ── Partition & Packing ──────────────────────────────────────────────────
  voronoi:      { family: 'P', geom: 2, form: 'cellular', det: 'seeded', mark: 'line', sym: false, blurb: 'Voronoi cell partition of the plane.' },
  circlepacking:{ family: 'P', geom: 2, form: 'packed', det: 'seeded', mark: 'line', sym: true, blurb: 'Non-overlapping circle packing.' },

  // ── Growth & Agents ──────────────────────────────────────────────────────
  diffgrowth: { family: 'G', geom: 4, form: 'branching', det: 'stochastic', mark: 'line', sym: true, blurb: 'Self-avoiding differential growth.' },
  dendrite:   { family: 'G', geom: 4, form: 'branching', det: 'stochastic', mark: 'line', sym: true, blurb: 'Diffusion-limited aggregation — frost / coral branches.' },

  // ── Reaction-Diffusion & CA ──────────────────────────────────────────────
  turing:     { family: 'C', geom: 4, form: 'cellular', det: 'stochastic', mark: 'dash', sym: true, blurb: 'Reaction-diffusion spots, stripes, labyrinths.' },

  // ── PLACEHOLDERS (not yet built) ─ light up automatically once registered ──
  lissajous:  { family: 'H', geom: 0, form: 'radial', det: 'deterministic', mark: 'line', sym: true,  label: 'Lissajous',     blurb: 'Two-axis harmonic oscillation — a harmonograph.' },
  chladni:    { family: 'W', geom: 1, form: 'wave',   det: 'deterministic', mark: 'line', sym: true,  label: 'Chladni',       blurb: 'Standing-wave nodal figures — sound made visible.' },
  truchet:    { family: 'T', geom: 2, form: 'grid',   det: 'seeded',        mark: 'line', sym: false, label: 'Truchet',       blurb: 'Grid of randomly rotated arc tiles.' },
  hilbert:    { family: 'R', geom: 0, form: 'nested', det: 'deterministic', mark: 'line', sym: false, label: 'Hilbert Curve', blurb: 'One unbroken space-filling curve.' },
};

// Two-letter element symbols (periodic-table style) shown on each picker card.
// Hand-lettered captions on the naqsheh cell. Kept unique across all patterns.
export const PATTERN_SYMBOLS = {
  spirograph: 'Sg', spiral: 'Sl', phyllotaxis: 'Ph', feather: 'Fe',
  phyllodash: 'Pd', duality: 'Du', wave: 'Wv', moire: 'Mo',
  grid: 'Gr', modulegrid: 'Mg', girih: 'Gi', recursive: 'Re',
  topographic: 'To', radialetch: 'Ra', flowfield: 'Ff', flowhatch: 'Fh',
  grainfield: 'Gn', voronoi: 'Vo', circlepacking: 'Cp', diffgrowth: 'Dg',
  dendrite: 'De',
  turing: 'Tu', lissajous: 'Ls', chladni: 'Ch', truchet: 'Tr', hilbert: 'Hi',
};
