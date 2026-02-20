/**
 * Verifica que la API devuelva subtareas con todos los campos (no solo _id).
 * Simula la misma query que usa Tasks.tsx.
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { executeQuery } from '../lib/db/queryExecutor.js';

async function main() {
  await connectDB();

  console.log('\n🔍 Simulando fetch de subtareas (como Tasks.tsx)...\n');

  const result = await executeQuery({
    table: 'subtasks',
    operation: 'select',
    select: `*,
tasks!inner(
  id, project_id,
  projects!inner(id, is_archived)
)`,
    filters: { eq: { 'tasks.projects.is_archived': false } },
  });

  const data = result.data as Record<string, unknown>[] | null;
  const count = Array.isArray(data) ? data.length : 0;

  console.log(`   Subtareas devueltas: ${count}`);

  if (count > 0) {
    const first = data![0];
    const keys = Object.keys(first);
    console.log(`   Campos en primera subtarea: ${keys.join(', ')}`);
    console.log(`   ¿Tiene task_id?: ${'task_id' in first && first.task_id ? 'Sí' : 'No'}`);
    console.log(`   ¿Tiene title?: ${'title' in first && first.title ? 'Sí' : 'No'}`);
    console.log(`   ¿Tiene id?: ${'id' in first && first.id ? 'Sí' : 'No'}`);
    console.log('\n   Muestra (primeros campos):');
    console.log(
      '   ' +
        JSON.stringify(
          {
            id: first.id,
            _id: first._id,
            task_id: first.task_id,
            title: first.title,
            estimated_duration: first.estimated_duration,
          },
          null,
          2
        )
          .split('\n')
          .join('\n   ')
    );
  }

  const ok = count > 0 && data![0]?.task_id && data![0]?.title;
  console.log(ok ? '\n✅ API devuelve datos completos.' : '\n⚠️ Revisar: faltan campos.');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
