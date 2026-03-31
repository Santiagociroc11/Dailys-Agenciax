/**
 * Explica por qué una subtarea puede verse en Gestión (/management) pero no en Tareas (/tasks) en vista admin.
 *
 * Uso:
 *   npx tsx scripts/diagnostico-subtarea-tareas-vs-gestion.ts
 *   npx tsx scripts/diagnostico-subtarea-tareas-vs-gestion.ts 947c5a51-b837-429b-a7d6-83b22bedd071
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongoose.js';
import { Subtask, Task, Project } from '../models/index.js';

const DEFAULT_SUBTASK_ID = '947c5a51-b837-429b-a7d6-83b22bedd071';
const TASKS_PER_PAGE = 10;

function isTaskApprovedLikeTasksPage(siblings: { status?: string }[]): boolean {
  if (siblings.length === 0) return false;
  return siblings.every((s) => s.status === 'approved');
}

async function main() {
  const subtaskId = process.argv[2] || DEFAULT_SUBTASK_ID;

  await connectDB();

  const sub = await Subtask.findOne({ id: subtaskId }).lean().exec();
  if (!sub) {
    console.error(`No existe subtarea con id: ${subtaskId}`);
    process.exit(1);
  }

  const parent = await Task.findOne({ id: (sub as { task_id: string }).task_id }).lean().exec();
  if (!parent) {
    console.error(`No existe tarea padre task_id=${(sub as { task_id: string }).task_id}`);
    process.exit(1);
  }

  const projectId = (parent as { project_id?: string }).project_id;
  const project = projectId
    ? await Project.findOne({ id: projectId }).select('id name is_archived').lean().exec()
    : null;

  const siblings = await Subtask.find({ task_id: (parent as { id: string }).id }).lean().exec();
  const allApproved = isTaskApprovedLikeTasksPage(siblings as { status?: string }[]);

  const archivedProjectIds = new Set(
    (await Project.find({ is_archived: true }).select('id').lean().exec()).map((p) => (p as { id: string }).id)
  );

  const allTasksRaw = await Task.find({
    project_id: { $nin: [...archivedProjectIds, null, ''] },
  })
    .select('id title created_at project_id phase_id')
    .sort({ created_at: -1 })
    .lean()
    .exec();

  const tasksNonArchivedProject = allTasksRaw.filter((t) => {
    const pid = (t as { project_id?: string }).project_id;
    return pid && !archivedProjectIds.has(pid);
  });

  const parentId = (parent as { id: string }).id;

  const taskIds = tasksNonArchivedProject.map((t) => (t as { id: string }).id);
  const allSubsByTask = await Subtask.find({ task_id: { $in: taskIds } })
    .select('task_id status')
    .lean()
    .exec();
  const subsMap = new Map<string, { status?: string }[]>();
  for (const s of allSubsByTask) {
    const tid = (s as { task_id: string }).task_id;
    if (!subsMap.has(tid)) subsMap.set(tid, []);
    subsMap.get(tid)!.push(s as { status?: string });
  }

  const isApprovedOnPage = (taskId: string) => {
    const subs = subsMap.get(taskId) || [];
    return isTaskApprovedLikeTasksPage(subs);
  };

  const activeList = tasksNonArchivedProject.filter((t) => !isApprovedOnPage((t as { id: string }).id));
  const approvedList = tasksNonArchivedProject.filter((t) => isApprovedOnPage((t as { id: string }).id));

  const idxActive = activeList.findIndex((t) => (t as { id: string }).id === parentId);
  const idxApproved = approvedList.findIndex((t) => (t as { id: string }).id === parentId);

  console.log('\n=== DIAGNÓSTICO: Tareas (/tasks) vs Gestión (/management) ===\n');
  console.log('Subtarea:', (sub as { title?: string }).title);
  console.log('ID subtarea:', subtaskId);
  console.log('Estado subtarea:', (sub as { status?: string }).status);
  console.log('\nTarea padre:', (parent as { title?: string }).title);
  console.log('ID padre:', parentId);
  console.log('Proyecto:', project ? `${(project as { name?: string }).name} (${projectId})` : '(sin proyecto)');
  console.log('Proyecto archivado:', project ? (project as { is_archived?: boolean }).is_archived : 'N/A');

  console.log('\n--- Cómo lo trata la página TAREAS (Tasks.tsx) ---');
  console.log('- Solo se listan TAREAS PADRE (cards), no filas sueltas por subtarea.');
  console.log('- Las subtareas van dentro del card del padre (hay que expandir/ver la lista).');
  console.log('- Pestaña "Tareas activas": padre aparece si NO todas las subtareas están en estado approved.');
  console.log('- Pestaña "Tareas aprobadas": padre aparece solo si TODAS las subtareas están approved.');
  console.log(`- Paginación: ${TASKS_PER_PAGE} padres por página (por defecto), orden created_at descendente.`);

  if ((project as { is_archived?: boolean } | null)?.is_archived) {
    console.log('\n⚠️  Esta tarea no debería cargarse en Tareas ni Gestión (proyecto archivado).');
  } else {
    console.log('\nEstado pestañas para este padre:');
    console.log(`  ¿Todas las subtareas approved? ${allApproved}`);
    console.log(`  En "Tareas activas": ${!allApproved ? 'SÍ' : 'NO (mira pestaña Aprobadas)'}`);
    console.log(`  En "Tareas aprobadas": ${allApproved ? 'SÍ' : 'NO'}`);

    if (idxActive >= 0) {
      const page = Math.floor(idxActive / TASKS_PER_PAGE) + 1;
      const totalPages = Math.max(1, Math.ceil(activeList.length / TASKS_PER_PAGE));
      console.log(`\n  Posición en lista "activas" (índice 0-based): ${idxActive} → página ${page} de ~${totalPages}`);
    }
    if (idxApproved >= 0 && allApproved) {
      const page = Math.floor(idxApproved / TASKS_PER_PAGE) + 1;
      const totalPages = Math.max(1, Math.ceil(approvedList.length / TASKS_PER_PAGE));
      console.log(`  Posición en lista "aprobadas": ${idxApproved} → página ${page} de ~${totalPages}`);
    }
  }

  console.log('\n--- Cómo lo trata GESTIÓN (Management.tsx, vista Subtareas) ---');
  console.log('- Lista subtareas como filas del tablero (Kanban por estado).');
  console.log('- La búsqueda incluye título de subtarea, asignado y título del padre.');
  console.log('- Esta subtarea debería aparecer si cumple filtros de proyecto/fase/prioridad/asignado y no está excluida por búsqueda.');

  console.log('\n--- Resumen: causas típicas de “la veo en Gestión y no en Tareas” ---');
  console.log('1) Estás en "Tareas activas" pero el padre pasó a "Tareas aprobadas" (todas las subtareas approved).');
  console.log('2) El padre está en otra página de paginación.');
  console.log('3) En Tareas, el buscador solo filtra por título/descripcion del PADRE, no por título de subtarea.');
  console.log('4) Filtro de proyecto o fase en /tasks que excluye al padre.');
  console.log('\nSubtareas del padre (orden secuencial):');
  for (const s of siblings.sort((a, b) => ((a as { sequence_order?: number }).sequence_order || 0) - ((b as { sequence_order?: number }).sequence_order || 0))) {
    console.log(`  - [${(s as { status?: string }).status}] ${(s as { title?: string }).title} (${(s as { id: string }).id})`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
