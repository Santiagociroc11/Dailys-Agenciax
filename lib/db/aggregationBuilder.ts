/**
 * Construye pipelines de agregación MongoDB con $lookup para joins nativos.
 * Aprovecha la ventaja de MongoDB sobre SQL: un solo round-trip, sin N+1.
 */

import type { PipelineStage } from 'mongoose';
import type { FilterQuery } from 'mongoose';

export interface LookupConfig {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  inner?: boolean;
  nested?: (LookupConfig & { addToPath?: string })[];
}

/** Relaciones conocidas: tabla -> relación -> config */
const LOOKUP_CONFIG: Record<string, Record<string, LookupConfig>> = {
  tasks: {
    projects: {
      from: 'projects',
      localField: 'project_id',
      foreignField: 'id',
      as: 'projects',
      inner: true,
    },
  },
  subtasks: {
    tasks: {
      from: 'tasks',
      localField: 'task_id',
      foreignField: 'id',
      as: 'tasks',
      inner: true,
      nested: [
        {
          from: 'projects',
          localField: 'project_id',
          foreignField: 'id',
          as: 'projects',
          inner: true,
        },
      ],
    },
  },
  task_work_assignments: {
    tasks: {
      from: 'tasks',
      localField: 'task_id',
      foreignField: 'id',
      as: 'tasks',
      inner: false,
      nested: [
        {
          from: 'projects',
          localField: 'project_id',
          foreignField: 'id',
          as: 'projects',
          inner: false,
        },
      ],
    },
    subtasks: {
      from: 'subtasks',
      localField: 'subtask_id',
      foreignField: 'id',
      as: 'subtasks',
      inner: false,
      nested: [
        {
          from: 'tasks',
          localField: 'task_id',
          foreignField: 'id',
          as: 'tasks',
          inner: false,
        },
        {
          from: 'projects',
          localField: 'tasks.project_id',
          foreignField: 'id',
          as: 'projects',
          inner: false,
          addToPath: 'tasks.projects',
        },
      ],
    },
  },
  work_sessions: {
    task_work_assignments: {
      from: 'task_work_assignments',
      localField: 'assignment_id',
      foreignField: 'id',
      as: 'task_work_assignments',
      inner: true,
      nested: [
        {
          from: 'tasks',
          localField: 'task_id',
          foreignField: 'id',
          as: 'tasks',
          inner: false,
          nested: [
            {
              from: 'projects',
              localField: 'project_id',
              foreignField: 'id',
              as: 'projects',
              inner: false,
            },
          ],
        },
        {
          from: 'subtasks',
          localField: 'subtask_id',
          foreignField: 'id',
          as: 'subtasks',
          inner: false,
          nested: [
            {
              from: 'tasks',
              localField: 'task_id',
              foreignField: 'id',
              as: 'tasks',
              inner: false,
            },
            {
              from: 'projects',
              localField: 'tasks.project_id',
              foreignField: 'id',
              as: 'projects',
              inner: false,
              addToPath: 'tasks.projects',
            },
          ],
        },
      ],
    },
  },
};

/**
 * Detecta si el select contiene sintaxis de joins (Supabase-style).
 */
export function hasJoinSyntax(select?: string): boolean {
  if (!select || select.trim() === '') return false;
  return /[\w]+\!?(?:inner)?\s*\(/.test(select) || select.includes('(');
}

/**
 * Extrae las relaciones del select (ej: "tasks", "projects!inner").
 */
function parseJoinRelations(select: string): Array<{ name: string; inner: boolean }> {
  const relations: Array<{ name: string; inner: boolean }> = [];
  // Buscar patrones: relationName o relationName!inner seguido de (
  const regex = /(\w+)(\!inner)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(select)) !== null) {
    const name = m[1];
    const inner = !!m[2];
    if (!relations.some((r) => r.name === name)) {
      relations.push({ name, inner });
    }
  }
  return relations;
}

/**
 * Construye stages de $lookup y $unwind para las relaciones detectadas.
 */
function buildLookupStages(
  table: string,
  relations: Array<{ name: string; inner: boolean }>
): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const tableConfig = LOOKUP_CONFIG[table];
  if (!tableConfig) return stages;

  for (const { name, inner } of relations) {
    const config = tableConfig[name];
    if (!config) continue;

    // $lookup principal
    stages.push({
      $lookup: {
        from: config.from,
        localField: config.localField,
        foreignField: config.foreignField,
        as: config.as,
      },
    });

    // $unwind para inner join (un solo objeto, no array)
    stages.push({
      $unwind: {
        path: `$${config.as}`,
        preserveNullAndEmptyArrays: !inner,
      },
    });

    // Lookups anidados (ej: tasks -> projects dentro de subtasks)
    if (config.nested?.length) {
      for (const nested of config.nested) {
        // $lookup anidado: la colección "from" se une al resultado del unwind anterior
        stages.push({
          $lookup: {
            from: nested.from,
            localField: `${config.as}.${nested.localField}`,
            foreignField: nested.foreignField,
            as: `${config.as}_${nested.as}`,
          },
        });
        stages.push({
          $unwind: {
            path: `$${config.as}_${nested.as}`,
            preserveNullAndEmptyArrays: !nested.inner,
          },
        });
        // Mover el resultado al objeto padre (tasks.projects o el path indicado)
        const addPath = (nested as { addToPath?: string }).addToPath ?? nested.as;
        stages.push({
          $addFields: {
            [`${config.as}.${addPath}`]: `$${config.as}_${nested.as}`,
          },
        });
        stages.push({
          $project: { [`${config.as}_${nested.as}`]: 0 },
        });
      }
    }
  }
  return stages;
}

/**
 * Construye el pipeline de agregación completo.
 */
export function buildAggregationPipeline(
  table: string,
  select: string | undefined,
  matchFilter: FilterQuery<unknown>,
  order?: { column: string; ascending: boolean },
  limit?: number,
  offset?: number
): PipelineStage[] {
  const pipeline: PipelineStage[] = [];

  // 1. $match
  if (Object.keys(matchFilter).length > 0) {
    pipeline.push({ $match: matchFilter });
  }

  // 2. $lookup + $unwind si hay joins
  if (hasJoinSyntax(select)) {
    const relations = parseJoinRelations(select);
    const lookupStages = buildLookupStages(table, relations);
    pipeline.push(...lookupStages);
  }

  // 3. $sort
  if (order) {
    pipeline.push({
      $sort: { [order.column]: order.ascending ? 1 : -1 },
    });
  }

  // 4. $skip
  if (offset && offset > 0) {
    pipeline.push({ $skip: offset });
  }

  // 5. $limit
  if (limit && limit > 0) {
    pipeline.push({ $limit: limit });
  }

  return pipeline;
}
