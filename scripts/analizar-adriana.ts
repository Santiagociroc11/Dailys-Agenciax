/**
 * Análisis detallado del proyecto ADRIANA: CSV vs Sistema.
 * Identifica discrepancias y dónde están los gastos faltantes.
 *
 * Uso: npx tsx scripts/analizar-adriana.ts
 */
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../lib/mongoose.js';
import { parseAmount, parseSpanishDate } from '../lib/contabilidad/csvUtils.js';
import {
  AcctEntity,
  AcctChartAccount,
  AcctJournalEntry,
  AcctJournalEntryLine,
} from '../models/index.js';

const CSV_PATH = join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv');
const COP_RE = /BANCOLOMBIA|DAVIVIENDA|NEQUI|100000/i;

function parseAmountFromCell(str: string): number | null {
  const s = String(str || '').trim().replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  const neg = /^-/.test(s);
  const num = parseFloat(s.replace(/^-?/, ''));
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

function toUsd(accountName: string, amt: number): number | null {
  if (COP_RE.test(accountName) || Math.abs(amt) > 100000) return null;
  return amt;
}

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('  ANÁLISIS PROYECTO ADRIANA - CSV vs Sistema');
  console.log('═'.repeat(80) + '\n');

  // ─── 1. CSV: Todas las transacciones ADRIANA ───
  const csvText = readFileSync(CSV_PATH, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

  let headerRow = 0;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const row = records[i];
    if ((row[0] || '').toUpperCase().includes('FECHA') || row.some((c) => (c || '').toUpperCase().includes('PROYECTO'))) {
      headerRow = i;
      break;
    }
  }

  const headers = records[headerRow].map((h) => (h || '').trim());
  const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
  const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
  const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
  const idxDesc = headers.findIndex((h) => /DESCRIPCION/i.test(h));
  const idxCat = headers.findIndex((h) => /CATEGOR/i.test(h));
  const idxDet = headers.findIndex((h) => /^DETALLE$/i.test(h));
  const idxImporte = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
  const accountColStart = idxImporte >= 0 ? idxImporte + 1 : 7;
  const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

  const csvRows: { linea: number; fecha: string; tipo: string; desc: string; cat: string; det: string; monto: number; cuenta: string }[] = [];

  for (let i = headerRow + 1; i < records.length; i++) {
    const row = records[i];
    const proyecto = (row[idxProyecto] || '').trim();
    if (!proyecto.toUpperCase().includes('ADRIANA')) continue;

    const fecha = (row[idxFecha] || '').trim();
    const tipo = (idxTipo >= 0 ? row[idxTipo] || '' : '').trim();
    const desc = (idxDesc >= 0 ? row[idxDesc] || '' : '').trim().slice(0, 50);
    const cat = (idxCat >= 0 ? row[idxCat] || '' : '').trim();
    const det = (idxDet >= 0 ? row[idxDet] || '' : '').trim();

    let monto = 0;
    let cuenta = '';

    const accountAmounts: { name: string; amount: number }[] = [];
    for (let c = 0; c < accountHeaders.length; c++) {
      const cell = (row[accountColStart + c] || '').trim();
      const amount = parseAmountFromCell(cell);
      if (amount == null || amount === 0) continue;
      const usd = toUsd(accountHeaders[c], amount);
      if (usd != null) {
        accountAmounts.push({ name: accountHeaders[c], amount });
      }
    }

    if (accountAmounts.length > 0) {
      monto = accountAmounts.reduce((s, a) => s + a.amount, 0);
      cuenta = accountAmounts.map((a) => `${a.name}:${a.amount}`).join(', ');
    } else {
      const ic = idxImporte >= 0 ? parseAmountFromCell((row[idxImporte] || '').trim()) : null;
      if (ic != null && ic !== 0 && Math.abs(ic) < 100000) {
        monto = ic;
        cuenta = 'Importe contable';
      }
    }

    if (Math.abs(monto) < 0.01) continue;

    csvRows.push({ linea: i + 1, fecha, tipo, desc, cat, det, monto: Math.round(monto * 100) / 100, cuenta });
  }

  const csvIngresos = csvRows.filter((r) => r.monto > 0).reduce((s, r) => s + r.monto, 0);
  const csvGastos = csvRows.filter((r) => r.monto < 0).reduce((s, r) => s + Math.abs(r.monto), 0);
  const csvBalance = csvIngresos - csvGastos;

  console.log('─── CSV: Transacciones ADRIANA ───\n');
  console.log(`  Total filas: ${csvRows.length}`);
  console.log(`  Ingresos:  $${csvIngresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Gastos:    $${csvGastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Balance:   $${csvBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log('\n  Desglose por categoría (gastos):');
  const gastosPorCat: Record<string, number> = {};
  for (const r of csvRows.filter((x) => x.monto < 0)) {
    const key = `${r.cat} / ${r.det}`.trim() || '(sin categoría)';
    gastosPorCat[key] = (gastosPorCat[key] || 0) + Math.abs(r.monto);
  }
  Object.entries(gastosPorCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`    ${k.slice(0, 50).padEnd(52)} $${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));

  console.log('\n  Detalle transacciones (primeras 25):');
  csvRows.slice(0, 25).forEach((r) => {
    const sign = r.monto >= 0 ? '+' : '';
    console.log(`    L${r.linea} ${r.fecha.slice(0, 18).padEnd(20)} ${(r.cat + '/' + r.det).slice(0, 35).padEnd(37)} ${sign}$${r.monto.toFixed(2).padStart(12)}`);
  });

  // ─── 2. Sistema: Líneas de asiento para ADRIANA ───
  await connectDB();

  const adrianaEntity = await AcctEntity.findOne({ name: /^ADRIANA$/i }).select('id name').lean().exec();
  if (!adrianaEntity) {
    console.log('\n─── SISTEMA: Entidad ADRIANA no encontrada ───\n');
    process.exit(1);
  }

  const adrianaId = (adrianaEntity as { id: string; name: string }).id;
  console.log('\n─── SISTEMA: Líneas con entity_id = ADRIANA ───\n');
  console.log(`  Entity ID: ${adrianaId}`);

  const lines = await AcctJournalEntryLine.find({ entity_id: adrianaId })
    .select('journal_entry_id account_id debit credit currency description')
    .lean()
    .exec();

  const accountIds = [...new Set((lines as { account_id: string }[]).map((l) => l.account_id))];
  const accounts = await AcctChartAccount.find({ id: { $in: accountIds } }).select('id code name type').lean().exec();
  const accMap = new Map((accounts as { id: string; code: string; name: string; type: string }[]).map((a) => [a.id, a]));

  const entryIds = [...new Set((lines as { journal_entry_id: string }[]).map((l) => l.journal_entry_id))];
  const entries = await AcctJournalEntry.find({ id: { $in: entryIds } }).select('id date description reference').lean().exec();
  const entryMap = new Map((entries as { id: string; date: Date; description?: string; reference?: string }[]).map((e) => [e.id, e]));

  let sysIngresos = 0;
  let sysGastos = 0;
  const byAccountType: Record<string, { ingresos: number; gastos: number; count: number }> = {};

  for (const l of lines as { journal_entry_id: string; account_id: string; debit: number; credit: number; currency?: string; description?: string }[]) {
    const acc = accMap.get(l.account_id);
    if (!acc) continue;
    const cur = (l.currency || 'USD').toUpperCase() === 'COP' ? 'COP' : 'USD';
    if (cur === 'COP') continue; // Solo USD para comparar

    if (acc.type === 'income') {
      const amt = (l.credit || 0) - (l.debit || 0);
      sysIngresos += amt;
      const key = acc.type;
      if (!byAccountType[key]) byAccountType[key] = { ingresos: 0, gastos: 0, count: 0 };
      byAccountType[key].ingresos += amt;
      byAccountType[key].count++;
    } else if (acc.type === 'expense') {
      const amt = (l.debit || 0) - (l.credit || 0);
      sysGastos += amt;
      const key = acc.type;
      if (!byAccountType[key]) byAccountType[key] = { ingresos: 0, gastos: 0, count: 0 };
      byAccountType[key].gastos += amt;
      byAccountType[key].count++;
    }
    // equity, asset, liability no se suman en P&G
  }

  const sysBalance = sysIngresos - sysGastos;
  console.log(`  Líneas totales: ${lines.length}`);
  console.log(`  Ingresos (cuentas income):  $${sysIngresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Gastos (cuentas expense):  $${sysGastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Balance:                   $${sysBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  console.log('\n  Cuentas usadas por ADRIANA:');
  const byAcc: Record<string, { debit: number; credit: number; type: string }> = {};
  for (const l of lines as { account_id: string; debit: number; credit: number; currency?: string }[]) {
    const acc = accMap.get(l.account_id);
    const key = acc ? `${acc.code} ${acc.name} (${acc.type})` : l.account_id;
    if (!byAcc[key]) byAcc[key] = { debit: 0, credit: 0, type: acc?.type || '?' };
    byAcc[key].debit += l.debit || 0;
    byAcc[key].credit += l.credit || 0;
  }
  Object.entries(byAcc).forEach(([k, v]) => {
    const cur = (v.debit - v.credit).toFixed(2);
    console.log(`    ${k.slice(0, 60).padEnd(62)} D:${v.debit.toFixed(0).padStart(10)} C:${v.credit.toFixed(0).padStart(10)} (${v.type})`);
  });

  // ─── 3. Buscar gastos del CSV que podrían estar en otra entidad ───
  console.log('\n─── BÚSQUEDA: Gastos de ADRIANA en el CSV que podrían estar mal asignados ───\n');

  const gastosCsv = csvRows.filter((r) => r.monto < 0);
  const montosGastos = gastosCsv.map((r) => Math.abs(r.monto));

  // Buscar líneas de expense con entity_id != ADRIANA que coincidan en monto
  const allExpenseLines = await AcctJournalEntryLine.aggregate([
    { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
    { $unwind: '$acc' },
    { $match: { 'acc.type': 'expense' } },
    { $project: { entity_id: 1, debit: 1, credit: 1, currency: 1, journal_entry_id: 1, description: 1 } },
  ]).exec();

  const candidates: { entity_id: string | null; monto: number; desc: string; entryDate: string }[] = [];
  const entityNames = await AcctEntity.find({}).select('id name').lean().exec();
  const entityMap = new Map((entityNames as { id: string; name: string }[]).map((e) => [e.id, e.name]));

  for (const line of allExpenseLines as { entity_id: string | null; debit: number; credit: number; currency?: string; journal_entry_id: string; description?: string }[]) {
    if (line.entity_id === adrianaId) continue;
    const cur = (line.currency || 'USD').toUpperCase() === 'COP' ? 'COP' : 'USD';
    if (cur === 'COP') continue;
    const amt = Math.round(((line.debit || 0) - (line.credit || 0)) * 100) / 100;
    if (amt <= 0) continue;

    // ¿Coincide con algún gasto de Adriana en el CSV?
    for (const g of gastosCsv) {
      const csvAmt = Math.abs(g.monto);
      if (Math.abs(amt - csvAmt) < 0.02) {
        const entry = entryMap.get(line.journal_entry_id) as { date?: Date } | undefined;
        candidates.push({
          entity_id: line.entity_id,
          monto: amt,
          desc: (line.description || '').slice(0, 40),
          entryDate: entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : '?',
        });
        break;
      }
    }
  }

  if (candidates.length > 0) {
    console.log(`  Encontradas ${candidates.length} líneas de GASTO con entity_id != ADRIANA que coinciden en monto con gastos del CSV:`);
    const byEntity: Record<string, number> = {};
    candidates.slice(0, 20).forEach((c) => {
      const name = c.entity_id ? entityMap.get(c.entity_id) || c.entity_id : 'Sin asignar';
      byEntity[name] = (byEntity[name] || 0) + c.monto;
      console.log(`    ${c.entryDate} | ${name.padEnd(25)} | $${c.monto.toFixed(2).padStart(10)} | ${c.desc}`);
    });
    console.log('\n  Total por entidad (candidatos):');
    Object.entries(byEntity).forEach(([name, tot]) => console.log(`    ${name}: $${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
  } else {
    console.log('  No se encontraron líneas de gasto con montos coincidentes en otras entidades.');
    console.log('  Los gastos del CSV (REPARTICIÓN, CORTE UTILIDADES) van a cuentas EQUITY, no EXPENSE.');
    console.log('  El Balance del sistema usa solo income-expense; las distribuciones van a equity.');
  }

  // ─── 4. Resumen y conclusiones ───
  console.log('\n' + '═'.repeat(80));
  console.log('  CONCLUSIONES');
  console.log('═'.repeat(80));
  console.log(`
  CSV:    Ingresos $${csvIngresos.toLocaleString()} | Gastos $${csvGastos.toLocaleString()} | Balance $${csvBalance.toLocaleString()}
  Sistema: Ingresos $${sysIngresos.toLocaleString()} | Gastos $${sysGastos.toLocaleString()} | Balance $${sysBalance.toLocaleString()}
  Diferencia gastos: $${(csvGastos - sysGastos).toLocaleString()}

  El Excel incluye como "gastos" a:
  - REPARTICIÓN DE UTILIDADES SOCIOS (pagos a JUANCA)
  - CORTE UTILIDADES (SALIDA CONTABLE - traslados a AGENCIA X / FONDO LIBRE)
  - GASTO PUBLICITARIO, SOFTWARE (operativos)

  El sistema contable:
  - REPARTICIÓN y CORTE UTILIDADES → cuentas EQUITY (patrimonio), no expense
  - Solo GASTO PUBLICITARIO, SOFTWARE → cuentas EXPENSE

  Si los gastos operativos (FB ADS, ChatGPT, DEVZAPP) tampoco aparecen en el sistema,
  pueden estar asignados a "Sin asignar" o a otra entidad. Revisar en Config → Entidades
  las acciones masivas para reasignar.
`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
