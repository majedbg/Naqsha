// Canonical, ordered list of pro app-shell region labels (Lane B / B1, issue #2).
//
// Region aria-labels are the contract that later slices (#5–#10) and tests key
// off of; this is the single source of truth. Kept in its own module (not in
// AppShell.jsx) so the component file only exports components — react-refresh /
// fast-refresh requires that.
export const SHELL_REGIONS = [
  'Menu bar',
  'Contextual control bar',
  'Tool strip',
  'Object tree',
  'Canvas',
  'Inspector',
  'Operations panel',
  'Status bar',
];
