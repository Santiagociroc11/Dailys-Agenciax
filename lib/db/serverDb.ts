/**
 * Cliente de base de datos para uso en el servidor (API, workers, etc.).
 * Usa Mongoose directamente sin pasar por HTTP.
 */
import { executeQuery } from './queryExecutor.js';
import type { QueryRequest } from './types.js';

async function query<T = unknown>(
  request: QueryRequest
): Promise<{ data: T | T[] | null; error: { message: string } | null }> {
  return executeQuery<T>(request);
}

function createSelectBuilder(table: string, fields: string = '*') {
  const state = {
    table,
    filters: {
      eq: {} as Record<string, unknown>,
      in: {} as Record<string, unknown[]>,
      not: {} as Record<string, { op: string; value: unknown }>,
    },
    order: undefined as { column: string; ascending: boolean } | undefined,
    single: false,
  };

  const builder = {
    eq: (col: string, val: unknown) => {
      state.filters.eq[col] = val;
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      state.filters.in[col] = vals;
      return builder;
    },
    not: (col: string, op: string, val: unknown) => {
      state.filters.not[col] = { op, value: val };
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      state.order = { column: col, ascending: opts?.ascending ?? true };
      return builder;
    },
    single: () => {
      state.single = true;
      return builder;
    },
    then: async <T>(onFulfilled?: (v: { data: T | T[] | null; error: { message: string } | null }) => unknown) => {
      const req: QueryRequest = {
        table: state.table,
        operation: 'select',
        select: fields,
        filters: state.filters,
        order: state.order,
        single: state.single,
      };
      const result = await query<T>(req);
      return onFulfilled ? onFulfilled(result) : result;
    },
  };

  return builder;
}

export const db = {
  from: (table: string) => ({
    select: (fields: string = '*') => createSelectBuilder(table, fields),
  }),
};
