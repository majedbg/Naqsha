// Active-tool state + pointer-event router (plan §1 row 10, §7 P1 item 5).
//
// Per the constraint, the reducer + keymap resolution + router are pure
// module-level functions tested WITHOUT React DOM. The hook is a thin wrapper.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOOL,
  initState,
  toolReducer,
  resolveKey,
  routePointer,
} from './useActiveTool.js';

describe('toolReducer / state', () => {
  it('defaults the active tool to select', () => {
    expect(DEFAULT_TOOL).toBe('select');
    expect(initState().activeTool).toBe('select');
  });

  it('setActiveTool switches to a registered tool', () => {
    const next = toolReducer(initState(), { type: 'setActiveTool', id: 'text' });
    expect(next.activeTool).toBe('text');
  });

  it('ignores a set to an unregistered tool id', () => {
    const start = initState();
    const next = toolReducer(start, { type: 'setActiveTool', id: 'bogus' });
    expect(next).toBe(start);
  });

  it('returns the same state object for an unknown action (no-op)', () => {
    const start = initState();
    expect(toolReducer(start, { type: 'whatever' })).toBe(start);
  });
});

describe('resolveKey (keymap → reducer action)', () => {
  it('maps v to select (case-insensitive, no disabled flag)', () => {
    expect(resolveKey('v')).toEqual({ type: 'setActiveTool', id: 'select' });
    expect(resolveKey('V')).toEqual({ type: 'setActiveTool', id: 'select' });
  });

  it('allows selecting the disabled text tool via t/T but flags it', () => {
    expect(resolveKey('t')).toEqual({ type: 'setActiveTool', id: 'text', disabled: true });
    expect(resolveKey('T')).toEqual({ type: 'setActiveTool', id: 'text', disabled: true });
  });

  it('maps Escape to return-to-select (deselect)', () => {
    expect(resolveKey('Escape')).toEqual({ type: 'setActiveTool', id: 'select' });
  });

  it('returns null for an unmapped key', () => {
    expect(resolveKey('z')).toBeNull();
  });
});

describe('routePointer', () => {
  it('dispatches to the active tool handler for the event type', () => {
    const calls = [];
    const handlers = {
      select: { pointerdown: (p) => calls.push(['select.down', p]) },
      text: { pointerdown: (p) => calls.push(['text.down', p]) },
    };
    const payload = { x: 1, y: 2 };
    routePointer('select', 'pointerdown', payload, handlers);
    expect(calls).toEqual([['select.down', payload]]);
  });

  it('returns the handler result', () => {
    const handlers = { select: { pointermove: () => 'handled' } };
    expect(routePointer('select', 'pointermove', {}, handlers)).toBe('handled');
  });

  it('is a safe no-op when the tool has no handler map', () => {
    expect(() => routePointer('select', 'pointerdown', {}, {})).not.toThrow();
    expect(routePointer('select', 'pointerdown', {}, {})).toBeUndefined();
  });

  it('is a safe no-op when the event type has no handler', () => {
    const handlers = { select: { pointerdown: () => 'x' } };
    expect(routePointer('select', 'pointerup', {}, handlers)).toBeUndefined();
  });

  it('is a safe no-op when handlersByTool is missing', () => {
    expect(() => routePointer('select', 'pointerdown', {})).not.toThrow();
    expect(routePointer('select', 'pointerdown', {})).toBeUndefined();
  });
});
