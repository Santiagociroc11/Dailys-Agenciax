import type { QueryFilter, QueryRequest, QueryResponse } from './dbTypes.js';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

interface PendingQuery {
  table: string;
  operation: 'select';
  select?: string;
  filters: QueryFilter;
  order?: { column: string; ascending: boolean };
  single?: boolean;
  limit?: number;
  offset?: number;
}

class QueryBuilder {
  private pending: PendingQuery;

  constructor(table: string) {
    this.pending = {
      table,
      operation: 'select',
      filters: {},
    };
  }

  select(fields: string = '*') {
    this.pending.select = fields;
    return this;
  }

  eq(column: string, value: unknown) {
    this.pending.filters.eq = this.pending.filters.eq ?? {};
    (this.pending.filters.eq as Record<string, unknown>)[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.pending.filters.in = this.pending.filters.in ?? {};
    (this.pending.filters.in as Record<string, unknown[]>)[column] = values;
    return this;
  }

  contains(column: string, values: unknown[]) {
    this.pending.filters.contains = this.pending.filters.contains ?? {};
    (this.pending.filters.contains as Record<string, unknown[]>)[column] = values;
    return this;
  }

  not(column: string, op: string, value: unknown) {
    this.pending.filters.not = this.pending.filters.not ?? {};
    (this.pending.filters.not as Record<string, { op: string; value: unknown }>)[column] = { op, value };
    return this;
  }

  or(expr: string) {
    const conditions = parseOrExpression(expr);
    if (conditions.length > 0) {
      this.pending.filters.or = conditions;
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.pending.order = {
      column,
      ascending: options?.ascending ?? true,
    };
    return this;
  }

  single() {
    this.pending.single = true;
    return this;
  }

  limit(n: number) {
    this.pending.limit = n;
    return this;
  }

  offset(n: number) {
    this.pending.offset = n;
    return this;
  }

  async then<T>(
    onFulfilled?: (value: QueryResponse<T>) => T | PromiseLike<T>,
    onRejected?: (reason: unknown) => never
  ): Promise<QueryResponse<T>> {
    const request: QueryRequest = {
      table: this.pending.table,
      operation: 'select',
      select: this.pending.select,
      filters: Object.keys(this.pending.filters).length > 0 ? this.pending.filters : undefined,
      order: this.pending.order,
      single: this.pending.single,
      limit: this.pending.limit,
      offset: this.pending.offset,
    };
    const result = await executeRequest<T>(request);
    if (onFulfilled) {
      return onFulfilled(result) as Promise<QueryResponse<T>>;
    }
    return result;
  }
}

class InsertBuilder {
  private wantSingle = false;

  constructor(
    private table: string,
    private data: Record<string, unknown> | Record<string, unknown>[]
  ) {}

  select(_fields?: string) {
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  async then<T>(
    onFulfilled?: (value: QueryResponse<T>) => T | PromiseLike<T>,
    _onRejected?: (reason: unknown) => never
  ): Promise<QueryResponse<T>> {
    const items = Array.isArray(this.data) ? this.data : [this.data];
    const request: QueryRequest = {
      table: this.table,
      operation: 'insert',
      data: items,
      single: this.wantSingle || items.length === 1,
    };
    const result = await executeRequest<T>(request);
    if (onFulfilled) {
      return onFulfilled(result) as Promise<QueryResponse<T>>;
    }
    return result;
  }
}

class UpdateBuilder {
  private filters: QueryFilter = {};

  constructor(
    private table: string,
    private data: Record<string, unknown>
  ) {}

  eq(column: string, value: unknown) {
    this.filters.eq = this.filters.eq ?? {};
    (this.filters.eq as Record<string, unknown>)[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.in = this.filters.in ?? {};
    (this.filters.in as Record<string, unknown[]>)[column] = values;
    return this;
  }

  select(_fields?: string) {
    return this;
  }

  single() {
    return this;
  }

  async then<T>(
    onFulfilled?: (value: QueryResponse<T>) => T | PromiseLike<T>,
    _onRejected?: (reason: unknown) => never
  ): Promise<QueryResponse<T>> {
    const request: QueryRequest = {
      table: this.table,
      operation: 'update',
      data: this.data,
      filters: Object.keys(this.filters).length > 0 ? this.filters : undefined,
    };
    const result = await executeRequest<T>(request);
    if (onFulfilled) {
      return onFulfilled(result) as Promise<QueryResponse<T>>;
    }
    return result;
  }
}

class DeleteBuilder {
  private filters: QueryFilter = {};

  constructor(private table: string) {}

  eq(column: string, value: unknown) {
    this.filters.eq = this.filters.eq ?? {};
    (this.filters.eq as Record<string, unknown>)[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.in = this.filters.in ?? {};
    (this.filters.in as Record<string, unknown[]>)[column] = values;
    return this;
  }

  async then<T>(
    onFulfilled?: (value: QueryResponse<T>) => T | PromiseLike<T>,
    _onRejected?: (reason: unknown) => never
  ): Promise<QueryResponse<T>> {
    const request: QueryRequest = {
      table: this.table,
      operation: 'delete',
      filters: Object.keys(this.filters).length > 0 ? this.filters : undefined,
    };
    const result = await executeRequest<T>(request);
    if (onFulfilled) {
      return onFulfilled(result) as Promise<QueryResponse<T>>;
    }
    return result;
  }
}

class UpsertBuilder {
  constructor(
    private table: string,
    private data: Record<string, unknown> | Record<string, unknown>[],
    private options?: { onConflict?: string }
  ) {}

  async then<T>(
    onFulfilled?: (value: QueryResponse<T>) => T | PromiseLike<T>,
    _onRejected?: (reason: unknown) => never
  ): Promise<QueryResponse<T>> {
    const items = Array.isArray(this.data) ? this.data : [this.data];
    const request: QueryRequest = {
      table: this.table,
      operation: 'upsert',
      data: items,
      upsertOptions: this.options ? { onConflict: this.options.onConflict } : undefined,
    };
    const result = await executeRequest<T>(request);
    if (onFulfilled) {
      return onFulfilled(result) as Promise<QueryResponse<T>>;
    }
    return result;
  }
}

function parseOrExpression(expr: string): Array<Record<string, unknown>> {
  return expr.split(',').map((part) => {
    const match = part.trim().match(/^(\w+)\.(ilike|eq)\.(.+)$/);
    if (match) {
      const [, field, op, value] = match;
      const cleanValue = value.replace(/^['"]|['"]$/g, '');
      if (op === 'ilike') {
        const pattern = cleanValue.replace(/%/g, '.*');
        return { [field!]: { $regex: pattern, $options: 'i' } };
      }
      return { [field!]: cleanValue };
    }
    return {};
  }).filter((c) => Object.keys(c).length > 0);
}

async function executeRequest<T>(request: QueryRequest): Promise<QueryResponse<T>> {
  const url = `${API_BASE}/api/db/query`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch (parseErr) {
      console.error('[dbClient] Error parseando JSON. Status:', res.status, 'URL:', url);
      return { data: null, error: { message: 'La respuesta del servidor no es JSON válido' } };
    }
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } })?.error?.message ?? 'Error de red';
      console.error('[dbClient] Request falló:', res.status, msg);
      return { data: null, error: { message: msg } };
    }
    if (request.operation === 'insert' && request.table === 'tasks') {
      console.log('[dbClient] tasks insert response:', JSON.stringify(json).slice(0, 300));
    }
    return json as QueryResponse<T>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[dbClient] Fetch error:', message, 'URL:', url);
    return { data: null, error: { message } };
  }
}

export interface DbClient {
  from: (table: string) => {
    select: (fields?: string) => QueryBuilder;
    insert: (data: Record<string, unknown> | Record<string, unknown>[]) => InsertBuilder;
    update: (data: Record<string, unknown>) => UpdateBuilder;
    delete: () => DeleteBuilder;
    upsert: (
      data: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string }
    ) => UpsertBuilder;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

async function rpc(fn: string, params: Record<string, unknown>) {
  try {
    const res = await fetch(`${API_BASE}/api/db/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn, params }),
    });
    const json = await res.json();
    return { data: json.data ?? null, error: json.error ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { data: null, error: { message } };
  }
}

function from(table: string) {
  return {
    select(fields: string = '*') {
      return new QueryBuilder(table).select(fields);
    },
    insert(data: Record<string, unknown> | Record<string, unknown>[]) {
      return new InsertBuilder(table, data);
    },
    update(data: Record<string, unknown>) {
      return new UpdateBuilder(table, data);
    },
    delete() {
      return new DeleteBuilder(table);
    },
    upsert(
      data: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string }
    ) {
      return new UpsertBuilder(table, data, options);
    },
  };
}

export const db: DbClient = { from, rpc };
