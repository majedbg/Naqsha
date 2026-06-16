// Tool-system state core (P1, plan §1 row 10). A registry of editing tools the
// canvas toolbar exposes. `select` is live now; `text` is registered but
// flagged-for-P2 (enabled:false) so the keymap/IA slot exists without the tool.
import { describe, it, expect } from 'vitest';
import { getTool, toolForKey, listTools } from './toolRegistry.js';

describe('toolRegistry', () => {
  it('registers the select tool with its keybinding and metadata', () => {
    const select = getTool('select');
    expect(select).toMatchObject({ id: 'select', key: 'v' });
    expect(select.label).toBeTruthy();
    expect(select.cursor).toBeTruthy();
    // select is the always-available default tool.
    expect(select.enabled).not.toBe(false);
  });

  it('registers the text tool as a P2 placeholder (enabled:false)', () => {
    const text = getTool('text');
    expect(text).toMatchObject({ id: 'text', key: 't', enabled: false });
  });

  it('getTool returns undefined for an unknown id', () => {
    expect(getTool('nope')).toBeUndefined();
  });

  it('toolForKey resolves keybindings (case-insensitive) to tool ids', () => {
    expect(toolForKey('v')?.id).toBe('select');
    expect(toolForKey('V')?.id).toBe('select');
    expect(toolForKey('t')?.id).toBe('text');
    expect(toolForKey('T')?.id).toBe('text');
  });

  it('toolForKey returns undefined for an unmapped key', () => {
    expect(toolForKey('z')).toBeUndefined();
  });

  it('listTools returns every registered tool in registration order', () => {
    const ids = listTools().map((t) => t.id);
    expect(ids).toEqual(['select', 'text']);
  });
});
