// Chainable mock Supabase client factory for service-layer tests (no Docker).
//
// The real `@supabase/supabase-js` query builder is a PromiseLike: awaiting a
// chain WITHOUT `.single()` resolves `{ data: rows[], error }`, while
// `.single()`/`.maybeSingle()` resolve `{ data: row|null, error }`. This mock
// mirrors that by returning the SAME thenable builder from every chain method
// and computing the result lazily in `.then`.
//
// Error injection: `client.injectError(table, op, errorObj)` makes any chain on
// that table+op resolve `{ data: null, error: errorObj }`, mirroring how a real
// RLS denial or constraint violation surfaces.

function makeBuilder(state) {
  const builder = {
    select() {
      // `.select()` after a write (insert/update/delete) is a RETURNING clause,
      // not a new query — never clobber an existing write op.
      if (!state.op) state.op = 'select';
      return builder;
    },
    eq(col, val) {
      state.filters.push((row) => row[col] === val);
      return builder;
    },
    insert(payload) {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    },
    update(payload) {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    delete() {
      state.op = 'delete';
      return builder;
    },
    order(col, { ascending = true } = {}) {
      state.order = { col, ascending };
      return builder;
    },
    single() {
      state.single = true;
      return builder;
    },
    maybeSingle() {
      state.single = true;
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve(resolveBuilder(state)).then(resolve, reject);
    },
  };
  return builder;
}

function resolveBuilder(state) {
  const op = state.op || 'select';
  const injected = state.errors[`${state.table}:${op}`];
  if (injected) {
    return { data: null, error: injected };
  }

  const bucket = state.seed[state.table] || (state.seed[state.table] = []);

  if (op === 'insert') {
    const inserted = Array.isArray(state.payload)
      ? state.payload
      : [state.payload];
    bucket.push(...inserted);
    return { data: state.single ? inserted[0] : inserted, error: null };
  }

  const matches = (row) => state.filters.every((f) => f(row));

  if (op === 'update') {
    const updated = [];
    for (const row of bucket) {
      if (matches(row)) {
        Object.assign(row, state.payload);
        updated.push(row);
      }
    }
    return { data: state.single ? (updated[0] ?? null) : updated, error: null };
  }

  if (op === 'delete') {
    const removed = bucket.filter(matches);
    const kept = bucket.filter((row) => !matches(row));
    bucket.length = 0;
    bucket.push(...kept);
    return { data: state.single ? (removed[0] ?? null) : removed, error: null };
  }

  // select
  let matched = bucket.filter(matches);
  if (state.order) {
    const { col, ascending } = state.order;
    matched = matched.slice().sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return ascending ? cmp : -cmp;
    });
  }
  if (state.single) {
    return { data: matched.length ? matched[0] : null, error: null };
  }
  return { data: matched, error: null };
}

export function createSupabaseMock(seed = {}, { user = null } = {}) {
  const errors = {};

  return {
    injectError(table, op, error) {
      errors[`${table}:${op}`] = error;
      return this;
    },
    from(table) {
      return makeBuilder({
        seed,
        errors,
        table,
        op: null,
        filters: [],
        single: false,
      });
    },
    storage: {
      from() {
        return {
          async upload(path) {
            return { data: { path }, error: null };
          },
        };
      },
    },
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
  };
}
