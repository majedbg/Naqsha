// materialService.test.js — Worker 2b (Phase 2 data services)
// TDD: tracer first. Local chainable-resolution pattern (mirrors designService.test.js).
//
// Flattened merged-item shape locked by the tracer (downstream/UI contract):
//   {
//     id,            // org_materials.id  — toggle/UI key on THIS
//     org_id,
//     material_id,
//     name, type, thickness_mm, color,        // from catalog: materials
//     sheet_w_mm, sheet_h_mm, price, is_active // from org_materials
//   }
// Explicit field pick (no spread) so materials.id never clobbers org_materials.id.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };

vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  listMaterials,
  listActiveOrgMaterials,
  listOrgMaterials,
  addOrgMaterial,
  toggleOrgMaterial,
} from './materialService';

// Chainable resolution mock — every builder method returns the chain; the chain
// is thenable and resolves to the provided { data, error }.
function makeChain(resolution) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    single: () => chain,
    then(resolve, reject) {
      return Promise.resolve(resolution).then(resolve, reject);
    },
  };
  return chain;
}

function mockSupabase(fromImpl) {
  _ref.client = {
    from: vi.fn(fromImpl),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  return _ref.client;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── listMaterials (global catalog) ──────────────────────────────────────────
describe('materialService.listMaterials', () => {
  it('returns the global materials catalog ordered by name', async () => {
    const catalog = [
      { id: 'mat-1', name: '1/8in clear acrylic', type: 'acrylic', thickness_mm: 3.0, color: 'clear' },
      { id: 'mat-2', name: '3mm plywood', type: 'plywood', thickness_mm: 3.0, color: 'natural' },
    ];
    const orderMock = vi.fn();
    const supa = mockSupabase((table) => {
      expect(table).toBe('materials');
      const chain = makeChain({ data: catalog, error: null });
      chain.order = (col) => { orderMock(col); return chain; };
      return chain;
    });

    const result = await listMaterials();

    expect(supa.from).toHaveBeenCalledWith('materials');
    expect(orderMock).toHaveBeenCalledWith('name');
    expect(result).toEqual(catalog);
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    expect(await listMaterials()).toEqual([]);
  });

  it('throws when query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'RLS denied' } }));
    await expect(listMaterials()).rejects.toMatchObject({ message: 'RLS denied' });
  });
});

// ─── listOrgMaterials (inactive-INCLUSIVE) ───────────────────────────────────
describe('materialService.listOrgMaterials', () => {
  it('returns merged rows INCLUDING inactive (no is_active filter)', async () => {
    const joined = [
      {
        id: 'om-1', org_id: 'org-1', material_id: 'mat-1',
        sheet_w_mm: 600, sheet_h_mm: 400, price: 25, is_active: true,
        materials: { id: 'mat-1', name: 'acrylic', type: 'acrylic', thickness_mm: 3, color: 'clear' },
      },
      {
        id: 'om-2', org_id: 'org-1', material_id: 'mat-2',
        sheet_w_mm: 600, sheet_h_mm: 400, price: 30, is_active: false,
        materials: { id: 'mat-2', name: 'plywood', type: 'plywood', thickness_mm: 3, color: 'natural' },
      },
    ];
    const eqMock = vi.fn();
    const supa = mockSupabase((table) => {
      expect(table).toBe('org_materials');
      const chain = makeChain({ data: joined, error: null });
      chain.eq = (col, val) => { eqMock(col, val); return chain; };
      return chain;
    });

    const result = await listOrgMaterials('org-1');

    expect(supa.from).toHaveBeenCalledWith('org_materials');
    // scoped to the org, but NOT filtered by is_active — admin must see inactive
    // rows so the Activate toggle can round-trip a deactivated offering.
    expect(eqMock).toHaveBeenCalledWith('org_id', 'org-1');
    expect(eqMock).not.toHaveBeenCalledWith('is_active', true);
    expect(result.map((r) => r.id)).toEqual(['om-1', 'om-2']);
    expect(result.map((r) => r.is_active)).toEqual([true, false]);
    // flattened identity from catalog join (org_materials.id not clobbered)
    expect(result[1]).toMatchObject({ id: 'om-2', name: 'plywood', is_active: false });
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    expect(await listOrgMaterials('org-1')).toEqual([]);
  });

  it('throws when query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'RLS denied' } }));
    await expect(listOrgMaterials('org-1')).rejects.toMatchObject({ message: 'RLS denied' });
  });
});

// ─── TRACER ──────────────────────────────────────────────────────────────────
describe('materialService.listActiveOrgMaterials — TRACER', () => {
  it('is exported', () => {
    expect(typeof listActiveOrgMaterials).toBe('function');
  });

  it('returns merged rows: catalog identity + org sheet attrs flattened', async () => {
    // Nested-select shape the real client returns for `.select('*, materials(*)')`.
    const joined = [
      {
        id: 'om-1',
        org_id: 'org-1',
        material_id: 'mat-1',
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 25,
        is_active: true,
        materials: {
          id: 'mat-1',
          name: '1/8in clear acrylic',
          type: 'acrylic',
          thickness_mm: 3.0,
          color: 'clear',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    ];
    const supa = mockSupabase((table) => {
      expect(table).toBe('org_materials');
      return makeChain({ data: joined, error: null });
    });

    const result = await listActiveOrgMaterials('org-1');

    expect(supa.from).toHaveBeenCalledWith('org_materials');
    expect(result).toEqual([
      {
        id: 'om-1', // org_materials.id — NOT clobbered by materials.id
        org_id: 'org-1',
        material_id: 'mat-1',
        name: '1/8in clear acrylic',
        type: 'acrylic',
        thickness_mm: 3.0,
        color: 'clear',
        sheet_w_mm: 600,
        sheet_h_mm: 400,
        price: 25,
        is_active: true,
      },
    ]);
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    expect(await listActiveOrgMaterials('org-1')).toEqual([]);
  });

  it('throws when query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'RLS denied' } }));
    await expect(listActiveOrgMaterials('org-1')).rejects.toMatchObject({ message: 'RLS denied' });
  });

  it('filters to is_active=true (inactive excluded)', async () => {
    const eqMock = vi.fn();
    mockSupabase(() => {
      const chain = makeChain({ data: [], error: null });
      chain.eq = (col, val) => { eqMock(col, val); return chain; };
      return chain;
    });

    await listActiveOrgMaterials('org-1');

    expect(eqMock).toHaveBeenCalledWith('org_id', 'org-1');
    expect(eqMock).toHaveBeenCalledWith('is_active', true);
  });
});

// ─── addOrgMaterial ──────────────────────────────────────────────────────────
describe('materialService.addOrgMaterial', () => {
  it('inserts an org_materials row scoped to org + material with sheet attrs', async () => {
    const insertMock = vi.fn(() => makeChain({
      data: { id: 'om-9', org_id: 'org-1', material_id: 'mat-1', sheet_w_mm: 600, sheet_h_mm: 400, price: 25, is_active: true },
      error: null,
    }));
    const supa = mockSupabase((table) => {
      expect(table).toBe('org_materials');
      const chain = makeChain({ data: null, error: null });
      chain.insert = insertMock;
      return chain;
    });

    const result = await addOrgMaterial('org-1', 'mat-1', { sheet_w_mm: 600, sheet_h_mm: 400, price: 25 });

    expect(supa.from).toHaveBeenCalledWith('org_materials');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-1', material_id: 'mat-1', sheet_w_mm: 600, sheet_h_mm: 400, price: 25 }),
    );
    expect(result).toMatchObject({ id: 'om-9', is_active: true });
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    expect(await addOrgMaterial('org-1', 'mat-1', {})).toBeNull();
  });

  it('throws when insert errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'duplicate' } }));
    await expect(addOrgMaterial('org-1', 'mat-1', {})).rejects.toMatchObject({ message: 'duplicate' });
  });
});

// ─── toggleOrgMaterial ───────────────────────────────────────────────────────
describe('materialService.toggleOrgMaterial', () => {
  it('updates is_active on the org_materials row by id', async () => {
    const updateMock = vi.fn(() => makeChain({
      data: { id: 'om-1', is_active: false },
      error: null,
    }));
    const supa = mockSupabase((table) => {
      expect(table).toBe('org_materials');
      const chain = makeChain({ data: { id: 'om-1', is_active: false }, error: null });
      chain.update = updateMock;
      return chain;
    });

    const result = await toggleOrgMaterial('om-1', false);

    expect(supa.from).toHaveBeenCalledWith('org_materials');
    expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    expect(result).toMatchObject({ id: 'om-1', is_active: false });
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    expect(await toggleOrgMaterial('om-1', true)).toBeNull();
  });

  it('throws when update errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'update failed' } }));
    await expect(toggleOrgMaterial('om-1', true)).rejects.toMatchObject({ message: 'update failed' });
  });
});
