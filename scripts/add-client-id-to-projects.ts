/**
 * Migración: añadir client_id a proyectos existentes en MongoDB
 *
 * Uso: npx tsx scripts/add-client-id-to-projects.ts
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { Project } from '../models/index.js';

async function main() {
  await connectDB();

  const result = await Project.updateMany(
    { client_id: { $exists: false } },
    { $set: { client_id: null } }
  );

  console.log(`✅ Proyectos actualizados: ${result.modifiedCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
