import type { FilterQuery } from 'mongoose';
import type { QueryFilter } from './types.js';

/**
 * Convierte los filtros del formato API a un query de Mongoose.
 */
export function buildMongoFilter(filters: QueryFilter): FilterQuery<unknown> {
  const query: FilterQuery<unknown> = {};

  if (filters.eq) {
    for (const [key, value] of Object.entries(filters.eq)) {
      if (value !== undefined && value !== null) {
        (query as Record<string, unknown>)[key] = value;
      }
    }
  }

  if (filters.in) {
    for (const [key, values] of Object.entries(filters.in)) {
      if (Array.isArray(values) && values.length > 0) {
        (query as Record<string, unknown>)[key] = { $in: values };
      }
    }
  }

  if (filters.not) {
    for (const [key, { op, value }] of Object.entries(filters.not)) {
      if (op === 'in' && Array.isArray(value)) {
        (query as Record<string, unknown>)[key] = { $nin: value };
      } else if (op === 'in' && typeof value === 'string') {
        const parsed = parseNotInString(value);
        if (parsed.length > 0) {
          (query as Record<string, unknown>)[key] = { $nin: parsed };
        }
      } else if (op === 'is' && value === null) {
        (query as Record<string, unknown>)[key] = { $ne: null, $exists: true };
      } else {
        (query as Record<string, unknown>)[key] = { $ne: value };
      }
    }
  }

  if (filters.or && filters.or.length > 0) {
    (query as Record<string, unknown>).$or = filters.or;
  }

  return query;
}

/**
 * Parsea strings como "('completed', 'in_review', 'approved')" a array.
 */
function parseNotInString(str: string): string[] {
  const match = str.match(/\(([^)]*)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * Construye el objeto de proyección para select.
 * '*' = todos los campos, 'id, name' = campos específicos.
 */
export function buildProjection(select?: string): Record<string, number> | null {
  if (!select || select === '*') return null;
  const fields = select.split(',').map((f) => f.trim());
  const projection: Record<string, number> = {};
  for (const field of fields) {
    if (field) projection[field] = 1;
  }
  return Object.keys(projection).length > 0 ? projection : null;
}
