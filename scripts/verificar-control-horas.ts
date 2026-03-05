/**
 * Verifica los datos de task_work_assignments para el Control de Horas Diarias.
 * Ayuda a diagnosticar por qué todos los usuarios salen en cero.
 *
 * Uso: npx tsx scripts/verificar-control-horas.ts
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { TaskWorkAssignment, Project, User } from '../models/index.js';

async function main() {
  await connectDB();

  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayUTC = now.toISOString().split('T')[0];

  console.log('\n=== VERIFICACIÓN CONTROL DE HORAS ===\n');
  console.log('Fecha local (usada en la app):', todayLocal);
  console.log('Fecha UTC (antes se usaba esto):', todayUTC);
  console.log('¿Coinciden?', todayLocal === todayUTC ? 'Sí' : 'No - puede causar ceros');
  console.log('');

  const activeProjects = await Project.find({ is_archived: false }).select('id name').lean().exec();
  const activeProjectIds = new Set(activeProjects.map((p) => (p as { id: string }).id));

  console.log('--- PROYECTOS ACTIVOS ---');
  console.log(`Total: ${activeProjects.length}`);
  activeProjects.slice(0, 5).forEach((p) => console.log(`  - ${(p as { name: string }).name} (${(p as { id: string }).id})`));
  if (activeProjects.length > 5) console.log(`  ... y ${activeProjects.length - 5} más`);
  console.log('');

  const users = await User.find({}).select('id name email').lean().exec();
  console.log('--- USUARIOS ---');
  console.log(`Total: ${users.length}`);
  console.log('');

  const assignmentsToday = await TaskWorkAssignment.find({ date: todayLocal })
    .select('id user_id date project_id estimated_duration actual_duration created_at task_type')
    .lean()
    .exec();

  console.log('--- ASIGNACIONES PARA HOY (date = ' + todayLocal + ') ---');
  console.log(`Total: ${assignmentsToday.length}`);

  if (assignmentsToday.length === 0) {
    const sampleDates = await TaskWorkAssignment.aggregate([
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 10 },
    ]).exec();
    console.log('\nNo hay asignaciones para hoy. Fechas que SÍ existen en la BD (últimas 10):');
    sampleDates.forEach((r) => console.log(`  - ${r._id}: ${r.count} asignaciones`));
  } else {
    const withNullProject = assignmentsToday.filter((a) => !(a as { project_id?: string }).project_id);
    const withValidProject = assignmentsToday.filter((a) => (a as { project_id?: string }).project_id);
    const inActiveProject = withValidProject.filter((a) =>
      activeProjectIds.has((a as { project_id: string }).project_id)
    );

    console.log(`  Con project_id NULL: ${withNullProject.length}`);
    console.log(`  Con project_id válido: ${withValidProject.length}`);
    console.log(`  En proyectos activos: ${inActiveProject.length}`);

    const byUser = new Map<string, number>();
    assignmentsToday.forEach((a) => {
      const uid = (a as { user_id: string }).user_id;
      byUser.set(uid, (byUser.get(uid) || 0) + 1);
    });
    console.log('\n  Por usuario:');
    for (const [uid, count] of byUser) {
      const u = users.find((us) => (us as { id: string }).id === uid);
      const name = u ? (u as { name?: string }).name || (u as { email: string }).email : uid;
      console.log(`    - ${name}: ${count} asignaciones`);
    }

    console.log('\n  Primeras 3 asignaciones (muestra):');
    assignmentsToday.slice(0, 3).forEach((a, i) => {
      const x = a as { user_id: string; date: string; project_id?: string; estimated_duration?: number; created_at?: string };
      console.log(`    ${i + 1}. user=${x.user_id?.slice(0, 8)}... date=${x.date} project_id=${x.project_id ?? 'NULL'} est=${x.estimated_duration}min created=${x.created_at}`);
    });
  }

  console.log('');

  const assignmentsUTC = await TaskWorkAssignment.find({ date: todayUTC })
    .select('id user_id date')
    .lean()
    .exec();

  if (todayLocal !== todayUTC && assignmentsUTC.length > 0) {
    console.log('--- ASIGNACIONES CON FECHA UTC ---');
    console.log(`Si se usara fecha UTC (${todayUTC}): ${assignmentsUTC.length} asignaciones`);
    console.log('');
  }

  const totalInDb = await TaskWorkAssignment.countDocuments().exec();
  console.log('--- RESUMEN GLOBAL ---');
  console.log(`Total asignaciones en task_work_assignments: ${totalInDb}`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
