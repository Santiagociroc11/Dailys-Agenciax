import type { QueryRequest, QueryResponse } from './types.js';
import { getModel } from './models.js';
import { buildMongoFilter, buildProjection } from './queryBuilder.js';
import { hasJoinSyntax, buildAggregationPipeline } from './aggregationBuilder.js';

const JOIN_RELATIONS: Record<string, Record<string, { table: string; localField: string; foreignField: string }>> = {
  tasks: { projects: { table: 'projects', localField: 'project_id', foreignField: 'id' } },
  subtasks: { tasks: { table: 'tasks', localField: 'task_id', foreignField: 'id' } },
  work_sessions: {
    task_work_assignments: { table: 'task_work_assignments', localField: 'assignment_id', foreignField: 'id' },
  },
};

/**
 * Ejecuta una query contra MongoDB usando los modelos Mongoose.
 * Maneja select, insert, update, delete y upsert.
 */
export async function executeQuery<T = unknown>(
  request: QueryRequest
): Promise<QueryResponse<T>> {
  try {
    const model = getModel(request.table);
    if (!model) {
      return {
        data: null,
        error: { message: `Tabla desconocida: ${request.table}`, code: 'PGRST204' },
      };
    }

    const filtersWithoutJoins = request.filters ? stripJoinFilters(request.filters) : undefined;
    let filters = filtersWithoutJoins ? buildMongoFilter(filtersWithoutJoins) : {};

    if (request.filters?.eq) {
      const resolved = await resolveJoinFilters(
        request.table,
        request.filters.eq as Record<string, unknown>
      );
      if (Object.keys(resolved).length > 0) {
        filters = { ...filters, ...resolved };
      }
    }
    if (request.filters?.in) {
      const resolved = await resolveJoinFiltersForIn(
        request.table,
        request.filters.in as Record<string, unknown[]>
      );
      if (Object.keys(resolved).length > 0) {
        filters = { ...filters, ...resolved };
      }
    }
    const projection = buildProjection(request.select);
    const useAggregation = hasJoinSyntax(request.select);

    switch (request.operation) {
      case 'select':
        return (await executeSelect(model, request, filters, projection, useAggregation)) as QueryResponse<T>;
      case 'insert':
        return (await executeInsert(model, request)) as QueryResponse<T>;
      case 'update':
        return (await executeUpdate(model, request, filters)) as QueryResponse<T>;
      case 'delete':
        return (await executeDelete(model, filters, request.single)) as QueryResponse<T>;
      case 'upsert':
        return (await executeUpsert(model, request)) as QueryResponse<T>;
      default:
        return {
          data: null,
          error: { message: `Operación no soportada: ${request.operation}` },
        };
    }
  } catch (err) {
    const error = err as Error;
    return {
      data: null,
      error: {
        message: error.message,
        code: 'PGRST301',
      },
    };
  }
}

async function executeSelect(
  model: { find: Function; findOne: Function; aggregate: Function },
  request: QueryRequest,
  filters: Record<string, unknown>,
  projection: Record<string, number> | null,
  useAggregation = false
): Promise<QueryResponse> {
  if (useAggregation && !request.single) {
    const pipeline = buildAggregationPipeline(
      request.table,
      request.select,
      filters as import('mongoose').FilterQuery<unknown>,
      request.order,
      request.limit,
      request.offset
    );
    const data = await model.aggregate(pipeline).exec();
    return { data: Array.isArray(data) ? data : [], error: null };
  }

  let query = request.single
    ? model.findOne(filters)
    : model.find(filters);

  if (projection) {
    query = query.select(projection);
  }

  if (request.order) {
    const sort = { [request.order.column]: request.order.ascending ? 1 : -1 };
    query = query.sort(sort);
  }

  if (request.limit && !request.single) {
    query = query.limit(request.limit);
  }
  if (request.offset && !request.single) {
    query = query.skip(request.offset);
  }

  const data = await query.lean().exec();

  if (request.single) {
    return { data: data ?? null, error: null };
  }
  return { data: Array.isArray(data) ? data : [], error: null };
}

async function executeInsert(
  model: { create: Function; insertMany: Function },
  request: QueryRequest
): Promise<QueryResponse> {
  const data = request.data;
  if (!data) {
    return { data: null, error: { message: 'Falta el campo data para insert' } };
  }

  const items = Array.isArray(data) ? data : [data];
  const created = await model.create(items);
  const result = Array.isArray(created) ? created : [created];
  const plain = result.map((doc: { toObject?: () => unknown }) =>
    doc.toObject ? doc.toObject() : doc
  );

  return {
    data: request.single ? plain[0] ?? null : plain,
    error: null,
  };
}

async function executeUpdate(
  model: { updateMany: Function; findOneAndUpdate: Function; find: Function },
  request: QueryRequest,
  filters: Record<string, unknown>
): Promise<QueryResponse> {
  const data = request.data as Record<string, unknown>;
  if (!data) {
    return { data: null, error: { message: 'Falta el campo data para update' } };
  }

  if (request.single) {
    const updated = await model.findOneAndUpdate(
      filters,
      { $set: data },
      { new: true }
    ).lean().exec();
    return { data: updated ?? null, error: null };
  }

  await model.updateMany(filters, { $set: data }).exec();
  const results = await model.find(filters).lean().exec();
  return { data: results, error: null };
}

async function executeDelete(
  model: { deleteMany: Function; findOneAndDelete: Function },
  filters: Record<string, unknown>,
  single?: boolean
): Promise<QueryResponse> {
  if (single) {
    const deleted = await model.findOneAndDelete(filters).lean().exec();
    return { data: deleted ?? null, error: null };
  }
  const result = await model.deleteMany(filters).exec();
  return { data: result, error: null };
}

async function executeUpsert(
  model: {
    findOne: Function;
    findOneAndUpdate: Function;
    create: Function;
  },
  request: QueryRequest
): Promise<QueryResponse> {
  const data = request.data;
  if (!data) {
    return { data: null, error: { message: 'Falta el campo data para upsert' } };
  }

  const items = Array.isArray(data) ? data : [data];
  const results: unknown[] = [];

  for (const item of items) {
    const record = item as Record<string, unknown>;
    const keys = getUniqueKeysFromConflict(
      request.upsertOptions?.onConflict
    );
    const filter: Record<string, unknown> = {};
    for (const key of keys) {
      if (record[key] !== undefined) {
        filter[key] = record[key];
      }
    }

    if (Object.keys(filter).length === 0) {
      const created = await model.create([record]);
      results.push(created[0]?.toObject?.() ?? created[0]);
    } else {
      const updated = await model.findOneAndUpdate(
        filter,
        { $set: record },
        { new: true, upsert: true }
      ).lean().exec();
      results.push(updated);
    }
  }

  return {
    data: request.single ? results[0] ?? null : results,
    error: null,
  };
}

function getUniqueKeysFromConflict(onConflict?: string): string[] {
  if (!onConflict) return ['id'];
  return onConflict.split(',').map((k) => k.trim());
}

function stripJoinFilters(filters: NonNullable<QueryRequest['filters']>): typeof filters {
  let eq = filters.eq ? { ...filters.eq } : undefined;
  let inFilter = filters.in ? { ...filters.in } : undefined;
  if (eq) {
    for (const key of Object.keys(eq)) {
      if (key.includes('.')) delete eq[key];
    }
    eq = Object.keys(eq).length > 0 ? eq : undefined;
  }
  if (inFilter) {
    for (const key of Object.keys(inFilter)) {
      if (key.includes('.')) delete inFilter[key];
    }
    inFilter = Object.keys(inFilter).length > 0 ? inFilter : undefined;
  }
  return { ...filters, eq, in: inFilter };
}

async function resolveJoinFilters(
  table: string,
  eq: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(eq)) {
    if (!key.includes('.')) continue;

    const parts = key.split('.');
    if (parts.length === 2) {
      const [relationName, field] = parts;
      const relations = JOIN_RELATIONS[table];
      const relation = relations?.[relationName];
      if (relation) {
        const relatedModel = getModel(relation.table);
        if (relatedModel) {
          const docs = await relatedModel
            .find({ [field]: value })
            .select(relation.foreignField)
            .lean()
            .exec();
          const ids = docs
            .map((d: Record<string, unknown>) => d[relation.foreignField])
            .filter(Boolean);
          result[relation.localField] = ids.length > 0 ? { $in: ids } : { $in: [] };
        }
      }
    } else if (parts.length === 3) {
      const [rel1, rel2, field] = parts;
      if (table === 'subtasks' && rel1 === 'tasks' && rel2 === 'projects') {
        const projectModel = getModel('projects');
        const taskModel = getModel('tasks');
        if (projectModel && taskModel) {
          const projects = await projectModel
            .find({ [field]: value })
            .select('id')
            .lean()
            .exec();
          const projectIds = projects.map((p: Record<string, unknown>) => p.id).filter(Boolean);
          if (projectIds.length > 0) {
            const tasks = await taskModel
              .find({ project_id: { $in: projectIds } })
              .select('id')
              .lean()
              .exec();
            const taskIds = tasks.map((t: Record<string, unknown>) => t.id).filter(Boolean);
            result['task_id'] = taskIds.length > 0 ? { $in: taskIds } : { $in: [] };
          } else {
            result['task_id'] = { $in: [] };
          }
        }
      }
    }
  }
  return result;
}

async function resolveJoinFiltersForIn(
  table: string,
  inFilter: Record<string, unknown[]>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, values] of Object.entries(inFilter)) {
    if (!key.includes('.') || !Array.isArray(values) || values.length === 0) continue;

    const parts = key.split('.');
    if (parts.length === 2) {
      const [relationName, field] = parts;
      const relations = JOIN_RELATIONS[table];
      const relation = relations?.[relationName];
      if (relation) {
        const relatedModel = getModel(relation.table);
        if (relatedModel) {
          const docs = await relatedModel
            .find({ [field]: { $in: values } })
            .select(relation.foreignField)
            .lean()
            .exec();
          const ids = docs
            .map((d: Record<string, unknown>) => d[relation.foreignField])
            .filter(Boolean);
          result[relation.localField] = ids.length > 0 ? { $in: ids } : { $in: [] };
        }
      }
    } else if (parts.length === 3) {
      const [rel1, rel2, field] = parts;
      if (table === 'subtasks' && rel1 === 'tasks' && rel2 === 'projects') {
        const projectModel = getModel('projects');
        const taskModel = getModel('tasks');
        if (projectModel && taskModel) {
          const projects = await projectModel
            .find({ [field]: { $in: values } })
            .select('id')
            .lean()
            .exec();
          const projectIds = projects.map((p: Record<string, unknown>) => p.id).filter(Boolean);
          if (projectIds.length > 0) {
            const tasks = await taskModel
              .find({ project_id: { $in: projectIds } })
              .select('id')
              .lean()
              .exec();
            const taskIds = tasks.map((t: Record<string, unknown>) => t.id).filter(Boolean);
            result['task_id'] = taskIds.length > 0 ? { $in: taskIds } : { $in: [] };
          } else {
            result['task_id'] = { $in: [] };
          }
        }
      }
    }
  }
  return result;
}
