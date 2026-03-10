/**
 * Diagnóstico: por qué una subtarea devuelta no aparece al usuario
 *
 * La subtarea devuelta solo se muestra si:
 * 1. Existe en subtasks con status='returned'
 * 2. Tiene una asignación en task_work_assignments con status pendiente
 *    (NOT IN: completed, in_review, approved)
 * 3. La asignación incluye el user_id del usuario asignado
 * 4. El proyecto de la tarea padre no está archivado
 * 5. El project_id de la asignación está en los proyectos permitidos del usuario
 *
 * Uso:
 *   npx tsx scripts/diagnostico-subtarea-devuelta.ts <subtask_id>        # Solo diagnóstico
 *   npx tsx scripts/diagnostico-subtarea-devuelta.ts <subtask_id> --fix  # Crear asignación faltante
 *
 * Ejemplo: npx tsx scripts/diagnostico-subtarea-devuelta.ts 28d98ac8-9739-4b1d-9a55-b2cf191494f1 --fix
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import {
  User,
  TaskWorkAssignment,
  Subtask,
  Task,
  Project,
} from '../models/index.js';
import { generateUUID } from '../lib/uuid.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const SUBTASK_ID = args[0] || '28d98ac8-9739-4b1d-9a55-b2cf191494f1';
const FIX = process.argv.includes('--fix');

async function main() {
  await connectDB();

  console.log('\n=== DIAGNÓSTICO: SUBTAREA DEVUELTA NO VISIBLE ===');
  console.log(`Subtask ID: ${SUBTASK_ID}\n`);

  const causes: string[] = [];
  let subtask: { id?: string; _id?: unknown; title?: string; status?: string; assigned_to?: string; task_id?: string } | null = null;

  // 1. Buscar la subtarea (por id UUID)
  subtask = await Subtask.findOne({ id: SUBTASK_ID })
    .select('id title status assigned_to task_id estimated_duration')
    .lean()
    .exec() as typeof subtask;

  if (!subtask) {
    console.error('❌ SUBTAREA NO ENCONTRADA');
    causes.push('La subtarea no existe en la colección subtasks');
    printSummary(causes);
    process.exit(1);
  }

  const subtaskId = (subtask as { id?: string }).id ?? String((subtask as { _id?: unknown })._id);
  const assignedTo = (subtask as { assigned_to?: string }).assigned_to;
  const taskId = (subtask as { task_id?: string }).task_id;
  const status = (subtask as { status?: string }).status;

  console.log('--- 1. SUBTAREA ---');
  console.log(JSON.stringify(subtask, null, 2));
  console.log('');

  if (status !== 'returned') {
    causes.push(`Status actual: "${status}". Para aparecer como devuelta debe ser "returned"`);
  }

  if (!assignedTo) {
    causes.push('assigned_to está vacío - no hay usuario asignado');
  }

  // 2. Obtener usuario asignado (buscar por id UUID, no por _id)
  let user: { id: string; name?: string; email?: string; assigned_projects?: string[] } | null = null;
  if (assignedTo) {
    user = await User.findOne({ id: assignedTo })
      .select('id name email assigned_projects')
      .lean()
      .exec() as typeof user;
  }

  if (assignedTo && !user) {
    causes.push(`Usuario asignado (${assignedTo}) no encontrado en users`);
  }

  if (user) {
    console.log('--- 2. USUARIO ASIGNADO ---');
    console.log(JSON.stringify(user, null, 2));
    console.log('');
  }

  // 3. Buscar asignaciones en task_work_assignments para esta subtarea
  const allAssignments = await TaskWorkAssignment.find({
    subtask_id: { $in: [subtaskId, SUBTASK_ID] },
  })
    .select('id user_id date task_type task_id subtask_id project_id status')
    .sort({ date: -1 })
    .lean()
    .exec();

  console.log('--- 3. ASIGNACIONES (task_work_assignments) ---');
  console.log(`Total encontradas: ${allAssignments.length}`);

  if (allAssignments.length === 0) {
    causes.push(
      'NO HAY ASIGNACIÓN en task_work_assignments. La vista UserProjectView solo muestra subtareas que tienen una asignación pendiente. Sin asignación, la subtarea nunca aparece.'
    );
    causes.push(
      'Solución: Crear o restaurar la asignación en task_work_assignments cuando el PM devuelve la tarea.'
    );
  } else {
    allAssignments.forEach((a: Record<string, unknown>, i: number) => {
      const aStatus = a.status as string;
      const isPending = !['completed', 'in_review', 'approved'].includes(aStatus);
      const matchesUser = assignedTo && (a.user_id as string) === (user?.id ?? assignedTo);
      console.log(`  [${i + 1}] user_id=${a.user_id} date=${a.date} status=${aStatus} project_id=${a.project_id}`);
      console.log(`      ¿Status pendiente? ${isPending ? 'SÍ' : 'NO'} | ¿Coincide con usuario asignado? ${matchesUser ? 'SÍ' : 'NO'}`);

      if (!isPending) {
        causes.push(
          `Asignación (id=${a.id}) tiene status="${aStatus}". El filtro de fetchAssignedTasks excluye completed/in_review/approved.`
        );
      }
      if (assignedTo && !matchesUser) {
        causes.push(
          `Asignación user_id=${a.user_id} no coincide con assigned_to de la subtarea (${assignedTo})`
        );
      }
    });
  }
  console.log('');

  // 4. Tarea padre y proyecto
  let project: { id: string; name?: string; is_archived?: boolean } | null = null;
  let parentTask: { id: string; title?: string; project_id?: string } | null = null;

  if (taskId) {
    parentTask = await Task.findOne({ id: taskId })
      .select('id title project_id')
      .lean()
      .exec() as typeof parentTask;

    if (parentTask) {
      const projectId = (parentTask as { project_id?: string }).project_id;
      if (projectId) {
        project = await Project.findOne({ id: projectId })
          .select('id name is_archived')
          .lean()
          .exec() as typeof project;
      }
    }
  }

  console.log('--- 4. TAREA PADRE Y PROYECTO ---');
  if (parentTask) {
    console.log('Tarea:', JSON.stringify(parentTask, null, 2));
  } else {
    console.log('Tarea padre: NO ENCONTRADA');
    causes.push('La tarea padre no existe o task_id es incorrecto');
  }

  if (project) {
    console.log('Proyecto:', JSON.stringify(project, null, 2));
    if ((project as { is_archived?: boolean }).is_archived) {
      causes.push('El proyecto está ARCHIVADO. Las subtareas de proyectos archivados no se muestran.');
    }
  } else if (parentTask && (parentTask as { project_id?: string }).project_id) {
    console.log('Proyecto: NO ENCONTRADO');
    causes.push('El proyecto de la tarea padre no existe');
  }
  console.log('');

  // 5. Simular el filtro de fetchAssignedTasks
  console.log('--- 5. SIMULACIÓN fetchAssignedTasks ---');
  const userIdForFilter = user?.id ?? assignedTo;
  if (!userIdForFilter) {
    console.log('No se puede simular: no hay user_id');
  } else {
    const pendingAssignments = await TaskWorkAssignment.find({
      user_id: userIdForFilter,
      status: { $nin: ['completed', 'in_review', 'approved'] },
    })
      .select('task_id task_type subtask_id project_id date')
      .lean()
      .exec();

    const subtaskIdsFromAssignments = (pendingAssignments as { task_type?: string; subtask_id?: string }[])
      .filter((a) => a.task_type === 'subtask' && a.subtask_id)
      .map((a) => a.subtask_id);

    const wouldAppear = subtaskIdsFromAssignments.some(
      (sid) => sid === subtaskId || sid === SUBTASK_ID
    );

    console.log(`Asignaciones pendientes del usuario: ${pendingAssignments.length}`);
    console.log(`Subtask IDs en esas asignaciones: [${subtaskIdsFromAssignments.join(', ')}]`);
    console.log(`¿Esta subtarea estaría en la lista? ${wouldAppear ? 'SÍ' : 'NO'}`);

    if (!wouldAppear && allAssignments.length > 0) {
      causes.push(
        'La asignación existe pero no pasa el filtro: user_id o status no coinciden con lo que fetchAssignedTasks espera.'
      );
    }
  }
  console.log('');

  // Resumen
  printSummary(causes);

  // 6. Reparar: crear asignación faltante si --fix
  if (FIX && allAssignments.length === 0 && user && parentTask && project && assignedTo) {
    const projectId = (parentTask as { project_id?: string }).project_id;
    const estimatedDuration = (subtask as { estimated_duration?: number }).estimated_duration ?? 60;
    const today = new Date().toISOString().slice(0, 10);

    const newAssignment = {
      id: generateUUID(),
      user_id: assignedTo,
      date: today,
      task_type: 'subtask',
      task_id: null as string | null,
      subtask_id: subtaskId,
      project_id: projectId ?? null,
      estimated_duration: estimatedDuration,
      status: 'pending',
    };

    try {
      await TaskWorkAssignment.create(newAssignment);
      console.log('=== REPARACIÓN EXITOSA ===');
      console.log('Se creó la asignación en task_work_assignments:');
      console.log(JSON.stringify(newAssignment, null, 2));
      console.log('');
      console.log('La subtarea devuelta debería aparecer ahora al usuario. Recargar la vista.');
    } catch (err) {
      console.error('Error al crear asignación:', err);
      process.exit(1);
    }
  } else if (FIX && allAssignments.length > 0) {
    const pending = (allAssignments as { status?: string }[]).filter(
      (a) => !['completed', 'in_review', 'approved'].includes(a.status ?? '')
    );
    if (pending.length === 0) {
      console.log('=== REPARACIÓN: Actualizar status de asignación existente ===');
      const toUpdate = allAssignments[0] as { id: string };
      await TaskWorkAssignment.updateOne(
        { id: toUpdate.id },
        { $set: { status: 'pending', updated_at: new Date() } }
      );
      console.log('Asignación actualizada a status=pending. La subtarea debería aparecer.');
    }
  }

  process.exit(0);
}

function printSummary(causes: string[]) {
  console.log('=== RESUMEN / POSIBLES CAUSAS ===');
  if (causes.length === 0) {
    console.log('No se detectaron causas obvias. Revisar filtros de proyecto (projectId, allowedProjectIds) en UserProjectView.');
  } else {
    causes.forEach((c, i) => console.log(`${i + 1}. ${c}`));
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
