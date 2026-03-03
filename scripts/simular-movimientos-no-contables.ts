/**
 * Simula la tabla dinámica "MOVIMIENTOS NO CONTABLES" del Excel.
 * Excluye: SALIDA CONTABLE, INGRESO CONTABLE.
 * Excluye: traslados entre bancos (suma ~0).
 * Solo USD (montos >100k o BANCOLOMBIA = COP).
 *
 * Ejecutar: npx tsx scripts/simular-movimientos-no-contables.ts "CUENTAS DINERO PRESUPUESTO final.csv"
 * Opcional: npx tsx scripts/simular-movimientos-no-contables.ts "archivo.csv" --end=2025-12-31
 */
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAmount, parseSpanishDate } from '../lib/contabilidad/csvUtils.js';

const COP_ACCOUNT_RE = /BANCOLOMBIA|DAVIVIENDA|NEQUI\s*COP/i;

const args = process.argv.slice(2);
const startArg = args.find((a) => a.startsWith('--start='));
const endArg = args.find((a) => a.startsWith('--end='));
const filterStart = startArg ? startArg.split('=')[1] : null;
const filterEnd = endArg ? endArg.split('=')[1] : null;

const csvPathArg = args.find((a) => !a.startsWith('--'));
const csvPath = csvPathArg ? join(process.cwd(), csvPathArg) : join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv');
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
const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

const isMovContable = (t: string) => /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(t);
const isTrasladoBancos = (amounts: number[]) =>
  amounts.length >= 2 && Math.abs(amounts.reduce((s, a) => s + a, 0)) < 0.02;

// Solo USD para comparar con el sistema (montos > 100k o BANCOLOMBIA = COP)
const toUsdOnly = (accountName: string, amt: number): number | null => {
  if (COP_ACCOUNT_RE.test(accountName) || Math.abs(amt) > 100000) return null; // COP, excluir
  return amt;
};

const byEntity: Record<string, number> = {};
let totalGeneral = 0;

for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const fechaStr = (row[idxFecha] || '').trim();
  const d = parseSpanishDate(fechaStr);
  if (d) {
    if (filterStart && d < new Date(filterStart)) continue;
    if (filterEnd && d > new Date(filterEnd)) continue;
  }

  let proyectoStr = (row[idxProyecto] || '').trim();
  proyectoStr = proyectoStr.replace(/^TRASLADO$/i, 'AGENCIA X').replace(/^RETIRO HOTMART$/i, 'HOTMART');
  if (!proyectoStr) proyectoStr = 'Sin asignar';

  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  if (isMovContable(tipoStr)) continue; // Excluir movimientos contables

  const accountAmounts: { accountName: string; amount: number }[] = [];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    accountAmounts.push({ accountName: accountHeaders[c], amount: Math.round(amount * 100) / 100 });
  }

  let monto = 0;
  if (accountAmounts.length > 0) {
    if (isTrasladoBancos(accountAmounts.map((a) => a.amount))) continue; // Traslado bancos, ignorar
    monto = accountAmounts.reduce((s, a) => s + a.amount, 0);
    // Solo USD
    const usdOnly = accountAmounts
      .map((a) => toUsdOnly(a.accountName, a.amount))
      .filter((x): x is number => x != null);
    if (usdOnly.length === 0) continue; // Todo COP, skip para comparar con sistema USD
    monto = usdOnly.reduce((s, a) => s + a, 0);
  } else {
    const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
    const amount = parseAmount(importeCell);
    if (amount == null || amount === 0) continue;
    if (Math.abs(amount) > 100000) continue; // COP
    monto = Math.round(amount * 100) / 100;
  }

  byEntity[proyectoStr] = (byEntity[proyectoStr] || 0) + monto;
  totalGeneral += monto;
}

// Ordenar por valor absoluto descendente
const sorted = Object.entries(byEntity)
  .filter(([, v]) => Math.abs(v) >= 0.01)
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  SIMULACIÓN: Movimientos NO contables (como tabla dinámica Excel)');
console.log('  Excluye: SALIDA CONTABLE, INGRESO CONTABLE, traslados bancos, COP');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Entidad                    USD');
console.log('─────────────────────────────────────────────────────────────');

for (const [name, val] of sorted) {
  const v = Math.round(val * 100) / 100;
  const s = v >= 0 ? `+$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  console.log(`${name.padEnd(28)} ${s.padStart(18)}`);
}

console.log('─────────────────────────────────────────────────────────────');
const tot = Math.round(totalGeneral * 100) / 100;
console.log(`Total general               ${tot >= 0 ? '+' : ''}$${tot.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('\nComparar con el Balance del sistema. Si difieren:');
console.log('  - El Balance incluye CORTE UTILIDADES (ingresos contables)');
console.log('  - La tabla dinámica los excluye → AGENCIA X y FONDO LIBRE serán distintos');
