/**
 * Busca actividades de supervisión asignadas al usuario waltbarros.
 *
 * Uso: npx tsx scripts/buscar-supervision-waltbarros.ts
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Task, Subtask, User } from '../models/index.js';

async function main() {
  await connectDB();

  console.log('\n=== Actividades de supervisión de waltbarros ===\n');

  // Buscar usuario por email (Walt121296@gmail.com o pasado como argumento)
  const userEmail = process.argv[2] || 'Walt121296@gmail.com';
  const users = await User.find({ $or: [{ email: userEmail }, { email: { $regex: /walt121296/i } }] })
    .select('id name email')
    .lean()
    .exec();

  if (users.length === 0) {
    console.log('No se encontró usuario waltbarros.');
    process.exit(1);
  }

  const user = users[0] as { id: string; name?: string; email?: string };
  console.log(`Usuario: ${user.name || user.email} (id: ${user.id})\n`);

  // Subtareas asignadas a este usuario
  const subtasks = await Subtask.find({ assigned_to: user.id })
    .select('id title task_id status sequence_order start_date deadline')
    .lean()
    .exec();

  const taskIds = [...new Set(subtasks.map((s) => (s as { task_id: string }).task_id))];

  const tasks = await Task.find({ id: { $in: taskIds } })
    .select('id title notes is_sequential project_id')
    .lean()
    .exec();

  const taskMap = new Map(tasks.map((t) => [(t as { id: string }).id, t]));

  // Agrupar por tarea
  const byTask = new Map<string, typeof subtasks>();
  for (const s of subtasks) {
    const st = s as { task_id: string };
    const list = byTask.get(st.task_id) || [];
    list.push(s);
    byTask.set(st.task_id, list);
  }

  console.log(`Total subtareas asignadas: ${subtasks.length}`);
  console.log(`En ${taskIds.length} tareas distintas\n`);

  // Ordenar por cantidad de subtareas (las de supervisión suelen tener muchas)
  const sorted = [...byTask.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('--- Tareas con subtareas asignadas a waltbarros ---\n');
  for (const [taskId, subs] of sorted) {
    const task = taskMap.get(taskId) as { id: string; title?: string; notes?: string; is_sequential?: boolean } | undefined;
    const subsSorted = subs.sort((a, b) => ((a as { sequence_order?: number }).sequence_order ?? 0) - ((b as { sequence_order?: number }).sequence_order ?? 0));

    console.log(`📋 ${task?.title || '(sin título)'}`);
    console.log(`   task_id: ${taskId} | is_sequential: ${task?.is_sequential} | ${subs.length} subtareas`);
    if (task?.notes) {
      const hasSupervision = String(task.notes).includes('is_supervision');
      console.log(`   notes: ${hasSupervision ? '✓ is_supervision' : String(task.notes).slice(0, 80)}...`);
    }
    console.log('   Subtareas:');
    subsSorted.slice(0, 5).forEach((s) => {
      const sub = s as { title?: string; status?: string; sequence_order?: number; deadline?: string };
      console.log(`     - ${sub.title} (nivel ${sub.sequence_order}, ${sub.status})`);
    });
    if (subs.length > 5) {
      console.log(`     ... y ${subs.length - 5} más`);
    }
    console.log('');
  }

  // Identificar candidatas a supervisión (muchas subtareas, posible patrón diario)
  const supervisionCandidates = sorted.filter(([taskId, subs]) => {
    const task = taskMap.get(taskId) as { title?: string; notes?: string } | undefined;
    const hasNotesFlag = task?.notes && String(task.notes).includes('is_supervision');
    const hasTitle = /supervisi[oó]n|revisi[oó]n|seguimiento|checkpoint/i.test(task?.title || '');
    const manySubs = subs.length >= 5;
    return hasNotesFlag || hasTitle || (manySubs && subs.some((s) => /^\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.test((s as { title?: string }).title || '')));
  });

  if (supervisionCandidates.length > 0) {
    console.log('\n--- Candidatas a supervisión (para marcar is_sequential) ---');
    supervisionCandidates.forEach(([taskId]) => {
      const task = taskMap.get(taskId) as { id: string; title?: string; is_sequential?: boolean };
      if (task && !task.is_sequential) {
        console.log(`   ${task.title} (id: ${task.id}) → actualizar is_sequential: true`);
      }
    });
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
