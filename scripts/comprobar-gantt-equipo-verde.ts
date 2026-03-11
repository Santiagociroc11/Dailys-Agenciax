/**
 * Comprueba por qué las barras verdes (work_sessions) no aparecen en el Gantt de equipo.
 * Replica la lógica exacta de DailyHoursControl.fetchWeeklyTeamGanttData.
 *
 * Uso: npx tsx scripts/comprobar-gantt-equipo-verde.ts [startDate] [endDate]
 * Ejemplo: npx tsx scripts/comprobar-gantt-equipo-verde.ts 2026-03-09 2026-03-15
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { format } from 'date-fns';
import { connectDB } from '../lib/mongoose.js';
import {
  WorkSession,
  TaskWorkAssignment,
  Project,
  User,
} from '../models/index.js';
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

const startISO = new Date(startDate + 'T00:00:00').toISOString();
const endISO = new Date(endDate + 'T23:59:59.999').toISOString();

const weekDays = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
function getWeekDays(baseDate: Date): { dateStr: string; dayShort: string }[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : -(day - 1);
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const result: { dateStr: string; dayShort: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    result.push({
      dateStr: format(dayDate, 'yyyy-MM-dd'),
      dayShort: weekDays[i],
    });
  }
  return result;
}

async function main() {
  await connectDB();

  console.log('\n=== COMPROBAR GANTT EQUIPO - BARRAS VERDES ===');
  console.log(`Semana: ${startDate} a ${endDate}`);
  console.log(`startISO: ${startISO}`);
  console.log(`endISO: ${endISO}\n`);

  const weekDaysForFetch = getWeekDays(new Date(startDate));

  // 1. Proyectos activos
  const activeProjects = await Project.find({ is_archived: false }).select('id').lean().exec();
  const activeProjectIds = new Set(activeProjects.map((p) => (p as { id: string }).id));
  const filterByProject = (projectId: string | null) =>
    activeProjectIds.size === 0 || !projectId || activeProjectIds.has(projectId);

  // 2. Usuarios activos
  const users = await User.find({ is_active: { $ne: false } }).select('id name email').lean().exec();
  const userList = users.map((u) => ({
    id: (u as { id: string }).id,
    name: (u as { name?: string }).name || (u as { email: string }).email,
    email: (u as { email: string }).email,
  }));

  // 3. Assignments (date en rango) con tasks/subtasks
  const assignmentsRaw = await TaskWorkAssignment.aggregate([
    { $match: { date: { $gte: startDate, $lte: endDate } } },
    {
      $lookup: {
        from: 'tasks',
        localField: 'task_id',
        foreignField: 'id',
        as: 'tasks',
      },
    },
    { $unwind: { path: '$tasks', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'subtasks',
        localField: 'subtask_id',
        foreignField: 'id',
        as: 'subtasks',
      },
    },
    { $unwind: { path: '$subtasks', preserveNullAndEmptyArrays: true } },
  ]).exec();

  const filterAssignments = assignmentsRaw.filter((a: { project_id?: string | null }) =>
    filterByProject(a.project_id)
  );

  // 4. assignmentIdToUserAndTaskKey (igual que el frontend)
  const assignmentIdToUserAndTaskKey = new Map<string, { user_id: string; taskKey: string }>();
  const assignmentTaskKeysByUser = new Map<string, Set<string>>();

  for (const a of filterAssignments) {
    const taskData = a.task_type === 'subtask' ? a.subtasks : a.tasks;
    if (!taskData) continue;
    const aRefId = a.task_type === 'subtask' ? a.subtask_id : a.task_id;
    if (!aRefId) continue;
    const taskKey = `${a.task_type}-${aRefId}`;
    if (a.id) {
      assignmentIdToUserAndTaskKey.set(String(a.id), { user_id: a.user_id, taskKey });
    }
    if (!assignmentTaskKeysByUser.has(a.user_id)) {
      assignmentTaskKeysByUser.set(a.user_id, new Set());
    }
    assignmentTaskKeysByUser.get(a.user_id)!.add(taskKey);
  }

  console.log('--- 1. ASIGNACIONES (date en rango, proyectos activos) ---');
  console.log(`Total: ${filterAssignments.length}`);
  console.log(`assignmentIdToUserAndTaskKey size: ${assignmentIdToUserAndTaskKey.size}`);
  console.log('');

  // 5. Work sessions con join (agregación)
  const dateFilter: FilterQuery<unknown> = {
    $or: [
      { createdAt: { $gte: new Date(startISO), $lte: new Date(endISO) } },
      { created_at: { $gte: new Date(startISO), $lte: new Date(endISO) } },
    ],
  };

  const WORK_SESSIONS_SELECT = `
    id, assignment_id, duration_minutes, created_at,
    task_work_assignments!inner(
      id, user_id, task_id, subtask_id, task_type, date, project_id,
      tasks(id, title, project_id, projects(name)),
      subtasks(id, title, task_id, tasks(id, title, projects(name)))
    )
  `;

  const pipeline = buildAggregationPipeline('work_sessions', WORK_SESSIONS_SELECT, dateFilter);
  const aggregated = await WorkSession.aggregate(pipeline).exec();

  const sessionList = aggregated.filter((d: { task_work_assignments?: { project_id?: string | null } }) => {
    const twa = d.task_work_assignments;
    return twa && filterByProject(twa.project_id);
  });

  console.log('--- 2. WORK_SESSIONS (agregación con join, filtro proyecto) ---');
  console.log(`Total: ${sessionList.length}`);
  console.log('');

  // 6. Procesar work_sessions igual que el frontend
  const sessionsByUserTask: Record<string, Record<string, Record<string, Array<{ duration_minutes?: number }>>>> = {};

  let matchedByAssignId = 0;
  let usedFallback = 0;
  let skippedNoTaskKey = 0;

  for (const s of sessionList) {
    const rawAssign = s.task_work_assignments;
    const assign = Array.isArray(rawAssign) ? rawAssign[0] : rawAssign;
    if (!assign) continue;

    const assignId = String(s.assignment_id || (assign as { id?: string }).id || '');
    const mapped = assignmentIdToUserAndTaskKey.get(assignId);
    if (mapped) matchedByAssignId++;

    const user_id = mapped?.user_id ?? (assign as { user_id?: string }).user_id;
    const taskKey =
      mapped?.taskKey ??
      (() => {
        usedFallback++;
        const refId =
          (assign as { task_type?: string }).task_type === 'subtask'
            ? (assign as { subtask_id?: string }).subtask_id ??
              (assign as { subtasks?: { id?: string } }).subtasks?.id
            : (assign as { task_id?: string }).task_id ?? (assign as { tasks?: { id?: string } }).tasks?.id;
        const t = (assign as { task_type?: string }).task_type;
        return refId && t ? `${t}-${refId}` : null;
      })();

    if (!taskKey) {
      skippedNoTaskKey++;
      continue;
    }

    const created = (s as { createdAt?: string; created_at?: string }).createdAt ?? (s as { created_at?: string }).created_at;
    const sessionDate = created ? format(new Date(created), 'yyyy-MM-dd') : (assign as { date: string }).date;

    if (!sessionsByUserTask[user_id]) sessionsByUserTask[user_id] = {};
    if (!sessionsByUserTask[user_id][taskKey]) sessionsByUserTask[user_id][taskKey] = {};
    if (!sessionsByUserTask[user_id][taskKey][sessionDate]) {
      sessionsByUserTask[user_id][taskKey][sessionDate] = [];
    }
    sessionsByUserTask[user_id][taskKey][sessionDate].push({
      duration_minutes: (s as { duration_minutes?: number }).duration_minutes ?? 0,
    });
  }

  console.log('--- 3. MATCH assignment_id ---');
  console.log(`work_sessions con assignment_id en el mapa (semana): ${matchedByAssignId}/${sessionList.length}`);
  console.log(`work_sessions que usaron fallback (taskKey desde assign): ${usedFallback}`);
  console.log(`work_sessions saltadas (sin taskKey): ${skippedNoTaskKey}`);
  console.log('');

  // 7. Por usuario: taskKeys de assignments vs taskKeys con workSessions
  console.log('--- 4. POR USUARIO: taskKey match ---');

  for (const u of userList) {
    const assignKeys = assignmentTaskKeysByUser.get(u.id);
    const wsKeys = sessionsByUserTask[u.id] ? Object.keys(sessionsByUserTask[u.id]) : [];
    if (!assignKeys || assignKeys.size === 0) continue;

    const match = [...assignKeys].filter((k) => wsKeys.includes(k));
    const noMatch = [...assignKeys].filter((k) => !wsKeys.includes(k));
    const extraWs = wsKeys.filter((k) => !assignKeys.has(k));

    const totalMinutes = wsKeys.reduce((sum, tk) => {
      const byDate = sessionsByUserTask[u.id][tk];
      return sum + Object.values(byDate).flat().reduce((s, x) => s + (x.duration_minutes ?? 0), 0);
    }, 0);

    console.log(`\n${u.name}:`);
    console.log(`  Assignments taskKeys: ${assignKeys.size} | WorkSessions taskKeys: ${wsKeys.length}`);
    console.log(`  Match (tendrían verde): ${match.length} | No match: ${noMatch.length} | Extra (solo EXTRA): ${extraWs.length}`);
    console.log(`  Total min desde workSessions: ${totalMinutes} (${(totalMinutes / 60).toFixed(1)}h)`);

    if (noMatch.length > 0 && noMatch.length <= 5) {
      console.log(`  No match taskKeys: ${noMatch.join(', ')}`);
    } else if (noMatch.length > 5) {
      console.log(`  No match taskKeys (primeros 5): ${noMatch.slice(0, 5).join(', ')}...`);
    }

    if (match.length > 0) {
      console.log(`  Match taskKeys (tendrían verde): ${match.slice(0, 5).join(', ')}${match.length > 5 ? '...' : ''}`);
    }
  }

  console.log('\n--- 5. RESUMEN ---');
  if (matchedByAssignId === 0 && sessionList.length > 0) {
    console.log('PROBLEMA: Ninguna work_session tiene assignment_id que coincida con assignments de la semana.');
    console.log('  Las work_sessions son de asignaciones de OTRAS semanas (retrabajo).');
    console.log('  El fallback usa taskKey desde assign; si taskKey coincide con assignments, debería funcionar.');
  } else if (matchedByAssignId > 0) {
    console.log(`OK: ${matchedByAssignId} work_sessions tienen assignment_id en la semana.`);
  }
  if (skippedNoTaskKey > 0) {
    console.log(`ATENCIÓN: ${skippedNoTaskKey} work_sessions se saltaron por no poder construir taskKey.`);
  }
  console.log('\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
