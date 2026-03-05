/**
 * Marca las tareas de supervisión existentes como secuenciales (is_sequential = true).
 * Así el usuario solo ve el checkpoint del día actual hasta que apruebe el anterior.
 *
 * Criterios para identificar supervisión:
 * - notes contiene {"is_supervision": true}
 * - O título contiene "supervisión" (case insensitive)
 * - O --user EMAIL: solo tareas con subtareas asignadas a ese usuario
 *
 * Uso:
 *   npx tsx scripts/marcar-supervision-secuencial.ts     # Solo reportar (dry-run)
 *   npx tsx scripts/marcar-supervision-secuencial.ts --fix   # Ejecutar actualización
 *   npx tsx scripts/marcar-supervision-secuencial.ts --user Walt121296@gmail.com --fix
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Task, Subtask, User } from '../models/index.js';

const FIX = process.argv.includes('--fix');
const userEmailIdx = process.argv.indexOf('--user');
const USER_EMAIL = userEmailIdx >= 0 ? process.argv[userEmailIdx + 1] : undefined;

function isSupervisionTask(task: { notes?: string | null; title?: string }): boolean {
  if (task.notes) {
    try {
      const notes = typeof task.notes === 'string' ? JSON.parse(task.notes) : task.notes;
      if (notes?.is_supervision) return true;
    } catch {
      /* ignore */
    }
  }
  return /supervisi[oó]n/i.test(task.title || '');
}

async function main() {
  await connectDB();

  console.log('\n=== Marcar tareas de supervisión como secuenciales ===\n');
  if (USER_EMAIL) {
    console.log(`Filtro por usuario: ${USER_EMAIL}\n`);
  }

  let candidateTaskIds: string[] | null = null;
  if (USER_EMAIL) {
    const users = await User.find({ $or: [{ email: USER_EMAIL }, { email: { $regex: new RegExp(USER_EMAIL.replace(/@.*/, ''), 'i') } }] }).select('id').lean().exec();
    if (users.length === 0) {
      console.log(`No se encontró usuario con email: ${USER_EMAIL}`);
      process.exit(1);
    }
    const userId = (users[0] as { id: string }).id;
    const subs = await Subtask.find({ assigned_to: userId }).select('task_id').lean().exec();
    candidateTaskIds = [...new Set(subs.map((s) => (s as { task_id: string }).task_id))];
    console.log(`Tareas con subtareas asignadas a este usuario: ${candidateTaskIds.length}\n`);
  }

  const filter = candidateTaskIds ? { id: { $in: candidateTaskIds } } : {};
  const allTasks = await Task.find(filter).select('id title notes is_sequential').lean().exec();

  const supervisionTasks = allTasks.filter((t) => isSupervisionTask(t as { notes?: string; title?: string }));

  // Si filtramos por usuario, incluir TODAS sus tareas con muchas subtareas (patrón supervisión)
  let finalCandidates = supervisionTasks;
  if (USER_EMAIL && candidateTaskIds && candidateTaskIds.length > 0) {
    const subCounts = await Subtask.aggregate([{ $match: { task_id: { $in: candidateTaskIds } } }, { $group: { _id: '$task_id', count: { $sum: 1 } } }]).exec();
    const manySubs = new Set(subCounts.filter((s) => s.count >= 5).map((s) => s._id));
    const extra = allTasks.filter((t) => manySubs.has((t as { id: string }).id) && !supervisionTasks.some((s) => (s as { id: string }).id === (t as { id: string }).id));
    finalCandidates = [...supervisionTasks, ...extra];
    if (extra.length > 0) {
      console.log(`+ ${extra.length} tareas adicionales (5+ subtareas, asignadas a este usuario)\n`);
    }
  }

  const toUpdate = finalCandidates.filter((t) => !(t as { is_sequential?: boolean }).is_sequential);

  console.log(`Tareas de supervisión detectadas: ${finalCandidates.length}`);
  console.log(`Ya secuenciales: ${finalCandidates.length - toUpdate.length}`);
  console.log(`A actualizar (is_sequential: false → true): ${toUpdate.length}`);
  console.log('');

  if (toUpdate.length === 0) {
    console.log('No hay tareas que actualizar.');
    process.exit(0);
  }

  console.log('Tareas a actualizar:');
  toUpdate.forEach((t) => {
    if (t) {
      const task = t as { id: string; title?: string };
      console.log(`  - ${task.title || '(sin título)'} (${task.id})`);
    }
  });
  console.log('');

  if (FIX) {
    const ids = toUpdate.map((t) => (t as { id: string }).id);
    const result = await Task.updateMany(
      { id: { $in: ids } },
      { $set: { is_sequential: true } }
    );
    console.log(`✓ Actualizadas ${result.modifiedCount} tareas (is_sequential: true).`);

    // Marcar también notes con is_supervision para que aparezcan en Bitácora y exijan reporte
    const withNotes = toUpdate.filter((t) => (t as { notes?: string }).notes);
    const withoutNotes = toUpdate.filter((t) => !(t as { notes?: string }).notes);
    if (withoutNotes.length > 0) {
      for (const t of withoutNotes) {
        const task = t as { id: string };
        await Task.updateOne({ id: task.id }, { $set: { notes: JSON.stringify({ is_supervision: true }) } }).exec();
      }
      console.log(`✓ Marcadas ${withoutNotes.length} tareas con is_supervision en notes (para Bitácora).`);
    }
    if (withNotes.length > 0) {
      for (const t of withNotes) {
        const task = t as { id: string; notes?: string };
        try {
          const notes = typeof task.notes === 'string' ? JSON.parse(task.notes) : task.notes || {};
          if (!notes.is_supervision) {
            notes.is_supervision = true;
            await Task.updateOne({ id: task.id }, { $set: { notes: JSON.stringify(notes) } }).exec();
          }
        } catch {
          /* skip */
        }
      }
    }
  } else {
    console.log('Modo dry-run. Para ejecutar la actualización, ejecuta con --fix');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
