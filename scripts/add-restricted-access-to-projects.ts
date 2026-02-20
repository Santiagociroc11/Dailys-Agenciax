/**
 * Migración: añadir restricted_access a proyectos existentes en MongoDB
 *
 * Uso: npx tsx scripts/add-restricted-access-to-projects.ts
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Project } from '../models/index.js';

async function main() {
  await connectDB();

  const result = await Project.updateMany(
    { restricted_access: { $exists: false } },
    { $set: { restricted_access: false } }
  );

  console.log(`✅ Proyectos actualizados: ${result.modifiedCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
