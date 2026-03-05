/**
 * Elimina de task_work_assignments las asignaciones cuyo project_id apunta a proyectos archivados.
 *
 * Uso:
 *   npx tsx scripts/limpiar-assignments-proyectos-archivados.ts     # Solo reportar (dry-run)
 *   npx tsx scripts/limpiar-assignments-proyectos-archivados.ts --fix   # Ejecutar borrado
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { TaskWorkAssignment, Project } from '../models/index.js';

const FIX = process.argv.includes('--fix');

async function main() {
  await connectDB();

  console.log('\n=== Limpieza de task_work_assignments (proyectos archivados) ===\n');

  const archivedProjects = await Project.find({ is_archived: true })
    .select('id name')
    .lean()
    .exec();

  const archivedIds = archivedProjects.map((p) => (p as { id: string }).id);

  if (archivedIds.length === 0) {
    console.log('No hay proyectos archivados. Nada que limpiar.');
    process.exit(0);
  }

  console.log(`Proyectos archivados: ${archivedIds.length}`);
  archivedProjects.forEach((p) => console.log(`  - ${(p as { name: string }).name} (${(p as { id: string }).id})`));
  console.log('');

  const toDelete = await TaskWorkAssignment.find({
    project_id: { $in: archivedIds },
  })
    .select('id user_id date task_id task_type subtask_id project_id status')
    .lean()
    .exec();

  console.log(`Asignaciones a eliminar (project_id en proyecto archivado): ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('No hay asignaciones en proyectos archivados. Nada que hacer.');
    process.exit(0);
  }

  // Resumen por proyecto
  const byProject = toDelete.reduce((acc, a) => {
    const pid = (a as { project_id?: string }).project_id || 'sin_project';
    if (!acc[pid]) acc[pid] = 0;
    acc[pid]++;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nDesglose por proyecto:');
  for (const [pid, count] of Object.entries(byProject)) {
    const proj = archivedProjects.find((p) => (p as { id: string }).id === pid);
    console.log(`  - ${proj ? (proj as { name: string }).name : pid}: ${count} asignaciones`);
  }

  if (FIX) {
    const result = await TaskWorkAssignment.deleteMany({
      project_id: { $in: archivedIds },
    });
    console.log(`\n✓ Eliminadas ${result.deletedCount} asignaciones.`);
  } else {
    console.log('\nModo dry-run. Para ejecutar el borrado, ejecuta con --fix');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
