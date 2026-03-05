/**
 * Verifica tareas retrasadas: asignaciones con date < hoy y status pendiente.
 * Criterio: assignment.date < today && status NOT IN (completed, in_review, approved)
 *
 * Uso: npx tsx scripts/verificar-tareas-retrasadas.ts
 *
 * Requiere: MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { TaskWorkAssignment, Project, User } from '../models/index.js';

const FINAL_STATUSES = ['completed', 'in_review', 'approved'];

async function main() {
  await connectDB();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  console.log('\n=== TAREAS RETRASADAS (date < hoy, sin completar) ===\n');
  console.log('Hoy:', todayStr);
  console.log('Criterio: date < hoy AND status NOT IN (completed, in_review, approved)');
  console.log('');

  const activeProjects = await Project.find({ is_archived: false }).select('id name').lean().exec();
  const activeProjectIds = new Set(activeProjects.map((p) => (p as { id: string }).id));

  const users = await User.find({}).select('id name email').lean().exec();
  const userMap = new Map(users.map((u) => [(u as { id: string }).id, u]));

  const overdueAssignments = await TaskWorkAssignment.find({
    date: { $lt: todayStr },
    status: { $nin: FINAL_STATUSES },
  })
    .select('id user_id date project_id task_type estimated_duration status')
    .lean()
    .exec();

  const filtered = overdueAssignments.filter((a) => {
    const pid = (a as { project_id?: string }).project_id;
    return !pid || activeProjectIds.has(pid);
  });

  console.log('--- TOTAL ASIGNACIONES RETRASADAS ---');
  console.log(`Total (todas): ${overdueAssignments.length}`);
  console.log(`En proyectos activos: ${filtered.length}`);
  console.log('');

  const byUser = new Map<string, { count: number; totalMinutes: number }>();
  filtered.forEach((a) => {
    const uid = (a as { user_id: string }).user_id;
    if (!byUser.has(uid)) byUser.set(uid, { count: 0, totalMinutes: 0 });
    const row = byUser.get(uid)!;
    row.count += 1;
    row.totalMinutes += (a as { estimated_duration?: number }).estimated_duration ?? 0;
  });

  console.log('--- POR USUARIO ---');
  const sorted = Array.from(byUser.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [uid, data] of sorted) {
    const u = userMap.get(uid);
    const name = u ? (u as { name?: string }).name || (u as { email: string }).email : uid;
    const hours = (data.totalMinutes / 60).toFixed(1);
    console.log(`  ${name}: ${data.count} tareas retrasadas (${hours}h)`);
  }

  if (filtered.length > 0) {
    console.log('\n--- MUESTRA (primeras 5) ---');
    filtered.slice(0, 5).forEach((a, i) => {
      const x = a as { user_id: string; date: string; project_id?: string; estimated_duration?: number; status?: string };
      const u = userMap.get(x.user_id);
      const name = u ? (u as { name?: string }).name || (u as { email: string }).email : x.user_id.slice(0, 8);
      console.log(`  ${i + 1}. ${name} | date=${x.date} | ${x.estimated_duration}min | status=${x.status}`);
    });
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
