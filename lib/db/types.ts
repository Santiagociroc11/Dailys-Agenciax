export type QueryOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface QueryFilter {
  eq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  contains?: Record<string, unknown[]>;
  not?: Record<string, { op: string; value: unknown }>;
  or?: Array<Record<string, unknown>>;
  gte?: Record<string, unknown>;
  lte?: Record<string, unknown>;
  gt?: Record<string, unknown>;
  lt?: Record<string, unknown>;
}

export interface QueryRequest {
  table: string;
  operation: QueryOperation;
  select?: string;
  filters?: QueryFilter;
  data?: Record<string, unknown> | Record<string, unknown>[];
  order?: { column: string; ascending: boolean };
  single?: boolean;
  limit?: number;
  offset?: number;
  upsertOptions?: {
    onConflict?: string;
    ignoreDuplicates?: boolean;
  };
}

export interface QueryResponse<T = unknown> {
  data: T | T[] | null;
  error: { message: string; code?: string } | null;
}
