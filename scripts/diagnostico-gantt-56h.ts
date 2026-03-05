/**
 * Diagnóstico: por qué el Gantt Semanal muestra 56h (32h martes + 24h jueves)
 * para la tarea "EDICION DE VSL CERO DOLOR".
 *
 * Revisa internamente: task_work_assignments, work_sessions, status_history.
 *
 * Uso: npx tsx scripts/diagnostico-gantt-56h.ts [email] [titulo-busqueda]
 * Ejemplo: npx tsx scripts/diagnostico-gantt-56h.ts Angelrudas15@gmail.com "VSL CERO DOLOR"
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import {
  User,
  TaskWorkAssignment,
  WorkSession,
  StatusHistory,
  Task,
  Subtask,
} from '../models/index.js';

const email = process.argv[2] || 'Angelrudas15@gmail.com';
const searchTitle = process.argv[3] || 'VSL CERO DOLOR';

// Semana del 02 al 08 marzo 2026
const startDate = '2026-03-02';
const endDate = '2026-03-08';

async function main() {
  await connectDB();

  console.log('\n=== DIAGNÓSTICO GANTT 56 HORAS ===');
  console.log(`Usuario: ${email}`);
  console.log(`Búsqueda tarea: "${searchTitle}"`);
  console.log(`Semana: ${startDate} a ${endDate}\n`);

  // 1. Buscar usuario
  const user = await User.findOne({ email }).select('id name email').lean().exec();
  if (!user) {
    console.error('Usuario no encontrado');
    process.exit(1);
  }
  const userId = (user as { id: string }).id;
  console.log('--- USUARIO ---');
  console.log(`ID: ${userId}`);
  console.log(`Nombre: ${(user as { name?: string }).name}\n`);

  // 2. Buscar tarea o subtarea por título
  const taskRegex = new RegExp(searchTitle, 'i');
  const tasks = await Task.find({ title: taskRegex }).select('id title').lean().exec();
  const subtasks = await Subtask.find({ title: taskRegex })
    .select('id title task_id')
    .lean()
    .exec();

  console.log('--- TAREAS/SUBTAREAS ENCONTRADAS ---');
  if (tasks.length > 0) {
    tasks.forEach((t) => {
      const d = t as { id: string; title: string };
      console.log(`  TASK: ${d.id} | ${d.title}`);
    });
  }
  if (subtasks.length > 0) {
    subtasks.forEach((s) => {
      const d = s as { id: string; title: string; task_id: string };
      console.log(`  SUBTASK: ${d.id} | ${d.title} | task_id: ${d.task_id}`);
    });
  }
  if (tasks.length === 0 && subtasks.length === 0) {
    console.log('  No se encontraron tareas ni subtareas con ese título.');
    process.exit(1);
  }
  console.log('');

  const taskIds = tasks.map((t) => (t as { id: string }).id);
  const subtaskIds = subtasks.map((s) => (s as { id: string }).id);

  // 3. task_work_assignments de la semana para esta tarea/subtarea
  const assignmentsTask = await TaskWorkAssignment.find({
    user_id: userId,
    task_type: 'task',
    task_id: { $in: taskIds },
    date: { $gte: startDate, $lte: endDate },
  })
    .lean()
    .exec();

  const assignmentsSubtask = await TaskWorkAssignment.find({
    user_id: userId,
    task_type: 'subtask',
    subtask_id: { $in: subtaskIds },
    date: { $gte: startDate, $lte: endDate },
  })
    .lean()
    .exec();

  const allAssignments = [...assignmentsTask, ...assignmentsSubtask];

  // También assignments con date FUERA de la semana pero que podrían tener work_sessions en la semana
  const assignmentIds = allAssignments.map((a) => (a as { id: string }).id);

  // 4. work_sessions para esos assignments (y para assignments retrasadas del mismo task/subtask)
  const assignmentsRetrasadas = await TaskWorkAssignment.find({
    user_id: userId,
    $or: [
      { task_type: 'task', task_id: { $in: taskIds } },
      { task_type: 'subtask', subtask_id: { $in: subtaskIds } },
    ],
    date: { $lt: startDate },
    status: { $in: ['completed', 'in_review', 'approved'] },
  })
    .select('id date estimated_duration actual_duration status')
    .lean()
    .exec();

  const allAssignmentIds = [
    ...assignmentIds,
    ...assignmentsRetrasadas.map((a) => (a as { id: string }).id),
  ];

  const workSessions = await WorkSession.find({
    assignment_id: { $in: allAssignmentIds },
  })
    .select('id assignment_id duration_minutes session_type createdAt created_at')
    .sort({ createdAt: 1, created_at: 1 })
    .lean()
    .exec();

  // 5. status_history completed para task/subtask en la semana
  const statusCompleted = await StatusHistory.find({
    $or: [
      { task_id: { $in: taskIds }, new_status: 'completed' },
      { subtask_id: { $in: subtaskIds }, new_status: 'completed' },
    ],
    changed_at: {
      $gte: new Date(`${startDate}T00:00:00.000Z`),
      $lte: new Date(`${endDate}T23:59:59.999Z`),
    },
  })
    .select('task_id subtask_id changed_at metadata new_status')
    .sort({ changed_at: 1 })
    .lean()
    .exec();

  // 6. Reporte
  console.log('--- TASK_WORK_ASSIGNMENTS (semana 02-08 mar) ---');
  console.log(`Total: ${allAssignments.length}`);
  allAssignments.forEach((a) => {
    const d = a as {
      id: string;
      date: string;
      task_type: string;
      task_id?: string;
      subtask_id?: string;
      estimated_duration?: number;
      actual_duration?: number;
      status: string;
    };
    const ref = d.task_type === 'subtask' ? d.subtask_id : d.task_id;
    console.log(
      `  ${d.id} | date: ${d.date} | ${d.task_type} ${ref} | est: ${d.estimated_duration ?? 0} min | actual: ${d.actual_duration ?? 0} min | status: ${d.status}`
    );
  });
  console.log('');

  console.log('--- TASK_WORK_ASSIGNMENTS RETRASADAS (date < 02-mar, completadas) ---');
  console.log(`Total: ${assignmentsRetrasadas.length}`);
  assignmentsRetrasadas.forEach((a) => {
    const d = a as {
      id: string;
      date: string;
      estimated_duration?: number;
      actual_duration?: number;
      status: string;
    };
    console.log(
      `  ${d.id} | date: ${d.date} | est: ${d.estimated_duration ?? 0} min | actual: ${d.actual_duration ?? 0} min | status: ${d.status}`
    );
  });
  console.log('');

  console.log('--- WORK_SESSIONS (para todos los assignments anteriores) ---');
  console.log(`Total: ${workSessions.length}`);

  const assignmentIdToDate = new Map<string, string>();
  [...allAssignments, ...assignmentsRetrasadas].forEach((a) => {
    const d = a as { id: string; date: string };
    assignmentIdToDate.set(d.id, d.date);
  });

  const sessionsByAssignmentDate: Record<string, number> = {};
  let totalMinutes = 0;
  workSessions.forEach((s) => {
    const d = s as {
      assignment_id: string;
      duration_minutes?: number;
      session_type?: string;
      createdAt?: Date;
      created_at?: Date;
    };
    const assignDate = assignmentIdToDate.get(d.assignment_id) ?? '?';
    const mins = d.duration_minutes ?? 0;
    totalMinutes += mins;
    const created = d.createdAt ?? d.created_at;
    const createdStr = created ? new Date(created).toISOString().slice(0, 19) : 'N/A';
    console.log(
      `  assignment: ${d.assignment_id} | assignment.date: ${assignDate} | ${mins} min | type: ${d.session_type ?? '?'} | created: ${createdStr}`
    );
    sessionsByAssignmentDate[assignDate] = (sessionsByAssignmentDate[assignDate] ?? 0) + mins;
  });
  console.log(`\n  Suma total work_sessions: ${totalMinutes} min (${(totalMinutes / 60).toFixed(1)} h)`);
  console.log('  Por assignment.date:');
  Object.entries(sessionsByAssignmentDate).forEach(([date, mins]) => {
    console.log(`    ${date}: ${mins} min (${(mins / 60).toFixed(1)} h)`);
  });
  console.log('');

  console.log('--- STATUS_HISTORY (completed en la semana) ---');
  console.log(`Total: ${statusCompleted.length}`);
  statusCompleted.forEach((r) => {
    const d = r as {
      task_id?: string;
      subtask_id?: string;
      changed_at: Date;
      metadata?: { duracion_real?: number };
      new_status: string;
    };
    const changedStr = new Date(d.changed_at).toISOString().slice(0, 19);
    const duracion = d.metadata?.duracion_real ?? 0;
    const ref = d.subtask_id ?? d.task_id;
    console.log(
      `  ${d.new_status} | ${ref} | changed_at: ${changedStr} | duracion_real: ${duracion} min (${(duracion / 60).toFixed(1)} h)`
    );
  });
  console.log('');

  // 7. Simular lógica del Gantt
  console.log('=== SIMULACIÓN LÓGICA GANTT ===');
  console.log('');
  console.log('1) getWorkSessionsForGantt: agrupa work_sessions por assignment.date');
  console.log('   → Las horas van al DÍA DE LA ASIGNACIÓN, no al día en que se creó la sesión.');
  console.log('');
  console.log('2) getOffScheduleWork: status_history completed en días NO planificados');
  console.log('   → Si completó el jueves 05 y ese día no estaba planificado, suma duracion_real al jueves.');
  console.log('');

  const martes = sessionsByAssignmentDate['2026-03-03'] ?? 0;
  const juevesOffSchedule = statusCompleted
    .filter((r) => {
      const d = r as { changed_at: Date };
      const dateStr = new Date(d.changed_at).toISOString().slice(0, 10);
      return dateStr === '2026-03-05';
    })
    .reduce((sum, r) => sum + ((r as { metadata?: { duracion_real?: number } }).metadata?.duracion_real ?? 0), 0);

  console.log('RESULTADO ESPERADO EN GANTT:');
  console.log(`  Martes 03: ${martes} min (${(martes / 60).toFixed(1)} h) [desde work_sessions, assignment.date=03-03]`);
  console.log(
    `  Jueves 05: ${juevesOffSchedule} min (${(juevesOffSchedule / 60).toFixed(1)} h) [desde status_history completed, EXTRA]`
  );
  console.log(`  TOTAL: ${martes + juevesOffSchedule} min (${((martes + juevesOffSchedule) / 60).toFixed(1)} h)`);
  console.log('');

  if (martes > 0 && juevesOffSchedule > 0 && martes + juevesOffSchedule >= 3360) {
    console.log('⚠️  POSIBLE DOBLE CONTEO:');
    console.log('   El mismo trabajo podría estar en work_sessions (bajo assignment.date)');
    console.log('   Y en getOffScheduleWork (bajo completedDate).');
    console.log('   Si ambos suman 56h, el trabajo real podría ser ~32h o ~24h, no ambos.');
  }
  if (martes > 1440) {
    console.log('⚠️  Martes tiene más de 24h: imposible en un día. Las horas vienen de assignment.date,');
    console.log('   no del día en que realmente se trabajó.');
  }

  console.log('\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
