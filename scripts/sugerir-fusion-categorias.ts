/**
 * Script que analiza las categorías de contabilidad y sugiere cuáles se pueden fusionar.
 *
 * Criterios de sugerencia:
 * - Mismo tipo (income/expense)
 * - Nombres idénticos (case-insensitive)
 * - Un nombre contiene al otro (ej: "Marketing" y "Marketing Digital")
 * - Nombres muy similares (distancia de Levenshtein baja)
 *
 * Uso: npx tsx scripts/sugerir-fusion-categorias.ts
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import { AcctCategory, AcctTransaction } from '../models/index.js';

type CatWithCount = { id: string; name: string; type: string; parent_id: string | null; transaction_count: number };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function oneContainsOther(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 2 && nb.length > 2 && (na.includes(nb) || nb.includes(na));
}

async function main() {
  await connectDB();

  const categories = (await AcctCategory.find({}).sort({ type: 1, name: 1 }).lean().exec()) as {
    id: string;
    name: string;
    type: string;
    parent_id: string | null;
  }[];

  const counts = await AcctTransaction.aggregate([
    { $match: { category_id: { $ne: null } } },
    { $group: { _id: '$category_id', count: { $sum: 1 } } },
  ]).exec();

  const countMap = new Map<string, number>();
  for (const c of counts as { _id: string; count: number }[]) {
    countMap.set(c._id, c.count);
  }

  const cats: CatWithCount[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    parent_id: c.parent_id,
    transaction_count: countMap.get(c.id) ?? 0,
  }));

  console.log('\n📊 Categorías analizadas:', cats.length);
  console.log('─'.repeat(60));

  const suggestions: { reason: string; source: CatWithCount; target: CatWithCount; score: number }[] = [];

  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i];
      const b = cats[j];
      if (a.type !== b.type) continue;

      const na = normalize(a.name);
      const nb = normalize(b.name);

      // 1. Idénticos (case-insensitive)
      if (na === nb) {
        suggestions.push({
          reason: 'Nombre idéntico',
          source: a.transaction_count <= b.transaction_count ? a : b,
          target: a.transaction_count > b.transaction_count ? a : b,
          score: 1,
        });
        continue;
      }

      // 2. Uno contiene al otro
      if (oneContainsOther(a.name, b.name)) {
        const score = 0.9;
        suggestions.push({
          reason: 'Un nombre contiene al otro',
          source: a.transaction_count <= b.transaction_count ? a : b,
          target: a.transaction_count > b.transaction_count ? a : b,
          score,
        });
        continue;
      }

      // 3. Muy similares (Levenshtein)
      const sim = similarity(na, nb);
      if (sim >= 0.8) {
        suggestions.push({
          reason: `Similitud alta (${Math.round(sim * 100)}%)`,
          source: a.transaction_count <= b.transaction_count ? a : b,
          target: a.transaction_count > b.transaction_count ? a : b,
          score: sim,
        });
      }
    }
  }

  // Eliminar duplicados (mismo par en distinto orden)
  const seen = new Set<string>();
  const unique = suggestions.filter((s) => {
    const key = [s.source.id, s.target.id].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // --- SIMPLIFICACIÓN POR PREFIJO (ej: ZOOM JOSHUA → ZOOM) ---
  // Agrupar por "tipo + primera palabra" (solo mismo type puede fusionarse)
  const byPrefix = new Map<string, CatWithCount[]>();
  for (const c of cats) {
    const firstWord = (c.name.trim().split(/\s+/)[0] || '').toUpperCase();
    if (firstWord.length >= 3) {
      const key = `${c.type}:${firstWord}`;
      if (!byPrefix.has(key)) byPrefix.set(key, []);
      byPrefix.get(key)!.push(c);
    }
  }

  const simplificaciones: { prefix: string; type: string; target: CatWithCount; toMerge: CatWithCount[] }[] = [];
  for (const [key, list] of byPrefix.entries()) {
    if (list.length < 2) continue;
    const [type, prefix] = key.split(':');
    const sorted = [...list].sort((a, b) => b.transaction_count - a.transaction_count);
    const target = sorted[0];
    const toMerge = sorted.slice(1).filter((c) => c.name.toUpperCase() !== prefix);
    if (toMerge.length === 0) continue;
    simplificaciones.push({ prefix, type, target, toMerge });
  }

  // --- SALIDA ---
  if (unique.length === 0 && simplificaciones.length === 0) {
    console.log('\n✅ No se encontraron categorías que sugieran fusión.\n');
    process.exit(0);
    return;
  }

  // 1. Simplificaciones por prefijo (ZOOM*, PARTE*, etc.)
  if (simplificaciones.length > 0) {
    console.log('\n📌 SIMPLIFICACIÓN POR PREFIJO (ej: ZOOM JOSHUA → ZOOM)\n');
    for (const s of simplificaciones.sort((a, b) => b.target.transaction_count - a.target.transaction_count)) {
      const typeLabel = s.type === 'income' ? 'ingreso' : 'gasto';
      const totalToMerge = s.toMerge.reduce((sum, c) => sum + c.transaction_count, 0);
      console.log(`  Prefijo "${s.prefix}" (${typeLabel}) → mantener "${s.target.name}" (${s.target.transaction_count} trans.)`);
      for (const c of s.toMerge) {
        console.log(`    • Fusionar "${c.name}" (${c.transaction_count} trans.) → ${s.target.id}`);
      }
      console.log(`    Total a fusionar: ${totalToMerge} trans. en ${s.toMerge.length} categorías\n`);
    }
    console.log('─'.repeat(60));
  }

  // 2. Sugerencias puntuales (siempre: pequeñas → grandes)
  if (unique.length > 0) {
    const sorted = unique.sort((a, b) => {
      const byTarget = b.target.transaction_count - a.target.transaction_count;
      if (byTarget !== 0) return byTarget;
      return b.score - a.score;
    });
    console.log(`\n🔗 OTRAS SUGERENCIAS (pequeñas → grandes) (${sorted.length}):\n`);
    for (const s of sorted) {
      console.log(`  • ${s.reason}`);
      console.log(`    Fusionar: "${s.source.name}" (${s.source.transaction_count} trans.)`);
      console.log(`    En:      "${s.target.name}" (${s.target.transaction_count} trans.)`);
      console.log(`    IDs: ${s.source.id} → ${s.target.id}`);
      console.log('');
    }
  }

  console.log('─'.repeat(60));
  console.log('\nPara fusionar, usa la UI de Configuración > Categorías o la API:');
  console.log('  POST /api/contabilidad/categories/:id/merge');
  console.log('  Body: { "target_category_id": "<id_destino>", "created_by": "<user_id>" }\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
