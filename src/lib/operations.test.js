// Unit tests for the document-level operation library (issue #1, A1).
// These pin the seeded colors as LITERALS (LightBurn convention) — never
// captured from current output.

import { describe, it, expect } from 'vitest';
import {
  seedOperations,
  createOperation,
  addOperation,
  removeOperation,
  reorderOperations,
  recolorOperation,
  resolveOperation,
  resolveLayerColor,
  resolveLayerProcess,
} from './operations.js';

describe('seedOperations', () => {
  it('seeds Cut / Score / Engrave with the locked LightBurn colors', () => {
    const ops = seedOperations();
    expect(ops).toHaveLength(3);
    const byProcess = Object.fromEntries(ops.map((o) => [o.process, o]));
    expect(byProcess.cut.name).toBe('Cut');
    expect(byProcess.cut.color).toBe('#FF0000');
    expect(byProcess.score.name).toBe('Score');
    expect(byProcess.score.color).toBe('#0000FF');
    expect(byProcess.engrave.name).toBe('Engrave');
    expect(byProcess.engrave.color).toBe('#000000');
  });

  it('assigns a stable ordered list (order = cut order)', () => {
    const ops = seedOperations();
    expect(ops.map((o) => o.order)).toEqual([0, 1, 2]);
    expect(ops.every((o) => typeof o.id === 'string' && o.id.length > 0)).toBe(true);
    expect(ops.every((o) => typeof o.machineParams === 'object' && o.machineParams)).toBe(true);
  });
});

describe('createOperation', () => {
  it('builds an operation with the canonical shape', () => {
    const op = createOperation({ name: 'Cut (deep)', color: '#FF0000', process: 'cut', order: 5 });
    expect(op).toMatchObject({ name: 'Cut (deep)', color: '#FF0000', process: 'cut', order: 5 });
    expect(typeof op.id).toBe('string');
    expect(op.machineParams).toEqual({});
  });
});

describe('add/remove/reorder/recolor', () => {
  it('addOperation appends with the next order', () => {
    const ops = seedOperations();
    const next = addOperation(ops, createOperation({ name: 'Pen 1', color: '#123456', process: 'pen' }));
    expect(next).toHaveLength(4);
    expect(next[3].order).toBe(3);
    expect(ops).toHaveLength(3); // immutable
  });

  it('removeOperation drops by id and reflows order', () => {
    const ops = seedOperations();
    const next = removeOperation(ops, ops[1].id);
    expect(next).toHaveLength(2);
    expect(next.map((o) => o.order)).toEqual([0, 1]);
    expect(next.find((o) => o.id === ops[1].id)).toBeUndefined();
  });

  it('reorderOperations moves an op and reflows order', () => {
    const ops = seedOperations();
    const next = reorderOperations(ops, 0, 2);
    expect(next[2].process).toBe('cut');
    expect(next.map((o) => o.order)).toEqual([0, 1, 2]);
  });

  it('recolorOperation changes a single op color immutably', () => {
    const ops = seedOperations();
    const next = recolorOperation(ops, ops[0].id, '#abcdef');
    expect(next[0].color).toBe('#abcdef');
    expect(ops[0].color).toBe('#FF0000');
  });
});

describe('resolve helpers', () => {
  it('resolveOperation looks up by id', () => {
    const ops = seedOperations();
    expect(resolveOperation(ops, ops[1].id)).toBe(ops[1]);
    expect(resolveOperation(ops, 'nope')).toBeUndefined();
  });

  it('resolveLayerColor uses the assigned operation color', () => {
    const ops = seedOperations();
    const scoreId = ops.find((o) => o.process === 'score').id;
    expect(resolveLayerColor({ operationId: scoreId }, ops)).toBe('#0000FF');
  });

  it('resolveLayerColor falls back to #000000 when operationId is missing', () => {
    const ops = seedOperations();
    expect(resolveLayerColor({}, ops)).toBe('#000000');
    expect(resolveLayerColor({ operationId: 'gone' }, ops)).toBe('#000000');
  });

  it('resolveLayerProcess returns the operation process or null', () => {
    const ops = seedOperations();
    const engraveId = ops.find((o) => o.process === 'engrave').id;
    expect(resolveLayerProcess({ operationId: engraveId }, ops)).toBe('engrave');
    expect(resolveLayerProcess({}, ops)).toBeNull();
  });
});
