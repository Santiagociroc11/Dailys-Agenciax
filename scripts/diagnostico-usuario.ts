/**
 * Diagnóstico de actividades para un usuario específico.
 * Ayuda a entender por qué aparecen ciertas tareas y por qué muestran "Sin proyecto".
 *
 * Uso: npx tsx scripts/diagnostico-usuario.ts jorgeluisvarelameza@gmail.com
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { User, TaskWorkAssignment, Subtask, Task, Project } from '../models/index.js';

const email = process.argv[2] || 'jorgeluisvarelameza@gmail.com';

async function main() {
  await connectDB();

  console.log('\n=== DIAGNÓSTICO DE USUARIO ===');
  console.log(`Email: ${email}\n`);

  // 1. Buscar usuario
  const user = await User.findOne({ email }).select('id name email role assigned_projects').lean().exec();
  if (!user) {
    console.error('Usuario no encontrado');
    process.exit(1);
  }

  const userId = (user as { id: string }).id;

  console.log('--- USUARIO ---');
  console.log(JSON.stringify(user, null, 2));
  console.log('');

  let nullAssignCount = 0;
  let nullSubsCount = 0;
  let nullTasksCount = 0;

  // 2. Asignaciones pendientes (task_work_assignments)
  const assignments = await TaskWorkAssignment.find({
    user_id: userId,
    status: { $nin: ['completed', 'in_review', 'approved'] },
  })
    .select('id task_id task_type subtask_id project_id date status estimated_duration')
    .sort({ date: 1 })
    .lean()
    .exec();

  console.log('--- ASIGNACIONES PENDIENTES (task_work_assignments) ---');
  console.log(`Total: ${assignments.length}`);
  nullAssignCount = assignments.filter((a) => !(a as { project_id?: string }).project_id).length;
  if (nullAssignCount > 0) {
    console.log(`⚠️  Asignaciones con project_id NULL: ${nullAssignCount}`);
  }
  const projectIdsFromAssign = [...new Set(assignments.map((a) => (a as { project_id?: string }).project_id).filter(Boolean))] as string[];
  console.log('Project IDs en asignaciones:', projectIdsFromAssign);
  if (assignments.length > 0) {
    console.log('Primeras 5:', JSON.stringify(assignments.slice(0, 5), null, 2));
  }
  console.log('');

  // 3. Subtareas asignadas (assigned_to)
  const subtasks = await Subtask.find({
    assigned_to: userId,
    status: { $nin: ['approved', 'completed', 'in_review'] },
  })
    .select('id title status start_date deadline assigned_to task_id')
    .lean()
    .exec();

  const taskIdsForSubs = [...new Set(subtasks.map((s) => (s as { task_id: string }).task_id))];
  const parentTasks = await Task.find({ id: { $in: taskIdsForSubs } })
    .select('id title project_id')
    .lean()
    .exec();
  const taskToProject = new Map(parentTasks.map((t) => [(t as { id: string }).id, (t as { project_id?: string }).project_id]));

  console.log('--- SUBTAREAS ASIGNADAS (assigned_to) ---');
  console.log(`Total: ${subtasks.length}`);
  nullSubsCount = subtasks.filter((s) => !taskToProject.get((s as { task_id: string }).task_id)).length;
  if (nullSubsCount > 0) {
    console.log(`⚠️  Subtareas cuya tarea padre tiene project_id NULL: ${nullSubsCount}`);
  }
  const projectIdsFromSubs = [...new Set(subtasks.map((s) => taskToProject.get((s as { task_id: string }).task_id)).filter(Boolean))] as string[];
  console.log('Project IDs de tareas padre:', projectIdsFromSubs);
  if (subtasks.length > 0) {
    console.log('Primeras 5:', JSON.stringify(subtasks.slice(0, 5).map((s) => ({
      id: (s as { id: string }).id,
      title: (s as { title: string }).title,
      status: (s as { status: string }).status,
      start_date: (s as { start_date?: string }).start_date,
      task_project_id: taskToProject.get((s as { task_id: string }).task_id),
    })), null, 2));
  }
  console.log('');

  // 4. Tareas con assigned_users
  const tasks = await Task.find({
    assigned_users: userId,
    status: { $nin: ['approved', 'completed', 'in_review'] },
  })
    .select('id title status project_id start_date deadline')
    .lean()
    .exec();

  console.log('--- TAREAS ASIGNADAS (assigned_users) ---');
  console.log(`Total: ${tasks.length}`);
  nullTasksCount = tasks.filter((t) => !(t as { project_id?: string }).project_id).length;
  if (nullTasksCount > 0) {
    console.log(`⚠️  Tareas con project_id NULL: ${nullTasksCount}`);
  }
  if (tasks.length > 0) {
    console.log('Primeras 5:', JSON.stringify(tasks.slice(0, 5), null, 2));
  }
  console.log('');

  // 5. Verificar proyectos
  const allProjectIds = new Set<string>();
  assignments.forEach((a) => {
    const pid = (a as { project_id?: string }).project_id;
    if (pid) allProjectIds.add(pid);
  });
  projectIdsFromSubs.forEach((id) => allProjectIds.add(id));
  tasks.forEach((t) => {
    const pid = (t as { project_id?: string }).project_id;
    if (pid) allProjectIds.add(pid);
  });

  let archivedProjs: { id: string; name: string; is_archived: boolean }[] = [];
  let notFoundIds: string[] = [];

  if (allProjectIds.size > 0) {
    const projects = await Project.find({ id: { $in: Array.from(allProjectIds) } })
      .select('id name is_archived')
      .lean()
      .exec();

    archivedProjs = projects.filter((p) => (p as { is_archived?: boolean }).is_archived) as typeof archivedProjs;
    notFoundIds = Array.from(allProjectIds).filter((id) => !projects.some((p) => (p as { id: string }).id === id));

    console.log('--- ESTADO DE PROYECTOS ---');
    if (archivedProjs.length > 0) {
      console.log(`⚠️  Proyectos ARCHIVADOS (no aparecen en projectMap): ${archivedProjs.map((p) => p.name).join(', ')}`);
    }
    if (notFoundIds.length > 0) {
      console.log(`⚠️  Project IDs no encontrados en tabla projects: ${notFoundIds.join(', ')}`);
    }
    projects.forEach((p) => {
      const status = (p as { is_archived?: boolean }).is_archived ? 'ARCHIVADO' : 'activo';
      console.log(`  - ${(p as { name: string }).name} (${(p as { id: string }).id}): ${status}`);
    });
    console.log('');
  }

  // 6. Resumen diagnóstico
  console.log('=== RESUMEN DIAGNÓSTICO ===');
  const causes: string[] = [];
  if (nullAssignCount > 0) causes.push(`Asignaciones con project_id NULL: ${nullAssignCount}`);
  if (nullSubsCount > 0) causes.push(`Subtareas con tarea padre sin proyecto: ${nullSubsCount}`);
  if (nullTasksCount > 0) causes.push(`Tareas con project_id NULL: ${nullTasksCount}`);
  if (archivedProjs.length > 0) causes.push(`Proyectos archivados: ${archivedProjs.map((p) => p.name).join(', ')}`);
  if (notFoundIds.length > 0) causes.push(`Project IDs inexistentes: ${notFoundIds.length}`);

  if (causes.length > 0) {
    console.log('Posibles causas de "Sin proyecto":');
    causes.forEach((c) => console.log('  •', c));
  } else {
    console.log('No se detectaron causas obvias. Revisar projectMap en fetchAssignedTasks.');
  }

  console.log('\n"Iniciada hace X días" se calcula desde start_date de la tarea/subtarea.');
  console.log('Si start_date está en el pasado, se muestra "Iniciada hace X días".');
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
