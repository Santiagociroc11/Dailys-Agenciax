/**
 * Migración: corregir índice único de task_work_assignments
 * El índice anterior (user_id, date, task_id, task_type) causaba E11000 duplicate key
 * cuando varias subtareas del mismo padre se asignaban el mismo día.
 *
 * Nuevo índice: (user_id, date, task_type, task_id, subtask_id)
 *
 * Uso: npx tsx scripts/fix-task-work-assignments-index.ts
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { TaskWorkAssignment } from '../models/TaskWorkAssignment.js';

async function main() {
  await connectDB();

  const collection = TaskWorkAssignment.collection;

  try {
    const indexes = await collection.indexes();
    const oldIndexName = 'user_id_1_date_1_task_id_1_task_type_1';

    if (indexes.some((i) => i.name === oldIndexName)) {
      await collection.dropIndex(oldIndexName);
      console.log(`✅ Índice antiguo eliminado: ${oldIndexName}`);
    } else {
      console.log(`ℹ️ Índice antiguo no encontrado (quizá ya se eliminó)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('index not found')) {
      console.log('ℹ️ Índice antiguo no existía');
    } else {
      throw err;
    }
  }

  await TaskWorkAssignment.syncIndexes();
  console.log('✅ Índices sincronizados con el schema actual');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
