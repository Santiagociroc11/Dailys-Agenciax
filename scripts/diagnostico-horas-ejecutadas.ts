/**
 * Diagnóstico: por qué las horas ejecutadas aparecen en cero en Control de Horas
 * cuando un usuario entrega actividades retrasadas.
 *
 * Uso: npx tsx scripts/diagnostico-horas-ejecutadas.ts Angelrudas15@gmail.com
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import {
  User,
  TaskWorkAssignment,
  WorkSession,
  Project,
} from '../models/index.js';

const email = process.argv[2] || 'Angelrudas15@gmail.com';
const today = new Date().toISOString().split('T')[0];
const todayStart = new Date(today + 'T00:00:00').toISOString();
const todayEnd = new Date(today + 'T23:59:59.999').toISOString();

async function main() {
  await connectDB();

  console.log('\n=== DIAGNÓSTICO: HORAS EJECUTADAS EN CONTROL DE JORNADA ===');
  console.log(`Usuario: ${email}`);
  console.log(`Fecha hoy: ${today}\n`);

  // 1. Buscar usuario
  const user = await User.findOne({ email }).select('id name email is_active').lean().exec();
  if (!user) {
    console.error('Usuario no encontrado');
    process.exit(1);
  }

  const userId = (user as { id: string }).id;
  const isActive = (user as { is_active?: boolean }).is_active;

  console.log('--- USUARIO ---');
  console.log(`ID: ${userId}`);
  console.log(`Nombre: ${(user as { name?: string }).name}`);
  console.log(`is_active: ${isActive ?? 'undefined (se considera activo)'}`);
  if (isActive === false) {
    console.log('⚠️  Usuario INACTIVO: no aparece en Control de Horas (filtro is_active)');
  }
  console.log('');

  // 2. Asignaciones de HOY (todayAssignments)
  const todayAssignments = await TaskWorkAssignment.find({
    user_id: userId,
    date: today,
  })
    .select('id date project_id estimated_duration actual_duration status created_at')
    .lean()
    .exec();

  console.log('--- ASIGNACIONES DE HOY (date = hoy) ---');
  console.log(`Total: ${todayAssignments.length}`);
  const actualFromToday = todayAssignments.reduce(
    (sum, a) => sum + ((a as { actual_duration?: number }).actual_duration ?? 0),
    0
  );
  console.log(`Suma actual_duration: ${actualFromToday} min (${(actualFromToday / 60).toFixed(1)} h)`);
  if (todayAssignments.length > 0) {
    todayAssignments.slice(0, 5).forEach((a) => {
      const d = a as { id: string; project_id?: string; actual_duration?: number; status: string };
      console.log(`  - ${d.id} | project: ${d.project_id ?? 'NULL'} | actual: ${d.actual_duration ?? 0} min | status: ${d.status}`);
    });
  }
  console.log('');

  // 3. Asignaciones RETRASADAS (date < hoy, no completadas)
  const overdueAssignments = await TaskWorkAssignment.find({
    user_id: userId,
    date: { $lt: today },
    status: { $nin: ['completed', 'in_review', 'approved'] },
  })
    .select('id date project_id estimated_duration actual_duration status')
    .lean()
    .exec();

  console.log('--- ASIGNACIONES RETRASADAS (date < hoy, status no final) ---');
  console.log(`Total: ${overdueAssignments.length}`);
  const overdueMinutes = overdueAssignments.reduce(
    (sum, a) => sum + ((a as { estimated_duration?: number }).estimated_duration ?? 0),
    0
  );
  console.log(`Suma estimated (overdueMinutes): ${overdueMinutes} min (${(overdueMinutes / 60).toFixed(1)} h)`);
  if (overdueAssignments.length > 0) {
    overdueAssignments.slice(0, 5).forEach((a) => {
      const d = a as { id: string; date: string; project_id?: string; status: string };
      console.log(`  - ${d.id} | date: ${d.date} | project: ${d.project_id ?? 'NULL'} | status: ${d.status}`);
    });
  }
  console.log('');

  // 4. Asignaciones COMPLETADAS HOY (date < hoy, status final) - las que entregó
  const completedOverdue = await TaskWorkAssignment.find({
    user_id: userId,
    date: { $lt: today },
    status: { $in: ['completed', 'in_review', 'approved'] },
  })
    .select('id date project_id estimated_duration actual_duration status updated_at')
    .sort({ updated_at: -1 })
    .lean()
    .exec();

  console.log('--- ASIGNACIONES RETRASADAS YA ENTREGADAS (date < hoy, status final) ---');
  console.log(`Total: ${completedOverdue.length}`);
  const actualFromCompletedOverdue = completedOverdue.reduce(
    (sum, a) => sum + ((a as { actual_duration?: number }).actual_duration ?? 0),
    0
  );
  console.log(`Suma actual_duration: ${actualFromCompletedOverdue} min (${(actualFromCompletedOverdue / 60).toFixed(1)} h)`);
  if (completedOverdue.length > 0) {
    completedOverdue.slice(0, 5).forEach((a) => {
      const d = a as { id: string; date: string; project_id?: string; actual_duration?: number; status: string; updated_at?: string };
      console.log(`  - ${d.id} | date: ${d.date} | project: ${d.project_id ?? 'NULL'} | actual: ${d.actual_duration ?? 0} min | status: ${d.status} | updated: ${d.updated_at}`);
    });
  }
  console.log('');

  // 5. work_sessions de tipo completion creadas HOY
  const assignmentIds = [
    ...todayAssignments.map((a) => (a as { id: string }).id),
    ...completedOverdue.map((a) => (a as { id: string }).id),
  ];
  // Mongoose timestamps usa createdAt; la API puede usar created_at
  const todayStartDate = new Date(todayStart);
  const todayEndDate = new Date(todayEnd);
  const reworkSessions = await WorkSession.find({
    assignment_id: { $in: assignmentIds },
    session_type: 'completion',
    $or: [
      { createdAt: { $gte: todayStartDate, $lte: todayEndDate } },
      { created_at: { $gte: todayStartDate, $lte: todayEndDate } },
    ],
  })
    .select('assignment_id duration_minutes createdAt created_at')
    .lean()
    .exec();

  // También buscar por todos los assignments del usuario para no perder ninguno
  const allUserAssignments = await TaskWorkAssignment.find({ user_id: userId })
    .select('id date project_id')
    .lean()
    .exec();
  const allAssignmentIds = allUserAssignments.map((a) => (a as { id: string }).id);
  const allCompletionSessionsToday = await WorkSession.find({
    assignment_id: { $in: allAssignmentIds },
    session_type: 'completion',
    $or: [
      { createdAt: { $gte: todayStartDate, $lte: todayEndDate } },
      { created_at: { $gte: todayStartDate, $lte: todayEndDate } },
    ],
  })
    .select('assignment_id duration_minutes created_at')
    .lean()
    .exec();

  // Work sessions de completion de CUALQUIER fecha (para ver si existen)
  const anyCompletionSessions = await WorkSession.find({
    assignment_id: { $in: allAssignmentIds },
    session_type: 'completion',
  })
    .select('assignment_id duration_minutes createdAt created_at')
    .sort({ createdAt: -1, created_at: -1 })
    .limit(10)
    .lean()
    .exec();

  console.log('--- WORK_SESSIONS completion (cualquier fecha) ---');
  console.log(`Últimas 10 sesiones completion del usuario: ${anyCompletionSessions.length}`);
  anyCompletionSessions.forEach((s) => {
    const d = s as { assignment_id: string; duration_minutes?: number; createdAt?: string; created_at?: string };
    console.log(`  - assignment: ${d.assignment_id} | ${d.duration_minutes ?? 0} min | createdAt: ${d.createdAt ?? 'N/A'} | created_at: ${d.created_at ?? 'N/A'}`);
  });
  console.log('');

  console.log('--- WORK_SESSIONS completion creadas HOY ---');
  console.log(`Sesiones (solo assignments conocidos): ${reworkSessions.length}`);
  console.log(`Sesiones (todos los assignments del usuario): ${allCompletionSessionsToday.length}`);
  const reworkMinutes = allCompletionSessionsToday.reduce(
    (sum, s) => sum + ((s as { duration_minutes?: number }).duration_minutes ?? 0),
    0
  );
  console.log(`Suma duration_minutes: ${reworkMinutes} min (${(reworkMinutes / 60).toFixed(1)} h)`);
  if (allCompletionSessionsToday.length > 0) {
    allCompletionSessionsToday.slice(0, 5).forEach((s) => {
      const d = s as { assignment_id: string; duration_minutes?: number; created_at?: string };
      console.log(`  - assignment: ${d.assignment_id} | ${d.duration_minutes ?? 0} min | created: ${d.created_at}`);
    });
  }
  console.log('');

  // 6. Proyectos archivados
  const projectIds = new Set<string>();
  todayAssignments.forEach((a) => {
    const pid = (a as { project_id?: string }).project_id;
    if (pid) projectIds.add(pid);
  });
  completedOverdue.forEach((a) => {
    const pid = (a as { project_id?: string }).project_id;
    if (pid) projectIds.add(pid);
  });
  const projects = await Project.find({ id: { $in: Array.from(projectIds) } })
    .select('id name is_archived')
    .lean()
    .exec();
  const archivedProjects = projects.filter((p) => (p as { is_archived?: boolean }).is_archived);
  const activeProjectIds = new Set(
    projects.filter((p) => !(p as { is_archived?: boolean }).is_archived).map((p) => (p as { id: string }).id)
  );

  console.log('--- PROYECTOS ---');
  console.log(`Archivados: ${archivedProjects.map((p) => (p as { name: string }).name).join(', ') || 'ninguno'}`);
  if (archivedProjects.length > 0) {
    console.log('⚠️  Las asignaciones de proyectos archivados se EXCLUYEN del Control de Horas');
  }
  console.log('');

  // 7. Simular lógica de Control de Horas (rework = completion hoy para assignments con date < hoy)
  const assignmentIdsFromSessions = [...new Set(allCompletionSessionsToday.map((s) => (s as { assignment_id: string }).assignment_id))];
  const reworkAssignmentsData = await TaskWorkAssignment.find({
    id: { $in: assignmentIdsFromSessions },
  })
    .select('id user_id date project_id')
    .lean()
    .exec();

  const validReworkAssignments = new Map<string, string>(); // assignment_id -> user_id
  reworkAssignmentsData.forEach((a) => {
    const aid = (a as { id: string }).id;
    const uid = (a as { user_id: string }).user_id;
    const pid = (a as { project_id?: string }).project_id;
    const date = (a as { date: string }).date;
    if (date >= today) return; // Solo date < hoy cuenta como rework
    if (activeProjectIds.size > 0 && pid && !activeProjectIds.has(pid)) return; // Proyecto archivado
    validReworkAssignments.set(aid, uid);
  });

  let reworkMinutesThatWouldCount = 0;
  allCompletionSessionsToday.forEach((s) => {
    const aid = (s as { assignment_id: string }).assignment_id;
    const uid = validReworkAssignments.get(aid);
    if (uid === userId) {
      reworkMinutesThatWouldCount += (s as { duration_minutes?: number }).duration_minutes ?? 0;
    }
  });

  const actualMinutesToday = actualFromToday;
  const ejecutado = actualMinutesToday + reworkMinutesThatWouldCount;

  console.log('=== SIMULACIÓN CONTROL DE HORAS ===');
  console.log(`actualMinutesToday (de todayAssignments): ${actualMinutesToday} min`);
  console.log(`reworkMinutes (completion hoy, date < hoy, proyecto activo): ${reworkMinutesThatWouldCount} min`);
  console.log(`EJECUTADO total: ${ejecutado} min (${(ejecutado / 60).toFixed(1)} h)`);
  console.log('');

  // 8. Diagnóstico
  console.log('=== POSIBLES CAUSAS DE CERO ===');
  const causes: string[] = [];
  if (isActive === false) causes.push('Usuario marcado como inactivo (is_active: false)');
  if (todayAssignments.length === 0 && completedOverdue.length === 0)
    causes.push('No hay asignaciones de hoy ni retrasadas completadas');
  if (allCompletionSessionsToday.length === 0 && actualFromToday === 0)
    causes.push('No hay work_sessions completion de hoy y actual_duration de hoy es 0');
  if (archivedProjects.length > 0 && completedOverdue.some((a) => archivedProjects.some((p) => (p as { id: string }).id === (a as { project_id?: string }).project_id)))
    causes.push('Las asignaciones entregadas pertenecen a proyectos ARCHIVADOS (se excluyen)');
  if (completedOverdue.length > 0 && actualFromCompletedOverdue === 0)
    causes.push('Asignaciones completadas tienen actual_duration = 0 o NULL (no se registró work_session?)');
  if (completedOverdue.length > 0 && allCompletionSessionsToday.length === 0)
    causes.push('Entregó desde Management o Tasks (no crean work_sessions) en lugar de UserProjectView');

  if (causes.length > 0) {
    causes.forEach((c) => console.log('  •', c));
  } else {
    console.log('  No se detectaron causas obvias. Revisar timezone (created_at vs hoy) o filtros.');
  }

  console.log('\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
