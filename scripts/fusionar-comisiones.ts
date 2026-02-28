/**
 * Fusiona categorías que contienen "comisiones" en PAGO COMISIONES.
 *
 * Uso: npx tsx scripts/fusionar-comisiones.ts [--dry-run]
 *   --dry-run  Solo muestra qué se fusionaría, sin ejecutar
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { AcctCategory, AcctTransaction } from '../models/index.js';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDB();

  const comisionesCats = await AcctCategory.find({ type: 'expense', name: /comision/i })
    .lean()
    .exec();

  const counts = await AcctTransaction.aggregate([
    { $match: { category_id: { $in: comisionesCats.map((c) => (c as { id: string }).id) } } },
    { $group: { _id: '$category_id', count: { $sum: 1 } } },
  ]).exec();

  const countMap = new Map<string, number>();
  for (const r of counts as { _id: string; count: number }[]) {
    countMap.set(r._id, r.count);
  }

  const withCount = comisionesCats
    .map((c) => ({ ...c, transaction_count: countMap.get((c as { id: string }).id) ?? 0 }))
    .sort((a, b) => b.transaction_count - a.transaction_count);

  const target = withCount[0];
  if (!target) {
    console.log('No hay categorías con "comisiones".');
    process.exit(0);
  }

  const targetId = (target as { id: string }).id;
  const targetName = (target as { name: string }).name;
  const toMerge = withCount.slice(1);

  if (toMerge.length === 0) {
    console.log('No hay categorías con "comisiones" para fusionar en PAGO COMISIONES.');
    process.exit(0);
  }

  console.log(`\n📌 Fusionar en "${targetName}" (${targetId}):\n`);

  for (const cat of toMerge) {
    const c = cat as { id: string; name: string };
    const count = await AcctTransaction.countDocuments({ category_id: c.id }).exec();
    console.log(`  • "${c.name}" (${count} trans.) → ${c.id}`);
  }

  if (dryRun) {
    console.log('\n[--dry-run] No se ejecutó ninguna fusión.\n');
    process.exit(0);
  }

  console.log('\nEjecutando fusiones...\n');

  let totalMerged = 0;
  for (const cat of toMerge) {
    const c = cat as { id: string; name: string };
    const result = await AcctTransaction.updateMany(
      { category_id: c.id },
      { $set: { category_id: targetId } }
    ).exec();
    await AcctCategory.findOneAndDelete({ id: c.id }).exec();
    totalMerged += result.modifiedCount;
    console.log(`  ✓ "${c.name}" → ${result.modifiedCount} transacciones reasignadas`);
  }

  console.log(`\n✅ Total: ${totalMerged} transacciones fusionadas en "${targetName}".\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
