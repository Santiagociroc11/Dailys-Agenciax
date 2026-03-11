/**
 * Debug: por qué las work_sessions no aparecen en el Gantt de equipo (Vista semana).
 *
 * Ejecuta la misma lógica de consulta que DailyHoursControl.fetchWeeklyTeamGanttData
 * para identificar si el fallo está en: query de fechas, join assignment_id,
 * o filtro por proyecto.
 *
 * Uso: npx tsx scripts/debug-gantt-equipo-work-sessions.ts [startDate] [endDate]
 * Ejemplo: npx tsx scripts/debug-gantt-equipo-work-sessions.ts 2026-03-09 2026-03-15
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { WorkSession, TaskWorkAssignment, Project } from '../models/index.js';
import { buildAggregationPipeline } from '../lib/db/aggregationBuilder.js';
import type { FilterQuery } from 'mongoose';

function getCurrentWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : -(day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(monday), endDate: fmt(sunday) };
}

const startDate = process.argv[2] || getCurrentWeekRange().startDate;
const endDate = process.argv[3] || getCurrentWeekRange().endDate;
const verbose = process.argv.includes('--verbose');

const startISO = new Date(startDate + 'T00:00:00').toISOString();
const endISO = new Date(endDate + 'T23:59:59.999').toISOString();

const WORK_SESSIONS_SELECT = `
  id, assignment_id, duration_minutes, created_at,
  task_work_assignments!inner(
    id, user_id, task_id, subtask_id, task_type, date, project_id,
    tasks(id, title, project_id, projects(name)),
    subtasks(id, title, task_id, tasks(id, title, projects(name)))
  )
`;

async function main() {
  await connectDB();

  console.log('\n=== DEBUG GANTT EQUIPO: WORK SESSIONS ===');
  console.log(`Semana: ${startDate} a ${endDate}`);
  console.log(`startISO: ${startISO}`);
  console.log(`endISO: ${endISO}\n`);

  // --- 1. WORK_SESSIONS (sin join, filtro fecha) ---
  const dateFilter: FilterQuery<unknown> = {
    $or: [
      { createdAt: { $gte: new Date(startISO), $lte: new Date(endISO) } },
      { created_at: { $gte: new Date(startISO), $lte: new Date(endISO) } },
    ],
  };

  const workSessionsRaw = await WorkSession.find(dateFilter)
    .select('id assignment_id duration_minutes createdAt created_at')
    .lean()
    .exec();

  console.log('--- 1. WORK_SESSIONS (sin join, filtro fecha) ---');
  console.log(`Total: ${workSessionsRaw.length}`);
  if (workSessionsRaw.length > 0) {
    const sample = workSessionsRaw[0] as {
      id: string;
      assignment_id: string;
      duration_minutes?: number;
      createdAt?: Date;
      created_at?: Date;
    };
    console.log(
      `Muestra: id=${sample.id?.slice(0, 8)}... assignment_id=${sample.assignment_id?.slice(0, 8)}... duration=${sample.duration_minutes} min createdAt=${sample.createdAt ?? 'N/A'} created_at=${sample.created_at ?? 'N/A'}`
    );
    if (verbose) {
      workSessionsRaw.slice(0, 3).forEach((s, i) => {
        const d = s as { id: string; assignment_id: string; duration_minutes?: number; createdAt?: Date; created_at?: Date };
        console.log(`  [${i}] ${JSON.stringify(d)}`);
      });
    }
  }
  console.log('');

  // --- 2. TASK_WORK_ASSIGNMENTS (date en rango) ---
  const assignments = await TaskWorkAssignment.find({
    date: { $gte: startDate, $lte: endDate },
  })
    .select('id user_id date project_id task_id subtask_id task_type')
    .lean()
    .exec();

  console.log('--- 2. TASK_WORK_ASSIGNMENTS (date en rango) ---');
  console.log(`Total: ${assignments.length}`);
  const sampleIds = assignments.slice(0, 5).map((a) => (a as { id: string }).id);
  console.log(`assignment_ids (primeros 5): ${sampleIds.join(', ')}`);
  console.log('');

  // --- 3. COINCIDENCIA assignment_id ---
  const allAssignmentIds = await TaskWorkAssignment.find({})
    .select('id')
    .lean()
    .exec();
  const assignmentIdsSet = new Set(allAssignmentIds.map((a) => (a as { id: string }).id));

  const wsAssignmentIds = [...new Set(workSessionsRaw.map((s) => (s as { assignment_id: string }).assignment_id))];
  const orphaned = wsAssignmentIds.filter((id) => !assignmentIdsSet.has(id));

  console.log('--- 3. COINCIDENCIA assignment_id ---');
  console.log(
    `work_sessions con assignment_id que NO existe en task_work_assignments (en toda la BD): ${orphaned.length}`
  );
  if (orphaned.length > 0) {
    console.log(`  (inner join eliminaría estas ${orphaned.length} sesiones)`);
    console.log(`  IDs huérfanos (primeros 5): ${orphaned.slice(0, 5).join(', ')}`);
  }
  console.log('');

  // --- 4. AGREGACIÓN COMPLETA (con join) ---
  const matchFilter: FilterQuery<unknown> = { ...dateFilter };
  const pipeline = buildAggregationPipeline(
    'work_sessions',
    WORK_SESSIONS_SELECT,
    matchFilter
  );

  const aggregated = await WorkSession.aggregate(pipeline).exec();

  console.log('--- 4. AGREGACIÓN COMPLETA (con join) ---');
  console.log(`Total después de $lookup + $unwind inner: ${aggregated.length}`);
  if (verbose && aggregated.length > 0) {
    console.log('Pipeline stages:', JSON.stringify(pipeline.map((s) => Object.keys(s)[0]), null, 2));
  }
  console.log('');

  // --- 5. ESTRUCTURA (muestra 1 doc) ---
  console.log('--- 5. ESTRUCTURA (muestra 1 doc) ---');
  if (aggregated.length > 0) {
    const doc = aggregated[0] as {
      id: string;
      assignment_id: string;
      duration_minutes?: number;
      task_work_assignments?: {
        id: string;
        user_id: string;
        task_id?: string;
        subtask_id?: string;
        task_type: string;
        date: string;
        project_id?: string | null;
        tasks?: unknown;
        subtasks?: unknown;
      };
    };
    const twa = doc.task_work_assignments;
    if (twa) {
      console.log(
        `task_work_assignments: { user_id: ${twa.user_id?.slice(0, 8)}..., task_type: ${twa.task_type}, date: ${twa.date}, project_id: ${twa.project_id ?? 'null'}, tasks: ${twa.tasks ? 'OK' : 'null'}, subtasks: ${twa.subtasks ? 'OK' : 'null'} }`
      );
    } else {
      console.log('task_work_assignments: null (join falló)');
    }
    if (verbose) {
      console.log(JSON.stringify(doc, null, 2).slice(0, 1500) + '...');
    }
  } else {
    console.log('Sin documentos para mostrar.');
  }
  console.log('');

  // --- 6. FILTRO POR PROYECTO ---
  const activeProjects = await Project.find({ is_archived: false })
    .select('id')
    .lean()
    .exec();
  const activeProjectIds = new Set(activeProjects.map((p) => (p as { id: string }).id));
  const filterByProject = (projectId: string | null) =>
    activeProjectIds.size === 0 || !projectId || activeProjectIds.has(projectId);

  const filteredByProject = aggregated.filter((d) => {
    const twa = (d as { task_work_assignments?: { project_id?: string | null } }).task_work_assignments;
    return twa && filterByProject(twa.project_id);
  });

  console.log('--- 6. FILTRO POR PROYECTO ---');
  console.log(`Proyectos activos: ${activeProjectIds.size}`);
  console.log(`Sesiones después de filtrar por project_id en activos: ${filteredByProject.length}`);
  const withNullProject = aggregated.filter((d) => {
    const twa = (d as { task_work_assignments?: { project_id?: string | null } }).task_work_assignments;
    return twa && !twa.project_id;
  });
  const withArchivedProject = aggregated.filter((d) => {
    const twa = (d as { task_work_assignments?: { project_id?: string | null } }).task_work_assignments;
    return twa && twa.project_id && !activeProjectIds.has(twa.project_id);
  });
  if (withNullProject.length > 0 || withArchivedProject.length > 0) {
    console.log(`  Sesiones con project_id null: ${withNullProject.length}`);
    console.log(`  Sesiones con project_id archivado: ${withArchivedProject.length}`);
  }
  console.log('');

  // Resumen diagnóstico
  console.log('=== RESUMEN DIAGNÓSTICO ===');
  if (workSessionsRaw.length === 0) {
    console.log('CAUSA PROBABLE: No hay work_sessions en el rango de fechas.');
    console.log('  - Verificar createdAt/created_at en MongoDB.');
    console.log('  - Verificar timezone (startISO/endISO).');
  } else if (aggregated.length === 0) {
    console.log('CAUSA PROBABLE: El inner join con task_work_assignments elimina todas las sesiones.');
    console.log(`  - ${orphaned.length} assignment_ids no tienen match en task_work_assignments.`);
    console.log('  - Revisar si assignment_id en work_sessions coincide con id en task_work_assignments.');
  } else if (filteredByProject.length === 0 && aggregated.length > 0) {
    console.log('CAUSA PROBABLE: Todas las sesiones se filtran por proyecto (null o archivado).');
  } else {
    console.log(`OK: ${filteredByProject.length} sesiones llegarían al Gantt.`);
  }
  console.log('\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
