import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseDate(s: string): Date | null {
  const m = (s || '').trim().match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (!m) return null;
  const month = SPANISH_MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

const csv = readFileSync('CUENTAS DINERO PRESUPUESTO final_interactivo_revisado_corregido.csv', 'utf-8');
const records = parse(csv, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

let headerRow = 0;
for (let i = 0; i < Math.min(10, records.length); i++) {
  if (records[i].some((c) => /PROYECTO|FECHA/i.test(c || ''))) {
    headerRow = i;
    break;
  }
}

const headers = records[headerRow].map((h) => (h || '').trim());
const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
const idxDesc = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
const idxCat = headers.findIndex((h) => /CATEGOR[IÍ]A/i.test(h));

let invalidDate = 0;
const invalidSamples: { line: number; fecha: string; desc: string }[] = [];
const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
const idxImporte = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporte >= 0 ? idxImporte + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

function parseAmount(s: string): number | null {
  const n = parseFloat(String(s || '').replace(/[$\s,]/g, ''));
  return isNaN(n) ? null : n;
}

const hashes = new Set<string>();
let inFileDupes = 0;

for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const fecha = (row[idxFecha] || '').trim();
  const proyecto = (row[idxProyecto] || '').trim();
  const desc = ((row[idxDesc] || '') || (row[idxCat] || '')).trim().slice(0, 200) || 'Sin descripción';
  const d = parseDate(fecha);
  if (!d) {
    invalidDate++;
    if (invalidSamples.length < 15) invalidSamples.push({ line: i + 1, fecha, desc: desc.slice(0, 60) });
  } else {
    const amounts: { accountName: string; amount: number }[] = [];
    for (let c = 0; c < accountHeaders.length; c++) {
      const cell = (row[accountColStart + c] || '').trim();
      const amt = parseAmount(cell);
      if (amt != null && amt !== 0) amounts.push({ accountName: accountHeaders[c], amount: Math.round(amt * 100) / 100 });
    }
    const amountsSig = amounts.length > 0
      ? amounts.sort((a, b) => a.accountName.localeCompare(b.accountName)).map((a) => `${a.accountName}:${a.amount}`).join('|')
      : `importe:${parseAmount((row[idxImporte] || '').trim()) ?? 0}`;
    const h = `${d.toISOString().slice(0, 10)}\x00${desc}\x00${proyecto}\x00${amountsSig}`;
    if (hashes.has(h)) inFileDupes++;
    hashes.add(h);
  }
}

console.log('=== ANÁLISIS CSV (mismo que usa el importador) ===\n');
console.log('Total filas de datos:', records.length - headerRow - 1);
console.log('Fechas inválidas (se omiten):', invalidDate);
console.log('Duplicados dentro del CSV (misma fecha+descripción):', inFileDupes);
console.log('\nSuma esperada de omitidas:', invalidDate + inFileDupes);

if (invalidSamples.length > 0) {
  console.log('\n--- Ejemplos de filas con fecha inválida ---');
  invalidSamples.forEach((s) => console.log(`  L${s.line}: "${s.fecha}" | ${s.desc}`));
}
