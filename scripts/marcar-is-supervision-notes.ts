/**
 * Añade is_supervision a notes de tareas específicas (para Bitácora y reporte obligatorio).
 * Uso: npx tsx scripts/marcar-is-supervision-notes.ts
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Task } from '../models/index.js';

const TASK_IDS = [
  '4df69464-226a-409b-8ffd-68f00ee72e03', // SEGUIMIENTO DISTRIBUCION DE CONTENIDO GERSSON
  '9b9454ef-ebfe-4428-9a12-99d98d7e85cc', // DISTRIBUCION DE CONTENIDO
];

async function main() {
  await connectDB();
  for (const id of TASK_IDS) {
    const task = await Task.findOne({ id }).select('notes').lean().exec();
    if (!task) continue;
    const current = (task as { notes?: string }).notes;
    let notes: Record<string, unknown> = {};
    try {
      notes = current ? (typeof current === 'string' ? JSON.parse(current) : current) : {};
    } catch {
      notes = {};
    }
    notes.is_supervision = true;
    await Task.updateOne({ id }, { $set: { notes: JSON.stringify(notes) } }).exec();
    console.log(`✓ ${id}`);
  }
  console.log('Listo.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
