/**
 * Busca tareas de supervisión en la base de datos.
 * Criterios amplios para encontrarlas.
 *
 * Uso: npx tsx scripts/buscar-supervision-tasks.ts
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Task, Subtask } from '../models/index.js';

async function main() {
  await connectDB();

  console.log('\n=== Búsqueda de tareas de supervisión ===\n');

  // 1. Por notes con is_supervision
  const withNotes = await Task.find({ notes: { $regex: /is_supervision/i } })
    .select('id title notes is_sequential project_id created_at')
    .lean()
    .exec();

  console.log('1. Por notes con "is_supervision":', withNotes.length);
  withNotes.forEach((t) => {
    const task = t as { id: string; title?: string; notes?: string; is_sequential?: boolean };
    console.log(`   - ${task.title} (id: ${task.id}, is_sequential: ${task.is_sequential})`);
  });
  console.log('');

  // 2. Por título con "supervisión" o variants
  const byTitle = await Task.find({
    title: { $regex: /supervisi[oó]n|supervis|revisi[oó]n\s+diaria|checkpoint/i },
  })
    .select('id title notes is_sequential project_id created_at')
    .lean()
    .exec();

  console.log('2. Por título (supervisión, revision diaria, checkpoint):', byTitle.length);
  byTitle.forEach((t) => {
    const task = t as { id: string; title?: string; notes?: string; is_sequential?: boolean };
    console.log(`   - ${task.title} (id: ${task.id}, is_sequential: ${task.is_sequential})`);
  });
  console.log('');

  // 3. Tareas con muchas subtareas (patrón típico: 1 subtarea por día)
  const allTasks = await Task.find({}).select('id title is_sequential').lean().exec();
  const taskIds = allTasks.map((t) => (t as { id: string }).id);

  const subtaskCounts = await Subtask.aggregate([
    { $match: { task_id: { $in: taskIds } } },
    { $group: { _id: '$task_id', count: { $sum: 1 } } },
  ]).exec();

  const manySubtasks = subtaskCounts.filter((s) => s.count >= 5);
  const countMap = new Map(manySubtasks.map((s) => [s._id, s.count]));

  console.log('3. Tareas con 5+ subtareas (posible supervisión diaria):', manySubtasks.length);
  for (const t of allTasks) {
    const task = t as { id: string; title?: string; is_sequential?: boolean };
    const count = countMap.get(task.id);
    if (count) {
      console.log(`   - ${task.title} (id: ${task.id}, ${count} subtareas, is_sequential: ${task.is_sequential})`);
    }
  }
  console.log('');

  // 4. Listar TODAS las tareas (últimas 50) para inspección manual
  const recent = await Task.find({})
    .sort({ created_at: -1 })
    .limit(50)
    .select('id title notes is_sequential created_at')
    .lean()
    .exec();

  console.log('4. Últimas 50 tareas creadas (para inspección):');
  recent.forEach((t) => {
    const task = t as { id: string; title?: string; notes?: string; is_sequential?: boolean; created_at?: string };
    const notesPreview = task.notes ? String(task.notes).slice(0, 60) + '...' : '-';
    console.log(`   - ${task.title} | notes: ${notesPreview} | seq: ${task.is_sequential}`);
  });

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
