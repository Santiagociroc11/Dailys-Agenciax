/**
 * Script para verificar si una subtarea tiene alertas_solicitudes en notes.
 * Uso: npx tsx scripts/verificar-alertas-subtask.ts [subtask_id]
 * Si no se pasa ID, lista las últimas 10 subtareas de supervisión con sus notes.
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Subtask } from '../models/Subtask.js';
import { Task } from '../models/Task.js';

async function main() {
  await connectDB();
  console.log('Conectado a MongoDB\n');

  const subtaskId = process.argv[2];

  if (subtaskId) {
    // Verificar subtarea específica
    const subtask = await Subtask.findOne({ id: subtaskId }).lean().exec();
    if (!subtask) {
      console.log('Subtask no encontrada con id:', subtaskId);
      process.exit(1);
    }
    console.log('Subtask:', subtask.title);
    console.log('ID:', subtask.id);
    console.log('Status:', subtask.status);
    console.log('\nNotes (raw):', JSON.stringify(subtask.notes, null, 2));
    const notes = typeof subtask.notes === 'string' ? JSON.parse(subtask.notes || '{}') : subtask.notes || {};
    console.log('\nalertas_solicitudes:', notes.alertas_solicitudes || 'NO HAY');
  } else {
    // Listar últimas subtareas de tareas de supervisión
    const supervisionTasks = await Task.find({ notes: /is_supervision/ }).select('id title').lean().exec();
    const taskIds = supervisionTasks.map((t: { id: string }) => t.id);
    const subtasks = await Subtask.find({ task_id: { $in: taskIds } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean()
      .exec();

    console.log('Últimas 10 subtareas de supervisión:\n');
    for (const s of subtasks as Array<{ id: string; title: string; status: string; notes: unknown }>) {
      const notes = typeof s.notes === 'string' ? (() => { try { return JSON.parse(s.notes || '{}'); } catch { return {}; } })() : s.notes || {};
      const alertas = notes.alertas_solicitudes;
      const hasAlertas = Array.isArray(alertas) && alertas.length > 0;
      console.log(`- ${s.id} | ${s.title} | ${s.status} | alertas: ${hasAlertas ? alertas.length : 0}`);
      if (hasAlertas) {
        console.log('  ', JSON.stringify(alertas, null, 2));
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
