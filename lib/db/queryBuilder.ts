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

  // contains: array field contains value(s) - MongoDB: { key: value } o { key: { $all: values } }
  if (filters.contains) {
    for (const [key, values] of Object.entries(filters.contains)) {
      if (Array.isArray(values) && values.length > 0) {
        (query as Record<string, unknown>)[key] =
          values.length === 1 ? values[0] : { $all: values };
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

  if (filters.gte) {
    for (const [key, value] of Object.entries(filters.gte)) {
      if (value !== undefined && value !== null) {
        const existing = (query as Record<string, unknown>)[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          (existing as Record<string, unknown>).$gte = value;
        } else {
          (query as Record<string, unknown>)[key] = { $gte: value };
        }
      }
    }
  }

  if (filters.lte) {
    for (const [key, value] of Object.entries(filters.lte)) {
      if (value !== undefined && value !== null) {
        const existing = (query as Record<string, unknown>)[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          (existing as Record<string, unknown>).$lte = value;
        } else {
          (query as Record<string, unknown>)[key] = { $lte: value };
        }
      }
    }
  }

  if (filters.gt) {
    for (const [key, value] of Object.entries(filters.gt)) {
      if (value !== undefined && value !== null) {
        const existing = (query as Record<string, unknown>)[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          (existing as Record<string, unknown>).$gt = value;
        } else {
          (query as Record<string, unknown>)[key] = { $gt: value };
        }
      }
    }
  }

  if (filters.lt) {
    for (const [key, value] of Object.entries(filters.lt)) {
      if (value !== undefined && value !== null) {
        const existing = (query as Record<string, unknown>)[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          (existing as Record<string, unknown>).$lt = value;
        } else {
          (query as Record<string, unknown>)[key] = { $lt: value };
        }
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
 * Si el select contiene sintaxis de joins (ej: tasks!inner(...)), no aplicar proyección
 * para evitar que Mongoose devuelva solo _id (los campos de join no existen en el doc).
 */
export function buildProjection(select?: string): Record<string, number> | null {
  if (!select || select === '*') return null;
  // Si hay joins (Supabase-style), no proyectar: devolveríamos solo _id
  if (select.includes('!') || select.includes('(')) return null;
  const fields = select.split(',').map((f) => f.trim());
  const projection: Record<string, number> = {};
  for (const field of fields) {
    if (field && !field.includes('!') && !field.includes('(')) projection[field] = 1;
  }
  return Object.keys(projection).length > 0 ? projection : null;
}
