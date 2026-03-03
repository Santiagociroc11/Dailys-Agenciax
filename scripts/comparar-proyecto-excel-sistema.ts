/**
 * Compara P&G y Balance de un proyecto entre el Excel (CSV) y el sistema.
 * Ayuda a diagnosticar discrepancias como "Adriana difiere entre Excel y sistema".
 *
 * Uso:
 *   npx tsx scripts/comparar-proyecto-excel-sistema.ts --entity=Adriana
 *   npx tsx scripts/comparar-proyecto-excel-sistema.ts --entity=Adriana "CUENTAS DINERO PRESUPUESTO final.csv"
 *   npx tsx scripts/comparar-proyecto-excel-sistema.ts --entity=Adriana --start=2025-01-01 --end=2025-12-31
 *
 * Requiere MONGODB_URI en .env
 */
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../lib/mongoose.js';
import { parseAmount, parseSpanishDate } from '../lib/contabilidad/csvUtils.js';
import {
  AcctEntity,
  AcctChartAccount,
  AcctJournalEntry,
  AcctJournalEntryLine,
} from '../models/index.js';

const COP_ACCOUNT_RE = /BANCOLOMBIA|DAVIVIENDA|NEQUI\s*COP/i;
const INGRESO_CATEGORIES = /INGRESOS\s*PROYECTO|INGRESO|COBRO|VENTAS|SALDOS\s*INICIALES/i;
const GASTO_CATEGORIES = /GASTOS|SOFTWARE|EDUCACION|CURSOS|REPARTICI[OÓ]N|NOMINA|TRASLADOS|HOSTINGUER|LEGALES|ADQUISICIONES|VIAJES|DOMINIOS|PAGOS\s*PENDIENTES|CONTRATOS|DEUDAS/i;
const isMovContable = (t: string) => /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(t);
const isTrasladoBancos = (amounts: { amount: number }[]) =>
  amounts.length >= 2 && Math.abs(amounts.reduce((s, a) => s + a.amount, 0)) < 0.02;

function normCurrency(c: string): 'USD' | 'COP' {
  return (c || 'USD').toUpperCase() === 'COP' ? 'COP' : 'USD';
}

function toUsdOnly(accountName: string, amt: number): number | null {
  if (COP_ACCOUNT_RE.test(accountName) || Math.abs(amt) > 100000) return null;
  return amt;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const entityArg = args.find((a) => a.startsWith('--entity='));
  const startArg = args.find((a) => a.startsWith('--start='));
  const endArg = args.find((a) => a.startsWith('--end='));
  const csvPathArg = args.find((a) => !a.startsWith('--'));
  return {
    entityFilter: entityArg ? entityArg.split('=')[1]?.trim().toLowerCase() : 'adriana',
    start: startArg ? startArg.split('=')[1] : null,
    end: endArg ? endArg.split('=')[1] : null,
    csvPath: csvPathArg ? join(process.cwd(), csvPathArg) : join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv'),
  };
}

// --- CSV: Balance y P&G por proyecto ---
function computeFromCsv(
  csvPath: string,
  proyectoFilter: string,
  filterStart: string | null,
  filterEnd: string | null
): { balanceUsd: number; ingresos: number; gastos: number; transacciones: number } {
  if (!existsSync(csvPath)) {
    return { balanceUsd: 0, ingresos: 0, gastos: 0, transacciones: 0 };
  }
  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

  let headerRow = 0;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const row = records[i];
    const first = (row[0] || '').toUpperCase();
    const hasProyecto = row.some((c) => (c || '').toUpperCase().includes('PROYECTO'));
    if (first.includes('FECHA') || hasProyecto) {
      headerRow = i;
      break;
    }
  }

  const headers = records[headerRow].map((h) => (h || '').trim());
  const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
  const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
  const idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
  const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
  const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
  const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
  const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
  const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

  let ingresos = 0;
  let gastos = 0;
  let transacciones = 0;

  for (let i = headerRow + 1; i < records.length; i++) {
    const row = records[i];
    let proyectoStr = (row[idxProyecto] || '').trim();
    proyectoStr = proyectoStr.replace(/^TRASLADO$/i, 'AGENCIA X').replace(/^RETIRO HOTMART$/i, 'HOTMART');
    if (!proyectoStr.toLowerCase().includes(proyectoFilter)) continue;

    const fechaStr = (row[idxFecha] || '').trim();
    const d = parseSpanishDate(fechaStr);
    if (d) {
      if (filterStart && d < new Date(filterStart)) continue;
      if (filterEnd && d > new Date(filterEnd)) continue;
    }

    const tipoStr = idxTipo >= 0 ? (row[idxTipo] || '').trim() : '';
    const categoria = idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '';
    const subcategoria = idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '';
    const cat = subcategoria || categoria || '';

    const esCorteUtilidades = /CORTE\s*UTILIDADES/i.test(cat);
    if (isMovContable(tipoStr) && !esCorteUtilidades) continue;

    const accountAmounts: { accountName: string; amount: number }[] = [];
    for (let c = 0; c < accountHeaders.length; c++) {
      const cell = (row[accountColStart + c] || '').trim();
      const amount = parseAmount(cell);
      if (amount == null || amount === 0) continue;
      accountAmounts.push({ accountName: accountHeaders[c], amount: Math.round(amount * 100) / 100 });
    }

    let monto = 0;
    if (accountAmounts.length > 0) {
      if (isTrasladoBancos(accountAmounts)) continue;
      monto = accountAmounts.reduce((s, a) => s + a.amount, 0);
      const usdOnly = accountAmounts
        .map((a) => toUsdOnly(a.accountName, a.amount))
        .filter((x): x is number => x != null);
      if (usdOnly.length === 0) continue;
      monto = usdOnly.reduce((s, a) => s + a, 0);
    } else {
      const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
      const amount = parseAmount(importeCell);
      if (amount == null || amount === 0) continue;
      if (Math.abs(amount) > 100000) continue;
      monto = Math.round(amount * 100) / 100;
    }

    transacciones++;
    if (monto > 0) {
      ingresos += monto;
    } else {
      gastos += Math.abs(monto);
    }
  }

  const balanceUsd = Math.round((ingresos - gastos) * 100) / 100;
  return { balanceUsd, ingresos, gastos, transacciones };
}

// --- Sistema: Balance y P&G por entidad ---
async function computeFromSystem(
  entityNameFilter: string,
  filterStart: string | null,
  filterEnd: string | null
): Promise<{ entityId: string; entityName: string; balanceUsd: number; balanceCop: number; ingresos: number; gastos: number; transacciones: number }[]> {
  const entryMatch: Record<string, unknown> = {};
  if (filterStart && filterEnd) {
    entryMatch.date = { $gte: new Date(filterStart), $lte: new Date(filterEnd) };
  } else if (filterStart) {
    entryMatch.date = { $gte: new Date(filterStart) };
  } else if (filterEnd) {
    entryMatch.date = { $lte: new Date(filterEnd) };
  }

  const entries = await AcctJournalEntry.find(entryMatch).select('id').lean().exec();
  const entryIds = (entries as { id: string }[]).map((e) => e.id);
  if (entryIds.length === 0) {
    return [];
  }

  // Balance: income - expense por entity_id
  const pgPipeline = [
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

  const pgResults = (await AcctJournalEntryLine.aggregate(pgPipeline).exec()) as {
    _id: { entity_id: string | null; currency: string };
    total_amount: number;
  }[];

  const entityIds = [...new Set(pgResults.map((r) => r._id.entity_id).filter(Boolean))] as string[];
  const entities = entityIds.length > 0
    ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name').lean().exec()
    : [];
  const entityMap = new Map((entities as { id: string; name: string }[]).map((e) => [e.id, e.name]));

  const matchingEntities = (entities as { id: string; name: string }[]).filter((e) =>
    e.name.toLowerCase().includes(entityNameFilter)
  );

  const out: { entityId: string; entityName: string; balanceUsd: number; balanceCop: number; ingresos: number; gastos: number; transacciones: number }[] = [];

  for (const ent of matchingEntities) {
    let balanceUsd = 0;
    let balanceCop = 0;
    let ingresos = 0;
    let gastos = 0;

    for (const r of pgResults) {
      if (r._id.entity_id !== ent.id) continue;
      const cur = normCurrency(r._id.currency || 'USD');
      const amt = Math.round(r.total_amount * 100) / 100;
      if (cur === 'COP') {
        balanceCop += amt;
      } else {
        balanceUsd += amt;
      }
      if (amt > 0) ingresos += amt;
      else gastos += Math.abs(amt);
    }

    const lineCount = await AcctJournalEntryLine.countDocuments({
      journal_entry_id: { $in: entryIds },
      entity_id: ent.id,
    });

    out.push({
      entityId: ent.id,
      entityName: ent.name,
      balanceUsd,
      balanceCop,
      ingresos,
      gastos,
      transacciones: lineCount,
    });
  }

  return out;
}

async function main() {
  const { entityFilter, start, end, csvPath } = parseArgs();

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`  COMPARACIÓN: Proyecto "${entityFilter}" - Excel vs Sistema`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // CSV
  const csvResult = computeFromCsv(csvPath, entityFilter, start, end);
  console.log('--- EXCEL (CSV) ---');
  console.log(`  Archivo: ${csvPath}`);
  if (!existsSync(csvPath)) {
    console.log('  ⚠ Archivo no encontrado. Solo se mostrará el sistema.\n');
  } else {
    console.log(`  Proyectos que coinciden con "${entityFilter}" (columna PROYECTO)`);
    console.log(`  Ingresos:     $${csvResult.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Gastos:       $${csvResult.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Balance USD:  $${csvResult.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Transacciones: ${csvResult.transacciones}`);
    if (start || end) console.log(`  Rango fechas: ${start || 'inicio'} → ${end || 'hoy'}`);
    console.log('');
  }

  // Sistema
  await connectDB();
  const systemResults = await computeFromSystem(entityFilter, start, end);

  console.log('--- SISTEMA (MongoDB) ---');
  if (systemResults.length === 0) {
    console.log(`  No hay entidades que coincidan con "${entityFilter}".`);
    console.log('  Lista de entidades en el sistema:');
    const allEntities = await AcctEntity.find({}).select('name').sort({ name: 1 }).lean().exec();
    const similar = (allEntities as { name: string }[])
      .filter((e) => e.name.toLowerCase().includes(entityFilter.slice(0, 4)))
      .slice(0, 15);
    similar.forEach((e) => console.log(`    - ${e.name}`));
    if (similar.length === 0) {
      (allEntities as { name: string }[]).slice(0, 20).forEach((e) => console.log(`    - ${e.name}`));
    }
  } else {
    for (const r of systemResults) {
      console.log(`  Entidad: ${r.entityName} (id: ${r.entityId})`);
      console.log(`  Ingresos:     $${r.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      console.log(`  Gastos:       $${r.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      console.log(`  Balance USD:  $${r.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      if (r.balanceCop !== 0) console.log(`  Balance COP:  $${r.balanceCop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`);
      console.log(`  Líneas asiento: ${r.transacciones}`);
      console.log('');
    }
  }

  // Comparación
  if (existsSync(csvPath) && systemResults.length > 0) {
    console.log('--- DIFERENCIAS ---');
    const sysTotal = systemResults.reduce((s, r) => s + r.balanceUsd, 0);
    const diff = csvResult.balanceUsd - sysTotal;
    console.log(`  Balance Excel:  $${csvResult.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Balance Sistema: $${sysTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Diferencia:      $${diff.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log('');
    console.log('  Posibles causas de discrepancia:');
    console.log('  1. Nombres distintos: "Adriana" en Excel vs "Adriana L7" en sistema (o viceversa)');
    console.log('  2. Transacciones con PROYECTO vacío en Excel que se importaron a otra entidad');
    console.log('  3. CORTE UTILIDADES: Excel puede incluirlas; Balance con excluir_contables las omite');
    console.log('  4. Montos COP: el script solo suma USD; si hay COP puro, no se incluye');
    console.log('  5. Fechas: verificar que el rango --start/--end coincida con el Excel');
    console.log('  6. Traslados bancos o mov. contables tratados distinto');
  }

  console.log('\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
