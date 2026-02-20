/**
 * Script para detectar y corregir tareas/subtareas migradas con datos incompletos.
 *
 * Uso:
 *   npx tsx scripts/fix-migrated-tasks.ts          # Solo detectar y reportar
 *   npx tsx scripts/fix-migrated-tasks.ts --fix     # Detectar y aplicar correcciones
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongoose.js';
import { Task, Subtask, TaskWorkAssignment } from '../models/index.js';
import { generateUUID } from '../lib/uuid.js';

const FIX = process.argv.includes('--fix');

function isValidDate(val: unknown): boolean {
  if (val == null) return false;
  const d = new Date(val as string | Date);
  return !isNaN(d.getTime());
}

async function findCorruptTasks() {
  const tasks = await Task.find({}).lean().exec();
  const corrupt: Array<{ _id: unknown; id?: string; issues: string[] }> = [];

  for (const t of tasks as Record<string, unknown>[]) {
    const issues: string[] = [];
    if (!t.title || t.title === '') issues.push('title vacío');
    if (!isValidDate(t.deadline)) issues.push('deadline inválido');
    if (!isValidDate(t.start_date)) issues.push('start_date inválido');
    if (t.estimated_duration == null || typeof t.estimated_duration !== 'number')
      issues.push('estimated_duration inválido');
    if (!t.id || t.id === 'undefined') issues.push('id faltante o "undefined"');

    if (issues.length > 0) {
      corrupt.push({
        _id: t._id,
        id: t.id as string,
        issues,
      });
    }
  }
  return corrupt;
}

async function findCorruptSubtasks() {
  const subtasks = await Subtask.find({}).lean().exec();
  const corrupt: Array<{
    _id: unknown;
    id?: string;
    task_id?: string;
    issues: string[];
  }> = [];

  for (const s of subtasks as Record<string, unknown>[]) {
    const issues: string[] = [];
    if (!s.task_id || s.task_id === 'undefined') issues.push('task_id faltante');
    if (!s.id || s.id === 'undefined') issues.push('id faltante (solo _id?)');
    if (!s.title || s.title === '') issues.push('title vacío');
    if (s.estimated_duration == null || typeof s.estimated_duration !== 'number')
      issues.push('estimated_duration inválido');
    if (!s.assigned_to || s.assigned_to === '') issues.push('assigned_to vacío');
    if (!isValidDate(s.deadline) && s.deadline != null) issues.push('deadline inválido');
    if (!isValidDate(s.start_date) && s.start_date != null) issues.push('start_date inválido');

    if (issues.length > 0) {
      corrupt.push({
        _id: s._id,
        id: s.id as string,
        task_id: s.task_id as string,
        issues,
      });
    }
  }
  return corrupt;
}

async function fixCorruptTasks(corrupt: Awaited<ReturnType<typeof findCorruptTasks>>) {
  let fixed = 0;
  const now = new Date();
  const defaultDeadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const item of corrupt) {
    const updates: Record<string, unknown> = {};
    if (item.issues.includes('title vacío')) updates.title = '(Sin título)';
    if (item.issues.includes('deadline inválido')) updates.deadline = defaultDeadline;
    if (item.issues.includes('start_date inválido')) updates.start_date = now;
    if (item.issues.includes('estimated_duration inválido')) updates.estimated_duration = 30;
    if (item.issues.includes('id faltante o "undefined"')) updates.id = generateUUID();

    if (Object.keys(updates).length > 0) {
      await Task.updateOne({ _id: item._id }, { $set: updates }).exec();
      fixed++;
      console.log(`   ✅ Tarea ${item.id || item._id}: corregido ${Object.keys(updates).join(', ')}`);
    }
  }
  return fixed;
}

async function fixCorruptSubtasks(corrupt: Awaited<ReturnType<typeof findCorruptSubtasks>>) {
  let fixed = 0;
  const now = new Date();
  const defaultDeadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const item of corrupt) {
    const updates: Record<string, unknown> = {};

    // task_id faltante: intentar obtener de task_work_assignments (task_id = tarea padre cuando task_type=subtask)
    if (item.issues.includes('task_id faltante')) {
      const subtaskId = item.id || (item._id as mongoose.Types.ObjectId)?.toString();
      const assignment = await TaskWorkAssignment.findOne({
        $or: [{ subtask_id: subtaskId }, { task_id: subtaskId, task_type: 'subtask' }],
      })
        .select('task_id project_id')
        .lean()
        .exec();

      if (assignment?.task_id) {
        // Para task_type=subtask, task_id puede ser la tarea padre; verificar que exista
        const parentExists = await Task.findOne({ id: assignment.task_id }).select('id').lean().exec();
        if (parentExists) {
          updates.task_id = assignment.task_id;
        }
      }
      if (!updates.task_id) {
        console.log(
          `   ⚠️  Subtarea ${subtaskId}: sin task_id recuperable - considerar eliminar manualmente`
        );
      }
    }

    if (item.issues.includes('id faltante (solo _id?)'))
      updates.id = item.id || (item._id != null ? String(item._id) : generateUUID());
    if (item.issues.includes('title vacío')) updates.title = '(Sin título)';
    if (item.issues.includes('estimated_duration inválido')) updates.estimated_duration = 15;
    if (item.issues.includes('assigned_to vacío') && updates.task_id) {
      // Usar created_by de la tarea padre como fallback
      const parent = await Task.findOne({ id: updates.task_id }).select('created_by').lean().exec();
      if (parent?.created_by) updates.assigned_to = parent.created_by;
    }
    if (item.issues.includes('deadline inválido')) updates.deadline = defaultDeadline;
    if (item.issues.includes('start_date inválido')) updates.start_date = now;

    if (Object.keys(updates).length > 0) {
      await Subtask.updateOne({ _id: item._id }, { $set: updates }).exec();
      fixed++;
      console.log(
        `   ✅ Subtarea ${item.id || item._id}: corregido ${Object.keys(updates).join(', ')}`
      );
    }
  }
  return fixed;
}

async function main() {
  await connectDB();

  const totalTasks = await Task.countDocuments().exec();
  const totalSubtasks = await Subtask.countDocuments().exec();
  const dbHost = process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@').split('/')[2] ?? '?';

  console.log('\n🔍 Buscando tareas y subtareas con datos incompletos...');
  console.log(`   BD: ${dbHost} | Tareas: ${totalTasks} | Subtareas: ${totalSubtasks}\n`);

  const corruptTasks = await findCorruptTasks();
  const corruptSubtasks = await findCorruptSubtasks();

  console.log('📋 TAREAS CON PROBLEMAS:', corruptTasks.length);
  for (const t of corruptTasks) {
    console.log(`   - ${t.id || t._id}: ${t.issues.join(', ')}`);
  }

  console.log('\n📋 SUBTAREAS CON PROBLEMAS:', corruptSubtasks.length);
  for (const s of corruptSubtasks) {
    console.log(`   - ${s.id || s._id} (task_id: ${s.task_id ?? 'N/A'}): ${s.issues.join(', ')}`);
  }

  if (corruptTasks.length === 0 && corruptSubtasks.length === 0) {
    console.log('\n✅ No se encontraron registros corruptos.');
    process.exit(0);
    return;
  }

  if (FIX) {
    console.log('\n🔧 Aplicando correcciones...\n');
    const tasksFixed = await fixCorruptTasks(corruptTasks);
    const subtasksFixed = await fixCorruptSubtasks(corruptSubtasks);
    console.log(`\n✅ Corregidas ${tasksFixed} tareas y ${subtasksFixed} subtareas.`);
  } else {
    console.log('\n💡 Ejecuta con --fix para aplicar correcciones automáticas.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
