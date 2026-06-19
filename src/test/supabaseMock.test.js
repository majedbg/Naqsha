import { describe, it, expect } from 'vitest';
import { createSupabaseMock } from './supabaseMock.js';

describe('supabaseMock — tracer', () => {
  it('resolves a seeded org row via .from().select().eq().single()', async () => {
    const sb = createSupabaseMock({
      orgs: [{ id: 'o1', slug: 'itp-camp', name: 'ITP Camp' }],
    });

    const { data, error } = await sb
      .from('orgs')
      .select('*')
      .eq('slug', 'itp-camp')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ id: 'o1', slug: 'itp-camp', name: 'ITP Camp' });
  });

  it('returns the inserted row from .insert().select().single()', async () => {
    const sb = createSupabaseMock({ submissions: [] });

    const { data, error } = await sb
      .from('submissions')
      .insert({ id: 's1', title: 'My Job' })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ id: 's1', title: 'My Job' });
  });

  it('awaiting a chain without .single() resolves an array', async () => {
    const sb = createSupabaseMock({
      orgs: [
        { id: 'o1', slug: 'a' },
        { id: 'o2', slug: 'b' },
      ],
    });

    const { data, error } = await sb.from('orgs').select('*');

    expect(error).toBeNull();
    expect(data).toEqual([
      { id: 'o1', slug: 'a' },
      { id: 'o2', slug: 'b' },
    ]);
  });

  it('applies .update() to the matched row and returns it', async () => {
    const sb = createSupabaseMock({
      submissions: [{ id: 's1', status: 'pending' }],
    });

    const { data, error } = await sb
      .from('submissions')
      .update({ status: 'approved' })
      .eq('id', 's1')
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ id: 's1', status: 'approved' });
  });

  it('removes matched rows on .delete()', async () => {
    const seed = { submissions: [{ id: 's1' }, { id: 's2' }] };
    const sb = createSupabaseMock(seed);

    const { error } = await sb.from('submissions').delete().eq('id', 's1');

    expect(error).toBeNull();
    expect(seed.submissions).toEqual([{ id: 's2' }]);
  });

  it('storage.from().upload() returns a path', async () => {
    const sb = createSupabaseMock();

    const { data, error } = await sb.storage
      .from('svgs')
      .upload('org/itp/job.svg', '<svg/>');

    expect(error).toBeNull();
    expect(data).toEqual({ path: 'org/itp/job.svg' });
  });

  it('auth.getUser() returns the seeded user', async () => {
    const user = { id: 'u1', email: 'majed.bg@gmail.com' };
    const sb = createSupabaseMock({}, { user });

    const { data, error } = await sb.auth.getUser();

    expect(error).toBeNull();
    expect(data.user).toEqual(user);
  });

  it('surfaces an injected error as { data: null, error }', async () => {
    const sb = createSupabaseMock({ orgs: [{ id: 'o1', slug: 'a' }] });
    sb.injectError('orgs', 'select', { message: 'permission denied', code: '42501' });

    const { data, error } = await sb
      .from('orgs')
      .select('*')
      .eq('slug', 'a')
      .single();

    expect(data).toBeNull();
    expect(error).toEqual({ message: 'permission denied', code: '42501' });
  });
});
