/**
 * Lista todos los proyectos (entidades) de contabilidad, su cierre contable y si aparece en el balance.
 *
 * Uso: npx tsx scripts/listar-proyectos-cierre.ts
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { connectDB } from '../lib/mongoose.js';
import {
  AcctEntity,
  AcctChartAccount,
  AcctJournalEntry,
  AcctJournalEntryLine,
} from '../models/index.js';

function normCurrency(c: string): 'USD' | 'COP' {
  return (c || 'USD').toUpperCase() === 'COP' ? 'COP' : 'USD';
}

async function main() {
  await connectDB();

  const entities = await AcctEntity.find({}).sort({ sort_order: 1, name: 1 }).lean().exec();
  const entityList = entities as { id: string; name: string; type: string }[];

  const entryIds = (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);
  if (entryIds.length === 0) {
    console.log('No hay asientos contables. La base está vacía.');
    process.exit(0);
  }

  // 1. Balance por entidad (ingresos - gastos) - cuentas income/expense
  const balancePipeline = [
    { $match: { journal_entry_id: { $in: entryIds } } },
    { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
    { $unwind: '$acc' },
    { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
    {
      $addFields: {
        amount: {
          $cond: [
            { $eq: ['$acc.type', 'income'] },
            { $subtract: ['$credit', '$debit'] },
            { $subtract: [0, { $subtract: ['$debit', '$credit'] }] },
          ],
        },
      },
    },
    { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, total_amount: { $sum: '$amount' } } },
  ];
  const balanceResults = (await AcctJournalEntryLine.aggregate(balancePipeline).exec()) as {
    _id: { entity_id: string | null; currency: string };
    total_amount: number;
  }[];

  // 2. Cierre contable = créditos en cuentas "Utilidades [nombre]" (distribuciones/liquidaciones)
  const equityAccounts = await AcctChartAccount.find({ type: 'equity', name: { $regex: /^Utilidades\s+/i } })
    .select('id name')
    .lean()
    .exec();
  const equityIds = (equityAccounts as { id: string; name: string }[]).map((a) => a.id);
  let distResults: { _id: { entity_id: string | null; currency: string }; credit: number }[] = [];
  if (equityIds.length > 0) {
    const distPipeline = [
      { $match: { journal_entry_id: { $in: entryIds }, account_id: { $in: equityIds } } },
      { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, credit: { $sum: '$credit' } } },
    ];
    distResults = (await AcctJournalEntryLine.aggregate(distPipeline).exec()) as {
      _id: { entity_id: string | null; currency: string };
      credit: number;
    }[];
  }

  // Construir mapas
  const balanceByEntity = new Map<string, { usd: number; cop: number }>();
  const cierreByEntity = new Map<string, { usd: number; cop: number }>();

  for (const r of balanceResults) {
    const eid = r._id.entity_id ?? 'null';
    if (!balanceByEntity.has(eid)) balanceByEntity.set(eid, { usd: 0, cop: 0 });
    const row = balanceByEntity.get(eid)!;
    const cur = normCurrency(r._id.currency || 'USD');
    const amt = Math.round(r.total_amount * 100) / 100;
    if (cur === 'COP') row.cop += amt;
    else row.usd += amt;
  }

  for (const d of distResults) {
    const eid = d._id.entity_id ?? 'null';
    if (!cierreByEntity.has(eid)) cierreByEntity.set(eid, { usd: 0, cop: 0 });
    const row = cierreByEntity.get(eid)!;
    const cur = normCurrency(d._id.currency || 'USD');
    const amt = Math.round(d.credit * 100) / 100;
    if (cur === 'COP') row.cop += amt;
    else row.usd += amt;
  }

  // Reporte
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  PROYECTOS / ENTIDADES DE CONTABILIDAD - Cierre contable y Balance');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const entityMap = new Map(entityList.map((e) => [e.id, e]));

  const rows: Array<{
    name: string;
    type: string;
    balance_usd: number;
    balance_cop: number;
    cierre_usd: number;
    cierre_cop: number;
    pendiente_usd: number;
    pendiente_cop: number;
    liquidado: boolean;
  }> = [];

  for (const ent of entityList) {
    const bal = balanceByEntity.get(ent.id) ?? { usd: 0, cop: 0 };
    const cierre = cierreByEntity.get(ent.id) ?? { usd: 0, cop: 0 };
    const pendiente = { usd: bal.usd - cierre.usd, cop: bal.cop - cierre.cop };
    const liquidado = Math.abs(pendiente.usd) < 0.01 && Math.abs(pendiente.cop) < 0.01;
    rows.push({
      name: ent.name,
      type: ent.type,
      balance_usd: bal.usd,
      balance_cop: bal.cop,
      cierre_usd: cierre.usd,
      cierre_cop: cierre.cop,
      pendiente_usd: pendiente.usd,
      pendiente_cop: pendiente.cop,
      liquidado,
    });
  }

  // Sin asignar
  const balNull = balanceByEntity.get('null') ?? { usd: 0, cop: 0 };
  const cierreNull = cierreByEntity.get('null') ?? { usd: 0, cop: 0 };
  const pendNull = { usd: balNull.usd - cierreNull.usd, cop: balNull.cop - cierreNull.cop };
  if (balNull.usd !== 0 || balNull.cop !== 0 || cierreNull.usd !== 0 || cierreNull.cop !== 0) {
    rows.push({
      name: 'Sin asignar',
      type: '—',
      balance_usd: balNull.usd,
      balance_cop: balNull.cop,
      cierre_usd: cierreNull.usd,
      cierre_cop: cierreNull.cop,
      pendiente_usd: pendNull.usd,
      pendiente_cop: pendNull.cop,
      liquidado: Math.abs(pendNull.usd) < 0.01 && Math.abs(pendNull.cop) < 0.01,
    });
  }

  // Ordenar por nombre
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const fmt = (n: number) => (n >= 0 ? `$${n.toLocaleString('es', { minimumFractionDigits: 2 })}` : `-$${Math.abs(n).toLocaleString('es', { minimumFractionDigits: 2 })}`);

  for (const r of rows) {
    const tieneCierre = r.cierre_usd !== 0 || r.cierre_cop !== 0;
    const cierreStr = tieneCierre ? `USD: ${fmt(r.cierre_usd)} | COP: ${fmt(r.cierre_cop)}` : 'Sin cierre';
    const status = r.liquidado ? '✓ Liquidado' : 'Pendiente';
    console.log(`\n📌 ${r.name} (${r.type})`);
    console.log(`   Balance (ingresos - gastos): USD ${fmt(r.balance_usd)} | COP ${fmt(r.balance_cop)}`);
    console.log(`   Cierre contable (liquidaciones): ${cierreStr}`);
    console.log(`   Pendiente de liquidar: USD ${fmt(r.pendiente_usd)} | COP ${fmt(r.pendiente_cop)}`);
    console.log(`   Estado: ${status}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  ¿QUÉ TOMA EL BALANCE?');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  console.log('  El endpoint GET /balance usa:');
  console.log('  • Líneas de asientos (AcctJournalEntryLine) con cuentas tipo income y expense');
  console.log('  • Agrupa por entity_id y currency');
  console.log('  • Fórmula: Ingresos (credit-debit) - Gastos (debit-credit)');
  console.log('  • Con ?liquidacion=1: resta los créditos en cuentas "Utilidades [nombre]"');
  console.log('    (es el cierre contable = distribuciones ya hechas)');
  console.log('  • Resultado: saldo pendiente de liquidar por proyecto');
  console.log('\n═══════════════════════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
