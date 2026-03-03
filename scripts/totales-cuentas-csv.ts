/**
 * Calcula los totales por cuenta desde el CSV (como el Excel)
 * y los compara con lo que debería dar el import.
 * Ejecutar: npx tsx scripts/totales-cuentas-csv.ts "CUENTAS DINERO PRESUPUESTO final.csv"
 */
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAmount } from '../lib/contabilidad/csvUtils.js';

const csvPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv');
const csvText = readFileSync(csvPath, 'utf-8');

const COP_ACCOUNT_RE = /BANCOLOMBIA|DAVIVIENDA|NEQUI\s*COP/i;

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
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

// Suma por cuenta (como Excel: suma de cada columna)
const sumByAccount: Record<string, { usd: number; cop: number }> = {};
for (const h of accountHeaders) {
  sumByAccount[h] = { usd: 0, cop: 0 };
}

let rowCount = 0;
for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    const accountName = accountHeaders[c];
    const amt = Math.abs(amount);
    const isCop = COP_ACCOUNT_RE.test(accountName) || amt > 100000;
    if (isCop) {
      sumByAccount[accountName].cop += amount;
    } else {
      sumByAccount[accountName].usd += amount;
    }
  }
  rowCount++;
}

let totalUsd = 0;
let totalCop = 0;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Totales por cuenta desde CSV (como Excel)');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Cuenta                    USD              COP');
console.log('─────────────────────────────────────────────────────────────');

for (const [name, vals] of Object.entries(sumByAccount)) {
  const usd = Math.round(vals.usd * 100) / 100;
  const cop = Math.round(vals.cop * 100) / 100;
  totalUsd += usd;
  totalCop += cop;
  const usdStr = usd !== 0 ? usd.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-';
  const copStr = cop !== 0 ? cop.toLocaleString('es-CO', { minimumFractionDigits: 0 }) : '-';
  console.log(`${name.padEnd(25)} ${usdStr.padStart(15)} ${copStr.padStart(15)}`);
}

console.log('─────────────────────────────────────────────────────────────');
console.log(`TOTAL USD: ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`TOTAL COP: ${totalCop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`);
console.log(`\nFilas procesadas: ${rowCount}`);
console.log('\nSi el sistema muestra un total USD mayor, posibles causas:');
console.log('  1. CSV importado más de una vez (duplicados)');
console.log('  2. Montos COP clasificados como USD (ej. 52,911 en cuenta USD)');
console.log('  3. Filas con solo IMPORTE CONTABLE asignadas a cuenta por defecto');
