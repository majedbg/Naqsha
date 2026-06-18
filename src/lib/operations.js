// Document-level operation library (issue #1, A1).
//
// An operation is a colored fabrication process. The document owns an ORDERED
// list of operations; each layer references one by `operationId` (replacing the
// per-layer `role` string at the data level). Color + process for export and
// canvas resolve THROUGH the operation, not from a raw role.
//
//   operation = { id, name, color, process, machineParams, order }
//   process   ∈ { 'cut' | 'score' | 'engrave' | 'pen' }
//
// Seed colors follow the locked LightBurn convention (pure RGB):
//   Cut = red #FF0000, Score = blue #0000FF, Engrave = black #000000.

export const PROCESSES = ['cut', 'score', 'engrave', 'pen'];

const FALLBACK_COLOR = '#000000';

// Stable seed definitions — order is the cut order. The ids are STABLE (not
// random) so a layer's `operationId` resolves against any freshly seeded library
// — bundled examples reference these ids directly, and the migration shim maps
// legacy roles to them, so the Studio's default library always resolves them.
const SEED_DEFS = [
  { id: 'op-cut', name: 'Cut', color: '#FF0000', process: 'cut' },
  { id: 'op-score', name: 'Score', color: '#0000FF', process: 'score' },
  { id: 'op-engrave', name: 'Engrave', color: '#000000', process: 'engrave' },
];

let nextOpNum = 1;
function genOperationId() {
  return `op-${nextOpNum++}-${Math.random().toString(36).slice(2, 8)}`;
}

// Build one operation in the canonical shape.
export function createOperation({ id, name, color, process, machineParams, order = 0 } = {}) {
  return {
    id: id || genOperationId(),
    name: name ?? '',
    color: color ?? FALLBACK_COLOR,
    process: PROCESSES.includes(process) ? process : 'cut',
    machineParams: machineParams && typeof machineParams === 'object' ? { ...machineParams } : {},
    order,
  };
}

// Seed a fresh document's operation library: Cut / Score / Engrave.
export function seedOperations() {
  return SEED_DEFS.map((def, i) => createOperation({ ...def, machineParams: {}, order: i }));
}

// The operationId a legacy `role` (or absent role) maps to under the seed
// library — cut/score/engrave map 1:1; anything else defaults to Cut.
export function operationIdForRole(role) {
  const def = SEED_DEFS.find((d) => d.process === role);
  return (def ?? SEED_DEFS[0]).id;
}

// Reflow `order` to match array position (cut order = list order).
function reindex(ops) {
  return ops.map((op, i) => (op.order === i ? op : { ...op, order: i }));
}

// Append an operation (immutable). Order is assigned from the new length.
export function addOperation(ops, op) {
  const list = Array.isArray(ops) ? ops : [];
  const next = createOperation({ ...op, order: list.length });
  return [...list, next];
}

// Remove by id (immutable), reflowing order.
export function removeOperation(ops, id) {
  return reindex((ops || []).filter((o) => o.id !== id));
}

// Move the operation at `from` to `to` (immutable), reflowing order.
export function reorderOperations(ops, from, to) {
  const list = [...(ops || [])];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return reindex(list);
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return reindex(list);
}

// Change a single operation's color (immutable).
export function recolorOperation(ops, id, color) {
  return (ops || []).map((o) => (o.id === id ? { ...o, color } : o));
}

// Resolve an operationId → operation object (or undefined).
export function resolveOperation(ops, operationId) {
  if (!operationId) return undefined;
  return (ops || []).find((o) => o.id === operationId);
}

// Resolve a layer's color through its operation. Falls back to #000000 when the
// layer has no operationId or it points at a missing operation — matching the
// legacy roleColor() default.
export function resolveLayerColor(layer, ops) {
  return resolveOperation(ops, layer?.operationId)?.color ?? FALLBACK_COLOR;
}

// Resolve a layer's process through its operation (or null when unresolved).
export function resolveLayerProcess(layer, ops) {
  return resolveOperation(ops, layer?.operationId)?.process ?? null;
}
